import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Download, GraduationCap, Search } from 'lucide-react';
import { db } from '@/config/firebase';
import { FIRESTORE_COLLECTIONS } from '@/config/firestoreCollections';
import { analyticalAccountOf, isApprenticeRelation, toDate } from '@/services/analyticsService';
import { HrEmployeeDetailDialog } from '@/components/users/HrEmployeeDetailDialog';
import { DistributionCard } from '@/components/analytics/DistributionCard';
import type { Company } from '@/models/types/Company';
import type { EmploymentRelationship } from '@/models/types/HumanResourceRecord';

// Aprendices SENA activos (contrato "laboral especial" / cuenta APRENDICES),
// tomados de las relaciones laborales de Expedientes. No cuentan en el
// headcount de rotación, pero TH necesita verlos aparte: quiénes son, en qué
// etapa están y en qué cuenta analítica y empresa.

type Stage = 'Productiva' | 'Lectiva' | 'Sin definir';

interface ApprenticeRow {
  employmentId: string;
  employeeId: string;
  fullName: string;
  documentNumber: string;
  company: string;
  account: string;
  stage: Stage;
  position: string;
  startDate: Date | null;
}

const normalize = (value?: string) => String(value ?? '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

const stageOf = (contractType?: string): Stage => {
  const value = normalize(contractType);
  if (value.includes('productiva')) return 'Productiva';
  if (value.includes('lectiva')) return 'Lectiva';
  return 'Sin definir';
};

const STAGE_STYLES: Record<Stage, string> = {
  Productiva: 'bg-green-50 text-green-700',
  Lectiva: 'bg-blue-50 text-blue-700',
  'Sin definir': 'bg-gray-100 text-gray-500',
};

const formatDate = (date: Date | null) => date
  ? date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

const monthsSince = (date: Date | null) => {
  if (!date) return null;
  const now = new Date();
  return Math.max(0, (now.getFullYear() - date.getFullYear()) * 12 + now.getMonth() - date.getMonth());
};

const countBy = (rows: ApprenticeRow[], key: (row: ApprenticeRow) => string) => {
  const map = new Map<string, number>();
  rows.forEach(row => map.set(key(row), (map.get(key(row)) ?? 0) + 1));
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
};

type EmployeeName = { fullName: string; documentNumber: string };

export function SenaApprenticesPanel({ employments, thCompanies, filterCompany, knownNames }: {
  employments: EmploymentRelationship[];
  thCompanies: Company[];
  filterCompany: string;
  /** Nombres ya descargados por la pantalla (por id de expediente); evita una consulta por aprendiz. */
  knownNames?: Map<string, EmployeeName>;
}) {
  const [names, setNames] = useState<Map<string, EmployeeName>>(new Map());
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<Stage | 'all'>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [openEmployeeId, setOpenEmployeeId] = useState<string | null>(null);
  const requestedIds = useRef(new Set<string>());

  // Relaciones activas de aprendices en empresas TH (y en la empresa filtrada).
  const relations = useMemo(() => employments.filter(r => {
    if (r.status !== 'active' || !isApprenticeRelation(r)) return false;
    const company = thCompanies.find(c => (r.companyId && r.companyId === c.id)
      || [c.name, ...(c.aliases ?? [])].map(normalize).includes(normalize(r.companyName)));
    if (!company) return false;
    return filterCompany === 'all' || normalize(company.name) === normalize(filterCompany);
  }), [employments, thCompanies, filterCompany]);

  // Las relaciones no traen el nombre: se lee solo el expediente de cada aprendiz.
  useEffect(() => {
    const requested = requestedIds.current;
    const missing = [...new Set(relations.map(r => r.employeeId))]
      .filter(id => id && !requested.has(id) && !knownNames?.has(id));
    if (!missing.length) return;
    missing.forEach(id => requested.add(id));
    Promise.all(missing.map(async id => {
      const snapshot = await getDoc(doc(db, FIRESTORE_COLLECTIONS.employees, id));
      const data = snapshot.data() as { fullName?: string; documentNumber?: string } | undefined;
      return [id, { fullName: data?.fullName || 'Sin nombre', documentNumber: data?.documentNumber || id }] as const;
    }))
      .then(entries => setNames(prev => new Map([...prev, ...entries])))
      .catch(error => {
        // Que un nuevo render pueda reintentarlos.
        missing.forEach(id => requested.delete(id));
        console.error('Error cargando aprendices:', error);
      });
  }, [relations, knownNames]);

  const nameOf = (id: string) => knownNames?.get(id) ?? names.get(id);
  const rows: ApprenticeRow[] = useMemo(() => relations.map(r => ({
    employmentId: r.id,
    employeeId: r.employeeId,
    fullName: nameOf(r.employeeId)?.fullName ?? 'Cargando…',
    documentNumber: nameOf(r.employeeId)?.documentNumber ?? '',
    company: thCompanies.find(c => (r.companyId && r.companyId === c.id)
      || [c.name, ...(c.aliases ?? [])].map(normalize).includes(normalize(r.companyName)))?.name ?? r.companyName ?? '—',
    account: analyticalAccountOf(r) || 'Sin cuenta analítica',
    stage: stageOf(r.contractType),
    position: r.position || '',
    startDate: toDate(r.startDate),
  })).sort((a, b) => a.fullName.localeCompare(b.fullName, 'es')), [relations, names, knownNames, thCompanies]);

  const byStage = countBy(rows, row => row.stage);
  const stageCount = (stage: Stage) => byStage.find(([name]) => name === stage)?.[1] ?? 0;
  const byAccount = countBy(rows, row => row.account);
  const byCompany = countBy(rows, row => row.company);
  const thisYear = new Date().getFullYear();
  const joinedThisYear = rows.filter(row => row.startDate?.getFullYear() === thisYear).length;

  const visibleRows = rows.filter(row => {
    if (stageFilter !== 'all' && row.stage !== stageFilter) return false;
    if (accountFilter !== 'all' && row.account !== accountFilter) return false;
    const term = normalize(search);
    return !term || [row.fullName, row.documentNumber, row.company, row.account].some(value => normalize(value).includes(term));
  });

  const exportExcel = async () => {
    // Carga diferida: xlsx pesa ~430 KB y este panel está en la pantalla de inicio.
    const XLSX = await import('xlsx');
    const sheet = XLSX.utils.json_to_sheet(visibleRows.map(row => ({
      Nombre: row.fullName,
      Documento: row.documentNumber,
      Empresa: row.company,
      'Cuenta analítica': row.account,
      Etapa: row.stage,
      Cargo: row.position,
      'Fecha de ingreso': row.startDate ? row.startDate.toLocaleDateString('es-CO') : '',
      'Meses en la empresa': monthsSince(row.startDate) ?? '',
    })));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Aprendices SENA');
    XLSX.writeFile(book, `aprendices-sena-activos-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const kpis = [
    { label: 'Aprendices activos', value: rows.length },
    { label: 'Etapa productiva', value: stageCount('Productiva') },
    { label: 'Etapa lectiva', value: stageCount('Lectiva') },
    { label: `Ingresaron en ${thisYear}`, value: joinedThisYear },
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3 mt-7">
        <p className="flex items-center gap-1.5 text-[11px] font-bold text-[#8B93A1] uppercase tracking-wider">
          <GraduationCap className="w-3.5 h-3.5" />Aprendices SENA activos
        </p>
        <span className="text-[11px] text-[#8B93A1]">No cuentan en el headcount de rotación</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-gray-400 italic py-6 text-center bg-white rounded-xl border border-[#E7E9EE]">
          {filterCompany === 'all' ? 'No hay aprendices SENA activos' : `No hay aprendices SENA activos en ${filterCompany}`}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {kpis.map(kpi => (
              <div key={kpi.label} className="bg-white rounded-xl border border-[#E7E9EE] shadow-sm p-4">
                <p className="text-[11px] font-semibold text-[#8B93A1] uppercase tracking-wide">{kpi.label}</p>
                <p className="mt-1 text-2xl font-bold text-[#14171C] leading-none">{kpi.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <DistributionCard title="Por cuenta analítica" items={byAccount} total={rows.length} />
            <DistributionCard title="Por empresa" items={byCompany} total={rows.length} />
          </div>

          <div className="bg-white rounded-xl border border-[#E7E9EE] shadow-sm">
            <div className="flex flex-wrap items-center gap-2 p-3 border-b border-[#E7E9EE]">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por nombre, documento, empresa o cuenta"
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[#E7E9EE] focus:outline-none focus:border-[#008C3C]"
                />
              </div>
              <select
                value={stageFilter}
                onChange={e => setStageFilter(e.target.value as Stage | 'all')}
                className="text-xs rounded-lg border border-[#E7E9EE] px-2 py-1.5 bg-white"
              >
                <option value="all">Todas las etapas</option>
                <option value="Productiva">Productiva</option>
                <option value="Lectiva">Lectiva</option>
                {stageCount('Sin definir') > 0 && <option value="Sin definir">Sin definir</option>}
              </select>
              <select
                value={accountFilter}
                onChange={e => setAccountFilter(e.target.value)}
                className="text-xs rounded-lg border border-[#E7E9EE] px-2 py-1.5 bg-white max-w-[200px]"
              >
                <option value="all">Todas las cuentas</option>
                {byAccount.map(([name]) => <option key={name} value={name}>{name}</option>)}
              </select>
              <button
                onClick={exportExcel}
                disabled={!visibleRows.length}
                className="flex items-center gap-1.5 text-xs font-medium rounded-lg border border-[#E7E9EE] px-2.5 py-1.5 text-[#14171C] hover:bg-gray-50 disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />Excel
              </button>
            </div>
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 text-[#8B93A1]">
                  <tr>
                    <th className="text-left font-semibold px-4 py-2.5">Aprendiz</th>
                    <th className="text-left font-semibold px-4 py-2.5">Empresa</th>
                    <th className="text-left font-semibold px-4 py-2.5">Cuenta analítica</th>
                    <th className="text-left font-semibold px-4 py-2.5">Etapa</th>
                    <th className="text-left font-semibold px-4 py-2.5">Ingreso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F2F4]">
                  {visibleRows.map(row => {
                    const months = monthsSince(row.startDate);
                    return (
                      <tr
                        key={row.employmentId}
                        onClick={() => setOpenEmployeeId(row.employeeId)}
                        className="hover:bg-green-50/60 cursor-pointer transition-colors"
                        title="Abrir expediente"
                      >
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-[#14171C]">{row.fullName}</p>
                          <p className="font-mono text-[10px] text-gray-400">{row.documentNumber}</p>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{row.company}</td>
                        <td className="px-4 py-2.5 text-gray-600">{row.account}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STAGE_STYLES[row.stage]}`}>{row.stage}</span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">
                          <p>{formatDate(row.startDate)}</p>
                          {months !== null && <p className="text-[10px] text-gray-400">{months === 1 ? '1 mes' : `${months} meses`}</p>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!visibleRows.length && <p className="text-center text-xs text-gray-400 py-8">Ningún aprendiz coincide con los filtros.</p>}
            </div>
          </div>
        </div>
      )}

      <HrEmployeeDetailDialog
        employeeId={openEmployeeId}
        open={!!openEmployeeId}
        onOpenChange={open => { if (!open) setOpenEmployeeId(null); }}
      />
    </div>
  );
}
