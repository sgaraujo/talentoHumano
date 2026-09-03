import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Calendar, Download, Loader2, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { taxCalendarService } from '@/services/taxCalendarService';
import type { TaxObligation } from '@/models/types/TaxObligation';
import { displayTax, cleanNit, normalizePeriod } from '@/domain/tax/taxIdentity';
import { toast } from 'sonner';

// ── Orden oficial de empresas ─────────────────────────────────────────────────
const COMPANY_ORDER = [
  'inteegra',
  'netcol',
  'inversiones eon',
  'itac colombia',
  'consorcio scia',
  'triangulum',
  'netia',
  'leti',               // LETI SAS Logística Empresarial de Transporte Integral
  'logistica empresarial', // alias nombre anterior
  'newstar',
  'newforce',
  'union temporal tecnologia',
  'union temporal fomento',
  'union temporal internuqui',
  'union temporal itac',
  'plex de colombia',
  'red empresarial',
];

function normalizeCompany(s: string) {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bs\.?\s*a\.?\s*s\.?\b/g, 'sas')
    .replace(/\bb\.?\s*i\.?\s*c\.?\b/g, 'bic')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rawCompanyKey(o: TaxObligation) {
  // companyId es la identidad canónica. Evita separar una empresa en dos filas
  // cuando sobreviven formatos históricos del nombre o del NIT.
  if (o.companyId) return `id:${o.companyId}`;
  const nit = cleanNit(o.nit);
  return nit ? `nit:${nit}` : `name:${normalizeCompany(o.company)}`;
}

function isMostlyUpper(name: string) {
  const letters = name.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
  return letters.length > 0 && letters === letters.toUpperCase();
}

function preferredCompanyName(current: string, incoming: string) {
  if (!current) return incoming;
  if (!incoming) return current;
  if (isMostlyUpper(current) && !isMostlyUpper(incoming)) return incoming;
  return current.length <= incoming.length ? current : incoming;
}

function companyIdx(name: string) {
  const n = normalizeCompany(name);
  const idx = COMPANY_ORDER.findIndex(c => n.includes(c) || c.includes(n));
  return idx === -1 ? COMPANY_ORDER.length : idx;
}

function shortCompany(name: string) {
  return name
    .replace(/S\.A\.S\.?/gi, 'SAS').replace(/\bBIC\b/gi, 'BIC')
    .replace(/Ingeniería/gi, 'Ing.')
    .replace(/LETI SAS.*/gi, 'LETI')
    .replace(/Logística Empresarial de Transporte.*/gi, 'LETI')
    .replace(/LOGISTICA EMPRESARIAL DE TRANSPORTE.*/gi, 'LETI')
    .replace(/Logistrica Empresarial de Transporte.*/gi, 'LETI')
    .replace(/ - En Liquidación/gi, ' (Liq.)')
    .replace(/Unión Temporal /gi, 'UT ').replace(/UNIÓN TEMPORAL /gi, 'UT ')
    .replace(/Inversiones /gi, 'Inv. ').trim();
}

function fmtCOP(v: number | undefined) {
  if (!v) return '—';
  return v.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
}

function fmtCOPShort(v: number | undefined) {
  if (!v) return '—';
  return v.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
}

/** presentedAt/paidAt pueden venir como 'YYYY-MM-DD' o como ISO datetime completo. */
function fmtFlexDate(value?: string) {
  if (!value) return '';
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = isDateOnly ? new Date(`${value}T12:00:00`) : new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface Cell { projected: number; presented: number; paid: number; count: number; lastPresentedAt?: string }
type PivotRow = {
  key: string; company: string; cells: Record<string, Cell>;
  totalProj: number; totalPresented: number; totalPaid: number; totalCount: number; totalLastPresentedAt?: string;
  noAplicaCount: number;
};

/** Se queda con la fecha más reciente entre dos valores de fecha (algún lado puede venir vacío). */
function laterDate(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return new Date(b) > new Date(a) ? b : a;
}

const STATUS_OPTIONS: Array<[string, string]> = [
  ['', 'Sin iniciar'],
  ['No iniciado', 'No iniciado'],
  ['En revisión', 'En revisión'],
  ['Revisado', 'Revisado'],
  ['Informe Enviado', 'Informe Enviado'],
  ['Presentado', 'Presentado'],
  ['Pagado', 'Pagado'],
  ['No aplica', 'No aplica'],
];

// ── component ─────────────────────────────────────────────────────────────────
export const TaxReportPage = () => {
  const navigate = useNavigate();
  const [obligations,    setObligations]    = useState<TaxObligation[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [filterYear,     setFilterYear]     = useState(String(new Date().getFullYear()));
  const [expanded,       setExpanded]       = useState<Set<string>>(new Set());
  const [selectedTypes,  setSelectedTypes]  = useState<Set<string>>(new Set());
  // Filtros de métricas. Siempre debe permanecer al menos uno activo.
  const [showProjected,  setShowProjected]  = useState(true);
  const [showPresented,  setShowPresented]  = useState(true);
  const [showPaid,       setShowPaid]       = useState(true);
  const [filterMonth,    setFilterMonth]    = useState('all');
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(new Set());
  const [filterCompany,  setFilterCompany]  = useState('all');

  const toggleStatus = (status: string) =>
    setFilterStatuses(prev => { const n = new Set(prev); n.has(status) ? n.delete(status) : n.add(status); return n; });

  const toggleMetric = (metric: 'projected' | 'presented' | 'paid') => {
    const current = { projected: showProjected, presented: showPresented, paid: showPaid };
    if (current[metric] && Object.values(current).filter(Boolean).length === 1) {
      toast.error('Debe permanecer al menos un filtro visible');
      return;
    }
    if (metric === 'projected') setShowProjected(value => !value);
    if (metric === 'presented') setShowPresented(value => !value);
    if (metric === 'paid') setShowPaid(value => !value);
  };

  useEffect(() => {
    taxCalendarService.getAll()
      .then(data => setObligations(data))
      .catch(e => toast.error('Error al cargar', { description: e.message }))
      .finally(() => setLoading(false));
  }, []);

  const years = useMemo(() => {
    const s = new Set(obligations.map(o => o.year || o.dueDate?.slice(0, 4) || ''));
    return Array.from(s).filter(Boolean).sort().reverse();
  }, [obligations]);

  // All unique taxTypes present in the selected year (excluding Reportes)
  const allTypes = useMemo(() => {
    const s = new Set<string>();
    obligations
      .filter(o => (o.year || o.dueDate?.slice(0, 4)) === filterYear)
      .filter(o => o.obligationType !== 'Reportes')
      .forEach(o => s.add(displayTax(o.taxType)));
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'es'));
  }, [obligations, filterYear]);

  // Reset selection to all when year changes
  useEffect(() => {
    setSelectedTypes(new Set(allTypes));
    setFilterMonth('all');
  }, [filterYear, allTypes.join('|')]);

  const visibleTypes = useMemo(
    () => allTypes.filter(t => selectedTypes.has(t)),
    [allTypes, selectedTypes],
  );

  const toggleType = (t: string) =>
    setSelectedTypes(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; });

  const allSelected = selectedTypes.size === allTypes.length;
  const toggleAll   = () =>
    setSelectedTypes(allSelected ? new Set() : new Set(allTypes));

  const companyKeyByName = useMemo(() => {
    const map = new Map<string, string>();
    obligations.forEach(o => {
      const nameKey = normalizeCompany(o.company);
      const nit = cleanNit(o.nit);
      const canonicalKey = o.companyId ? `id:${o.companyId}` : (nit ? `nit:${nit}` : '');
      if (nameKey && canonicalKey && !map.has(nameKey)) map.set(nameKey, canonicalKey);
    });
    return map;
  }, [obligations]);

  const getCompanyKey = (o: TaxObligation) =>
    (o.companyId ? `id:${o.companyId}` : companyKeyByName.get(normalizeCompany(o.company))) ?? rawCompanyKey(o);

  // Pivot
  const { rows } = useMemo(() => {
    const byCompany = new Map<string, PivotRow>();

    obligations
      .filter(o => (o.year || o.dueDate?.slice(0, 4)) === filterYear)
      .filter(o => filterMonth === 'all' || o.dueDate?.slice(0, 7) === filterMonth)
      .filter(o => o.obligationType !== 'Reportes')
      .filter(o => selectedTypes.has(displayTax(o.taxType)))
      .filter(o => filterStatuses.size === 0 || filterStatuses.has(o.status || ''))
      .filter(o => filterCompany === 'all' || getCompanyKey(o) === filterCompany)
      .forEach(o => {
        const proj = o.projected ?? 0;
        const presented = o.presented ?? 0;
        const paid = o.paid ?? 0;
        const key = getCompanyKey(o);
        const taxKey = displayTax(o.taxType);
        if (!byCompany.has(key))
          byCompany.set(key, { key, company: o.company, cells: {}, totalProj: 0, totalPresented: 0, totalPaid: 0, totalCount: 0, noAplicaCount: 0 });
        const row = byCompany.get(key)!;
        row.company = preferredCompanyName(row.company, o.company);
        if (o.status === 'No aplica') row.noAplicaCount += 1;
        if (!row.cells[taxKey]) row.cells[taxKey] = { projected: 0, presented: 0, paid: 0, count: 0 };
        const cell = row.cells[taxKey];
        cell.projected += proj;
        cell.presented += presented;
        cell.paid      += paid;
        cell.count     += 1;
        cell.lastPresentedAt = laterDate(cell.lastPresentedAt, o.presentedAt);

        row.totalProj += proj;
        row.totalPresented += presented;
        row.totalPaid += paid;
        row.totalCount += 1;
        row.totalLastPresentedAt = laterDate(row.totalLastPresentedAt, o.presentedAt);
      });

    const sorted = Array.from(byCompany.values())
      .sort((a, b) => companyIdx(a.company) - companyIdx(b.company));

    return { rows: sorted };
  }, [obligations, filterYear, filterMonth, filterStatuses, filterCompany, selectedTypes, visibleTypes, companyKeyByName]);

  // El filtro de estado (Presentado, Pagado, etc.) ya se aplica dentro del
  // pivote — el cuadro tipo Excel se muestra siempre, filtrado o no.
  // Se ocultan las empresas sin ningún valor proyectado ni presentado (fila
  // sin datos financieros que solo agregaría ruido al informe) — salvo que
  // tengan alguna obligación marcada "No aplica", que es información válida
  // por sí misma y debe seguir visible aunque no lleve montos.
  const filteredRows = useMemo(
    () => rows.filter(r => r.totalProj > 0 || r.totalPresented > 0 || r.noAplicaCount > 0),
    [rows],
  );

  // Cuántas sub-columnas van visibles por tipo de impuesto (y en el bloque Total):
  const typeColSpan = (showProjected ? 1 : 0) + (showPresented ? 2 : 0) + (showPaid ? 1 : 0);

  // ── Status summary ────────────────────────────────────────────────────────────
  const statusSummary = useMemo(() => {
    const yearObls = obligations.filter(o =>
      (o.year || o.dueDate?.slice(0, 4)) === filterYear &&
      (filterMonth === 'all' || o.dueDate?.slice(0, 7) === filterMonth) &&
      o.obligationType !== 'Reportes'
    );
    const total       = yearObls.length;
    const byStatus    = new Map<string, number>();
    for (const o of yearObls) {
      const s = o.status || '';
      byStatus.set(s, (byStatus.get(s) ?? 0) + 1);
    }
    const get = (k: string) => byStatus.get(k) ?? 0;
    const presentado = get('Presentado');
    const pagado     = get('Pagado');
    const noAplica   = get('No aplica');
    const enProceso  = get('Revisado') + get('Informe Enviado');
    const sinIniciar = get('') + get('No iniciado');
    const done       = presentado + pagado + noAplica;
    const pct        = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, presentado, pagado, noAplica, enProceso, sinIniciar, done, pct };
  }, [obligations, filterYear, filterMonth]);

  const toggleExpand = (key: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const detailRows = (companyKey: string) =>
    obligations
      .filter(o => getCompanyKey(o) === companyKey &&
        (o.year || o.dueDate?.slice(0, 4)) === filterYear &&
        (filterMonth === 'all' || o.dueDate?.slice(0, 7) === filterMonth) &&
        o.obligationType !== 'Reportes' &&
        selectedTypes.has(displayTax(o.taxType)) &&
        (filterStatuses.size === 0 || filterStatuses.has(o.status || '')))
      .sort((a, b) => a.taxType.localeCompare(b.taxType));

  // Companies for filter dropdown
  const companyOptions = useMemo(() => {
    const s = new Map<string, string>();
    obligations
      .filter(o => (o.year || o.dueDate?.slice(0, 4)) === filterYear)
      .forEach(o => {
        const k = getCompanyKey(o);
        s.set(k, preferredCompanyName(s.get(k) ?? '', o.company));
      });
    return Array.from(s.entries()).sort((a, b) => companyIdx(a[1]) - companyIdx(b[1]));
  }, [obligations, filterYear, companyKeyByName]);

  // ── Excel export ──────────────────────────────────────────────────────────────
  const handleExport = () => {
    const wb = XLSX.utils.book_new();

    const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                         'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const monthLabel = filterMonth === 'all'
      ? `Año ${filterYear} — Todos los meses`
      : (() => {
          const m = parseInt(filterMonth.split('-')[1]) - 1;
          return `${MONTH_NAMES[m]} ${filterYear}`;
        })();
    const generatedAt = new Date().toLocaleString('es-CO', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota',
    });

    // Formato moneda Colombia sin símbolo para Excel (Excel agrega COP si está configurado)
    const COP_FMT = '[$COP ]#,##0';

    // Helper: aplica formato COP a todas las celdas numéricas de un rango de filas/columnas
    const applyFmt = (ws: XLSX.WorkSheet, rowStart: number, rowEnd: number, cols: number[]) => {
      for (let r = rowStart; r <= rowEnd; r++) {
        for (const c of cols) {
          const addr = XLSX.utils.encode_cell({ r, c });
          if (ws[addr] && typeof ws[addr].v === 'number') ws[addr].z = COP_FMT;
        }
      }
    };

    // ── HOJA 1: RESUMEN PIVOT ─────────────────────────────────────────────────
    const TITLE_ROWS = 4; // filas de cabecera antes de los encabezados de tabla
    const headerRow1: (string | null)[] = ['Empresa'];
    const headerRow2: string[] = [''];
    visibleTypes.forEach(t => {
      const subheaders: string[] = [];
      if (showProjected) subheaders.push('Proyectado');
      if (showPresented) subheaders.push('Valor presentado', 'Fecha valor presentado');
      if (showPaid) subheaders.push('Pagado');
      subheaders.forEach((header, index) => {
        headerRow1.push(index === 0 ? t : null);
        headerRow2.push(header);
      });
    });
    const totalSubheaders: string[] = [];
    if (showProjected) totalSubheaders.push('Proy. Total');
    if (showPresented) totalSubheaders.push('Valor presentado total', 'Última fecha presentada');
    if (showPaid) totalSubheaders.push('Pag. Total');
    totalSubheaders.forEach((header, index) => {
      headerRow1.push(index === 0 ? 'Total' : null);
      headerRow2.push(header);
    });
    const numCols = headerRow1.length;

    const dataRows = filteredRows.map(r => {
      const noAplicaLabel = r.noAplicaCount > 0 ? ` — NO APLICA (${r.noAplicaCount})` : '';
      const cells: (string | number)[] = [`${r.company}${noAplicaLabel}`];
      visibleTypes.forEach(t => {
        if (showProjected) cells.push(r.cells[t]?.projected ?? 0);
        if (showPresented) cells.push(r.cells[t]?.presented ?? 0, r.cells[t]?.lastPresentedAt ? fmtFlexDate(r.cells[t]?.lastPresentedAt) : '');
        if (showPaid) cells.push(r.cells[t]?.paid ?? 0);
      });
      if (showProjected) cells.push(r.totalProj);
      if (showPresented) cells.push(r.totalPresented, r.totalLastPresentedAt ? fmtFlexDate(r.totalLastPresentedAt) : '');
      if (showPaid) cells.push(r.totalPaid);
      return cells;
    });
    const totalRow: (string | number)[] = ['TOTAL'];
    visibleTypes.forEach(t => {
      if (showProjected) totalRow.push(filteredRows.reduce((s, r) => s + (r.cells[t]?.projected ?? 0), 0));
      if (showPresented) totalRow.push(
        filteredRows.reduce((s, r) => s + (r.cells[t]?.presented ?? 0), 0),
        fmtFlexDate(filteredRows.reduce((date: string | undefined, r) => laterDate(date, r.cells[t]?.lastPresentedAt), undefined)),
      );
      if (showPaid) totalRow.push(filteredRows.reduce((s, r) => s + (r.cells[t]?.paid ?? 0), 0));
    });
    if (showProjected) totalRow.push(filteredRows.reduce((s, r) => s + r.totalProj, 0));
    if (showPresented) totalRow.push(
      filteredRows.reduce((s, r) => s + r.totalPresented, 0),
      fmtFlexDate(filteredRows.reduce((date: string | undefined, r) => laterDate(date, r.totalLastPresentedAt), undefined)),
    );
    if (showPaid) totalRow.push(filteredRows.reduce((s, r) => s + r.totalPaid, 0));

    const ws = XLSX.utils.aoa_to_sheet([
      ['INTEEGRADOS — Informe Tributario'],
      [monthLabel],
      [`Generado: ${generatedAt}`],
      [],
      headerRow1,
      headerRow2,
      ...dataRows,
      totalRow,
    ]);

    // Formato moneda en columnas 1..numCols-1 de las filas de datos y total
    const dataStart = TITLE_ROWS + 2; // 0-based: 4 título + 2 encabezados
    applyFmt(ws, dataStart, dataStart + dataRows.length, Array.from({ length: numCols - 1 }, (_, i) => i + 1));

    // Merges: título abarca todo el ancho, encabezados de tipo por pares
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merges: any[] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: numCols - 1 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: numCols - 1 } },
    ];
    let col = 1;
    visibleTypes.forEach(() => {
      merges.push({ s: { r: TITLE_ROWS, c: col }, e: { r: TITLE_ROWS, c: col + typeColSpan - 1 } });
      col += typeColSpan;
    });
    merges.push({ s: { r: TITLE_ROWS, c: col }, e: { r: TITLE_ROWS, c: col + typeColSpan - 1 } });
    ws['!merges'] = merges;

    const colWidths = [{ wch: 38 }];
    visibleTypes.forEach(() => {
      if (showProjected) colWidths.push({ wch: 20 });
      if (showPresented) colWidths.push({ wch: 22 }, { wch: 22 });
      if (showPaid) colWidths.push({ wch: 20 });
    });
    if (showProjected) colWidths.push({ wch: 20 });
    if (showPresented) colWidths.push({ wch: 22 }, { wch: 22 });
    if (showPaid) colWidths.push({ wch: 20 });
    ws['!cols'] = colWidths;
    ws['!rows'] = [{ hpt: 22 }, { hpt: 18 }, { hpt: 14 }, { hpt: 6 }, { hpt: 20 }, { hpt: 16 }];

    const sheetName1 = filterMonth === 'all' ? `Resumen ${filterYear}` : monthLabel.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName1);

    // ── HOJA 2: DETALLE ───────────────────────────────────────────────────────
    // Mismas empresas que la hoja de resumen — se excluyen las que no tienen
    // ningún valor proyectado ni presentado.
    const visibleCompanyKeys = new Set(filteredRows.map(r => r.key));
    const detailObls = obligations
      .filter(o => (o.year || o.dueDate?.slice(0, 4)) === filterYear)
      .filter(o => filterMonth === 'all' || o.dueDate?.slice(0, 7) === filterMonth)
      .filter(o => o.obligationType !== 'Reportes')
      .filter(o => selectedTypes.has(displayTax(o.taxType)))
      .filter(o => filterStatuses.size === 0 || filterStatuses.has(o.status || ''))
      .filter(o => filterCompany === 'all' || getCompanyKey(o) === filterCompany)
      .filter(o => visibleCompanyKeys.has(getCompanyKey(o)))
      .sort((a, b) => companyIdx(a.company) - companyIdx(b.company) || a.dueDate.localeCompare(b.dueDate));

    const ACCOUNTING_STEPS = ['No iniciado', 'Revisado', 'Informe Enviado', 'Presentado'] as const;
    const detailHeader = [
      'Empresa', 'NIT', 'Tipo de obligación', 'Período', 'Vencimiento',
      'Estado', 'Fecha valor presentado', 'Fecha de pago', 'Proyectado (COP)', 'Valor presentado (COP)', 'Pagado (COP)', 'Contabilidad', 'Financiera',
    ];
    const detailData = detailObls.map(o => {
      const sw = (o as any).stepOwners ?? {};
      const accounting = [...new Set(ACCOUNTING_STEPS.map(s => sw[s]).filter(Boolean) as string[])];
      return [
        o.company, o.nit ?? '', displayTax(o.taxType), normalizePeriod(o.period), o.dueDate,
        o.status || '',
        fmtFlexDate(o.presentedAt), fmtFlexDate(o.paidAt),
        o.projected ?? 0,
        o.presented ?? 0,
        o.paid ?? 0,
        accounting.length ? accounting.join(', ') : (o.accountingUser ?? ''),
        sw['Pagado'] || o.financieraUser || '',
      ];
    });

    const ws2 = XLSX.utils.aoa_to_sheet([
      ['INTEEGRADOS — Detalle de Obligaciones'],
      [monthLabel],
      [`Generado: ${generatedAt}`],
      [],
      detailHeader,
      ...detailData,
    ]);

    // Formato moneda en las columnas de Proyectado / Pagado
    applyFmt(ws2, 5, 4 + detailData.length, [8, 9, 10]);

    ws2['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: detailHeader.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: detailHeader.length - 1 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: detailHeader.length - 1 } },
    ];
    ws2['!cols'] = [
      { wch: 38 }, { wch: 16 }, { wch: 30 }, { wch: 18 }, { wch: 14 },
      { wch: 22 }, { wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 22 }, { wch: 20 }, { wch: 30 }, { wch: 30 },
    ];
    ws2['!rows'] = [{ hpt: 22 }, { hpt: 18 }, { hpt: 14 }, { hpt: 6 }, { hpt: 20 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Detalle');

    const fileSuffix = filterMonth === 'all' ? filterYear : filterMonth;
    XLSX.writeFile(wb, `informe-tributario-${fileSuffix}.xlsx`);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#4A4A4A] flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-[#008C3C]" />
            Informe Tributario
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Proyectado, presentado y pagado por empresa y responsabilidad
          </p>
          <div className="flex gap-1 mt-3">
            <button
              onClick={() => navigate('/contabilidad')}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-200 transition-all"
            >
              <Calendar className="w-3.5 h-3.5" /> Calendario
            </button>
            <button className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-[#008C3C] text-white shadow-sm">
              <BarChart3 className="w-3.5 h-3.5" /> Informe
            </button>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select
            value={filterYear}
            onChange={e => setFilterYear(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-[#4A4A4A] focus:outline-none focus:ring-1 focus:ring-[#008C3C]"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-[#4A4A4A] focus:outline-none focus:ring-1 focus:ring-[#008C3C]"
          >
            <option value="all">Todos los meses</option>
            {[
              ['01','Enero'],['02','Febrero'],['03','Marzo'],['04','Abril'],
              ['05','Mayo'],['06','Junio'],['07','Julio'],['08','Agosto'],
              ['09','Septiembre'],['10','Octubre'],['11','Noviembre'],['12','Diciembre'],
            ].map(([m, label]) => (
              <option key={m} value={`${filterYear}-${m}`}>{label}</option>
            ))}
          </select>
          <button
            onClick={handleExport}
            disabled={visibleTypes.length === 0}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" /> Exportar Excel
          </button>
        </div>
      </div>

      {/* Resumen por estado */}
      {statusSummary.total > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Resumen {filterYear}</p>
            <span className="text-xs text-gray-500">{statusSummary.total} obligaciones en total</span>
          </div>

          {/* Tarjetas */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
            <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-2.5 text-center">
              <p className="text-2xl font-bold text-green-700">{statusSummary.presentado}</p>
              <p className="text-[10px] text-green-600 font-semibold mt-0.5">Presentadas</p>
            </div>
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5 text-center">
              <p className="text-2xl font-bold text-emerald-700">{statusSummary.pagado}</p>
              <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">Pagadas</p>
            </div>
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5 text-center">
              <p className="text-2xl font-bold text-blue-700">{statusSummary.enProceso}</p>
              <p className="text-[10px] text-blue-600 font-semibold mt-0.5">En proceso</p>
            </div>
            <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5 text-center">
              <p className="text-2xl font-bold text-gray-500">{statusSummary.sinIniciar}</p>
              <p className="text-[10px] text-gray-400 font-semibold mt-0.5">Sin iniciar</p>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5 text-center">
              <p className="text-2xl font-bold text-slate-400">{statusSummary.noAplica}</p>
              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">No aplica</p>
            </div>
          </div>

          {/* Barra de progreso */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500 font-medium">Completitud</span>
              <span className={`font-bold ${statusSummary.pct === 100 ? 'text-green-600' : statusSummary.pct >= 60 ? 'text-blue-600' : 'text-orange-500'}`}>
                {statusSummary.pct}% — {statusSummary.done} de {statusSummary.total}
              </span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  statusSummary.pct === 100 ? 'bg-green-500' :
                  statusSummary.pct >= 60  ? 'bg-blue-500'  : 'bg-orange-400'
                }`}
                style={{ width: `${statusSummary.pct}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Filtro de responsabilidades */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 mb-4">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-semibold text-gray-500 mr-1 shrink-0">Responsabilidades:</span>
          <button
            onClick={toggleAll}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              allSelected
                ? 'bg-[#4A4A4A] text-white border-[#4A4A4A]'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
            }`}
          >
            Todas
          </button>
          {allTypes.map(t => {
            const active = selectedTypes.has(t);
            return (
              <button
                key={t}
                onClick={() => toggleType(t)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                  active
                    ? 'bg-[#008C3C] text-white border-[#008C3C]'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-[#008C3C] hover:text-[#008C3C]'
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filtros estado / empresa */}
      <div className="flex gap-2 mb-3 items-center flex-wrap">
        <span className="text-xs font-semibold text-gray-500 shrink-0">Estado:</span>
        {STATUS_OPTIONS.map(([value, label]) => {
          const active = filterStatuses.has(value);
          return (
            <button
              key={value || '__sin_iniciar__'}
              onClick={() => toggleStatus(value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                active
                  ? 'bg-[#008C3C] text-white border-[#008C3C]'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-[#008C3C] hover:text-[#008C3C]'
              }`}
            >
              {label}
            </button>
          );
        })}
        <select
          value={filterCompany}
          onChange={e => setFilterCompany(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-[#4A4A4A] focus:outline-none focus:ring-1 focus:ring-[#008C3C]"
        >
          <option value="all">Todas las empresas</option>
          {companyOptions.map(([key, name]) => (
            <option key={key} value={key}>{shortCompany(name)}</option>
          ))}
        </select>
        {(filterStatuses.size > 0 || filterCompany !== 'all') && (
          <button
            onClick={() => { setFilterStatuses(new Set()); setFilterCompany('all'); }}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Mostrar / ocultar métricas; al menos una debe permanecer activa */}
      <div className="flex gap-2 mb-4 items-center flex-wrap">
        <span className="text-xs font-semibold text-gray-500 shrink-0">Mostrar:</span>
        <button
          onClick={() => toggleMetric('projected')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            showProjected
              ? 'bg-yellow-500 text-white border-yellow-500'
              : 'bg-white text-gray-400 border-gray-200 hover:border-yellow-400'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-current" />
          Con Proyectado
        </button>
        <button
          onClick={() => toggleMetric('presented')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            showPresented
              ? 'bg-purple-600 text-white border-purple-600'
              : 'bg-white text-gray-400 border-gray-200 hover:border-purple-400'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-current" />
          Con Presentado
        </button>
        <button
          onClick={() => toggleMetric('paid')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            showPaid
              ? 'bg-green-600 text-white border-green-600'
              : 'bg-white text-gray-400 border-gray-200 hover:border-green-400'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-current" />
          Con Pagado
        </button>
        {(!showProjected || !showPresented || !showPaid) && (
          <button
            onClick={() => { setShowProjected(true); setShowPresented(true); setShowPaid(true); }}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Mostrar todo
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400">
          {filteredRows.length} empresa{filteredRows.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Leyenda */}
      <div className="flex gap-4 mb-4 text-xs text-gray-500">
        {showProjected && (
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-yellow-100 border border-yellow-300" /> Proyectado
          </span>
        )}
        {showPaid && (
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-green-100 border border-green-300" /> Pagado
          </span>
        )}
        {showPresented && (
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-purple-100 border border-purple-300" /> Presentado
          </span>
        )}
        <span className="flex items-center gap-1.5 ml-auto text-gray-400">
          Clic en empresa para ver detalle
        </span>
      </div>

      {visibleTypes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <BarChart3 className="w-10 h-10 mx-auto mb-3 text-gray-200" />
          <p>Selecciona al menos una responsabilidad</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
            <table className="w-full min-w-max text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left font-semibold text-gray-500 bg-gray-50 sticky left-0 z-10 min-w-[160px]">
                    Empresa
                  </th>
                  {typeColSpan > 0 && visibleTypes.map(t => (
                    <th key={t} colSpan={typeColSpan}
                      className="px-2 py-3 text-center font-semibold text-gray-600 bg-gray-50 border-l border-gray-200 min-w-[180px]">
                      {t}
                    </th>
                  ))}
                  {typeColSpan > 0 && (
                    <th colSpan={typeColSpan} className="px-2 py-3 text-center font-semibold text-gray-700 bg-gray-100 border-l border-gray-300 min-w-[180px]">
                      Total
                    </th>
                  )}
                </tr>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-2 bg-gray-50 sticky left-0 z-10" />
                  {visibleTypes.map(t => (
                    <>
                      {showProjected && (
                        <th key={`${t}-p`} className="px-3 py-2 text-center font-semibold text-yellow-700 bg-yellow-50 border-l border-gray-200 text-[10px] uppercase tracking-wide">
                          Proyectado
                        </th>
                      )}
                      {showPresented && (
                        <>
                          <th key={`${t}-sp`} className="px-3 py-2 text-center font-semibold text-blue-700 bg-blue-50 text-[10px] uppercase tracking-wide">
                            Valor presentado
                          </th>
                          <th key={`${t}-fp`} className="px-3 py-2 text-center font-semibold text-blue-700 bg-blue-50 text-[10px] uppercase tracking-wide">
                            Fecha de presentado
                          </th>
                        </>
                      )}
                      {showPaid && (
                        <th key={`${t}-a`} className="px-3 py-2 text-center font-semibold text-green-700 bg-green-50 text-[10px] uppercase tracking-wide">
                          Pagado
                        </th>
                      )}
                    </>
                  ))}
                  {showProjected && (
                    <th className="px-3 py-2 text-center font-semibold text-yellow-700 bg-yellow-50 border-l border-gray-300 text-[10px] uppercase tracking-wide">
                      Proy. Total
                    </th>
                  )}
                  {showPresented && (
                    <>
                      <th className="px-3 py-2 text-center font-semibold text-blue-700 bg-blue-50 text-[10px] uppercase tracking-wide">
                        Valor presentado total
                      </th>
                      <th className="px-3 py-2 text-center font-semibold text-blue-700 bg-blue-50 text-[10px] uppercase tracking-wide">
                        Fecha de presentado
                      </th>
                    </>
                  )}
                  {showPaid && (
                    <th className="px-3 py-2 text-center font-semibold text-green-700 bg-green-50 text-[10px] uppercase tracking-wide">
                      Pag. Total
                    </th>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {filteredRows.map(row => {
                  const isExp  = expanded.has(row.key);
                  const detail = isExp ? detailRows(row.key) : [];
                  return (
                    <>
                      <tr key={row.key}
                        className="hover:bg-gray-50/70 cursor-pointer transition-colors"
                        onClick={() => toggleExpand(row.key)}
                      >
                        <td className="px-4 py-3 font-medium text-[#4A4A4A] sticky left-0 bg-white z-10 flex items-center gap-1.5">
                          <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExp ? '' : '-rotate-90'}`} />
                          <span>{shortCompany(row.company)}</span>
                          {row.noAplicaCount > 0 && (
                            <span className="ml-1 inline-flex shrink-0 items-center rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-600 not-italic">
                              No aplica{row.noAplicaCount > 1 ? ` (${row.noAplicaCount})` : ''}
                            </span>
                          )}
                        </td>
                        {visibleTypes.map(t => {
                          const c = row.cells[t];
                          return (
                            <>
                              {showProjected && (
                                <td key={`${t}-p`} className="px-3 py-3 text-right text-yellow-700 bg-yellow-50/50 border-l border-gray-100 font-mono">
                                  {c?.projected ? fmtCOPShort(c.projected) : <span className="text-gray-200">—</span>}
                                </td>
                              )}
                              {showPresented && (
                                <>
                                  <td key={`${t}-sp`} className="px-3 py-3 text-center bg-blue-50/40 text-[11px] font-medium text-blue-700">
                                    {c?.presented ? fmtCOPShort(c.presented) : <span className="text-gray-200">—</span>}
                                  </td>
                                  <td key={`${t}-fp`} className="px-3 py-3 text-center bg-blue-50/40 text-[11px] text-gray-500 whitespace-nowrap">
                                    {c?.lastPresentedAt ? fmtFlexDate(c.lastPresentedAt) : <span className="text-gray-200">—</span>}
                                  </td>
                                </>
                              )}
                              {showPaid && (
                                <td key={`${t}-a`} className="px-3 py-3 text-right text-green-700 bg-green-50/50 font-mono">
                                  {c?.paid ? fmtCOPShort(c.paid) : <span className="text-gray-200">—</span>}
                                </td>
                              )}
                            </>
                          );
                        })}
                        {showProjected && (
                          <td className="px-3 py-3 text-right text-yellow-800 bg-yellow-50 border-l border-gray-300 font-mono font-semibold">
                            {row.totalProj ? fmtCOPShort(row.totalProj) : <span className="text-gray-200">—</span>}
                          </td>
                        )}
                        {showPresented && (
                          <>
                            <td className="px-3 py-3 text-center bg-blue-50 text-[11px] font-semibold text-blue-800">
                              {row.totalPresented ? fmtCOPShort(row.totalPresented) : <span className="text-gray-200">—</span>}
                            </td>
                            <td className="px-3 py-3 text-center bg-blue-50 text-[11px] text-gray-600 whitespace-nowrap">
                              {row.totalLastPresentedAt ? fmtFlexDate(row.totalLastPresentedAt) : <span className="text-gray-200">—</span>}
                            </td>
                          </>
                        )}
                        {showPaid && (
                          <td className="px-3 py-3 text-right text-green-800 bg-green-50 font-mono font-semibold">
                            {row.totalPaid ? fmtCOPShort(row.totalPaid) : <span className="text-gray-200">—</span>}
                          </td>
                        )}
                      </tr>

                      {isExp && detail.map(obl => (
                        <tr key={obl.id} className="bg-gray-50/80 text-[10px]">
                          <td className="pl-10 pr-4 py-2 text-gray-500 sticky left-0 bg-gray-50/80 z-10 italic">
                            <span>{obl.taxType} — {normalizePeriod(obl.period)}</span>
                            {obl.status === 'No aplica' && (
                              <span className="ml-2 inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-600 not-italic">
                                No aplica
                              </span>
                            )}
                          </td>
                          {visibleTypes.map(t => {
                            const isThis = obl.taxType === t;
                            return (
                              <>
                                {showProjected && (
                                  <td key={`d-${t}-p`} className="px-3 py-2 text-right border-l border-gray-100 bg-yellow-50/30 font-mono text-yellow-700">
                                    {isThis && obl.projected ? fmtCOPShort(obl.projected) : ''}
                                  </td>
                                )}
                                {showPresented && (
                                  <>
                                    <td key={`d-${t}-sp`} className="px-3 py-2 text-center bg-blue-50/20 text-blue-700">
                                      {isThis && obl.presented ? fmtCOPShort(obl.presented) : ''}
                                    </td>
                                    <td key={`d-${t}-fp`} className="px-3 py-2 text-center bg-blue-50/20 text-gray-500 whitespace-nowrap">
                                      {isThis && obl.presentedAt ? fmtFlexDate(obl.presentedAt) : ''}
                                    </td>
                                  </>
                                )}
                                {showPaid && (
                                  <td key={`d-${t}-a`} className="px-3 py-2 text-right bg-green-50/30 font-mono text-green-700">
                                    {isThis && obl.paid ? fmtCOPShort(obl.paid) : ''}
                                  </td>
                                )}
                              </>
                            );
                          })}
                          {showProjected && (
                            <td className="px-3 py-2 text-right border-l border-gray-300 bg-yellow-50/30 font-mono text-yellow-700">
                              {obl.projected ? fmtCOPShort(obl.projected) : ''}
                            </td>
                          )}
                          {showPresented && (
                            <>
                              <td className="px-3 py-2 text-center bg-blue-50/20 text-blue-700">
                                {obl.presented ? fmtCOPShort(obl.presented) : ''}
                              </td>
                              <td className="px-3 py-2 text-center bg-blue-50/20 text-gray-500 whitespace-nowrap">
                                {obl.presentedAt ? fmtFlexDate(obl.presentedAt) : ''}
                              </td>
                            </>
                          )}
                          {showPaid && (
                            <td className="px-3 py-2 text-right bg-green-50/30 font-mono text-green-700">
                              {obl.paid ? fmtCOPShort(obl.paid) : ''}
                            </td>
                          )}
                        </tr>
                      ))}
                    </>
                  );
                })}
              </tbody>

              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-900">
                  <td className="px-4 py-3 font-bold text-white sticky left-0 bg-gray-900 z-10 text-xs uppercase tracking-wider">
                    TOTAL
                  </td>
                  {visibleTypes.map(t => {
                    const proj = filteredRows.reduce((s, r) => s + (r.cells[t]?.projected ?? 0), 0);
                    const paid  = filteredRows.reduce((s, r) => s + (r.cells[t]?.paid  ?? 0), 0);
                    const presented = filteredRows.reduce((s, r) => s + (r.cells[t]?.presented ?? 0), 0);
                    const lastPresentedAt = filteredRows.reduce((acc: string | undefined, r) => laterDate(acc, r.cells[t]?.lastPresentedAt), undefined as string | undefined);
                    return (
                      <>
                        {showProjected && (
                          <td key={`t-${t}-p`} className="px-3 py-3 text-right text-yellow-300 font-bold font-mono border-l border-gray-700 text-xs">
                            {proj ? fmtCOP(proj) : '—'}
                          </td>
                        )}
                        {showPresented && (
                          <>
                            <td key={`t-${t}-sp`} className="px-3 py-3 text-center text-blue-300 font-bold text-[11px]">
                              {presented ? fmtCOP(presented) : '—'}
                            </td>
                            <td key={`t-${t}-fp`} className="px-3 py-3 text-center text-blue-200 text-[11px] whitespace-nowrap">
                              {lastPresentedAt ? fmtFlexDate(lastPresentedAt) : '—'}
                            </td>
                          </>
                        )}
                        {showPaid && (
                          <td key={`t-${t}-a`} className="px-3 py-3 text-right text-green-300 font-bold font-mono text-xs">
                            {paid ? fmtCOP(paid) : '—'}
                          </td>
                        )}
                      </>
                    );
                  })}
                  {showProjected && (
                    <td className="px-3 py-3 text-right text-yellow-200 font-bold font-mono border-l border-gray-600 text-xs">
                      {fmtCOP(filteredRows.reduce((s, r) => s + r.totalProj, 0))}
                    </td>
                  )}
                  {showPresented && (
                    <>
                      <td className="px-3 py-3 text-center text-blue-300 font-bold text-[11px]">
                        {fmtCOP(filteredRows.reduce((s, r) => s + r.totalPresented, 0))}
                      </td>
                      <td className="px-3 py-3 text-center text-blue-200 text-[11px] whitespace-nowrap">
                        {(() => {
                          const d = filteredRows.reduce((acc: string | undefined, r) => laterDate(acc, r.totalLastPresentedAt), undefined as string | undefined);
                          return d ? fmtFlexDate(d) : '—';
                        })()}
                      </td>
                    </>
                  )}
                  {showPaid && (
                    <td className="px-3 py-3 text-right text-green-200 font-bold font-mono text-xs">
                      {fmtCOP(filteredRows.reduce((s, r) => s + r.totalPaid, 0))}
                    </td>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>

          {filteredRows.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 text-gray-200" />
              <p>No hay datos para {filterYear}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};
