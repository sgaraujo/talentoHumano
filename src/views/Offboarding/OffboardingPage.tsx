import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import {
  DoorOpen, Loader2, RefreshCw, Search, Download, Send, Eye, Settings2, CheckCircle2, Clock, MailX, Star, Sparkles, BellRing,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { auth } from '@/config/firebase';
import { questionnaireService } from '@/services/questionnaireService';
import type { Questionnaire } from '@/models/types/Questionnaire';
import { esVoluntario, normalizeRetiroReason } from '@/domain/humanResources/terminationReasons';
import { answerLabels, answerText } from '@/domain/questionnaires/answerLabels';
import { projectService } from '@/services/projectService';
import {
  listOffboardingSurveys, getOffboardingSettings, saveOffboardingSettings, resendOffboardingSurvey,
  createSuggestedOffboardingQuestionnaire, DEFAULT_SETTINGS, listRetiredEmployees, sendOffboardingSurveysTo,
  sendOffboardingReminders,
  type OffboardingSurvey, type OffboardingSettings, type OffboardingStatus, type RetiredEmployee, type ManualSendOutcome,
  type ReminderOutcome,
} from '@/services/offboardingService';

// Mismo margen que MIN_HOURS_BETWEEN_EMAILS del backend: no se recuerda a quien recibió correo hace menos de 24 h.
const REMINDER_MIN_GAP_MS = 24 * 3_600_000;
const MAX_REMINDERS_PER_CALL = 100;
const canRemindNow = (s: OffboardingSurvey) =>
  s.status === 'sent' && (!s.lastSentAt || Date.now() - s.lastSentAt.getTime() >= REMINDER_MIN_GAP_MS);

const REMINDER_OUTCOME_LABEL: Record<ReminderOutcome, string> = {
  sent: 'enviados',
  responded: 'ya habían respondido',
  not_pending: 'no estaban pendientes',
  recent: 'recibieron un correo hace menos de 24 h',
  max_reached: 'ya tenían el máximo de recordatorios',
  rehired: 'fueron recontratados',
  no_email: 'sin correo personal',
  error: 'con error de envío',
  not_found: 'no encontrados',
};

type Tab = 'surveys' | 'indicators' | 'settings';
type StatusFilter = 'all' | 'responded' | 'sent' | 'not_sent';

const STATUS_META: Record<OffboardingStatus, { label: string; className: string }> = {
  responded:    { label: 'Respondida',             className: 'bg-green-100 text-green-700' },
  sent:         { label: 'Pendiente de respuesta', className: 'bg-amber-100 text-amber-700' },
  not_sent:     { label: 'No enviada',             className: 'bg-red-100 text-red-700' },
  pending_send: { label: 'Enviando…',              className: 'bg-gray-100 text-gray-600' },
};

const fmtDate = (value: Date | string | null | undefined) => {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(`${value}T12:00:00`) : value;
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
};

const statusGroup = (status: OffboardingStatus): StatusFilter =>
  status === 'responded' ? 'responded' : status === 'sent' ? 'sent' : 'not_sent';

const isRecommendation = (text: string) => /recomend/i.test(text);
const isMotive = (text: string) => /motivo/i.test(text);

/** Promedio de las preguntas de calificación (sin la de recomendación). */
function satisfaction(survey: OffboardingSurvey): number | null {
  const values = (survey.questions ?? [])
    .filter(question => question.type === 'rating' && !isRecommendation(question.text))
    .map(question => Number(survey.answers?.[question.id]))
    .filter(value => value >= 1 && value <= 5);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

const normalizeName = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Unifica los datos de Expedientes para que las gráficas no partan un mismo
 * grupo en varios: la cuenta analítica pasa a su nombre oficial (resolviendo
 * alias como "ZTE - MPW") y el motivo de retiro al motivo del catálogo.
 */
function harmonizeSurveys(surveys: OffboardingSurvey[], projects: Array<{ name: string; aliases?: string[] }>): OffboardingSurvey[] {
  const canonical = new Map<string, string>();
  projects.forEach(project => [project.name, ...(project.aliases ?? [])]
    .filter(Boolean)
    .forEach(name => { if (!canonical.has(normalizeName(name))) canonical.set(normalizeName(name), project.name); }));
  return surveys.map(survey => ({
    ...survey,
    projectName: survey.projectName ? canonical.get(normalizeName(survey.projectName)) ?? survey.projectName.trim() : null,
    terminationReason: survey.terminationReason
      ? normalizeRetiroReason(survey.terminationReason).reason ?? survey.terminationReason
      : null,
  }));
}

const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const fmtScore = (value: number | null) => value === null ? '—' : value.toFixed(1);

export function OffboardingPage() {
  const [tab, setTab] = useState<Tab>('surveys');
  const [loading, setLoading] = useState(true);
  const [surveys, setSurveys] = useState<OffboardingSurvey[]>([]);
  const [settings, setSettings] = useState<OffboardingSettings>(DEFAULT_SETTINGS);
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [detail, setDetail] = useState<OffboardingSurvey | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [reminding, setReminding] = useState(false);
  const surveyIds = useMemo(() => new Set(surveys.map(s => s.id)), [surveys]);

  const load = async () => {
    setLoading(true);
    try {
      const [items, config, qs, projectList] = await Promise.all([
        listOffboardingSurveys(), getOffboardingSettings(), questionnaireService.getAll(),
        projectService.getAll().catch(() => []),
      ]);
      setSurveys(harmonizeSurveys(items, projectList));
      setSettings(config);
      setQuestionnaires(qs);
      if (!config.enabled || !config.questionnaireId) setTab(current => (items.length ? current : 'settings'));
    } catch (error: any) {
      toast.error('No se pudo cargar Offboarding', { description: error?.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const projects = useMemo(() => [...new Set(surveys.map(s => s.projectName).filter(Boolean))].sort() as string[], [surveys]);
  const years = useMemo(() => [...new Set(surveys.map(s => s.endDate?.slice(0, 4)).filter(Boolean))].sort().reverse() as string[], [surveys]);

  const filtered = useMemo(() => surveys.filter(s => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [s.fullName, s.documentNumber, s.projectName, s.position, s.supervisor]
      .some(value => value?.toLowerCase().includes(term));
    return matchesSearch
      && (statusFilter === 'all' || statusGroup(s.status) === statusFilter)
      && (projectFilter === 'all' || s.projectName === projectFilter)
      && (yearFilter === 'all' || s.endDate?.startsWith(yearFilter));
  }), [surveys, search, statusFilter, projectFilter, yearFilter]);

  const counts = useMemo(() => ({
    total: filtered.length,
    responded: filtered.filter(s => s.status === 'responded').length,
    sent: filtered.filter(s => s.status === 'sent').length,
    notSent: filtered.filter(s => statusGroup(s.status) === 'not_sent').length,
    satisfaction: average(filtered.map(satisfaction).filter((v): v is number => v !== null)),
  }), [filtered]);

  // Pendientes de respuesta con los filtros actuales (proyecto, año, búsqueda).
  const pendingFiltered = useMemo(() => filtered.filter(s => s.status === 'sent'), [filtered]);
  const remindable = useMemo(() => pendingFiltered.filter(canRemindNow), [pendingFiltered]);

  const handleRemind = async () => {
    const batch = remindable.slice(0, MAX_REMINDERS_PER_CALL);
    setReminding(true);
    try {
      const results = await sendOffboardingReminders(batch.map(s => s.id));
      const tally = results.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.outcome]: (acc[r.outcome] ?? 0) + 1 }), {});
      const sent = tally.sent ?? 0;
      const others = Object.entries(tally).filter(([k]) => k !== 'sent')
        .map(([k, n]) => `${n} ${REMINDER_OUTCOME_LABEL[k as ReminderOutcome]}`).join(' · ');
      (sent ? toast.success : toast.warning)(`${sent} recordatorio${sent !== 1 ? 's' : ''} enviado${sent !== 1 ? 's' : ''}`,
        others ? { description: `No enviados: ${others}` } : undefined);
      setRemindOpen(false);
      await load();
    } catch (error: any) {
      toast.error('No se pudieron enviar los recordatorios', { description: error?.message });
    } finally {
      setReminding(false);
    }
  };

  const handleResend = async (survey: OffboardingSurvey) => {
    setResending(survey.id);
    try {
      const to = await resendOffboardingSurvey(survey.id);
      toast.success('Encuesta reenviada', { description: `Se envió el mismo enlace a ${to}.` });
      await load();
    } catch (error: any) {
      toast.error('No se pudo reenviar', { description: error?.message });
    } finally {
      setResending(null);
    }
  };

  const handleExport = () => {
    // Columnas de preguntas: unión de todos los textos, en orden de aparición.
    const questionTexts: string[] = [];
    filtered.forEach(s => (s.questions ?? []).slice().sort((a, b) => a.order - b.order)
      .forEach(question => { if (!questionTexts.includes(question.text)) questionTexts.push(question.text); }));
    const rows = filtered.map(s => {
      const byText = Object.fromEntries((s.questions ?? []).map(question => [question.text, answerText(question, s.answers?.[question.id])]));
      return {
        'Excolaborador': s.fullName,
        'Documento': s.documentNumber,
        'Correo personal': s.personalEmail ?? '',
        'Empresa': s.companyName ?? '',
        'Proyecto / cliente': s.projectName ?? '',
        'Cargo': s.position ?? '',
        'Líder': s.supervisor ?? '',
        'Fecha de retiro': s.endDate ?? '',
        'Motivo de retiro (TH)': s.terminationReason ?? '',
        'Fecha de envío': s.sentAt ? s.sentAt.toISOString().slice(0, 10) : '',
        'Recordatorios': s.reminderCount,
        'Último recordatorio': s.lastReminderAt ? s.lastReminderAt.toISOString().slice(0, 10) : '',
        'Fecha de respuesta': s.respondedAt ? s.respondedAt.toISOString().slice(0, 10) : '',
        'Estado': STATUS_META[s.status].label,
        'Satisfacción promedio (1-5)': fmtScore(satisfaction(s)),
        ...Object.fromEntries(questionTexts.map(text => [text, byText[text] ?? ''])),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Offboarding');
    XLSX.writeFile(wb, `offboarding_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const configured = settings.enabled && !!settings.questionnaireId;

  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-full space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#008C3C]/10 flex items-center justify-center"><DoorOpen className="w-6 h-6 text-[#008C3C]" /></div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#4A4A4A]">Offboarding</h1>
            <p className="text-sm text-gray-500 mt-0.5">Encuesta de salida y experiencia del colaborador</p>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${configured ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
            {configured ? 'Envío automático activo' : 'Envío automático inactivo'}
          </span>
          <Button variant="outline" onClick={() => setRemindOpen(true)} disabled={loading || !pendingFiltered.length}
            className="border-amber-300 text-amber-700 hover:bg-amber-50">
            <BellRing className="w-4 h-4 mr-2" />Recordar a pendientes{pendingFiltered.length ? ` (${pendingFiltered.length})` : ''}
          </Button>
          <Button onClick={() => setSendOpen(true)} className="bg-[#008C3C] hover:bg-[#006C2F] text-white"><Send className="w-4 h-4 mr-2" />Enviar a excolaboradores</Button>
          <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Actualizar</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi icon={DoorOpen} label="Encuestas generadas" value={counts.total} tone="text-gray-700 bg-white" />
        <Kpi icon={CheckCircle2} label="Respondidas" value={counts.responded} sub={counts.total ? `${Math.round(counts.responded / counts.total * 100)}% de respuesta` : undefined} tone="text-green-700 bg-green-50" />
        <Kpi icon={Clock} label="Pendientes de respuesta" value={counts.sent} tone="text-amber-700 bg-amber-50" />
        <Kpi icon={MailX} label="No enviadas" value={counts.notSent} sub="Sin correo personal o error" tone="text-red-700 bg-red-50" />
        <Kpi icon={Star} label="Satisfacción promedio" value={fmtScore(counts.satisfaction)} sub="Escala de 1 a 5" tone="text-blue-700 bg-blue-50" />
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="flex gap-1 p-2 border-b overflow-x-auto">
          {([['surveys', 'Encuestas'], ['indicators', 'Indicadores'], ['settings', 'Configuración']] as Array<[Tab, string]>).map(([value, label]) => (
            <button key={value} onClick={() => setTab(value)} className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${tab === value ? 'bg-[#008C3C] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>{label}</button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" /></div>
        ) : tab === 'settings' ? (
          <SettingsPanel settings={settings} questionnaires={questionnaires} onSaved={load} />
        ) : (
          <>
            <div className="p-4 border-b flex flex-col lg:flex-row gap-3 lg:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input id="offboarding-search" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar excolaborador, cédula, proyecto, cargo o líder…" />
              </div>
              <div className="flex flex-wrap gap-2">
                <select id="offboarding-status" value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} className="px-3 py-2 rounded-lg text-sm border border-gray-200 bg-white text-gray-600">
                  <option value="all">Todos los estados</option>
                  <option value="responded">Respondidas</option>
                  <option value="sent">Pendientes de respuesta</option>
                  <option value="not_sent">No enviadas</option>
                </select>
                <select id="offboarding-project" value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="px-3 py-2 rounded-lg text-sm border border-gray-200 bg-white text-gray-600 max-w-[220px]">
                  <option value="all">Todos los proyectos</option>
                  {projects.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select id="offboarding-year" value={yearFilter} onChange={e => setYearFilter(e.target.value)} className="px-3 py-2 rounded-lg text-sm border border-gray-200 bg-white text-gray-600">
                  <option value="all">Todos los años</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                {tab === 'surveys' && <Button variant="outline" onClick={handleExport} disabled={!filtered.length}><Download className="w-4 h-4 mr-2" />Exportar Excel</Button>}
              </div>
            </div>
            {tab === 'surveys'
              ? <SurveysTable rows={filtered} onOpen={setDetail} onResend={handleResend} resending={resending} configured={configured} />
              : <IndicatorsPanel rows={filtered} />}
          </>
        )}
      </div>

      <SurveyDetailDialog survey={detail} onClose={() => setDetail(null)} />
      <Dialog open={remindOpen} onOpenChange={open => { if (!reminding) setRemindOpen(open); }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BellRing className="w-4 h-4 text-amber-600" />Recordar a pendientes</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-gray-600">
            <p>
              Se enviará un recordatorio con el <b>mismo enlace</b> de la encuesta a{' '}
              <b>{Math.min(remindable.length, MAX_REMINDERS_PER_CALL)}</b> excolaborador{remindable.length !== 1 ? 'es' : ''} que aún no ha{remindable.length !== 1 ? 'n' : ''} respondido
              {(projectFilter !== 'all' || yearFilter !== 'all' || search.trim()) && <> (según los filtros aplicados)</>}.
            </p>
            {pendingFiltered.length > remindable.length && (
              <p className="text-xs text-gray-500">
                {pendingFiltered.length - remindable.length} se omiten porque recibieron un correo hace menos de 24 horas.
              </p>
            )}
            {remindable.length > MAX_REMINDERS_PER_CALL && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Se envían máximo {MAX_REMINDERS_PER_CALL} por vez. Vuelve a pulsar el botón para enviar el resto.
              </p>
            )}
            <div className="rounded-lg bg-gray-50 border px-3 py-2 text-xs">
              <p className="font-semibold text-gray-700 mb-0.5">Asunto</p>
              <p>Recordatorio: tu encuesta de salida de INTEEGRADOS</p>
            </div>
            <p className="text-xs text-gray-500">Se usa el correo personal actual del expediente. No se envía a quien ya respondió ni a quien fue recontratado.</p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setRemindOpen(false)} disabled={reminding}>Cancelar</Button>
            <Button className="flex-1 bg-[#008C3C] hover:bg-[#006C2F] text-white" onClick={handleRemind} disabled={reminding || !remindable.length}>
              {reminding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BellRing className="w-4 h-4 mr-2" />}Enviar recordatorio
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <SendToRetiredDialog open={sendOpen} onClose={() => setSendOpen(false)} existingSurveyIds={surveyIds} settings={settings} onDone={load} />
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone }: { icon: React.ElementType; label: string; value: number | string; sub?: string; tone: string }) {
  return (
    <div className={`rounded-xl border border-gray-100 p-4 ${tone}`}>
      <Icon className="w-5 h-5 mb-2" />
      <p className="text-2xl font-bold tabular-nums">{typeof value === 'number' ? value.toLocaleString('es-CO') : value}</p>
      <p className="text-xs font-medium">{label}</p>
      {sub && <p className="text-[11px] opacity-75 mt-0.5">{sub}</p>}
    </div>
  );
}

function SurveysTable({ rows, onOpen, onResend, resending, configured }: {
  rows: OffboardingSurvey[]; onOpen: (s: OffboardingSurvey) => void; onResend: (s: OffboardingSurvey) => void; resending: string | null; configured: boolean;
}) {
  if (!rows.length) {
    return (
      <div className="text-center py-16 text-gray-400 px-4">
        <DoorOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No hay encuestas de salida con estos filtros.</p>
        <p className="text-xs mt-1">
          Usa <b>Enviar a excolaboradores</b> para quienes ya se retiraron
          {!configured && <>, y activa el envío automático en <b>Configuración</b> para los próximos retiros</>}.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[900px]">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            {['Excolaborador', 'Proyecto / cliente', 'Cargo', 'Retiro', 'Envío', 'Respuesta', 'Estado', ''].map(h => <th key={h} className="text-left font-semibold px-4 py-3">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map(s => (
            <tr key={s.id} className="hover:bg-gray-50">
              <td className="px-4 py-3"><p className="font-semibold text-gray-800">{s.fullName}</p><p className="text-xs text-gray-400">CC {s.documentNumber}</p></td>
              <td className="px-4 py-3 text-gray-600">{s.projectName ?? '—'}<p className="text-xs text-gray-400">{s.companyName ?? ''}</p></td>
              <td className="px-4 py-3 text-gray-600">{s.position ?? '—'}</td>
              <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(s.endDate)}</td>
              <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                {fmtDate(s.sentAt)}
                {s.reminderCount > 0 && (
                  <p className="text-[11px] text-amber-600 flex items-center gap-1">
                    <BellRing className="w-3 h-3" />{s.reminderCount} recordatorio{s.reminderCount !== 1 ? 's' : ''} · {fmtDate(s.lastReminderAt)}
                  </p>
                )}
                {s.sendCount - s.reminderCount > 1 && <p className="text-[11px] text-gray-400">{s.sendCount - s.reminderCount} envíos</p>}
              </td>
              <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(s.respondedAt)}</td>
              <td className="px-4 py-3">
                <span className={`text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap ${STATUS_META[s.status].className}`}>{STATUS_META[s.status].label}</span>
                {s.status === 'not_sent' && s.notSentReason && <p className="text-[11px] text-red-500 mt-1">{s.notSentReason}</p>}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1.5 justify-end">
                  {s.status === 'responded'
                    ? <Button size="sm" variant="outline" onClick={() => onOpen(s)}><Eye className="w-3.5 h-3.5 mr-1" />Ver respuestas</Button>
                    : <Button size="sm" variant="outline" disabled={resending === s.id} onClick={() => onResend(s)}>
                        {resending === s.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                        {s.status === 'sent' ? 'Reenviar' : 'Enviar'}
                      </Button>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SurveyDetailDialog({ survey, onClose }: { survey: OffboardingSurvey | null; onClose: () => void }) {
  const questions = (survey?.questions ?? []).slice().sort((a, b) => a.order - b.order);
  return (
    <Dialog open={!!survey} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {survey && (
          <>
            <DialogHeader><DialogTitle>{survey.fullName}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm bg-gray-50 rounded-xl p-4">
              {[
                ['Proyecto / cliente', survey.projectName], ['Cargo', survey.position], ['Líder', survey.supervisor],
                ['Fecha de retiro', fmtDate(survey.endDate)], ['Enviada', fmtDate(survey.sentAt)], ['Respondida', fmtDate(survey.respondedAt)],
                ['Motivo registrado por TH', survey.terminationReason], ['Satisfacción promedio', `${fmtScore(satisfaction(survey))} / 5`],
              ].map(([label, value]) => (
                <div key={label as string}><p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p><p className="font-medium text-gray-800">{value || '—'}</p></div>
              ))}
            </div>
            <div className="space-y-3">
              {questions.map(question => {
                const value = survey.answers?.[question.id];
                const rating = question.type === 'rating' ? Number(value) : NaN;
                return (
                  <div key={question.id} className="border rounded-xl p-3">
                    <p className="text-sm font-semibold text-gray-700">{question.text}</p>
                    {question.type === 'rating' && rating >= 1 ? (
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex gap-1">{[1, 2, 3, 4, 5].map(n => <span key={n} className={`w-6 h-2 rounded-full ${n <= rating ? 'bg-[#008C3C]' : 'bg-gray-200'}`} />)}</div>
                        <span className="text-sm font-bold text-gray-800 tabular-nums">{rating}/5</span>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{answerText(question, value)}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Indicadores ──────────────────────────────────────────────────────────────

function BarList({ title, hint, rows, format = (v: number) => v.toLocaleString('es-CO'), max }: {
  title: string; hint?: string; rows: Array<[string, number, string?]>; format?: (v: number) => string; max?: number;
}) {
  const top = max ?? Math.max(1, ...rows.map(r => r[1]));
  return (
    <div className="rounded-xl border p-4">
      <h3 className="font-semibold text-gray-800">{title}</h3>
      {hint && <p className="text-xs text-gray-400 mb-3">{hint}</p>}
      {rows.length === 0 ? <p className="text-sm text-gray-400 py-4">Sin datos suficientes.</p> : (
        <div className="space-y-2.5 mt-2">
          {rows.map(([label, value, sub]) => (
            <div key={label}>
              <div className="flex justify-between gap-3 text-sm"><span className="text-gray-700 truncate">{label}</span><span className="font-semibold text-gray-800 tabular-nums whitespace-nowrap">{format(value)}{sub && <span className="text-xs font-normal text-gray-400"> · {sub}</span>}</span></div>
              <div className="h-2 rounded-full bg-gray-100 mt-1"><div className="h-2 rounded-full bg-[#008C3C]" style={{ width: `${Math.max(3, value / top * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function groupBy<T>(items: T[], key: (item: T) => string | null | undefined) {
  const map = new Map<string, T[]>();
  items.forEach(item => { const k = key(item) || 'Sin dato'; map.set(k, [...(map.get(k) ?? []), item]); });
  return map;
}

function IndicatorsPanel({ rows }: { rows: OffboardingSurvey[] }) {
  const responded = rows.filter(s => s.status === 'responded');

  const data = useMemo(() => {
    const count = (map: Map<string, unknown[]>) => [...map.entries()].map(([k, v]) => [k, v.length] as [string, number]).sort((a, b) => b[1] - a[1]);

    // Motivo según el excolaborador (pregunta de motivo) y según lo registrado por TH.
    // Se cuenta cada opción elegida por separado (la pregunta puede ser de selección múltiple)
    // y con su etiqueta, no con el valor interno guardado en la respuesta.
    const motiveAnswers = responded.flatMap(s => {
      const questions = s.questions ?? [];
      const question = questions.find(item => isMotive(item.text) && (item.type === 'select' || item.type === 'multiple'))
        ?? questions.find(item => isMotive(item.text));
      return question ? answerLabels(question, s.answers?.[question.id]) : [];
    });
    const selfMotives = count(groupBy(motiveAnswers, v => v)).slice(0, 8);
    const thMotives = count(groupBy(rows, s => s.terminationReason)).slice(0, 8);

    // Promedio por dimensión (texto de la pregunta de calificación).
    const dims = new Map<string, number[]>();
    responded.forEach(s => (s.questions ?? []).filter(item => item.type === 'rating').forEach(item => {
      const value = Number(s.answers?.[item.id]);
      const key = item.text.trim();
      if (value >= 1 && value <= 5) dims.set(key, [...(dims.get(key) ?? []), value]);
    }));
    const dimensions = [...dims.entries()].map(([text, values]) => [text.replace(/^Califica (el |la |las |los |tu )?/i, ''), average(values)!] as [string, number])
      .sort((a, b) => a[1] - b[1]);

    const byGroup = (key: (s: OffboardingSurvey) => string | null) => [...groupBy(rows, key).entries()].map(([name, items]) => {
      const voluntary = items.filter(s => esVoluntario(s.terminationReason ?? '')).length;
      const score = average(items.map(satisfaction).filter((v): v is number => v !== null));
      return { name, total: items.length, voluntary, score };
    }).sort((a, b) => b.voluntary - a.voluntary || b.total - a.total);

    const byMonth = [...groupBy(rows, s => s.endDate?.slice(0, 7)).entries()]
      .map(([month, items]) => ({
        month, total: items.length, responded: items.filter(s => s.status === 'responded').length,
        score: average(items.map(satisfaction).filter((v): v is number => v !== null)),
      }))
      .sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12);

    return { selfMotives, thMotives, dimensions, byProject: byGroup(s => s.projectName), byLeader: byGroup(s => s.supervisor), byMonth };
  }, [rows, responded]);

  const monthLabel = (m: string) => m === 'Sin dato' ? m : new Date(`${m}-15`).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });

  return (
    <div className="p-5 space-y-4">
      <p className="text-xs text-gray-400">Calculado sobre las encuestas de los filtros actuales ({rows.length} en total, {responded.length} respondidas). Las calificaciones van de 1 a 5.</p>
      <div className="grid lg:grid-cols-2 gap-4">
        <BarList title="Principales causas de retiro · según el excolaborador" hint="Respuesta a la pregunta de motivo principal." rows={data.selfMotives} />
        <BarList title="Causas de retiro · registradas por TH" hint="Motivo de retiro del expediente." rows={data.thMotives} />
        <BarList title="Satisfacción por dimensión" hint="Promedio de 1 a 5; las dimensiones peor calificadas aparecen primero." rows={data.dimensions} format={v => v.toFixed(1)} max={5} />
        <GroupTable title="Por proyecto / cliente" rows={data.byProject} />
        <GroupTable title="Por líder" rows={data.byLeader} />
        <div className="rounded-xl border p-4">
          <h3 className="font-semibold text-gray-800">Resultados por periodo</h3>
          <p className="text-xs text-gray-400 mb-3">Según el mes de retiro · últimos 12 meses con datos.</p>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-xs uppercase text-gray-400"><tr><th className="text-left py-1.5">Mes</th><th className="text-right">Retiros</th><th className="text-right">Respondidas</th><th className="text-right">Satisfacción</th></tr></thead>
            <tbody className="divide-y">{data.byMonth.map(m => (
              <tr key={m.month}><td className="py-2 capitalize text-gray-700">{monthLabel(m.month)}</td><td className="text-right tabular-nums">{m.total}</td><td className="text-right tabular-nums">{m.responded}</td><td className="text-right tabular-nums font-semibold">{fmtScore(m.score)}</td></tr>
            ))}</tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}

function GroupTable({ title, rows }: { title: string; rows: Array<{ name: string; total: number; voluntary: number; score: number | null }> }) {
  return (
    <div className="rounded-xl border p-4">
      <h3 className="font-semibold text-gray-800">{title}</h3>
      <p className="text-xs text-gray-400 mb-3">Retiros con encuesta, cuántos fueron voluntarios (renuncia o mutuo acuerdo) y satisfacción promedio.</p>
      {rows.length === 0 ? <p className="text-sm text-gray-400 py-4">Sin datos suficientes.</p> : (
        <div className="overflow-x-auto max-h-80 overflow-y-auto"><table className="w-full text-sm">
          <thead className="text-xs uppercase text-gray-400 sticky top-0 bg-white"><tr><th className="text-left py-1.5">Nombre</th><th className="text-right">Retiros</th><th className="text-right">Voluntarios</th><th className="text-right">Satisfacción</th></tr></thead>
          <tbody className="divide-y">{rows.map(r => (
            <tr key={r.name}><td className="py-2 text-gray-700">{r.name}</td><td className="text-right tabular-nums">{r.total}</td><td className="text-right tabular-nums">{r.voluntary}</td><td className="text-right tabular-nums font-semibold">{fmtScore(r.score)}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

// ── Configuración ────────────────────────────────────────────────────────────

function SettingsPanel({ settings, questionnaires, onSaved }: { settings: OffboardingSettings; questionnaires: Questionnaire[]; onSaved: () => void }) {
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const actor = auth.currentUser?.email || 'usuario-desconocido';

  useEffect(() => { setForm(settings); }, [settings]);

  const save = async (next = form) => {
    if (next.enabled && !next.questionnaireId) { toast.error('Elige la encuesta que se enviará antes de activar el envío automático.'); return; }
    setSaving(true);
    try {
      await saveOffboardingSettings(next, actor);
      toast.success(next.enabled ? 'Envío automático activado' : 'Configuración guardada');
      onSaved();
    } catch (error: any) {
      toast.error('No se pudo guardar', { description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  const createSuggested = async () => {
    setCreating(true);
    try {
      const id = await createSuggestedOffboardingQuestionnaire(actor);
      const next = { ...form, questionnaireId: id };
      setForm(next);
      await saveOffboardingSettings(next, actor);
      toast.success('Encuesta sugerida creada', { description: 'Puedes editar sus preguntas en el módulo Cuestionarios.' });
      onSaved();
    } catch (error: any) {
      toast.error('No se pudo crear la encuesta', { description: error?.message });
    } finally {
      setCreating(false);
    }
  };

  const active = questionnaires.filter(item => item.active);

  return (
    <div className="p-5 grid lg:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-5 max-w-2xl">
        <div className="space-y-2">
          <label htmlFor="offboarding-questionnaire" className="text-sm font-semibold text-gray-700">Encuesta que se envía</label>
          <select id="offboarding-questionnaire" value={form.questionnaireId} onChange={e => setForm({ ...form, questionnaireId: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm border border-gray-200 bg-white">
            <option value="">Selecciona un cuestionario…</option>
            {active.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
          <p className="text-xs text-gray-500">Las preguntas se administran en <b>Cuestionarios</b>. Si aún no tienes una, crea la sugerida con las preguntas definidas por Talento Humano.</p>
          <Button variant="outline" size="sm" onClick={createSuggested} disabled={creating}>
            {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}Crear encuesta sugerida
          </Button>
        </div>

        <div className="space-y-2">
          <label htmlFor="offboarding-max-age" className="text-sm font-semibold text-gray-700">Enviar solo si el retiro tiene máximo</label>
          <div className="flex items-center gap-2">
            <Input id="offboarding-max-age" type="number" min={1} max={365} className="w-24" value={form.maxRetirementAgeDays}
              onChange={e => setForm({ ...form, maxRetirementAgeDays: Math.max(1, Number(e.target.value) || 30) })} />
            <span className="text-sm text-gray-600">días de antigüedad</span>
          </div>
          <p className="text-xs text-gray-500">Protege contra envíos masivos: si se carga un Excel con retiros antiguos, a esas personas no se les envía la encuesta.</p>
        </div>

        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
            <input type="checkbox" className="accent-[#008C3C] w-4 h-4" checked={form.remindersEnabled}
              onChange={e => setForm({ ...form, remindersEnabled: e.target.checked })} />
            <BellRing className="w-4 h-4 text-amber-600" />Recordatorio automático a quien no ha respondido
          </label>
          <div className={`flex flex-wrap items-center gap-2 text-sm text-gray-600 ${form.remindersEnabled ? '' : 'opacity-50'}`}>
            <span>Recordar cada</span>
            <Input id="offboarding-reminder-interval" type="number" min={1} max={60} className="w-20" disabled={!form.remindersEnabled}
              value={form.reminderIntervalDays}
              onChange={e => setForm({ ...form, reminderIntervalDays: Math.min(60, Math.max(1, Number(e.target.value) || 5)) })} />
            <span>días desde el último correo, máximo</span>
            <Input id="offboarding-max-reminders" type="number" min={1} max={5} className="w-16" disabled={!form.remindersEnabled}
              value={form.maxReminders}
              onChange={e => setForm({ ...form, maxReminders: Math.min(5, Math.max(1, Number(e.target.value) || 2)) })} />
            <span>veces.</span>
          </div>
          <p className="text-xs text-gray-500">
            Se revisa todos los días a las 10:00 a. m. Usa el mismo enlace de la encuesta, no escribe a quien ya respondió ni a quien
            fue recontratado. Pulsa <b>Guardar</b> para aplicar el cambio.
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-semibold text-gray-700">Motivos de retiro excluidos</p>
          <p className="text-sm text-gray-600">{form.excludedReasons.join(', ')}</p>
          <p className="text-xs text-gray-500">Para estos motivos no se genera encuesta.</p>
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t">
          <Button onClick={() => save()} disabled={saving} variant="outline"><Settings2 className="w-4 h-4 mr-2" />Guardar</Button>
          {form.enabled
            ? <Button onClick={() => save({ ...form, enabled: false })} disabled={saving} variant="outline" className="border-red-200 text-red-600 hover:bg-red-50">Desactivar envío automático</Button>
            : <Button onClick={() => save({ ...form, enabled: true })} disabled={saving || !form.questionnaireId} className="bg-[#008C3C] hover:bg-[#006C2F] text-white">Activar envío automático</Button>}
        </div>
      </div>

      <aside className="rounded-xl bg-gray-50 border p-4 text-sm text-gray-600 space-y-2 h-fit">
        <p className="font-semibold text-gray-800">Cómo funciona</p>
        <ol className="list-decimal pl-4 space-y-1.5">
          <li>TH registra el retiro del último contrato activo de la persona en <b>Expedientes y control</b> (pasa a excolaborador).</li>
          <li>La plataforma genera un enlace único y lo envía a su <b>correo personal</b>.</li>
          <li>La persona responde sin necesidad de acceso a la plataforma.</li>
          <li>Las respuestas quedan aquí y el estado pasa a <b>Respondida</b>.</li>
        </ol>
        <p className="text-xs text-gray-500">Cada retiro genera una sola encuesta. Reenviar usa el mismo enlace, sin crear duplicados.</p>
        <p className="text-xs text-gray-500">Si no responde, puedes enviar un recordatorio con <b>Recordar a pendientes</b> o dejar activo el recordatorio automático.</p>
      </aside>
    </div>
  );
}

// ── Envío manual a excolaboradores ───────────────────────────────────────────

const OUTCOME_LABEL: Record<ManualSendOutcome, string> = {
  created: 'enviada',
  exists: 'ya tenía encuesta',
  excluded: 'motivo de retiro excluido',
  old: 'retiro antiguo',
  no_retirement: 'sin retiro registrado',
  still_active: 'aún tiene un contrato activo',
  not_found: 'no encontrado',
};

type ReasonFilter = 'resignation' | 'voluntary' | 'all';

const matchesReason = (reason: string | null, filter: ReasonFilter) =>
  filter === 'all' ? true
  : filter === 'voluntary' ? esVoluntario(reason ?? '')
  : (reason ?? '').toLowerCase().includes('renuncia');

function SendToRetiredDialog({ open, onClose, existingSurveyIds, settings, onDone }: {
  open: boolean; onClose: () => void; existingSurveyIds: Set<string>; settings: OffboardingSettings; onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [people, setPeople] = useState<RetiredEmployee[]>([]);
  const [search, setSearch] = useState('');
  const [onlyWithout, setOnlyWithout] = useState(true);
  // Por defecto: renuncias desde agosto de 2026 (primer grupo que TH quiere encuestar).
  const [since, setSince] = useState('2026-08-01');
  const [reasonFilter, setReasonFilter] = useState<ReasonFilter>('resignation');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setLoading(true);
    listRetiredEmployees()
      .then(setPeople)
      .catch((error: any) => toast.error('No se pudieron cargar los excolaboradores', { description: error?.message }))
      .finally(() => setLoading(false));
  }, [open]);

  const blockReason = (person: RetiredEmployee) =>
    existingSurveyIds.has(person.surveyId) ? 'Ya tiene encuesta'
    : person.terminationReason && settings.excludedReasons.includes(person.terminationReason) ? `Motivo excluido: ${person.terminationReason}`
    : !person.personalEmail ? 'Sin correo personal'
    : null;

  const visible = people.filter(person => {
    const term = search.trim().toLowerCase();
    const matches = !term || [person.fullName, person.documentNumber, person.projectName, person.position].some(v => v?.toLowerCase().includes(term));
    return matches
      && (!onlyWithout || !existingSurveyIds.has(person.surveyId))
      && (!since || (!!person.endDate && person.endDate >= since))
      && matchesReason(person.terminationReason, reasonFilter);
  });
  const selectable = visible.filter(person => !blockReason(person));
  // Solo se envía a lo seleccionado que sigue visible con los filtros actuales.
  const toSend = selectable.filter(person => selected.has(person.employeeId));

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const send = async () => {
    if (!toSend.length) return;
    setSending(true);
    try {
      const results = await sendOffboardingSurveysTo(toSend.map(person => person.employeeId));
      const sent = results.filter(r => r.outcome === 'created' && r.sent).length;
      const problems = results.filter(r => !(r.outcome === 'created' && r.sent));
      if (sent) toast.success(`Encuesta enviada a ${sent} excolaborador${sent === 1 ? '' : 'es'}`);
      if (problems.length) {
        const byName = new Map(people.map(p => [p.employeeId, p.fullName]));
        toast.warning(`${problems.length} no se enviaron`, {
          description: problems.slice(0, 5).map(r => `${byName.get(r.employeeId) ?? r.employeeId}: ${r.outcome === 'created' ? 'error al enviar el correo' : OUTCOME_LABEL[r.outcome]}`).join(' · '),
        });
      }
      onDone();
      onClose();
    } catch (error: any) {
      toast.error('No se pudo enviar', { description: error?.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={value => { if (!value && !sending) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col">
        <DialogHeader><DialogTitle>Enviar encuesta de salida a excolaboradores</DialogTitle></DialogHeader>
        <p className="text-sm text-gray-500 -mt-1">Personas de <b>Expedientes y control</b> sin contratos activos. Cada una recibe su enlace único en el correo personal y aparecerá en la lista de encuestas.</p>
        {!settings.questionnaireId && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2">Primero elige la encuesta de salida en la pestaña Configuración.</div>
        )}
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input id="offboarding-send-search" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, cédula, proyecto o cargo…" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 whitespace-nowrap">
            <input id="offboarding-send-only-without" type="checkbox" checked={onlyWithout} onChange={e => setOnlyWithout(e.target.checked)} />
            Solo sin encuesta
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <label htmlFor="offboarding-send-since" className="whitespace-nowrap">Retirados desde</label>
          <Input id="offboarding-send-since" type="date" className="w-auto" value={since} onChange={e => setSince(e.target.value)} />
          <select id="offboarding-send-reason" value={reasonFilter} onChange={e => setReasonFilter(e.target.value as ReasonFilter)}
            className="px-3 py-2 rounded-lg text-sm border border-gray-200 bg-white text-gray-600">
            <option value="resignation">Solo renuncias</option>
            <option value="voluntary">Voluntarios (renuncia o mutuo acuerdo)</option>
            <option value="all">Todos los motivos</option>
          </select>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{visible.length} excolaboradores · {toSend.length} seleccionados</span>
          <div className="flex gap-3">
            <button type="button" className="font-semibold text-[#008C3C] disabled:opacity-40" disabled={!selectable.length}
              onClick={() => setSelected(new Set(selectable.slice(0, 100).map(p => p.employeeId)))}>Seleccionar visibles{selectable.length > 100 ? ' (máx. 100)' : ''}</button>
            <button type="button" className="font-semibold text-gray-500 disabled:opacity-40" disabled={!selected.size} onClick={() => setSelected(new Set())}>Limpiar</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto border rounded-xl divide-y min-h-[200px]">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#008C3C]" /></div>
          ) : visible.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">No hay excolaboradores con estos filtros.</p>
          ) : visible.map(person => {
            const reason = blockReason(person);
            return (
              <label key={person.employeeId} className={`flex items-start gap-3 px-3 py-2.5 ${reason ? 'opacity-60' : 'cursor-pointer hover:bg-gray-50'}`}>
                <input type="checkbox" className="mt-1" disabled={!!reason} checked={selected.has(person.employeeId)} onChange={() => toggle(person.employeeId)} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-sm text-gray-800">{person.fullName}</span>
                    <span className="text-xs text-gray-400">CC {person.documentNumber}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{[person.projectName, person.position, `Retiro: ${fmtDate(person.endDate)}`].filter(Boolean).join(' · ')}</p>
                  <p className="text-xs text-gray-400 truncate">{person.personalEmail ?? 'Sin correo personal'}</p>
                </div>
                {reason && <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5 whitespace-nowrap">{reason}</span>}
              </label>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancelar</Button>
          <Button onClick={send} disabled={!toSend.length || sending || !settings.questionnaireId} className="bg-[#008C3C] hover:bg-[#006C2F] text-white">
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar encuesta{toSend.length ? ` (${toSend.length})` : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
