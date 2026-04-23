import { useState, useEffect, useMemo, useRef } from 'react';
import {
  AlertTriangle, CheckCircle2, Calendar,
  Search, Download, Upload, ChevronLeft, ChevronRight,
  X, FileText, Loader2, AlertCircle, Paperclip, ExternalLink, Trash2, Plus, Edit2, Bell, Settings2,
} from 'lucide-react';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/config/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { taxCalendarService } from '@/services/taxCalendarService';
import { rolesService } from '@/services/rolesService';
import type { TaxObligation, TaxStatus, TaxAttachment } from '@/models/types/TaxObligation';
import { TAX_SEED } from './taxSeed';

// ── constants ─────────────────────────────────────────────────────────────────

const STATUSES: TaxStatus[] = [
  '', 'No iniciado', 'Revisado', 'Presentado', 'Informe Enviado', 'No aplica', 'Pagado',
];

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  '':               { label: 'Pendiente',       color: 'text-gray-500',   bg: 'bg-gray-100',    dot: 'bg-gray-400' },
  'No iniciado':    { label: 'No iniciado',      color: 'text-gray-600',   bg: 'bg-gray-100',    dot: 'bg-gray-400' },
  'Revisado':       { label: 'Revisado',         color: 'text-blue-700',   bg: 'bg-blue-50',     dot: 'bg-blue-500' },
  'Presentado':     { label: 'Presentado',       color: 'text-purple-700', bg: 'bg-purple-50',   dot: 'bg-purple-500' },
  'Informe Enviado':{ label: 'Informe Enviado',  color: 'text-teal-700',   bg: 'bg-teal-50',     dot: 'bg-teal-500' },
  'No aplica':      { label: 'No aplica',        color: 'text-gray-400',   bg: 'bg-gray-50',     dot: 'bg-gray-300' },
  'Pagado':         { label: 'Pagado',           color: 'text-green-700',  bg: 'bg-green-50',    dot: 'bg-green-500' },
};

const COMPLETED = new Set(['Pagado', 'No aplica', 'Informe Enviado']);

const PAGE_SIZE = 25;

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dateStr + 'T00:00:00');
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function alertLevel(obl: TaxObligation): 'overdue' | 'urgent' | 'soon' | 'ok' | 'done' {
  if (COMPLETED.has(obl.status)) return 'done';
  const d = safeDaysUntil(obl.dueDate);
  if (d === null) return 'ok';
  if (d < 0)  return 'overdue';
  if (d <= 7)  return 'urgent';
  if (d <= 15) return 'soon';
  return 'ok';
}

const ALERT_ROW: Record<string, string> = {
  overdue: 'bg-red-50 border-l-4 border-l-red-400',
  urgent:  'bg-orange-50 border-l-4 border-l-orange-400',
  soon:    'bg-yellow-50 border-l-4 border-l-yellow-300',
  ok:      '',
  done:    '',
};

function isValidDate(d: string): boolean {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function fmtDate(d: string) {
  if (!isValidDate(d)) return d || '—';
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

function safeDaysUntil(dateStr: string): number | null {
  if (!isValidDate(dateStr)) return null;
  return daysUntil(dateStr);
}

// ── component ─────────────────────────────────────────────────────────────────

export const TaxCalendarPage = () => {
  const [obligations,      setObligations]      = useState<TaxObligation[]>([]);
  const [accountingUsers,  setAccountingUsers]  = useState<{ name: string; email: string }[]>([]);
  const [loading, setLoading]   = useState(true);
  const [seeding,   setSeeding]   = useState(false);
  const [alerting,    setAlerting]    = useState(false);
  const [scheduling,  setScheduling]  = useState(false);
  const [schedOpen,   setSchedOpen]   = useState(false);
  const [schedDays,   setSchedDays]   = useState('90');
  const [page, setPage]         = useState(1);

  // Filters
  const [search,        setSearch]        = useState('');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterType,    setFilterType]    = useState('all');
  const [filterOblType, setFilterOblType] = useState('all');
  const [filterStatus,  setFilterStatus]  = useState('all');
  const [filterYear,    setFilterYear]    = useState('all');
  const [filterMonth,   setFilterMonth]   = useState('all');
  const [filterAlert,   setFilterAlert]   = useState('all'); // overdue|urgent|soon

  // Edit / create dialog
  const [editObl,   setEditObl]   = useState<TaxObligation | null>(null);
  const [isNew,     setIsNew]     = useState(false);
  const [saving,    setSaving]    = useState(false);

  const EMPTY_FORM = {
    company: '', nit: '', city: 'Bogotá', scope: 'Nacional',
    taxType: '', obligationType: 'Impuestos',
    period: '', dueDate: '', year: String(new Date().getFullYear()),
    advisor: '', status: '' as TaxStatus, observation: '',
  };
  const [form, setForm] = useState(EMPTY_FORM);
  const setF = (k: keyof typeof EMPTY_FORM, v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  // Attachments inside edit dialog
  const [attachments,    setAttachments]    = useState<TaxAttachment[]>([]);
  const [uploading,      setUploading]      = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const attachFileRef = useRef<HTMLInputElement>(null);

  // Import dialog
  const [importOpen, setImportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [data, allRoleUsers] = await Promise.all([
        taxCalendarService.getAll(),
        rolesService.getAll(),
      ]);
      setObligations(data);
      setAccountingUsers(
        allRoleUsers
          .filter(u => u.role === 'contabilidad' || u.role === 'admin')
          .map(u => ({ name: u.name, email: u.email }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch (e: any) {
      toast.error('Error al cargar', { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── Seed initial data ────────────────────────────────────────────────────

  const handleSeed = async () => {
    if (!confirm(`¿Cargar ${TAX_SEED.length} obligaciones del calendario tributario 2025-2026?`)) return;
    setSeeding(true);
    try {
      await taxCalendarService.seedFromArray(TAX_SEED as any);
      toast.success(`${TAX_SEED.length} obligaciones cargadas exitosamente`);
      await load();
    } catch (e: any) {
      toast.error('Error al cargar datos', { description: e.message });
    } finally {
      setSeeding(false);
    }
  };

  // ── Calendar scheduling ───────────────────────────────────────────────────

  const handleSchedule = async () => {
    setScheduling(true);
    try {
      const fn = httpsCallable<{ daysAhead: number }, { scheduled: number; skipped: number; error?: string }>(
        functions, 'scheduleTaxInCalendar'
      );
      const res = await fn({ daysAhead: Number(schedDays) });
      const { scheduled, skipped, error } = res.data;
      if (error) { toast.error(error); return; }
      if (scheduled === 0 && skipped === 0) {
        toast.info('Sin obligaciones para agendar', {
          description: `No hay vencimientos pendientes en los próximos ${schedDays} días.`,
        });
      } else {
        toast.success(`${scheduled} evento${scheduled !== 1 ? 's' : ''} agendado${scheduled !== 1 ? 's' : ''} en Teams`, {
          description: skipped > 0 ? `${skipped} ya estaban agendados.` : 'Revisa el calendario de Teams/Outlook.',
        });
      }
      setSchedOpen(false);
    } catch (e: any) {
      toast.error('Error al agendar', { description: e.message });
    } finally {
      setScheduling(false);
    }
  };

  // ── Manual alert trigger ─────────────────────────────────────────────────

  const handleSendAlerts = async () => {
    if (!confirm('¿Enviar alertas de vencimiento ahora a todos los asesores de contabilidad?')) return;
    setAlerting(true);
    try {
      const fn = httpsCallable<void, { sent: number; skipped: number }>(functions, 'triggerTaxAlerts');
      const res = await fn();
      const { sent, skipped } = res.data;
      if (sent === 0 && skipped === 0) {
        toast.info('Sin alertas pendientes', {
          description: 'No hay obligaciones que venzan en los próximos 1, 3, 7 o 15 días.',
        });
      } else {
        toast.success(`Alertas enviadas a ${sent} persona${sent !== 1 ? 's' : ''}`, {
          description: skipped > 0 ? `${skipped} ya habían sido enviadas hoy.` : undefined,
        });
      }
    } catch (e: any) {
      toast.error('Error al enviar alertas', { description: e.message });
    } finally {
      setAlerting(false);
    }
  };

  // ── Import from Excel ────────────────────────────────────────────────────

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const XLSX = await import('xlsx');
      const ab   = await file.arrayBuffer();
      const wb   = XLSX.read(ab);
      // Look for "Calendario 2026" or first sheet
      const sheetName = wb.SheetNames.find(s => s.toLowerCase().includes('calendar')) ?? wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
      // Find header row (contains 'Nombre')
      const headerIdx = raw.findIndex(r => r.some((c: any) => String(c).toLowerCase() === 'nombre'));
      if (headerIdx < 0) { toast.error('No se encontró la cabecera del Excel'); return; }
      const records: Omit<TaxObligation, 'id'>[] = [];
      for (let i = headerIdx + 1; i < raw.length; i++) {
        const row = raw[i];
        if (!row[0] || row[0] === 'Nombre') continue;
        let due = row[9];
        if (!due) continue;
        // Excel serial to date
        if (typeof due === 'number') {
          const d = new Date(Math.round((due - 25569) * 86400 * 1000));
          due = d.toISOString().slice(0, 10);
        } else if (due instanceof Date) {
          due = due.toISOString().slice(0, 10);
        } else {
          due = String(due).slice(0, 10);
        }
        const status = String(row[12] || '').trim();
        records.push({
          company:        String(row[0] || '').trim(),
          nit:            String(row[1] || '').trim(),
          city:           String(row[4] || '').trim(),
          scope:          String(row[5] || '').trim(),
          taxType:        String(row[6] || '').trim(),
          obligationType: String(row[7] || '').trim(),
          period:         String(row[8] || '').trim(),
          dueDate:        due,
          year:           String(row[10] || '').trim(),
          status:         (['Pagado','Revisado','Presentado','Informe Enviado','No aplica','No iniciado'].includes(status) ? status : '') as TaxStatus,
          advisor:        String(row[21] || '').trim(),
          observation:    String(row[16] || '').trim(),
        });
      }
      await taxCalendarService.seedFromArray(records);
      toast.success(`${records.length} obligaciones importadas`);
      setImportOpen(false);
      await load();
    } catch (e: any) {
      toast.error('Error importando', { description: e.message });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // ── Status update ────────────────────────────────────────────────────────

  const openEdit = (obl: TaxObligation) => {
    setIsNew(false);
    setEditObl(obl);
    setForm({
      company:        obl.company,
      nit:            obl.nit,
      city:           obl.city,
      scope:          obl.scope,
      taxType:        obl.taxType,
      obligationType: obl.obligationType,
      period:         obl.period,
      dueDate:        obl.dueDate,
      year:           obl.year,
      advisor:        obl.advisor,
      status:         obl.status,
      observation:    obl.observation,
    });
    setAttachments(obl.attachments ?? []);
    setUploadProgress(0);
  };

  const openNew = () => {
    setIsNew(true);
    setEditObl({ id: '__new__' } as TaxObligation);
    setForm(EMPTY_FORM);
    setAttachments([]);
    setUploadProgress(0);
  };

  const closeDialog = () => { setEditObl(null); setIsNew(false); };

  const handleSave = async () => {
    if (!form.company.trim() || !form.taxType.trim() || !form.dueDate) {
      toast.error('Empresa, tipo de impuesto y fecha son obligatorios'); return;
    }
    if (uploading) { toast.error('Espera a que termine de subir el archivo'); return; }
    setSaving(true);
    try {
      const data = { ...form, attachments };
      if (isNew) {
        await taxCalendarService.create(data as any);
        toast.success('Vencimiento creado');
      } else if (editObl) {
        await taxCalendarService.update(editObl.id, data as any);
        toast.success('Guardado');
      }
      closeDialog();
      await load();
    } catch (e: any) {
      toast.error('Error', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteObl = async (obl: TaxObligation, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`¿Eliminar "${obl.taxType} · ${obl.period}"?`)) return;
    try {
      await taxCalendarService.delete(obl.id);
      setObligations(prev => prev.filter(o => o.id !== obl.id));
      toast.success('Eliminado');
    } catch (err: any) {
      toast.error('Error', { description: err.message });
    }
  };

  const handleAttachFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editObl) return;
    if (file.size > 20 * 1024 * 1024) { toast.error('El archivo supera los 20 MB'); return; }
    if (attachments.length >= 5) { toast.error('Máximo 5 archivos por obligación'); return; }

    setUploading(true); setUploadProgress(0);
    const path = `tax_obligations/${editObl.id}/${Date.now()}_${file.name}`;
    const ref  = storageRef(storage, path);
    const task = uploadBytesResumable(ref, file);

    task.on('state_changed',
      snap => setUploadProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
      err  => { toast.error(`Error subiendo ${file.name}`, { description: err.message }); setUploading(false); },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        const newAtt: TaxAttachment = {
          name: file.name, url, size: file.size,
          uploadedAt: new Date().toISOString(),
        };
        setAttachments(prev => [...prev, newAtt]);
        setUploading(false); setUploadProgress(0);
        toast.success(`${file.name} subido`);
      }
    );
    e.target.value = '';
  };

  const handleDeleteAttachment = async (att: TaxAttachment) => {
    if (!confirm(`¿Eliminar "${att.name}"?`)) return;
    try {
      const ref = storageRef(storage, att.url);
      await deleteObject(ref).catch(() => {}); // ignore if already deleted
      setAttachments(prev => prev.filter(a => a.url !== att.url));
    } catch (e: any) {
      toast.error('Error', { description: e.message });
    }
  };

  function fmtSize(bytes?: number) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  // ── Excel export ─────────────────────────────────────────────────────────

  const handleExport = async () => {
    const XLSX = await import('xlsx');
    const rows = filtered.map(o => ({
      'Empresa':        o.company,
      'NIT':            o.nit,
      'Ciudad':         o.city,
      'Ámbito':         o.scope,
      'Tipo Impuesto':  o.taxType,
      'Tipo Obligación':o.obligationType,
      'Periodo':        o.period,
      'Fecha Venc.':    fmtDate(o.dueDate),
      'Año':            o.year,
      'Estado':         STATUS_CFG[o.status]?.label ?? o.status,
      'Días':           safeDaysUntil(o.dueDate) ?? '—',
      'Asesor':         o.advisor,
      'Observación':    o.observation,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [30,14,10,10,30,20,12,12,6,14,8,30,30].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Calendario Tributario');
    XLSX.writeFile(wb, `CalendarioTributario_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // ── Derived data ─────────────────────────────────────────────────────────

  const companies   = useMemo(() => [...new Set(obligations.map(o => o.company))].sort(), [obligations]);
  const taxTypes    = useMemo(() => [...new Set(obligations.map(o => o.taxType))].sort(), [obligations]);
  const oblTypes    = useMemo(() => [...new Set(obligations.map(o => o.obligationType))].sort(), [obligations]);
  const years       = useMemo(() => [...new Set(obligations.map(o => o.year))].sort(), [obligations]);

  const today = new Date(); today.setHours(0,0,0,0);

  // KPIs
  const kpis = useMemo(() => {
    const total    = obligations.length;
    const overdue  = obligations.filter(o => { const d = safeDaysUntil(o.dueDate); return !COMPLETED.has(o.status) && d !== null && d < 0; }).length;
    const urgent   = obligations.filter(o => { const d = safeDaysUntil(o.dueDate); return !COMPLETED.has(o.status) && d !== null && d >= 0 && d <= 7; }).length;
    const done     = obligations.filter(o => COMPLETED.has(o.status)).length;
    const thisMonth = obligations.filter(o => {
      const d = new Date(o.dueDate + 'T00:00:00');
      return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
    }).length;
    return { total, overdue, urgent, done, thisMonth };
  }, [obligations]);

  // Filtered list
  const filtered = useMemo(() => {
    return obligations.filter(o => {
      if (filterCompany !== 'all' && o.company !== filterCompany) return false;
      if (filterType    !== 'all' && o.taxType !== filterType)    return false;
      if (filterOblType !== 'all' && o.obligationType !== filterOblType) return false;
      if (filterStatus  !== 'all' && o.status !== filterStatus)  return false;
      if (filterYear    !== 'all' && o.year   !== filterYear)    return false;
      if (filterMonth   !== 'all') {
        const d = new Date(o.dueDate + 'T00:00:00');
        if (d.getMonth() + 1 !== Number(filterMonth)) return false;
      }
      if (filterAlert !== 'all') {
        const level = alertLevel(o);
        if (filterAlert === 'overdue' && level !== 'overdue') return false;
        if (filterAlert === 'urgent'  && level !== 'urgent')  return false;
        if (filterAlert === 'pending' && level === 'done')     return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (!o.company.toLowerCase().includes(q) &&
            !o.taxType.toLowerCase().includes(q) &&
            !o.period.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [obligations, filterCompany, filterType, filterOblType, filterStatus, filterYear, filterMonth, filterAlert, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resetFilters = () => {
    setSearch(''); setFilterCompany('all'); setFilterType('all');
    setFilterOblType('all'); setFilterStatus('all'); setFilterYear('all');
    setFilterMonth('all'); setFilterAlert('all'); setPage(1);
  };
  const hasFilters = search || filterCompany !== 'all' || filterType !== 'all' ||
    filterOblType !== 'all' || filterStatus !== 'all' || filterYear !== 'all' ||
    filterMonth !== 'all' || filterAlert !== 'all';

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-screen">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#4A4A4A] flex items-center gap-2">
            <Calendar className="w-7 h-7 text-[#008C3C]" />
            Calendario Tributario
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Vencimientos y obligaciones fiscales · {obligations.length} registros
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {obligations.length === 0 && !loading && (
            <Button
              onClick={handleSeed}
              disabled={seeding}
              className="bg-[#1F8FBF] hover:bg-[#1677a0] text-white"
            >
              {seeding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Cargar datos iniciales
            </Button>
          )}
          <Button onClick={openNew} className="bg-[#008C3C] hover:bg-[#006C2F] text-white">
            <Plus className="w-4 h-4 mr-2" /> Nuevo vencimiento
          </Button>
          <Button
            variant="outline"
            onClick={handleSendAlerts}
            disabled={alerting || obligations.length === 0}
            className="border-amber-200 text-amber-600 hover:bg-amber-50"
          >
            {alerting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bell className="w-4 h-4 mr-2" />}
            Enviar alertas
          </Button>
          <Button
            variant="outline"
            onClick={() => setSchedOpen(true)}
            disabled={obligations.length === 0}
            className="border-purple-200 text-purple-600 hover:bg-purple-50"
          >
            <Settings2 className="w-4 h-4 mr-2" />
            Agendar en Teams
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)} className="border-gray-200">
            <Upload className="w-4 h-4 mr-2" /> Importar Excel
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={filtered.length === 0} className="border-gray-200">
            <Download className="w-4 h-4 mr-2" /> Exportar ({filtered.length})
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Total',        value: kpis.total,    color: 'text-[#4A4A4A]', bg: 'bg-white',       icon: <FileText   className="w-4 h-4" />, onClick: () => resetFilters() },
          { label: 'Vencidas',     value: kpis.overdue,  color: 'text-red-600',   bg: 'bg-red-50',      icon: <AlertTriangle className="w-4 h-4 text-red-500" />, onClick: () => { resetFilters(); setFilterAlert('overdue'); } },
          { label: 'Urgentes ≤7d', value: kpis.urgent,   color: 'text-orange-600',bg: 'bg-orange-50',   icon: <AlertCircle className="w-4 h-4 text-orange-500" />, onClick: () => { resetFilters(); setFilterAlert('urgent'); } },
          { label: 'Este mes',     value: kpis.thisMonth,color: 'text-blue-700',  bg: 'bg-blue-50',     icon: <Calendar   className="w-4 h-4 text-blue-500" />, onClick: () => { resetFilters(); setFilterMonth(String(today.getMonth() + 1)); } },
          { label: 'Completadas',  value: kpis.done,     color: 'text-green-700', bg: 'bg-green-50',    icon: <CheckCircle2 className="w-4 h-4 text-green-600" />, onClick: () => { resetFilters(); setFilterAlert('pending'); /* invertido */ } },
        ].map(k => (
          <button
            key={k.label}
            onClick={k.onClick}
            className={`${k.bg} rounded-xl border border-gray-100 shadow-sm p-4 text-left hover:shadow-md transition-shadow`}
          >
            <div className="flex items-center gap-1.5 mb-1 text-gray-400">
              {k.icon}
              <span className="text-[10px] font-semibold uppercase tracking-wide">{k.label}</span>
            </div>
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
          </button>
        ))}
      </div>

      {/* Alert banner */}
      {kpis.overdue > 0 && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 font-medium">
            Hay <strong>{kpis.overdue}</strong> obligación{kpis.overdue > 1 ? 'es' : ''} vencida{kpis.overdue > 1 ? 's' : ''} sin completar.
          </p>
          <button
            onClick={() => { resetFilters(); setFilterAlert('overdue'); }}
            className="ml-auto text-xs text-red-600 underline hover:text-red-800"
          >
            Ver ahora
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Filtros</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-x-2 gap-y-3">

          {/* Search */}
          <div className="col-span-2 space-y-1">
            <p className="text-[10px] text-gray-400 font-medium">Buscar por texto libre</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input
                placeholder="Empresa, impuesto, periodo..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pl-9 h-8 text-sm border-gray-200"
              />
            </div>
          </div>

          {/* Empresa */}
          <div className="space-y-1">
            <p className="text-[10px] text-gray-400 font-medium">Filtrar por empresa</p>
            <Select value={filterCompany} onValueChange={v => { setFilterCompany(v); setPage(1); }}>
              <SelectTrigger className="h-8 text-xs border-gray-200"><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las empresas</SelectItem>
                {companies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo impuesto */}
          <div className="space-y-1">
            <p className="text-[10px] text-gray-400 font-medium">Tipo de impuesto</p>
            <Select value={filterType} onValueChange={v => { setFilterType(v); setPage(1); }}>
              <SelectTrigger className="h-8 text-xs border-gray-200"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {taxTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo obligación */}
          <div className="space-y-1">
            <p className="text-[10px] text-gray-400 font-medium">Categoría de obligación</p>
            <Select value={filterOblType} onValueChange={v => { setFilterOblType(v); setPage(1); }}>
              <SelectTrigger className="h-8 text-xs border-gray-200"><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {oblTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Estado */}
          <div className="space-y-1">
            <p className="text-[10px] text-gray-400 font-medium">Estado de gestión</p>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(1); }}>
              <SelectTrigger className="h-8 text-xs border-gray-200"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                {STATUSES.map(s => (
                  <SelectItem key={s || '__empty'} value={s || '__empty'}>
                    {STATUS_CFG[s]?.label ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Año */}
          <div className="space-y-1">
            <p className="text-[10px] text-gray-400 font-medium">Año fiscal</p>
            <Select value={filterYear} onValueChange={v => { setFilterYear(v); setPage(1); }}>
              <SelectTrigger className="h-8 text-xs border-gray-200"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los años</SelectItem>
                {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Mes */}
          <div className="space-y-1">
            <p className="text-[10px] text-gray-400 font-medium">Mes de vencimiento</p>
            <Select value={filterMonth} onValueChange={v => { setFilterMonth(v); setPage(1); }}>
              <SelectTrigger className="h-8 text-xs border-gray-200"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los meses</SelectItem>
                {MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

        </div>

        {/* Active filters summary */}
        {hasFilters && (
          <div className="mt-3 flex items-center gap-2 flex-wrap border-t border-gray-50 pt-3">
            <span className="text-xs text-gray-400">Filtros activos:</span>
            <span className="text-xs bg-[#008C3C]/10 text-[#008C3C] px-2 py-0.5 rounded-full font-medium">
              {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
            </span>
            <button onClick={resetFilters} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-0.5 transition-colors ml-1">
              <X className="w-3 h-3" /> Limpiar todos los filtros
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" />
        </div>
      ) : obligations.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-14 text-center">
          <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-200" />
          <p className="text-gray-400 mb-4">No hay obligaciones cargadas aún</p>
          <Button onClick={handleSeed} disabled={seeding} className="bg-[#1F8FBF] hover:bg-[#1677a0] text-white">
            {seeding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            Cargar datos iniciales (453 registros)
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-12 px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            <span className="col-span-3">Empresa</span>
            <span className="col-span-3">Obligación</span>
            <span className="col-span-1 text-center">Periodo</span>
            <span className="col-span-2 text-center">Vencimiento</span>
            <span className="col-span-1 text-center">Días</span>
            <span className="col-span-2 text-center">Estado</span>
          </div>

          <div className="divide-y divide-gray-50">
            {pageItems.length === 0 ? (
              <p className="text-sm text-center text-gray-400 py-12">Sin resultados con estos filtros</p>
            ) : pageItems.map(obl => {
              const level  = alertLevel(obl);
              const days   = safeDaysUntil(obl.dueDate);
              const cfg    = STATUS_CFG[obl.status] ?? STATUS_CFG[''];
              return (
                <div
                  key={obl.id}
                  className={`grid grid-cols-12 px-4 py-3 items-center hover:bg-gray-50/80 transition-colors cursor-pointer ${ALERT_ROW[level]}`}
                  onClick={() => openEdit(obl)}
                >
                  {/* Empresa */}
                  <div className="col-span-3 min-w-0 pr-2">
                    <p className="text-sm font-medium text-[#4A4A4A] truncate">{obl.company}</p>
                    <p className="text-[10px] text-gray-400">{obl.scope} · {obl.city}</p>
                  </div>

                  {/* Tipo obligación */}
                  <div className="col-span-3 min-w-0 pr-2">
                    <p className="text-sm text-gray-700 truncate flex items-center gap-1">
                      {obl.taxType}
                      {obl.attachments && obl.attachments.length > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] bg-blue-50 text-blue-500 px-1 py-0.5 rounded ml-1 flex-shrink-0">
                          <Paperclip className="w-2.5 h-2.5" />{obl.attachments.length}
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-gray-400">{obl.obligationType}</p>
                  </div>

                  {/* Periodo */}
                  <div className="col-span-1 text-center">
                    <span className="text-xs text-gray-500">{obl.period}</span>
                  </div>

                  {/* Fecha */}
                  <div className="col-span-2 text-center">
                    <p className="text-xs font-semibold text-[#4A4A4A]">{fmtDate(obl.dueDate)}</p>
                    <p className="text-[10px] text-gray-400">{obl.year}</p>
                  </div>

                  {/* Días */}
                  <div className="col-span-1 text-center">
                    {level === 'done' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                    ) : days === null ? (
                      <span className="text-[10px] text-gray-400">Mensual</span>
                    ) : (
                      <span className={`text-xs font-bold tabular-nums ${
                        level === 'overdue' ? 'text-red-600' :
                        level === 'urgent'  ? 'text-orange-600' :
                        level === 'soon'    ? 'text-yellow-600' : 'text-gray-500'
                      }`}>
                        {days < 0 ? `+${Math.abs(days)}v` : days === 0 ? 'Hoy' : `${days}d`}
                      </span>
                    )}
                  </div>

                  {/* Estado + acciones */}
                  <div className="col-span-2 flex items-center justify-between gap-1">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => { e.stopPropagation(); openEdit(obl); }}
                        className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-[#008C3C] hover:bg-[#008C3C]/10 transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={e => handleDeleteObl(obl, e)}
                        className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-400">
              {filtered.length} registro{filtered.length !== 1 ? 's' : ''} · Página {page} de {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-7 w-7 p-0"
                disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const p = page <= 4 ? i + 1 : page - 3 + i;
                if (p < 1 || p > totalPages) return null;
                return (
                  <Button key={p} size="sm"
                    variant={p === page ? 'default' : 'outline'}
                    className={`h-7 w-7 p-0 text-xs ${p === page ? 'bg-[#008C3C] hover:bg-[#006C2F]' : ''}`}
                    onClick={() => setPage(p)}>
                    {p}
                  </Button>
                );
              })}
              <Button size="sm" variant="outline" className="h-7 w-7 p-0"
                disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit / New dialog ── */}
      <Dialog open={!!editObl} onOpenChange={o => { if (!o) closeDialog(); }}>
        <DialogContent className="w-full max-w-lg flex flex-col max-h-[92dvh] sm:max-h-[90vh] p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
            <DialogTitle className="text-base flex items-center gap-2">
              {isNew ? <Plus className="w-4 h-4 text-[#008C3C]" /> : <Edit2 className="w-4 h-4 text-[#008C3C]" />}
              {isNew ? 'Nuevo vencimiento' : 'Editar obligación'}
            </DialogTitle>
          </DialogHeader>

          {editObl && (
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

              {/* ── Sección 1: Empresa ── */}
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Empresa</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs text-gray-500">Razón social *</Label>
                    <Input value={form.company} onChange={e => setF('company', e.target.value)} placeholder="Ej: Netcol Ingeniería SAS BIC" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">NIT</Label>
                    <Input value={form.nit} onChange={e => setF('nit', e.target.value)} placeholder="901193667" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Ciudad</Label>
                    <Input value={form.city} onChange={e => setF('city', e.target.value)} placeholder="Bogotá" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Ámbito</Label>
                    <Select value={form.scope} onValueChange={v => setF('scope', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Nacional">Nacional</SelectItem>
                        <SelectItem value="Distrital">Distrital</SelectItem>
                        <SelectItem value="Municipal">Municipal</SelectItem>
                        <SelectItem value="Departamental">Departamental</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Asesor / Responsable</Label>
                    <Select value={form.advisor} onValueChange={v => setF('advisor', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar asesor..." />
                      </SelectTrigger>
                      <SelectContent>
                        {accountingUsers.length === 0 && (
                          <SelectItem value="__none" disabled>Sin usuarios de contabilidad</SelectItem>
                        )}
                        {accountingUsers.map(u => (
                          <SelectItem key={u.email} value={u.name}>
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* ── Sección 2: Obligación ── */}
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Obligación tributaria</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs text-gray-500">Tipo de impuesto / obligación *</Label>
                    <Input value={form.taxType} onChange={e => setF('taxType', e.target.value)} placeholder="Ej: Retención en la fuente" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Categoría</Label>
                    <Select value={form.obligationType} onValueChange={v => setF('obligationType', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Impuestos">Impuestos</SelectItem>
                        <SelectItem value="Información Exógena">Información Exógena</SelectItem>
                        <SelectItem value="Reportes">Reportes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Periodo</Label>
                    <Input value={form.period} onChange={e => setF('period', e.target.value)} placeholder="Ej: Mensual-1, Bim 1, Anual" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Fecha de vencimiento *</Label>
                    <Input
                      type="date"
                      value={form.dueDate}
                      onChange={e => {
                        const v = e.target.value;
                        setF('dueDate', v);
                        if (v) setF('year', v.slice(0, 4));
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Año</Label>
                    <Input value={form.year} onChange={e => setF('year', e.target.value)} placeholder="2026" />
                  </div>
                </div>
              </div>

              {/* ── Sección 3: Estado ── */}
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Estado</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {STATUSES.filter(s => s !== '').map(s => {
                    const c = STATUS_CFG[s];
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setF('status', s)}
                        className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-left transition-all text-xs font-medium
                          ${form.status === s
                            ? `${c.bg} ${c.color} border-current ring-2 ring-offset-1 ring-current/30`
                            : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
                        {c.label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 space-y-1">
                  <Label className="text-xs text-gray-500">Observación / Soporte</Label>
                  <Textarea
                    value={form.observation}
                    onChange={e => setF('observation', e.target.value)}
                    placeholder="Notas, número de pago, referencias..."
                    rows={2}
                    className="resize-none text-sm"
                  />
                </div>
              </div>

              {/* ── Sección 4: Documentos ── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                    <Paperclip className="w-3 h-3" /> Documentos adjuntos ({attachments.length}/5)
                  </p>
                  <label className={`flex items-center gap-1 text-xs cursor-pointer px-2.5 py-1 rounded-lg border transition-colors
                    ${uploading || attachments.length >= 5
                      ? 'opacity-40 pointer-events-none border-gray-200 text-gray-400'
                      : 'border-[#008C3C] text-[#008C3C] hover:bg-[#008C3C]/5'}`}>
                    {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    Subir archivo
                    <input ref={attachFileRef} type="file" className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip"
                      onChange={handleAttachFile} disabled={uploading || attachments.length >= 5} />
                  </label>
                </div>

                {uploading && (
                  <div className="mb-2 space-y-1">
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-[#008C3C] rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                    </div>
                    <p className="text-[10px] text-[#008C3C] text-right">{uploadProgress}%</p>
                  </div>
                )}

                {attachments.length > 0 ? (
                  <div className="space-y-1.5">
                    {attachments.map((att, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
                        <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-700 truncate">{att.name}</p>
                          <p className="text-[10px] text-gray-400">
                            {fmtSize(att.size)}{att.uploadedAt && ` · ${new Date(att.uploadedAt).toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' })}`}
                          </p>
                        </div>
                        <a href={att.url} target="_blank" rel="noopener noreferrer"
                          className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-blue-500 transition-colors">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button onClick={() => handleDeleteAttachment(att)}
                          className="w-6 h-6 flex items-center justify-center rounded text-gray-200 hover:text-red-500 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-400 italic text-center py-2">
                    Sin documentos — sube declaraciones, recibos de pago, soportes...
                  </p>
                )}
              </div>
            </div>
          )}

          {editObl && (
            <div className="flex gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0 bg-white">
              <Button variant="outline" className="flex-1" onClick={closeDialog}>Cancelar</Button>
              <Button
                onClick={handleSave}
                disabled={saving || uploading || !form.company.trim() || !form.taxType.trim() || !form.dueDate}
                className="flex-1 bg-[#008C3C] hover:bg-[#006C2F] text-white"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                {isNew ? 'Crear vencimiento' : 'Guardar cambios'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Schedule in Teams dialog ── */}
      <Dialog open={schedOpen} onOpenChange={setSchedOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-purple-500" />
              Agendar vencimientos en Teams
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 text-xs text-purple-700 space-y-1.5">
              <p className="font-semibold">¿Cómo funciona?</p>
              <ul className="list-disc list-inside space-y-1 text-purple-600">
                <li>Crea un evento en el calendario de Teams/Outlook por cada obligación pendiente</li>
                <li>Invita automáticamente a todos los usuarios de contabilidad</li>
                <li>Incluye un recordatorio 1 día antes</li>
                <li>Los eventos no se duplican si ya fueron agendados</li>
              </ul>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Agendar obligaciones que venzan en los próximos</Label>
              <Select value={schedDays} onValueChange={setSchedDays}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 días</SelectItem>
                  <SelectItem value="60">60 días</SelectItem>
                  <SelectItem value="90">90 días</SelectItem>
                  <SelectItem value="180">6 meses</SelectItem>
                  <SelectItem value="365">Todo el año</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-gray-400">
                Solo se agendan obligaciones no completadas dentro del período seleccionado.
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setSchedOpen(false)}>
                <X className="w-4 h-4 mr-1" /> Cancelar
              </Button>
              <Button
                onClick={handleSchedule}
                disabled={scheduling}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
              >
                {scheduling ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Settings2 className="w-4 h-4 mr-1" />}
                Agendar ahora
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Import dialog ── */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-[#008C3C]" /> Importar Excel
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-xs text-gray-500">
              Selecciona el archivo <strong>Calendario Vencimientos</strong>.xlsx.
              Debe tener la misma estructura: columnas Nombre, NIT, Ciudad, Ámbito, Tipo Impuesto, Tipo Obligación, Periodo, Fecha de Vencimiento…
            </p>
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
              {importing ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" />
                  <p className="text-sm text-gray-500">Importando...</p>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center gap-2">
                  <FileText className="w-8 h-8 text-gray-300" />
                  <p className="text-sm text-gray-500">Haz clic para seleccionar el archivo</p>
                  <p className="text-xs text-gray-400">.xlsx únicamente</p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={handleImportExcel}
                  />
                </label>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
