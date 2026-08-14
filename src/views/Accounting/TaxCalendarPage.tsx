import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import * as XLSX from 'xlsx';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2, Calendar, Search, X,
  FileText, Loader2, Paperclip, History,
  ExternalLink, Trash2, Plus, Edit2, Upload, Building2, SlidersHorizontal, BarChart3, Download, UserCheck, Send, ChevronsUpDown, Save,
} from 'lucide-react';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { storage, functions } from '@/config/firebase';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { taxCalendarService } from '@/services/taxCalendarService';
import { rolesService } from '@/services/rolesService';
import { companyService } from '@/services/companyService';
import { applyTaxImportPlan } from '@/services/taxImportService';
import { useAuth } from '@/hooks/useAuth';
import type { AppRole } from '@/models/types/AppRole';
import type { TaxObligation, TaxStatus, TaxAttachment, StatusHistoryEntry } from '@/models/types/TaxObligation';
import type { Company } from '@/models/types/Company';
import {
  extractVerificationDigit, getUpcomingObligationsByNit, getDianObligationsByNit, getAllObligationsByNit,
  type DianObligation, type NitDigit,
} from '@/data/dianCalendar2026';
import {
  cleanNit, displayTax, normalize, normalizePeriod, normTax, sameAutoDueDate,
  sameCompany as belongsToCompany, sameDianObligation,
} from '@/domain/tax/taxIdentity';
import { buildTaxImportPlan, type TaxImportPlan } from '@/domain/tax/taxExcelImport';
import { TaxImportPreviewDialog } from '@/components/accounting/TaxImportPreviewDialog';
import { TaxImportInstructions } from '@/components/accounting/TaxImportInstructions';

// ── constants ─────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  '':               { label: 'Pendiente',       color: 'text-gray-500',   bg: 'bg-gray-100',    dot: 'bg-gray-400' },
  'No iniciado':    { label: 'No iniciado',      color: 'text-gray-600',   bg: 'bg-gray-100',    dot: 'bg-gray-400' },
  'En revisión':    { label: 'En revisión',      color: 'text-amber-700',  bg: 'bg-amber-50',    dot: 'bg-amber-500' },
  'Revisado':       { label: 'Revisado',         color: 'text-blue-700',   bg: 'bg-blue-50',     dot: 'bg-blue-500' },
  'Presentado':     { label: 'Presentado',       color: 'text-purple-700', bg: 'bg-purple-50',   dot: 'bg-purple-500' },
  'Informe Enviado':{ label: 'Informe Enviado',  color: 'text-teal-700',   bg: 'bg-teal-50',     dot: 'bg-teal-500' },
  'Informe Enviado RF': { label: 'Informe Enviado RF', color: 'text-cyan-700', bg: 'bg-cyan-50', dot: 'bg-cyan-500' },
  'Impuesto Enviado para pago': { label: 'Enviado para pago', color: 'text-indigo-700', bg: 'bg-indigo-50', dot: 'bg-indigo-500' },
  'No aplica':      { label: 'No aplica',        color: 'text-gray-400',   bg: 'bg-gray-50',     dot: 'bg-gray-300' },
  'Pagado':         { label: 'Pagado',           color: 'text-green-700',  bg: 'bg-green-50',    dot: 'bg-green-500' },
};

// Mantener sincronizado con COMPLETED_STATUSES de functions/src/index.ts.
const ALERT_RESOLVED_STATUSES = new Set<TaxStatus>([
  'Pagado', 'No aplica', 'Informe Enviado', 'Presentado',
]);
const isAlertResolved = (status?: string) => ALERT_RESOLVED_STATUSES.has(status as TaxStatus);

const PERIOD_OPTIONS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  'Bimestre 1', 'Bimestre 2', 'Bimestre 3', 'Bimestre 4', 'Bimestre 5', 'Bimestre 6',
  'Cuatrimestre 1', 'Cuatrimestre 2', 'Cuatrimestre 3',
  'Trimestre 1', 'Trimestre 2', 'Trimestre 3', 'Trimestre 4',
  'Semestre 1', 'Semestre 2',
  'Cuota 1', 'Cuota 2',
  'Anual',
];



function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return Math.round((date.getTime() - today.getTime()) / 86_400_000);
}

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

/** Fecha de hoy en formato YYYY-MM-DD. Sirve como corte: no mostramos fechas pasadas. */
function getCalendarCutoff(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// ── TaxTypeCombobox ───────────────────────────────────────────────────────────

function TaxTypeCombobox({
  value, onChange, options, placeholder = 'Seleccionar o escribir…',
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const filtered = options.filter(o => o.toLowerCase().includes(q));
  const exactMatch = options.some(o => o.toLowerCase() === q);
  const showCreate = q.length > 0 && !exactMatch;

  const select = (v: string) => { onChange(v); setOpen(false); setQuery(''); };

  return (
    <Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setQuery(''); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="p-2 border-b">
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar tipo…"
            className="w-full text-sm outline-none bg-transparent placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-52 overflow-y-auto">
          {filtered.length === 0 && !showCreate && (
            <p className="py-3 text-center text-xs text-muted-foreground">Sin resultados</p>
          )}
          {filtered.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => select(opt)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors ${opt === value ? 'bg-accent font-medium' : ''}`}
            >
              {opt}
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              onClick={() => select(query.trim())}
              className="w-full text-left px-3 py-2 text-sm text-green-700 font-medium hover:bg-green-50 transition-colors border-t"
            >
              + Crear "<span className="font-semibold">{query.trim()}</span>"
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── AdminEmailButtons ─────────────────────────────────────────────────────────
function AdminEmailButtons() {
  const [sending9, setSending9] = useState<'idle'|'loading'|'ok'|'err'>('idle');
  const [sending5, setSending5] = useState<'idle'|'loading'|'ok'|'err'>('idle');

  const trigger9am = async () => {
    setSending9('loading');
    try {
      const fn = httpsCallable(functions, 'triggerTaxAlerts');
      await fn({ force: true });
      setSending9('ok');
      setTimeout(() => setSending9('idle'), 4000);
    } catch { setSending9('err'); setTimeout(() => setSending9('idle'), 4000); }
  };

  const trigger5pm = async () => {
    setSending5('loading');
    try {
      const fn = httpsCallable(functions, 'triggerDailyTaxDigest');
      await fn({});
      setSending5('ok');
      setTimeout(() => setSending5('idle'), 4000);
    } catch { setSending5('err'); setTimeout(() => setSending5('idle'), 4000); }
  };

  const btnClass = (state: typeof sending9) =>
    `flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors ${
      state === 'loading' ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-wait' :
      state === 'ok'      ? 'border-green-200 bg-green-50 text-green-700' :
      state === 'err'     ? 'border-red-200 bg-red-50 text-red-600' :
      'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
    }`;

  return (
    <>
      <button onClick={trigger9am} disabled={sending9 === 'loading'} className={btnClass(sending9)}>
        {sending9 === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        {sending9 === 'ok' ? 'Enviado ✓' : sending9 === 'err' ? 'Error' : 'Correo 9am'}
      </button>
      <button onClick={trigger5pm} disabled={sending5 === 'loading'} className={btnClass(sending5)}>
        {sending5 === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        {sending5 === 'ok' ? 'Enviado ✓' : sending5 === 'err' ? 'Error' : 'Correo 5pm'}
      </button>
    </>
  );
}

// ── component ─────────────────────────────────────────────────────────────────

export const TaxCalendarPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentRole, setCurrentRole]           = useState<AppRole | null>(null);
  const [currentUserName, setCurrentUserName]   = useState<string>('');
  type CalendarCompany = Company & { excludedTaxTypes: string[] };
  const [firestoreCompanies, setFirestoreCompanies] = useState<CalendarCompany[]>([]);
  const [obligations, setObligations]           = useState<TaxObligation[]>([]);
  const [accountingUsers,  setAccountingUsers]  = useState<{ name: string; email: string }[]>([]);
  const [financieraUsers,  setFinancieraUsers]  = useState<{ name: string; email: string }[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [dianSearch, setDianSearch]             = useState('');
  const [dianDays, setDianDays]                 = useState(60);
  const [filterUrgency, setFilterUrgency]       = useState<'all'|'overdue'|'urgent'|'soon'|'ok'>('all');
  const [filterMonth,   setFilterMonth]         = useState('all');
  const [viewMode,      setViewMode]            = useState<'upcoming' | 'past' | 'paid'>('upcoming');
  const [vencidosFrom,  setVencidosFrom]        = useState('2026-06-01');

  const [editingAmount, setEditingAmount] = useState<{
    key: string; field: 'projected' | 'paid'; value: string;
  } | null>(null);

  // Modal para ocultar tipos de impuesto por empresa
  const [managingTaxTypes, setManagingTaxTypes] = useState<CalendarCompany | null>(null);
  const [savingHidden, setSavingHidden] = useState(false);

  // Diálogo mensaje contabilidad
  const [msgOpen,      setMsgOpen]      = useState(false);
  const [msgSubject,   setMsgSubject]   = useState('');
  const [msgBody,      setMsgBody]      = useState('');
  const [msgRecipients,setMsgRecipients]= useState<string[]>([]);
  const [sendingMsg,   setSendingMsg]   = useState(false);

  // Edit / create dialog
  const [editObl,        setEditObl]        = useState<TaxObligation | null>(null);
  const [isNew,          setIsNew]          = useState(false);
  const [quickEditMode,  setQuickEditMode]  = useState(false);
  const [saving,         setSaving]         = useState(false);

  const EMPTY_FORM = {
    companyId: '', company: '', nit: '', city: 'Bogotá', scope: 'Nacional',
    taxType: '', obligationType: 'Impuestos',
    period: '', dueDate: '', year: String(new Date().getFullYear()),
    advisor: '', status: '' as TaxStatus, observation: '',
  };
  const [form, setForm] = useState(EMPTY_FORM);
  const setF = (k: keyof typeof EMPTY_FORM, v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  const [attachments,    setAttachments]    = useState<TaxAttachment[]>([]);
  const [uploading,      setUploading]      = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const attachFileRef = useRef<HTMLInputElement>(null);
  const [formProjected,  setFormProjected]  = useState('');
  const [formPresented,  setFormPresented]  = useState('');
  const [formPaid,       setFormPaid]       = useState('');
  const [formPaidAt,     setFormPaidAt]     = useState('');
  const [formPresentedAt, setFormPresentedAt] = useState('');

  // ── Carga masiva de vencimientos desde Excel ──────────────────────────────────
  const [importOpen,       setImportOpen]       = useState(false);
  const [importPlan,       setImportPlan]       = useState<TaxImportPlan | null>(null);
  const [importLoading,    setImportLoading]    = useState(false);
  const [importError,      setImportError]      = useState('');
  const [applyingImport,   setApplyingImport]   = useState(false);

  const selectImportExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImportOpen(true); setImportPlan(null); setImportError(''); setImportLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!worksheet) throw new Error('El archivo no tiene ninguna hoja legible.');
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: null, raw: false });
      setImportPlan(buildTaxImportPlan(file.name, rows, firestoreCompanies, obligations));
    } catch (e: any) {
      setImportError(e?.message || 'No fue posible analizar el archivo.');
    } finally {
      setImportLoading(false);
    }
  };

  const applyImport = async () => {
    if (!importPlan) return;
    if (!window.confirm(`Se crearán ${importPlan.create} y se actualizarán ${importPlan.update} vencimiento(s). ¿Continuar?`)) return;
    setApplyingImport(true);
    try {
      const result = await applyTaxImportPlan(importPlan.rows, currentUserName || user?.email || 'usuario-desconocido');
      toast.success('Vencimientos actualizados', { description: `${result.created} nuevos, ${result.updated} actualizados.` });
      setImportOpen(false);
      await load();
    } catch (e: any) {
      setImportError(e?.message || 'No fue posible aplicar la importación.');
      toast.error('La importación no se completó');
    } finally {
      setApplyingImport(false);
    }
  };

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = async () => {
    setLoading(true);
    try {
      const [data, allRoleUsers, allCompanies, companyTaxSettings] = await Promise.all([
        taxCalendarService.getAll(),
        rolesService.getAll(),
        companyService.getAll(),
        taxCalendarService.getCompanyTaxSettings(),
      ]);
      setObligations(data);
      setFirestoreCompanies(allCompanies.map(company => ({
        ...company,
        excludedTaxTypes: companyTaxSettings[company.id] ?? [],
      })));
      setAccountingUsers(
        allRoleUsers
          .filter(u => u.role === 'contabilidad' || u.role === 'admin')
          .map(u => ({ name: u.name, email: u.email }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setFinancieraUsers(
        allRoleUsers
          .filter(u => u.role === 'financiera' || u.role === 'admin')
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

  useEffect(() => {
    if (!user?.email) return;
    rolesService.getByEmail(user.email).then(p => {
      if (p) { setCurrentRole(p.role); setCurrentUserName(p.name || user.email || ''); }
    }).catch(() => {});
  }, [user?.email]);

  // Abrir obligación directamente desde link del correo (?obl=ID)
  useEffect(() => {
    const oblId = searchParams.get('obl');
    if (!oblId || obligations.length === 0) return;
    const obl = obligations.find(o => o.id === oblId);
    if (obl) {
      openEdit(obl, true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, obligations]);

  const isFinanciera = currentRole === 'financiera';
  const isAdmin      = currentRole === 'admin';
  const canMarkPaid  = isFinanciera || isAdmin;
  const canMarkPresented = !isFinanciera;
  // null = rol aún no cargado → mostrar stepper por defecto
  const canStepper   = currentRole === null || currentRole !== 'financiera';

  // ── Edit dialog helpers ──────────────────────────────────────────────────────

  const ALL_TAX_TYPES = [
    // Nacional — DIAN
    'Retención en la Fuente',
    'IVA Bimestral',
    'IVA Cuatrimestral',
    'Renta y Complementarios (PJ)',
    'Impuesto al Patrimonio',
    'Exógena Nacional (GC)',
    'Exógena Nacional (PJ/Naturales)',
    // Distrital — Hacienda Bogotá
    'ICA Bimestral',
    'ICA Régimen Común',
    'ICA Régimen Preferencial',
    'ReteICA',
    'Predial',
    'Vehículos',
  ];

  // Combina tipos predefinidos + los que ya existen en Firestore (sin duplicados)
  const taxTypeOptions = useMemo(() => {
    const fromObls = obligations.map(o => o.taxType).filter(Boolean);
    const all = [...ALL_TAX_TYPES, ...fromObls];
    const seen = new Set<string>();
    return all.filter(t => { const k = t.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  }, [obligations]);

  const periodOptions = useMemo(() => {
    const fromObls = obligations.map(o => o.period).filter(Boolean);
    const all = [...PERIOD_OPTIONS, ...fromObls];
    const seen = new Set<string>();
    return all.filter(p => { const k = p.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  }, [obligations]);

  const saveHiddenTaxTypes = async (company: CalendarCompany, hidden: string[]) => {
    setSavingHidden(true);
    try {
      await taxCalendarService.updateCompanyTaxSettings(company.id, hidden);
      setFirestoreCompanies(prev =>
        prev.map(c => c.id === company.id ? { ...c, excludedTaxTypes: hidden } : c)
      );
      toast.success('Tipos de obligación actualizados');
      setManagingTaxTypes(null);
    } catch (e: any) {
      toast.error('Error al guardar', { description: e.message });
    } finally {
      setSavingHidden(false);
    }
  };

  const openEdit = (obl: TaxObligation, quick = false) => {
    setIsNew(false);
    setQuickEditMode(quick);
    setEditObl(obl);
    setForm({
      companyId:      obl.companyId || '',
      company:        obl.company,
      nit:            obl.nit,
      city:           obl.city,
      scope:          obl.scope,
      taxType:        obl.taxType,
      obligationType: obl.obligationType,
      period:         obl.period,
      dueDate:        obl.dueDate,
      year:           obl.year,
      advisor:        obl.advisor || currentUserName,
      status:         obl.status,
      observation:    obl.observation,
    });
    setAttachments(obl.attachments ?? []);
    setUploadProgress(0);
    setFormProjected(obl.projected != null ? String(obl.projected) : '');
    setFormPresented(obl.presented != null ? String(obl.presented) : '');
    setFormPaid(obl.paid != null ? String(obl.paid) : '');
    setFormPaidAt(obl.paidAt ?? '');
    setFormPresentedAt(obl.presentedAt ? obl.presentedAt.slice(0, 10) : '');
  };

  const openNew = () => {
    setIsNew(true);
    setEditObl({ id: '__new__' } as TaxObligation);
    setForm({ ...EMPTY_FORM, advisor: currentUserName });
    setAttachments([]);
    setUploadProgress(0);
    setFormProjected('');
    setFormPresented('');
    setFormPaid('');
    setFormPaidAt('');
    setFormPresentedAt('');
  };

  const closeDialog = () => { setEditObl(null); setIsNew(false); setQuickEditMode(false); };



  // Guarda solo el estado inmediatamente (sin cerrar el dialog) — usado por los botones del stepper
  const saveStatusNow = async (newStatus: TaxStatus) => {
    setF('status', newStatus);
    if (isNew || !editObl || editObl.id === '__new__') return;
    try {
      const projNum = formProjected !== '' ? parseFloat(formProjected) : undefined;
      const presentedNum = formPresented !== '' ? parseFloat(formPresented) : undefined;
      const defaultPresentedAt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
      const presentedAt = newStatus === 'Presentado' ? (formPresentedAt || defaultPresentedAt) : undefined;
      if (presentedAt && !formPresentedAt) setFormPresentedAt(presentedAt);
      const actor = currentUserName || user?.email || 'Sistema';
      const updatePayload: Record<string, unknown> = { status: newStatus };
      if (projNum     != null && !isNaN(projNum)) updatePayload.projected   = projNum;
      if (presentedNum != null && !isNaN(presentedNum)) updatePayload.presented = presentedNum;
      if (presentedAt != null)                    updatePayload.presentedAt = presentedAt;
      // Registrar quién hizo este paso específico
      updatePayload[`stepOwners.${newStatus}`] = actor;
      // Auto-registrar quién diligenció / quién registró el pago
      if (newStatus === 'Pagado') updatePayload.financieraUser = actor;
      if (newStatus === 'Pagado' && formPaidAt) updatePayload.paidAt = formPaidAt;
      if (!isFinanciera && currentUserName && !(editObl as TaxObligation).accountingUser)
        updatePayload.accountingUser = actor;
      await taxCalendarService.update(editObl.id, updatePayload as any);
      // Actualizar editObl y la lista local para que prevStatus sea correcto en el siguiente clic
      const prevStatus = (editObl as TaxObligation).status ?? '';
      const changedBy = actor;
      const localUpdate: Partial<TaxObligation> = {
        status: newStatus,
        stepOwners: { ...(editObl as TaxObligation).stepOwners, [newStatus]: actor },
      };
      if (projNum     != null && !isNaN(projNum)) localUpdate.projected   = projNum;
      if (presentedNum != null && !isNaN(presentedNum)) localUpdate.presented = presentedNum;
      if (presentedAt != null)                    localUpdate.presentedAt = presentedAt;
      if (newStatus === 'Pagado') localUpdate.financieraUser = actor;
      if (newStatus === 'Pagado' && formPaidAt) localUpdate.paidAt = formPaidAt;
      if (!isFinanciera && currentUserName && !(editObl as TaxObligation).accountingUser)
        localUpdate.accountingUser = actor;
      setEditObl(prev => prev ? { ...prev, ...localUpdate } : prev);
      setObligations(prev => prev.map(o => o.id === editObl.id ? { ...o, ...localUpdate } : o));
      toast.success(STATUS_CFG[newStatus]?.label ?? newStatus);
      // Guardar entrada en historial
      const historyEntry: StatusHistoryEntry = {
        status: newStatus,
        changedBy,
        changedAt: new Date().toISOString(),
      };
      taxCalendarService.appendStatusHistory(editObl.id, historyEntry)
        .then(() => setEditObl(prev => prev ? {
          ...prev,
          statusHistory: [...(prev.statusHistory ?? []), historyEntry],
        } : prev))
        .catch(() => {});
      // Registrar en log diario — el digest se envía a las 5 PM
      if (newStatus && newStatus !== prevStatus) {
        taxCalendarService.recordDailyActivity({
          changedBy,
          company: (editObl as TaxObligation).company,
          nit: (editObl as TaxObligation).nit,
          taxType: (editObl as TaxObligation).taxType,
          period: (editObl as TaxObligation).period,
          dueDate: (editObl as TaxObligation).dueDate,
          newStatus,
          projected: formProjected ? parseFloat(formProjected) : null,
          obligationId: editObl.id,
        }).catch(() => {});
      }
    } catch (e: any) {
      toast.error('Error al guardar estado', { description: e.message });
    }
  };

  const handleSave = async () => {
    if (!form.company.trim() || !form.taxType.trim() || !form.dueDate) {
      toast.error('Empresa, tipo de impuesto y fecha son obligatorios'); return;
    }
    if (uploading) { toast.error('Espera a que termine de subir el archivo'); return; }
    setSaving(true);
    try {
      const projected = formProjected !== '' ? parseFloat(formProjected) : undefined;
      const presented = formPresented !== '' ? parseFloat(formPresented) : undefined;
      const paid      = formPaid      !== '' ? parseFloat(formPaid)      : undefined;
      const data = {
        ...form, attachments,
        ...(projected != null && !isNaN(projected) ? { projected } : {}),
        ...(presented != null && !isNaN(presented) ? { presented } : {}),
        ...(paid      != null && !isNaN(paid)      ? { paid }      : {}),
        ...(formPaidAt ? { paidAt: formPaidAt } : {}),
        ...(formPresentedAt ? { presentedAt: formPresentedAt } : {}),
      };
      if (isNew) {
        if (currentUserName && !isFinanciera) (data as any).accountingUser = currentUserName;
        await taxCalendarService.create(data as any);
        toast.success('Vencimiento creado');
      } else if (editObl) {
        const updateData: Record<string, unknown> = { ...data };
        if (currentUserName && !isFinanciera && !(editObl as TaxObligation).accountingUser)
          updateData.accountingUser = currentUserName;
        await taxCalendarService.update(editObl.id, updateData as any);
        toast.success('Guardado');
      }

      // Registrar en log diario — el digest se envía a las 5 PM
      const prevStatus = isNew ? '' : (editObl?.status ?? '');
      const savedOblId = isNew ? '' : (editObl?.id ?? '');
      if (form.status && form.status !== prevStatus) {
        taxCalendarService.recordDailyActivity({
          changedBy: form.advisor || currentUserName || 'Sistema',
          company: form.company,
          nit: form.nit,
          taxType: form.taxType,
          period: form.period,
          dueDate: form.dueDate,
          newStatus: form.status,
          projected: formProjected ? parseFloat(formProjected) : null,
          obligationId: savedOblId,
        }).catch(() => {});
      }

      closeDialog();
      await load();
    } catch (e: any) {
      toast.error('Error', { description: e.message });
    } finally {
      setSaving(false);
    }
  };


  const [isDragging, setIsDragging] = useState(false);

  const uploadFile = (file: File): Promise<void> => {
    return new Promise(resolve => {
      if (!file || !editObl) { resolve(); return; }
      if (file.size > 20 * 1024 * 1024) { toast.error(`${file.name}: supera los 20 MB`); resolve(); return; }
      const path = `tax_obligations/${editObl.id}/${Date.now()}_${file.name}`;
      const ref  = storageRef(storage, path);
      const task = uploadBytesResumable(ref, file);
      task.on('state_changed',
        snap => setUploadProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
        err  => { toast.error(`Error subiendo ${file.name}`, { description: err.message }); resolve(); },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          setAttachments(prev => [...prev, { name: file.name, url, size: file.size, uploadedAt: new Date().toISOString() }]);
          setUploadProgress(0);
          toast.success(`${file.name} subido`);
          resolve();
        }
      );
    });
  };

  const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    const remaining = 5 - attachments.length;
    if (remaining <= 0) { toast.error('Máximo 5 archivos por obligación'); return; }
    const toUpload = files.slice(0, remaining);
    if (files.length > remaining)
      toast.warning(`Solo se subirán ${remaining} archivo${remaining !== 1 ? 's' : ''} — límite 5`);
    setUploading(true);
    setUploadProgress(0);
    for (const file of toUpload) await uploadFile(file);
    setUploading(false);
  };

  const handleDeleteAttachment = async (att: TaxAttachment) => {
    if (!confirm(`¿Eliminar "${att.name}"?`)) return;
    try {
      await deleteObject(storageRef(storage, att.url)).catch(() => {});
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

  const fmtCOP = (v?: number) => {
    if (v == null) return null;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
  };

  const handleSaveAmount = async (
    field: 'projected' | 'paid',
    rawValue: string,
    matched: TaxObligation | undefined,
  ) => {
    setEditingAmount(null);
    if (!matched) { toast.error('Registra primero el estado del vencimiento'); return; }
    const num = parseFloat(rawValue.replace(/[^\d.]/g, ''));
    if (isNaN(num)) return;
    try {
      await taxCalendarService.update(matched.id, { [field]: num } as any);
      setObligations(prev => prev.map(o => o.id === matched.id ? { ...o, [field]: num } : o));
    } catch (e: any) {
      toast.error('Error al guardar', { description: e.message });
    }
  };

  const savePaidAtNow = async (value: string) => {
    if (isNew || !editObl || editObl.id === '__new__' || !value) return;
    try {
      await taxCalendarService.update(editObl.id, { paidAt: value } as any);
      setEditObl(prev => prev ? { ...prev, paidAt: value } : prev);
      setObligations(prev => prev.map(o => o.id === editObl.id ? { ...o, paidAt: value } : o));
    } catch (e: any) {
      toast.error('Error al guardar fecha de pago', { description: e.message });
    }
  };

  // Fecha real de presentación ante DIAN — independiente de la fecha de pago y
  // editable a mano, para no depender de "cuándo se dio clic" en el estado.
  const savePresentedAtNow = async (value: string) => {
    if (isNew || !editObl || editObl.id === '__new__' || !value) return;
    try {
      await taxCalendarService.update(editObl.id, { presentedAt: value } as any);
      setEditObl(prev => prev ? { ...prev, presentedAt: value } : prev);
      setObligations(prev => prev.map(o => o.id === editObl.id ? { ...o, presentedAt: value } : o));
    } catch (e: any) {
      toast.error('Error al guardar fecha de presentación', { description: e.message });
    }
  };

  // ── DIAN rows ────────────────────────────────────────────────────────────────

  interface CompanyDianRow {
    company: CalendarCompany;
    digit: NitDigit | null;
    upcoming: DianObligation[];
    allDianObls: DianObligation[];
    nextDue: DianObligation | null;
  }

  // Cada entrada es un array de palabras clave; cualquiera hace match (maneja nombres viejos y nuevos)
  const COMPANY_ORDER: string[][] = [
    ['inteegra'],
    ['netcol ingenieria', 'netcol ingeniería'],
    ['inversiones eon'],
    ['itac colombia'],
    ['consorcio scia'],
    ['triangulum'],
    ['netia'],
    ['leti', 'logistica empresarial', 'logistrica empresarial'],
    ['newstar'],
    ['newforce'],
    ['temporal tecnologia', 'temporal tecnología'],
    ['temporal fomento'],
    ['temporal internuqui'],
    ['temporal itac'],
    ['plex de colombia'],
    ['red empresarial'],
  ];

  const companyOrderIndex = (name: string) => {
    const n = normalize(name);
    const idx = COMPANY_ORDER.findIndex(keys =>
      keys.some(k => n.includes(k) || k.includes(n))
    );
    return idx === -1 ? COMPANY_ORDER.length : idx;
  };

  const calendarCompanies = useMemo<CalendarCompany[]>(() => {
    const byNit = new Map<string, CalendarCompany>();
    const byName = new Map<string, CalendarCompany>();
    const unique: CalendarCompany[] = [];

    const mergeCompany = (base: CalendarCompany, incoming: CalendarCompany): CalendarCompany => {
      const excludedTaxTypes = Array.from(new Set([
        ...base.excludedTaxTypes,
        ...incoming.excludedTaxTypes,
      ]));

      return {
        ...base,
        name: base.name?.trim() || incoming.name?.trim() || '',
        nit: base.nit?.trim() || incoming.nit?.trim() || '',
        active: Boolean(base.active || incoming.active),
        activeTH: Boolean(base.activeTH || incoming.activeTH),
        activeContabilidad: Boolean(base.activeContabilidad || incoming.activeContabilidad),
        excludedTaxTypes,
      };
    };

    for (const company of firestoreCompanies) {
      const nameKey = normalize(company.name ?? '');
      const nitKey = cleanNit(company.nit);
      if (!nameKey && !nitKey) continue;

      const existing = (nitKey ? byNit.get(nitKey) : undefined) ?? byName.get(nameKey);
      if (existing) {
        const merged = mergeCompany(existing, company);
        Object.assign(existing, merged);
        if (nitKey) byNit.set(nitKey, existing);
        if (nameKey) byName.set(nameKey, existing);
        continue;
      }

      const normalizedCompany = {
        ...company,
        name: company.name?.trim() ?? '',
        nit: company.nit?.trim() ?? '',
      };
      unique.push(normalizedCompany);
      if (nitKey) byNit.set(nitKey, normalizedCompany);
      if (nameKey) byName.set(nameKey, normalizedCompany);
    }

    return unique;
  }, [firestoreCompanies]);

  function dianUrgency(dueDate: string): 'overdue' | 'urgent' | 'soon' | 'ok' {
    const d = safeDaysUntil(dueDate);
    if (d === null) return 'ok';
    if (d < 0)  return 'overdue';
    if (d <= 7)  return 'urgent';
    if (d <= 15) return 'soon';
    return 'ok';
  }



  const dianRows = useMemo<CompanyDianRow[]>(() => {
    // Para filtro por mes usamos todos los vencimientos del año (sin límite de días)
    const effectiveDays = filterMonth !== 'all' ? 400 : dianDays;

    return calendarCompanies
      .filter(c => c.active && (
        c.activeContabilidad ||
        obligations.some(o => belongsToCompany(o, c))
      ))
      .filter(c => {
        if (!dianSearch) return true;
        const q = dianSearch.toLowerCase();
        if (c.name.toLowerCase().includes(q) || c.nit?.toLowerCase().includes(q)) return true;
        const oblsForCompany = c.nit ? getDianObligationsByNit(c.nit) : [];
        return oblsForCompany.some(o => displayTax(o.taxType).toLowerCase().includes(q) || o.taxType.toLowerCase().includes(q));
      })
      .map(c => {
        const digit    = extractVerificationDigit(c.nit);
        const hidden = new Set(c.excludedTaxTypes);
        const cutoff = getCalendarCutoff();
        const savedForCompany = obligations.filter(o => belongsToCompany(o, c));
        const effectiveDueDate = (automatic: DianObligation) =>
          savedForCompany.find(saved => sameDianObligation(saved, automatic))?.dueDate || automatic.dueDate;
        const rangeEnd = (() => {
          const end = new Date();
          end.setHours(0, 0, 0, 0);
          end.setDate(end.getDate() + effectiveDays);
          return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
        })();
        const allCalendarObligations = (c.nit ? getAllObligationsByNit(c.nit) : [])
          .filter(o => !hidden.has(o.taxType));
        const allUpcoming = viewMode === 'past'
          ? allCalendarObligations.filter(o => effectiveDueDate(o) < cutoff && effectiveDueDate(o) >= vencidosFrom)
          : viewMode === 'paid'
          ? allCalendarObligations
          : allCalendarObligations.filter(o => {
              const date = effectiveDueDate(o);
              return date >= cutoff && date <= rangeEnd;
            });
        // Para el filtro de mes filtramos las obligaciones que muestran, pero nextDue usa días reales
        const upcoming = filterMonth !== 'all'
          ? allUpcoming.filter(o => effectiveDueDate(o).slice(0, 7) === filterMonth)
          : allUpcoming;
        const upcomingForNext = c.nit
          ? (getUpcomingObligationsByNit(c.nit, dianDays)).filter(o => !hidden.has(o.taxType))
          : [];

        // Helper para buscar el estado registrado de una obligación DIAN
        const matchedStatus = (dianObl: DianObligation) => {
          const m = obligations.find(o => {
            return belongsToCompany(o, c) && sameDianObligation(o, dianObl);
          });
          return m?.status;
        };

        // nextDue = primera obligación pendiente (no completada)
        const pool = filterMonth !== 'all' ? upcoming : upcomingForNext;
        const nextDue = pool.find(o => !isAlertResolved(matchedStatus(o))) ?? null;

        const allDianObls = c.nit ? getDianObligationsByNit(c.nit) : [];
        return { company: c, digit, upcoming, allDianObls, nextDue };
      })
      .filter(row => {
        const sameCompany = (o: TaxObligation) => belongsToCompany(o, row.company);

        // ── Al día: solo empresas con al menos una obligación completada ────
        if (viewMode === 'paid') {
          const hasDone = obligations.some(o => sameCompany(o) && isAlertResolved(o.status));
          if (!hasDone) return false;
        }

        // ── Próximos/Vencidos: ocultar empresa si no tiene ninguna obligación pendiente ──
        if (viewMode !== 'paid') {
          const today = new Date().toISOString().slice(0, 10);
          // Pendientes en calendario DIAN
          const hasDianPending = row.upcoming.some(dianObl => {
            const m = obligations.find(o =>
              sameCompany(o) &&
              normTax(o.taxType) === normTax(dianObl.taxType) &&
              sameAutoDueDate(o.dueDate, dianObl.dueDate)
            );
            if (!m) return true; // sin registro = pendiente
            return !isAlertResolved(m.status);
          });
          // Pendientes manuales de Firestore (no están en el calendario DIAN)
          const hasManualPending = obligations.some(o =>
            sameCompany(o) &&
            !isAlertResolved(o.status) &&
            (o.dueDate ?? '') < today &&
            (o.dueDate ?? '') >= vencidosFrom &&
            !row.upcoming.some(u =>
              normTax(u.taxType) === normTax(o.taxType) &&
              sameAutoDueDate(o.dueDate, u.dueDate)
            )
          );
          if (!hasDianPending && !hasManualPending) return false;
        }

        // ── Month filter ────────────────────────────────────────────────────
        if (filterMonth !== 'all' && row.upcoming.length === 0) return false;

        // ── Build combined obligation list for the urgency filter ────────────
        // DIAN calendar obligations with their Firestore match (may be undefined)
        const dianPairs = row.upcoming.map(dianObl => {
          const m = obligations.find(o =>
            sameCompany(o) &&
            normalize(o.taxType) === normalize(dianObl.taxType) &&
            sameAutoDueDate(o.dueDate, dianObl.dueDate)
          );
          return { dueDate: dianObl.dueDate, period: dianObl.period, status: m?.status ?? '' };
        });


        // ── Urgency filter ──────────────────────────────────────────────────
        if (filterUrgency !== 'all') {
          if (filterUrgency === 'ok') {
            // Al día: tiene DIAN obls Y ninguna rastreada (status≠'') está vencida sin completar
            // Y tiene al menos una completada
            if (dianPairs.length === 0) return false;
            if (!dianPairs.some(o => isAlertResolved(o.status))) return false;
            if (dianPairs.some(o => o.status !== '' && !isAlertResolved(o.status) && dianUrgency(o.dueDate) === 'overdue')) return false;
          } else {
            // Vencidas / Urgentes / Próximas
            if (!dianPairs.some(o => !isAlertResolved(o.status) && dianUrgency(o.dueDate) === filterUrgency)) return false;
          }
        }

        return true;
      })
      .sort((a, b) => companyOrderIndex(a.company.name) - companyOrderIndex(b.company.name));
  }, [calendarCompanies, dianSearch, dianDays, filterUrgency, filterMonth, obligations, viewMode, vencidosFrom]);

  const URGENCY_BADGE: Record<string, string> = {
    overdue: 'bg-red-100 text-red-700',
    urgent:  'bg-orange-100 text-orange-700',
    soon:    'bg-yellow-100 text-yellow-700',
    ok:      'bg-green-100 text-green-700',
  };

  // ── Excel export del calendario ──────────────────────────────────────────────
  const handleExportCalendar = () => {
    type ExRow = {
      Empresa: string; NIT: string; 'Tipo de obligación': string;
      Período: string; Vencimiento: string; Estado: string;
      'Fecha de presentación': string;
      Contabilidad: string; Financiera: string;
      Proyectado: number | string; 'Valor presentado': number | string; Pagado: number | string;
      Observación: string;
    };
    const exRows: ExRow[] = [];
    const dateOnly = (v?: string) => (v ? v.slice(0, 10) : '');

    dianRows.forEach(({ company, upcoming }) => {
      const match = (o: TaxObligation) => belongsToCompany(o, company);

      // DIAN entries
      upcoming.forEach(dianObl => {
        const fs = obligations.find(o =>
          match(o) &&
          normalize(o.taxType) === normalize(dianObl.taxType) &&
          sameAutoDueDate(o.dueDate, dianObl.dueDate)
        );
        exRows.push({
          Empresa:              company.name,
          NIT:                  company.nit ?? '',
          'Tipo de obligación': displayTax(dianObl.taxType),
          Período:              normalizePeriod(dianObl.period),
          Vencimiento:          dianObl.dueDate,
          Estado:               fs?.status ?? '',
          'Fecha de presentación': dateOnly(fs?.presentedAt),
          Contabilidad:         (() => {
            const s = fs?.stepOwners ?? {};
            const names = [...new Set(['No iniciado','Revisado','Informe Enviado','Presentado'].map(k => s[k as TaxStatus]).filter(Boolean) as string[])];
            return names.length ? names.join(', ') : (fs?.accountingUser ?? '');
          })(),
          Financiera:           fs?.stepOwners?.['Pagado'] || (fs?.financieraUser ?? ''),
          Proyectado:           fs?.projected ?? '',
          'Valor presentado':   fs?.presented ?? '',
          Pagado:               fs?.paid ?? '',
          Observación:          fs?.observation ?? '',
        });
      });

      // Obligaciones legales / manuales (no están en upcoming)
      obligations
        .filter(o => match(o) && !upcoming.some(u =>
          normalize(u.taxType) === normalize(o.taxType) && sameAutoDueDate(o.dueDate, u.dueDate)
        ))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .forEach(o => {
          exRows.push({
            Empresa:              company.name,
            NIT:                  company.nit ?? '',
            'Tipo de obligación': displayTax(o.taxType),
            Período:              normalizePeriod(o.period),
            Vencimiento:          o.dueDate,
            Estado:               o.status ?? '',
            'Fecha de presentación': dateOnly(o.presentedAt),
            Contabilidad:         (() => {
              const s = o.stepOwners ?? {};
              const names = [...new Set(['No iniciado','Revisado','Informe Enviado','Presentado'].map(k => s[k as TaxStatus]).filter(Boolean) as string[])];
              return names.length ? names.join(', ') : (o.accountingUser ?? '');
            })(),
            Financiera:           o.stepOwners?.['Pagado'] || (o.financieraUser ?? ''),
            Proyectado:           o.projected ?? '',
            'Valor presentado':   o.presented ?? '',
            Pagado:               o.paid ?? '',
            Observación:          o.observation ?? '',
          });
        });
    });

    const ws = XLSX.utils.json_to_sheet(exRows);
    ws['!cols'] = [
      { wch: 38 }, { wch: 14 }, { wch: 28 }, { wch: 20 },
      { wch: 14 }, { wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 22 },
      { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 35 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Calendario');
    XLSX.writeFile(wb, `calendario-tributario-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-screen">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#4A4A4A] flex items-center gap-2">
            <Calendar className="w-7 h-7 text-[#008C3C]" />
            Calendario DIAN
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Vencimientos de retención por dígito del NIT · {dianRows.length} de {calendarCompanies.filter(c => c.active && c.activeContabilidad).length} empresa{dianRows.length !== 1 ? 's' : ''}
          </p>
          {/* Tabs */}
          <div className="flex gap-1 mt-3">
            <button
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-[#008C3C] text-white shadow-sm"
            >
              <Calendar className="w-3.5 h-3.5" /> Calendario
            </button>
            <button
              onClick={() => navigate('/contabilidad/informe')}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-200 transition-all"
            >
              <BarChart3 className="w-3.5 h-3.5" /> Informe
            </button>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {isAdmin && <AdminEmailButtons />}
          <button
            onClick={handleExportCalendar}
            disabled={dianRows.length === 0}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" /> Exportar Excel
          </button>
          {!isFinanciera && (
            <div className="flex items-center gap-1">
              <label className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer">
                <Upload className="w-3.5 h-3.5" /> Actualizar desde Excel
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={selectImportExcel} />
              </label>
              <TaxImportInstructions />
            </div>
          )}
          {!isFinanciera && (
            <Button onClick={openNew} className="bg-[#008C3C] hover:bg-[#006C2F] text-white">
              <Plus className="w-4 h-4 mr-2" /> Nuevo vencimiento
            </Button>
          )}
        </div>
      </div>

      {/* Filter panel */}
      {(() => {
        const hasFilters = dianSearch || filterUrgency !== 'all' || filterMonth !== 'all' || viewMode !== 'upcoming';

        return (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4 space-y-3">
            {/* Row 1: search + days */}
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <Input
                  placeholder="Buscar empresa o NIT..."
                  value={dianSearch}
                  onChange={e => setDianSearch(e.target.value)}
                  className="pl-9 h-8 text-sm border-gray-200"
                />
              </div>
              {/* Modo: Próximos / Vencidos / Al día */}
              <div className="flex items-center gap-1 rounded-lg border border-gray-200 overflow-hidden">
                <button onClick={() => { setViewMode('upcoming'); setFilterMonth('all'); }}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1.5
                    ${viewMode === 'upcoming' ? 'bg-[#008C3C] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                  <Calendar className="w-3 h-3" /> Próximos
                </button>
                <button onClick={() => { setViewMode('past'); setFilterMonth('all'); }}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1.5
                    ${viewMode === 'past' ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                  <History className="w-3 h-3" /> Vencidos
                </button>
                <button onClick={() => { setViewMode('paid'); setFilterMonth('all'); }}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1.5
                    ${viewMode === 'paid' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                  <CheckCircle2 className="w-3 h-3" /> Al día
                </button>
              </div>

              {viewMode === 'upcoming' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400 whitespace-nowrap">Rango:</span>
                  {[30, 60, 90].map(d => (
                    <button key={d} onClick={() => setDianDays(d)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors
                        ${dianDays === d ? 'bg-[#008C3C] text-white border-[#008C3C]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                      {d}d
                    </button>
                  ))}
                </div>
              )}
              {viewMode === 'past' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400 whitespace-nowrap">Desde:</span>
                  <Input
                    type="month"
                    value={vencidosFrom.slice(0, 7)}
                    onChange={e => setVencidosFrom(e.target.value ? `${e.target.value}-01` : '2026-01-01')}
                    className="h-7 text-xs border border-gray-200 rounded-lg px-2 text-gray-600 focus:outline-none focus:border-orange-400"
                  />
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400 whitespace-nowrap">Mes:</span>
                <Input
                  type="month"
                  value={filterMonth === 'all' ? '' : filterMonth}
                  onChange={e => setFilterMonth(e.target.value || 'all')}
                  className="h-7 text-xs border border-gray-200 rounded-lg px-2 text-gray-600 focus:outline-none focus:border-[#008C3C]"
                />
                {filterMonth !== 'all' && (
                  <button onClick={() => setFilterMonth('all')} className="text-gray-400 hover:text-gray-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>


            {/* Active summary */}
            {hasFilters && (
              <p className="text-xs text-[#008C3C] font-medium border-t border-gray-50 pt-2">
                {dianRows.length} empresa{dianRows.length !== 1 ? 's' : ''} con los filtros aplicados
              </p>
            )}
          </div>
        );
      })()}

      {/* Companies list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" />
        </div>
      ) : dianRows.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p>{dianSearch ? 'Sin resultados para la búsqueda.' : 'No hay empresas activas registradas.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dianRows.map(({ company, digit, upcoming, nextDue }) => {
            const noDigit = digit === null;
            const urgency = nextDue ? dianUrgency(nextDue.dueDate) : 'ok';
            const days    = nextDue ? safeDaysUntil(nextDue.dueDate) : null;
            return (
              <div
                key={company.id}
                className={`bg-white rounded-xl border shadow-sm overflow-hidden
                  ${urgency === 'overdue' ? 'border-l-4 border-l-red-400' :
                    urgency === 'urgent'  ? 'border-l-4 border-l-orange-400' :
                    urgency === 'soon'    ? 'border-l-4 border-l-yellow-400' :
                    'border-gray-100'}`}
              >
                {/* Company header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#008C3C]/10 flex items-center justify-center flex-shrink-0">
                      {company.logo
                        ? <img src={company.logo} alt={company.name} className="w-6 h-6 object-contain rounded" />
                        : <Building2 className="w-4 h-4 text-[#008C3C]" />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#4A4A4A] truncate">{company.name}</p>
                      <p className="text-[10px] text-gray-400">
                        NIT: <span className="font-mono">{company.nit || '—'}</span>
                        {digit !== null && (
                          <span className="ml-2 bg-[#008C3C]/10 text-[#008C3C] px-1.5 py-0.5 rounded font-bold">
                            DV: {digit}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setManagingTaxTypes(company)}
                      title="Gestionar tipos de obligación"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-[#008C3C] hover:bg-[#008C3C]/10 transition-colors"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                    </button>
                  {viewMode === 'paid' ? (
                    (() => {
                      const doneCount = obligations.filter(o =>
                        belongsToCompany(o, company) && (o.status === 'Presentado' || o.status === 'Pagado')
                      ).length;
                      return (
                        <span className="text-[10px] text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full font-semibold">
                          {doneCount} al día
                        </span>
                      );
                    })()
                  ) : noDigit ? (
                    <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">
                      NIT sin dígito verificador
                    </span>
                  ) : nextDue ? (
                    <div className="text-right flex-shrink-0">
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${URGENCY_BADGE[urgency]}`}>
                        {days !== null && days < 0 ? `Vencido hace ${Math.abs(days)}d` :
                         days === 0 ? 'Vence hoy' :
                         days !== null ? `${days} día${days !== 1 ? 's' : ''}` : ''}
                      </span>
                      <p className="text-[10px] text-gray-400 mt-1">{upcoming.length} próximo{upcoming.length !== 1 ? 's' : ''}</p>
                    </div>
                  ) : (
                    <span className="text-[10px] text-green-700 bg-green-50 px-2 py-1 rounded-lg font-semibold">
                      Sin vencimientos en {dianDays}d
                    </span>
                  )}
                  </div>
                </div>

                {/* Upcoming obligations */}
                {!noDigit && upcoming.length > 0 && (
                  <div className="divide-y divide-gray-50">
                    {upcoming.map((dianObl, i) => {
                      const matched = obligations.find(o =>
                        belongsToCompany(o, company) && sameDianObligation(o, dianObl)
                      );
                      const effectiveDate = matched?.dueDate || dianObl.dueDate;
                      const d = safeDaysUntil(effectiveDate);
                      if (matched?.status === 'No aplica') return null;
                      const doneStatus = matched?.status === 'Presentado' || matched?.status === 'Pagado';
                      // Completadas (Presentado/Pagado) → solo en "Al día"
                      if (doneStatus && viewMode !== 'paid') return null;
                      // "Al día" → solo completadas
                      if (viewMode === 'paid' && !doneStatus) return null;
                      const u = doneStatus ? 'ok' : dianUrgency(effectiveDate);
                      const cfg = matched?.status ? STATUS_CFG[matched.status] : null;
                      const handleDianClick = () => {
                        if (matched) {
                          openEdit(matched, true);
                        } else {
                          setIsNew(true);
                          setQuickEditMode(true);
                          setEditObl({ id: '__new__' } as TaxObligation);
                          setForm({
                            ...EMPTY_FORM,
                            companyId:      company.id,
                            company:        company.name,
                            nit:            company.nit,
                            city:           'Bogotá',
                            scope:          dianObl.scope,
                            taxType:        dianObl.taxType,
                            obligationType: 'Impuestos',
                            period:         dianObl.period,
                            dueDate:        dianObl.dueDate,
                            year:           dianObl.dueDate.slice(0, 4),
                            advisor:        currentUserName,
                          });
                          setAttachments([]);
                          setUploadProgress(0);
                          setFormProjected('');
                          setFormPaid('');
                        }
                      };
                      const oblKey = matched ? matched.id : `${company.nit}__${effectiveDate}__${dianObl.taxType}`;

                      const AmountCell = ({ field, label }: { field: 'projected' | 'paid'; label: string }) => {
                        const cellKey = `${oblKey}__${field}`;
                        const isEditing = editingAmount?.key === cellKey;
                        const val = matched?.[field];
                        if (isEditing) {
                          return (
                            <input
                              type="number"
                              min="0"
                              className="text-[11px] border border-[#008C3C] rounded px-1.5 py-0.5 w-28 focus:outline-none focus:ring-1 focus:ring-[#008C3C] bg-white"
                              value={editingAmount!.value}
                              onChange={e => setEditingAmount(prev => prev ? { ...prev, value: e.target.value } : null)}
                              onBlur={() => handleSaveAmount(field, editingAmount!.value, matched)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); handleSaveAmount(field, editingAmount!.value, matched); }
                                if (e.key === 'Escape') setEditingAmount(null);
                              }}
                              autoFocus
                              onClick={e => e.stopPropagation()}
                            />
                          );
                        }
                        return (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              if (!matched) { toast.error('Registra primero el estado del vencimiento'); return; }
                              setEditingAmount({ key: cellKey, field, value: val != null ? String(val) : '' });
                            }}
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors text-[11px]
                              ${val != null
                                ? field === 'projected'
                                  ? 'border-blue-100 bg-blue-50 text-blue-700 hover:border-blue-300'
                                  : 'border-green-100 bg-green-50 text-green-700 hover:border-green-300'
                                : 'border-dashed border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500'
                              }`}
                          >
                            <span className="font-medium">{label}:</span>
                            <span>{val != null ? fmtCOP(val) : '—'}</span>
                          </button>
                        );
                      };

                      return (
                        <div key={i} className="hover:bg-gray-50 transition-colors">
                          <div
                            onClick={handleDianClick}
                            className="w-full grid grid-cols-12 px-4 pt-2 pb-1 items-center text-xs cursor-pointer text-left"
                          >
                            <div className="col-span-5 text-gray-700 font-medium truncate pr-2 flex items-center gap-1.5">
                              {cfg
                                ? <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                                : <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-gray-200" />}
                              {displayTax(dianObl.taxType)}
                            </div>
                            <div className="col-span-3 text-gray-400 truncate">{normalizePeriod(dianObl.period)}</div>
                            <div className="col-span-2 text-center font-mono text-gray-500">{fmtDate(effectiveDate)}</div>
                            <div className="col-span-2 text-right">
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${URGENCY_BADGE[u]} ${doneStatus ? 'cursor-pointer hover:opacity-75' : ''}`}
                                onClick={doneStatus ? (e) => { e.stopPropagation(); setFilterUrgency('ok'); } : undefined}
                                title={doneStatus ? 'Filtrar solo Al día' : undefined}
                              >
                                {doneStatus ? '✓ Al día' : d === null ? '—' : d < 0 ? `+${Math.abs(d)}v` : d === 0 ? 'Hoy' : `${d}d`}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 px-4 pb-2 pl-8 flex-wrap">
                            <AmountCell field="projected" label="Proyectado" />
                            <AmountCell field="paid" label="Pagado" />
                            <span
                              className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px]
                                ${matched?.status === 'Pagado'
                                  ? 'border-green-100 bg-green-50 text-green-700'
                                  : 'border-dashed border-gray-200 text-gray-400'}`}
                            >
                              <span className="font-medium">¿Pagado?:</span>
                              <span>{matched?.status === 'Pagado' ? 'Sí' : 'No'}</span>
                            </span>
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-gray-200 text-[11px] text-gray-500">
                              <span className="font-medium">Fecha de pago:</span>
                              <span>
                                {matched?.paidAt
                                  ? new Date(matched.paidAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Bogota' })
                                  : '—'}
                              </span>
                            </span>
                            {matched?.presentedAt && (
                              <span className="text-[10px] text-purple-600 flex items-center gap-0.5">
                                <CheckCircle2 className="w-3 h-3" />
                                {new Date(matched.presentedAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Bogota' })}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {!noDigit && upcoming.length === 0 && (
                  <p className="text-[11px] text-gray-400 italic px-4 py-2">Sin obligaciones en los próximos {dianDays} días.</p>
                )}

              </div>
            );
          })}
        </div>
      )}

      {/* ── Edit / New dialog ── */}
      <Dialog open={!!editObl} onOpenChange={o => { if (!o) closeDialog(); }}>
        <DialogContent className="w-full max-w-lg flex flex-col max-h-[92dvh] sm:max-h-[90vh] p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
            <DialogTitle className="text-base flex items-center gap-2">
              {isNew ? <Plus className="w-4 h-4 text-[#008C3C]" /> : <Edit2 className="w-4 h-4 text-[#008C3C]" />}
              {isNew ? 'Nuevo vencimiento' : quickEditMode ? 'Actualizar estado' : 'Editar obligación'}
            </DialogTitle>
            {quickEditMode && editObl && editObl.id !== '__new__' && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">
                {(editObl as TaxObligation).taxType} · {normalizePeriod((editObl as TaxObligation).period)} · {fmtDate((editObl as TaxObligation).dueDate)}
              </p>
            )}
          </DialogHeader>

          {editObl && (
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

              {/* Empresa */}
              <div className={quickEditMode ? 'hidden' : ''}>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Empresa</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs text-gray-500">Razón social *</Label>
                    <Select
                      value={form.company}
                      onValueChange={v => {
                        const c = calendarCompanies.find(c => c.name === v);
                        setF('companyId', c?.id ?? '');
                        setF('company', v);
                        if (c?.nit) setF('nit', c.nit);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona una empresa..." />
                      </SelectTrigger>
                      <SelectContent>
                        {calendarCompanies
                          .filter(c => c.active)
                          .sort((a, b) => a.name.localeCompare(b.name, 'es'))
                          .map(c => (
                            <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
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
                    <Label className="text-xs text-gray-500">Diligenciado por</Label>
                    <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-gray-200 bg-gray-50 text-sm text-gray-700">
                      <UserCheck className="w-3.5 h-3.5 text-[#008C3C] flex-shrink-0" />
                      <span className="truncate">{form.advisor || currentUserName || '—'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Obligación */}
              <div className={quickEditMode ? 'hidden' : ''}>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Obligación tributaria</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs text-gray-500">Tipo de impuesto / obligación *</Label>
                    <TaxTypeCombobox
                      value={form.taxType}
                      onChange={v => setF('taxType', v)}
                      options={taxTypeOptions}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs text-gray-500">Período</Label>
                    <TaxTypeCombobox
                      value={form.period}
                      onChange={v => setF('period', v)}
                      options={periodOptions}
                      placeholder="Seleccionar o escribir período…"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Fecha de vencimiento *</Label>
                    <Input
                      type="date"
                      value={form.dueDate}
                      onChange={e => { const v = e.target.value; setF('dueDate', v); if (v) setF('year', v.slice(0, 4)); }}
                      disabled={isFinanciera}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Año</Label>
                    <Input value={form.year} onChange={e => setF('year', e.target.value)} placeholder="2026" />
                  </div>
                </div>
              </div>

              {/* Fecha editable en quickEdit — solo contabilidad/admin */}
              {quickEditMode && !isFinanciera && (
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">Fecha de vencimiento</Label>
                  <Input
                    type="date"
                    value={form.dueDate}
                    onChange={e => { const v = e.target.value; setF('dueDate', v); if (v) setF('year', v.slice(0, 4)); }}
                  />
                </div>
              )}

              {/* Proceso — oculto solo al crear desde "Nuevo vencimiento" */}
              <div className={isNew && !quickEditMode ? 'hidden' : ''}>
                {(quickEditMode || isFinanciera) && (() => {
                  const accUser = !isNew && editObl
                    ? (editObl as TaxObligation).accountingUser || (!isFinanciera ? currentUserName : '')
                    : (!isFinanciera ? currentUserName : '');
                  const finUser = !isNew && editObl
                    ? (editObl as TaxObligation).financieraUser || (isFinanciera ? currentUserName : '')
                    : (isFinanciera ? currentUserName : '');
                  return (
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg">
                        <UserCheck className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[10px] text-blue-400 font-medium uppercase tracking-wide">Contabilidad</p>
                          <p className="text-xs text-blue-700 font-semibold truncate">{accUser || '—'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-100 rounded-lg">
                        <UserCheck className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[10px] text-green-400 font-medium uppercase tracking-wide">Financiera</p>
                          <p className="text-xs text-green-700 font-semibold truncate">{finUser || 'Pendiente'}</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Proceso</p>
                {(() => {
                  const STEPS: { status: TaxStatus; label: string; btn: string; requiresFile?: boolean }[] = [
                    { status: 'No iniciado',     label: 'Iniciado',         btn: 'Iniciar proceso'    },
                    { status: 'Revisado',        label: 'Revisado',         btn: 'Marcar revisado'    },
                    { status: 'Informe Enviado', label: 'Informe\nEnviado', btn: 'Enviar informe'     },
                    { status: 'Presentado',      label: 'Presentado',       btn: 'Marcar presentado', requiresFile: true },
                  ];
                  const ORDER: Partial<Record<string, number>> = {
                    '': -1, 'No iniciado': 0, 'Revisado': 1, 'Informe Enviado': 2, 'Presentado': 3,
                  };
                  const curIdx   = ORDER[form.status] ?? -1;
                  const nextIdx  = curIdx + 1;
                  const nextStep = nextIdx < STEPS.length ? STEPS[nextIdx] : null;
                  const canNext  = !nextStep?.requiresFile || attachments.length > 0;
                  const isPresentado = form.status === 'Presentado';
                  const isPagado     = form.status === 'Pagado';

                  return (
                    <>
                      {/* ── Stepper visual (todos lo ven, read-only para financiera) ── */}
                      <div className="flex items-start mb-5">
                        {STEPS.map((step, i) => {
                          const done     = curIdx >= i;
                          const isNext   = i === nextIdx && canStepper;
                          const stepOwner = (editObl as TaxObligation)?.stepOwners?.[step.status];
                          // Nombre corto: primer nombre solamente
                          const shortName = stepOwner
                            ? stepOwner.includes('@')
                              ? stepOwner.split('@')[0]
                              : stepOwner.split(' ')[0]
                            : null;
                          return (
                            <Fragment key={step.status}>
                              {i > 0 && (
                                <div className={`flex-1 h-0.5 mt-4 ${curIdx >= i ? 'bg-green-400' : 'bg-gray-200'}`} />
                              )}
                              <div className="flex flex-col items-center gap-1 w-14">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                                  ${done
                                    ? 'bg-green-500 border-green-500 text-white'
                                    : isNext
                                      ? 'bg-white border-blue-400 text-blue-500'
                                      : 'bg-white border-gray-200 text-gray-300'}`}>
                                  {done ? '✓' : i + 1}
                                </div>
                                <span className={`text-[9px] text-center leading-tight whitespace-pre-line
                                  ${done ? 'text-green-600 font-semibold' : isNext ? 'text-blue-500 font-medium' : 'text-gray-300'}`}>
                                  {step.label}
                                </span>
                                {shortName && (
                                  <span className="text-[8px] text-center text-gray-400 leading-tight truncate w-full px-0.5" title={stepOwner ?? ''}>
                                    {shortName}
                                  </span>
                                )}
                              </div>
                            </Fragment>
                          );
                        })}
                      </div>

                      {/* ── Sección exclusiva CONTABILIDAD / ADMIN ── */}
                      {canStepper && (
                        <>
                          {/* Avisos de bloqueo */}
                          {nextStep?.requiresFile && attachments.length === 0 && (
                            <div className="mb-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                              📎 Sube el <b>archivo de presentación</b> para continuar
                            </div>
                          )}

                          {/* Botón de siguiente paso */}
                          {form.status === 'No aplica' ? (
                            <div className="text-center py-3 bg-gray-50 rounded-xl border border-gray-200">
                              <p className="text-sm font-semibold text-gray-400">✕ No aplica este período</p>
                            </div>
                          ) : curIdx < 3 && nextStep ? (
                            <button
                              type="button"
                              disabled={!canNext}
                              onClick={() => saveStatusNow(nextStep.status)}
                              className={`w-full py-3 rounded-xl text-sm font-semibold transition-all border-2
                                ${form.status === nextStep.status
                                  ? 'bg-blue-500 border-blue-500 text-white shadow-sm'
                                  : canNext
                                    ? 'bg-white border-blue-400 text-blue-600 hover:bg-blue-50'
                                    : 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'}`}>
                              {form.status === nextStep.status ? `✓ ${nextStep.btn}` : nextStep.btn}
                            </button>
                          ) : !isPagado && !isPresentado && (
                            <div className="text-center py-3 bg-green-50 rounded-xl border border-green-200">
                              <p className="text-sm font-semibold text-green-700">✓ Proceso completado — pendiente de pago</p>
                            </div>
                          )}

                          {/* Paso anterior + No aplica */}
                          <div className="flex gap-2 mt-2">
                            {curIdx >= 0 && (
                              isAdmin ? (
                                <button
                                  type="button"
                                  onClick={() => saveStatusNow(curIdx === 0 ? '' as TaxStatus : STEPS[curIdx - 1].status)}
                                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-medium bg-white border-gray-200 text-gray-500 hover:bg-gray-50 transition-all"
                                >
                                  {curIdx === 0 ? '↩ Revertir proceso' : '← Paso anterior'}
                                </button>
                              ) : (
                                <div className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed select-none"
                                  title="Solo un administrador puede revertir el proceso">
                                  🔒 {curIdx === 0 ? 'Revertir proceso' : 'Paso anterior'}
                                </div>
                              )
                            )}
                            {!isFinanciera && (
                              form.status === 'No aplica' ? (
                                <button
                                  type="button"
                                  onClick={() => saveStatusNow('No iniciado' as TaxStatus)}
                                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-medium bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 transition-all"
                                >
                                  ↩ Reactivar obligación
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => saveStatusNow('No aplica')}
                                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-medium bg-white border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-all"
                                >
                                  ✕ No aplica este período
                                </button>
                              )
                            )}
                          </div>
                        </>
                      )}

                      {/* ── Sección FINANCIERA / ADMIN: Registrar pago ── */}
                      {canMarkPaid && (
                        <div className={`mt-3 ${!isPresentado && !isPagado ? 'opacity-50 pointer-events-none' : ''}`}>
                          {!isPresentado && !isPagado && (
                            <p className="text-[11px] text-gray-400 text-center mb-2">
                              Disponible cuando contabilidad marque Presentado
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => saveStatusNow('Pagado')}
                            className={`w-full py-3 rounded-xl text-sm font-semibold transition-all border-2
                              ${isPagado
                                ? 'bg-green-500 border-green-500 text-white shadow-sm'
                                : isPresentado
                                  ? 'bg-white border-green-400 text-green-600 hover:bg-green-50'
                                  : 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'}`}>
                            {isPagado ? '✓ Pago registrado' : '💳 Registrar pago'}
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Fecha de presentación */}
                {!isNew && (editObl as TaxObligation).presentedAt && (
                  <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-100 rounded-lg">
                    <CheckCircle2 className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                    <span className="text-xs text-purple-700 font-medium">Presentado ante DIAN el&nbsp;
                      <span className="font-semibold">
                        {new Date((editObl as TaxObligation).presentedAt!).toLocaleDateString('es-CO', {
                          day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota',
                        })}
                      </span>
                    </span>
                  </div>
                )}

                {/* Responsables por paso */}
                {!isNew && (() => {
                  const obl = editObl as TaxObligation;
                  const stepOwners = obl.stepOwners ?? {};
                  // Personas únicas de contabilidad (todos los pasos excepto Pagado)
                  const ACCOUNTING_STEPS: TaxStatus[] = ['No iniciado', 'Revisado', 'Informe Enviado', 'Presentado'];
                  const accountingContribs = [...new Set(
                    ACCOUNTING_STEPS.map(s => stepOwners[s]).filter(Boolean) as string[]
                  )];
                  const financieraUser = stepOwners['Pagado'] || obl.financieraUser;
                  // Fallback a los campos legacy si no hay stepOwners aún
                  const accLegacy = obl.accountingUser;
                  const showAcc = accountingContribs.length > 0 || accLegacy;
                  const showFin = !!financieraUser;
                  if (!showAcc && !showFin) return null;
                  return (
                    <div className="mt-3 space-y-2">
                      {showAcc && (
                        <div className="flex items-start gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg">
                          <UserCheck className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] text-blue-400 font-medium uppercase tracking-wide mb-1">Contabilidad</p>
                            {accountingContribs.length > 0
                              ? accountingContribs.map(name => (
                                  <p key={name} className="text-xs text-blue-700 font-semibold truncate">{name}</p>
                                ))
                              : <p className="text-xs text-blue-700 font-semibold truncate">{accLegacy}</p>
                            }
                          </div>
                        </div>
                      )}
                      {showFin && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-100 rounded-lg">
                          <UserCheck className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] text-green-400 font-medium uppercase tracking-wide">Financiera</p>
                            <p className="text-xs text-green-700 font-semibold truncate">{financieraUser}</p>
                            {obl.paidAt && (
                              <p className="text-[10px] text-green-500 mt-0.5">
                                Pago: {new Date(obl.paidAt + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Fechas de presentación / pago — independientes entre sí */}
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Fecha de presentación</Label>
                    <Input
                      type="date"
                      value={formPresentedAt}
                      onChange={e => {
                        const v = e.target.value;
                        setFormPresentedAt(v);
                        savePresentedAtNow(v);
                      }}
                      onBlur={e => savePresentedAtNow(e.target.value)}
                      className="text-sm"
                      disabled={!canMarkPresented}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Fecha de pago</Label>
                    <Input
                      type="date"
                      value={formPaidAt}
                      onChange={e => {
                        const v = e.target.value;
                        setFormPaidAt(v);
                        savePaidAtNow(v);
                      }}
                      onBlur={e => savePaidAtNow(e.target.value)}
                      className="text-sm"
                      disabled={!canMarkPaid}
                    />
                  </div>
                </div>

                {/* Valores proyectado / presentado / pagado */}
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-gray-700">
                      Valor proyectado
                    </Label>
                    <Input
                      type="number" min="0"
                      value={formProjected}
                      onChange={e => setFormProjected(e.target.value)}
                      placeholder="Opcional"
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-purple-700">Valor presentado (COP)</Label>
                    <Input
                      type="number" min="0"
                      value={formPresented}
                      onChange={e => setFormPresented(e.target.value)}
                      placeholder="0"
                      className="text-sm"
                      disabled={!canMarkPresented}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Valor pagado (COP)</Label>
                    <Input
                      type="number" min="0"
                      value={formPaid}
                      onChange={e => setFormPaid(e.target.value)}
                      placeholder="0"
                      className="text-sm"
                    />
                  </div>
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

              {/* Historial de cambios */}
              {!isNew && editObl && (editObl as TaxObligation).statusHistory?.length ? (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1 mb-2">
                    <History className="w-3 h-3" /> Historial de cambios
                  </p>
                  <div className="space-y-1.5">
                    {[...(editObl as TaxObligation).statusHistory!]
                      .reverse()
                      .map((entry, i) => {
                        const cfg = entry.status ? STATUS_CFG[entry.status] : null;
                        const d   = new Date(entry.changedAt);
                        const now = new Date();
                        const diffMs  = now.getTime() - d.getTime();
                        const diffMin = Math.floor(diffMs / 60000);
                        const diffH   = Math.floor(diffMs / 3600000);
                        const diffD   = Math.floor(diffMs / 86400000);
                        const timeLabel =
                          diffMin < 1  ? 'ahora mismo' :
                          diffMin < 60 ? `hace ${diffMin}min` :
                          diffH   < 24 ? `hace ${diffH}h` :
                          diffD   < 2  ? 'ayer' :
                          d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined, timeZone: 'America/Bogota' });
                        const timeExact = d.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });
                        return (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg?.dot ?? 'bg-gray-300'}`} />
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${cfg?.bg ?? 'bg-gray-100'} ${cfg?.color ?? 'text-gray-500'}`}>
                              {cfg?.label ?? (entry.status || 'Sin estado')}
                            </span>
                            <span className="text-gray-500 truncate flex-1">{entry.changedBy}</span>
                            <span className="text-gray-400 flex-shrink-0 text-[10px]" title={timeExact}>{timeLabel}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ) : null}

              {/* Documentos */}
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
                    <input ref={attachFileRef} type="file" multiple className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip"
                      onChange={handleAttachFile} disabled={uploading || attachments.length >= 5} />
                  </label>
                </div>

                {/* Zona de arrastre */}
                <label
                  onDragEnter={e => { e.preventDefault(); if (!uploading && attachments.length < 5) setIsDragging(true); }}
                  onDragOver={e => { e.preventDefault(); }}
                  onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
                  onDrop={e => {
                    e.preventDefault();
                    setIsDragging(false);
                    const files = Array.from(e.dataTransfer.files);
                    if (!files.length) return;
                    const remaining = 5 - attachments.length;
                    if (remaining <= 0) { toast.error('Máximo 5 archivos por obligación'); return; }
                    const toUpload = files.slice(0, remaining);
                    setUploading(true);
                    setUploadProgress(0);
                    (async () => { for (const f of toUpload) await uploadFile(f); setUploading(false); })();
                  }}
                  className={`flex flex-col items-center justify-center gap-1.5 w-full rounded-xl border-2 border-dashed py-4 mb-2 cursor-pointer transition-all
                    ${uploading || attachments.length >= 5
                      ? 'opacity-40 pointer-events-none border-gray-200'
                      : isDragging
                        ? 'border-[#008C3C] bg-[#008C3C]/5 scale-[1.01]'
                        : 'border-gray-200 hover:border-[#008C3C]/50 hover:bg-gray-50'}`}
                >
                  <input type="file" multiple className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip"
                    onChange={handleAttachFile} disabled={uploading || attachments.length >= 5} />
                  {uploading
                    ? <Loader2 className="w-5 h-5 animate-spin text-[#008C3C]" />
                    : <Upload className={`w-5 h-5 ${isDragging ? 'text-[#008C3C]' : 'text-gray-300'}`} />}
                  <p className={`text-xs ${isDragging ? 'text-[#008C3C] font-medium' : 'text-gray-400'}`}>
                    {isDragging ? 'Suelta el archivo aquí' : 'Arrastra un archivo o haz clic para subir'}
                  </p>
                  <p className="text-[10px] text-gray-300">PDF, Word, Excel, imágenes · máx 20 MB</p>
                </label>

                {uploading && (
                  <div className="mb-2 space-y-1">
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-[#008C3C] rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
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
              {!isNew && quickEditMode ? (
                // Obligación existente abierta desde calendario DIAN
                <>
                  <Button variant="outline" className="flex-1" onClick={closeDialog} disabled={saving}>
                    Cerrar
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={saving || uploading || !form.company.trim() || !form.taxType.trim() || !form.dueDate}
                    className="flex-1 bg-[#008C3C] hover:bg-[#006C2F] text-white"
                  >
                    {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                    Guardar cambios
                  </Button>
                </>
              ) : isNew && !quickEditMode ? (
                // Nuevo vencimiento desde "+Nuevo": Cancelar + Crear
                <>
                  <Button variant="outline" className="flex-1" onClick={closeDialog}>
                    <X className="w-4 h-4 mr-1" /> Cancelar
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={saving || uploading || !form.company.trim() || !form.taxType.trim() || !form.dueDate}
                    className="flex-1 bg-[#008C3C] hover:bg-[#006C2F] text-white"
                  >
                    {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                    Crear vencimiento
                  </Button>
                </>
              ) : isNew && quickEditMode ? (
                // Vencimiento nuevo desde calendario DIAN (aún sin registrar): solo Crear
                <Button
                  onClick={handleSave}
                  disabled={saving || uploading || !form.company.trim() || !form.taxType.trim() || !form.dueDate}
                  className="flex-1 bg-[#008C3C] hover:bg-[#006C2F] text-white"
                >
                  {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                  Registrar vencimiento
                </Button>
              ) : (
                // Edición completa de obligación existente
                <Button
                  onClick={handleSave}
                  disabled={saving || uploading || !form.company.trim() || !form.taxType.trim() || !form.dueDate}
                  className="flex-1 bg-[#008C3C] hover:bg-[#006C2F] text-white"
                >
                  {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                  Guardar cambios
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: gestionar tipos de obligación por empresa */}
      {managingTaxTypes && (() => {
        const hidden = new Set(managingTaxTypes.excludedTaxTypes);
        const toggle = (type: string) => {
          const next = new Set(hidden);
          if (next.has(type)) next.delete(type); else next.add(type);
          setManagingTaxTypes({ ...managingTaxTypes, excludedTaxTypes: [...next] });
        };

        const GROUPS = [
          {
            label: 'Nacional — DIAN',
            color: 'text-blue-700',
            bg: 'bg-blue-50',
            dot: 'bg-blue-500',
            types: [
              'Retención en la Fuente',
              'IVA Bimestral',
              'IVA Cuatrimestral',
              'Renta y Complementarios (PJ)',
              'Impuesto al Patrimonio',
              'Exógena Nacional (GC)',
              'Exógena Nacional (PJ/Naturales)',
            ],
          },
          {
            label: 'Distrital — Hacienda Bogotá',
            color: 'text-emerald-700',
            bg: 'bg-emerald-50',
            dot: 'bg-emerald-500',
            types: [
              'ICA Bimestral',
              'ICA Régimen Común',
              'ICA Régimen Preferencial',
              'ReteICA',
              'Predial',
              'Vehículos',
            ],
          },
        ];

        const visibleCount = ALL_TAX_TYPES.length - hidden.size;

        return (
          <Dialog open onOpenChange={() => setManagingTaxTypes(null)}>
            <DialogContent className="max-w-md p-0 overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-[#004d22] to-[#008C3C] px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                    <SlidersHorizontal className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-white font-semibold text-sm">Tipos de obligación</h2>
                    <p className="text-green-200 text-xs truncate">{managingTaxTypes.name}</p>
                  </div>
                </div>
                <p className="text-green-100 text-xs mt-3 leading-relaxed">
                  Activa solo los tipos que aplican a esta empresa. Los desactivados no aparecerán en el calendario.
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-medium">
                    {visibleCount} de {ALL_TAX_TYPES.length} activos
                  </span>
                </div>
              </div>

              {/* Body */}
              <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
                {GROUPS.map(group => (
                  <div key={group.label}>
                    <div className={`flex items-center gap-1.5 mb-2`}>
                      <span className={`w-2 h-2 rounded-full ${group.dot}`} />
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${group.color}`}>
                        {group.label}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {group.types.map(type => {
                        const active = !hidden.has(type);
                        return (
                          <label
                            key={type}
                            className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all
                              ${active
                                ? 'border-gray-200 bg-white hover:border-[#008C3C]/30 hover:bg-green-50/40'
                                : 'border-dashed border-gray-200 bg-gray-50 opacity-60 hover:opacity-80'
                              }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors
                                ${active ? 'bg-[#008C3C] border-[#008C3C]' : 'bg-white border-gray-300'}`}
                              >
                                {active && (
                                  <svg className="w-2 h-2 text-white" viewBox="0 0 10 10" fill="none">
                                    <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                )}
                              </div>
                              <span className={`text-sm ${active ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                                {type}
                              </span>
                            </div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0
                              ${active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                              {active ? 'Activo' : 'Oculto'}
                            </span>
                            <input type="checkbox" checked={active} onChange={() => toggle(type)} className="sr-only" />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="flex gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50/60">
                <Button variant="outline" size="sm" className="flex-1 text-sm" onClick={() => setManagingTaxTypes(null)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="flex-1 text-sm bg-[#008C3C] hover:bg-[#006C2F] text-white"
                  disabled={savingHidden}
                  onClick={() => saveHiddenTaxTypes(managingTaxTypes, managingTaxTypes.excludedTaxTypes)}
                >
                  {savingHidden
                    ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
                  Guardar cambios
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
      {/* ── Diálogo Mensaje Contabilidad ── */}
      <Dialog open={msgOpen} onOpenChange={setMsgOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-4 h-4 text-blue-600" />
              Enviar mensaje interno
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Destinatarios */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Destinatarios
              </label>
              <div className="border border-gray-200 rounded-lg p-2 max-h-40 overflow-y-auto space-y-1">
                {[...accountingUsers, ...financieraUsers]
                  .filter((u, i, arr) => arr.findIndex(x => x.email === u.email) === i)
                  .map(u => (
                    <label key={u.email} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-blue-600"
                        checked={msgRecipients.includes(u.email)}
                        onChange={e => setMsgRecipients(prev =>
                          e.target.checked ? [...prev, u.email] : prev.filter(x => x !== u.email)
                        )}
                      />
                      <span className="text-sm text-gray-700 flex-1">{u.name}</span>
                      <span className="text-xs text-gray-400 truncate max-w-[160px]">{u.email}</span>
                    </label>
                  ))}
                {accountingUsers.length === 0 && financieraUsers.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-3">Sin usuarios registrados</p>
                )}
              </div>
              {msgRecipients.length > 0 && (
                <p className="text-xs text-blue-600 font-medium">{msgRecipients.length} destinatario{msgRecipients.length !== 1 ? 's' : ''} seleccionado{msgRecipients.length !== 1 ? 's' : ''}</p>
              )}
            </div>

            {/* Asunto */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Asunto</label>
              <input
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Asunto del mensaje..."
                value={msgSubject}
                onChange={e => setMsgSubject(e.target.value)}
              />
            </div>

            {/* Cuerpo */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Mensaje</label>
              <textarea
                rows={6}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Escribe tu mensaje aquí..."
                value={msgBody}
                onChange={e => setMsgBody(e.target.value)}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setMsgOpen(false)} disabled={sendingMsg}>
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                disabled={sendingMsg || msgRecipients.length === 0 || !msgSubject.trim() || !msgBody.trim()}
                onClick={async () => {
                  setSendingMsg(true);
                  try {
                    const allUsers = [...accountingUsers, ...financieraUsers];
                    const recipients = msgRecipients.map(email => {
                      const u = allUsers.find(x => x.email === email);
                      return { email, name: u?.name || email };
                    });
                    const fn = httpsCallable(functions, 'sendAccountingMessage');
                    await fn({ subject: msgSubject, body: msgBody, recipients, senderName: currentUserName });
                    toast.success('Mensaje enviado', { description: `${recipients.length} destinatario${recipients.length !== 1 ? 's' : ''}` });
                    setMsgOpen(false);
                  } catch (e: any) {
                    toast.error('Error al enviar', { description: e.message });
                  } finally {
                    setSendingMsg(false);
                  }
                }}
              >
                {sendingMsg ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                Enviar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <TaxImportPreviewDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        plan={importPlan}
        loading={importLoading}
        error={importError}
        applying={applyingImport}
        onApply={applyImport}
      />

    </div>
  );
};
