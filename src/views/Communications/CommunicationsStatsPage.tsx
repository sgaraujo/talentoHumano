import { Fragment, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  RefreshCw, Loader2, AlertTriangle, Search, ChevronDown, ChevronUp,
  Send, CheckCircle2, XCircle, Eye, MousePointerClick, ThumbsUp, Download, Filter, Info,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie,
} from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCommunicationsStats, rate, type CommsRecipientRow } from '@/hooks/useCommunicationsStats';

// ── Helpers de presentación ──────────────────────────────────────────────────

function fmtDate(d: Date | null) {
  if (!d) return '—';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(d: Date | null) {
  if (!d) return '—';
  return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function pct(n: number) { return `${n}%`; }

function RateBadge({ value }: { value: number }) {
  const cls = value >= 60 ? 'bg-green-100 text-green-700' : value >= 25 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{pct(value)}</span>;
}

interface KpiExplanation { title: string; formula?: string; description: string; source: string }

const KPI_EXPLANATIONS: Record<string, KpiExplanation> = {
  enviados: {
    title: 'Enviados',
    description: 'Total de destinatarios incluidos en las campañas que cumplen los filtros aplicados (campaña, fechas, empresa, cuenta analítica y estado), sin importar si el correo se entregó o no.',
    source: 'Se cuenta un registro de destinatario (CommunicationRecipient) por cada persona a la que se le generó un envío dentro de un comunicado.',
  },
  envioExitoso: {
    title: 'Envío exitoso',
    formula: 'envío exitoso ÷ enviados × 100',
    description: 'Porcentaje de destinatarios cuyo correo fue aceptado y entregado por el buzón de envío. No es un "entregado" confirmado por un proveedor externo — Microsoft Graph (el buzón de Office 365 que usa la plataforma) no envía webhooks de entrega, así que esto refleja que el envío no arrojó error al intentarlo.',
    source: 'Campo emailStatus del destinatario: "sent" cuenta como éxito, "failed" no. Se marca según la respuesta de la función sendCommunicationEmail para ese destinatario en particular.',
  },
  tasaApertura: {
    title: 'Tasa de apertura',
    formula: 'abiertos ÷ envío exitoso × 100',
    description: 'Porcentaje de correos con envío exitoso que fueron abiertos. Se detecta cuando el destinatario visita el enlace único de su correo (/comunicado/{token}) dentro de la plataforma — no hay seguimiento de apertura por parte de un proveedor de correo, así que solo cuenta si la persona realmente entra al enlace (una imagen de rastreo por sí sola no lo activaría).',
    source: 'Campo readAt del destinatario, escrito la primera vez que abre el enlace de su comunicado.',
  },
  tasaClic: {
    title: 'Tasa de clic',
    formula: 'clics ÷ envío exitoso × 100',
    description: 'Porcentaje de correos con envío exitoso donde el destinatario hizo clic en el botón de acción (CTA) del comunicado. Solo aplica a comunicados que tienen un botón configurado — si el comunicado no tiene CTA, nadie puede hacer clic.',
    source: 'Campo ctaClickedAt del destinatario, escrito cuando visita el enlace de seguimiento del botón (/comunicado/{token}/cta).',
  },
  tasaConfirmacion: {
    title: 'Tasa de confirmación',
    formula: 'confirmaron ÷ envío exitoso × 100',
    description: 'Porcentaje de destinatarios que confirmaron haber leído el comunicado (acuse de recibo). Solo tiene sentido en comunicados marcados como "Requiere confirmación" — en los demás siempre será 0 aunque se haya abierto el correo.',
    source: 'Campo ackAt del destinatario, escrito cuando confirma la lectura desde el enlace del comunicado.',
  },
  fallidos: {
    title: 'Fallidos',
    description: 'Destinatarios cuyo correo NO se pudo enviar (rechazado por el buzón de envío o por un error de la función de envío). Cuando el proveedor devuelve un motivo, queda guardado junto al destinatario.',
    source: 'Destinatarios con emailStatus = "failed". El motivo, si existe, queda en el campo emailError.',
  },
  campanas: {
    title: 'Campañas',
    description: 'Cantidad de campañas (comunicados enviados o en borrador) que cumplen los filtros seleccionados, sobre el total de campañas registradas en la plataforma.',
    source: 'Documentos de la colección de comunicados (Communication) que pasan los filtros de campaña, fecha y estado.',
  },
  destinatarios: {
    title: 'Destinatarios',
    description: 'Cantidad de destinatarios individuales que cumplen TODOS los filtros aplicados, incluido el de "Resultado del correo" — por eso puede ser distinto al número de "Enviados", que no aplica ese último filtro.',
    source: 'Registros de destinatario (CommunicationRecipient) después de aplicar campaña, fechas, empresa, cuenta analítica, estado, búsqueda y resultado del correo.',
  },
};

function KpiCard({
  icon: Icon, label, value, sub, iconBg, valueColor = 'text-gray-900', explainKey, onExplain,
}: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; iconBg: string; valueColor?: string;
  explainKey: string; onExplain: (key: string) => void;
}) {
  return (
    <button type="button" onClick={() => onExplain(explainKey)}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4 text-left hover:border-[#008C3C]/40 hover:shadow-md transition-all relative group">
      <Info className="w-3.5 h-3.5 text-gray-300 absolute top-3 right-3 group-hover:text-[#008C3C]" />
      <div className={`p-3 rounded-xl flex-shrink-0 ${iconBg}`}><Icon className="w-5 h-5 text-white" /></div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-bold mt-0.5 ${valueColor}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </button>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 shadow-lg rounded-xl p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-semibold text-gray-800">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

const FINAL_STATUS_LABEL: Record<CommsRecipientRow['finalStatus'], { label: string; color: string }> = {
  failed:            { label: 'Falló el envío',       color: '#ef4444' },
  sent_no_open:      { label: 'Enviado sin abrir',    color: '#9ca3af' },
  opened_no_click:   { label: 'Abrió sin clic',       color: '#f59e0b' },
  clicked:           { label: 'Hizo clic',            color: '#3b82f6' },
  acked:             { label: 'Confirmó lectura',     color: '#008C3C' },
};

const COMPARISON_METRICS = [
  { id: 'openRate', label: 'Tasa de apertura' },
  { id: 'clickRate', label: 'Tasa de clic' },
  { id: 'ackRate', label: 'Tasa de confirmación' },
  { id: 'deliveryRate', label: 'Tasa de envío exitoso' },
] as const;
type ComparisonMetric = typeof COMPARISON_METRICS[number]['id'];

const EVOLUTION_METRICS = [
  { id: 'sent', label: 'Enviados', color: '#22c55e' },
  { id: 'opened', label: 'Abiertos', color: '#008C3C' },
  { id: 'clicked', label: 'Clics', color: '#3b82f6' },
] as const;
type EvolutionMetric = typeof EVOLUTION_METRICS[number]['id'];

type RecipientSort = 'sentAt' | 'userName' | 'company';
type DetailTab = 'resumen' | 'campanas' | 'destinatarios';

export function CommunicationsStatsPage() {
  const { loading, error, refresh, campaigns, recipients, timeline } = useCommunicationsStats();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState<DetailTab>('resumen');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [campaignFilter, setCampaignFilter] = useState(searchParams.get('campaign') || 'all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'sent'>('all');
  const [resultFilter, setResultFilter] = useState<'all' | CommsRecipientRow['finalStatus']>('all');
  const [comparisonMetric, setComparisonMetric] = useState<ComparisonMetric>('openRate');
  const [evolutionMetric, setEvolutionMetric] = useState<EvolutionMetric>('sent');
  const [recipientSort, setRecipientSort] = useState<RecipientSort>('sentAt');
  const [recipientSortDir, setRecipientSortDir] = useState<'asc' | 'desc'>('desc');
  const [recipientPage, setRecipientPage] = useState(0);
  const [explainKey, setExplainKey] = useState<string | null>(null);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const PAGE_SIZE = 25;

  const toggleExpand = (id: string) => setExpandedCampaigns(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  useEffect(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (campaignFilter === 'all') next.delete('campaign'); else next.set('campaign', campaignFilter);
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignFilter]);

  const campaignOptions = useMemo(() => [...campaigns].sort((a, b) => (b.sentAt?.getTime() ?? 0) - (a.sentAt?.getTime() ?? 0)), [campaigns]);
  const companyOptions = useMemo(() => [...new Set(recipients.map(r => r.company).filter(Boolean))].sort(), [recipients]);
  const projectOptions = useMemo(() => [...new Set(recipients.map(r => r.project).filter(Boolean))].sort(), [recipients]);

  const inDateRange = (d: Date | null) => {
    if (!d) return !dateFrom && !dateTo;
    if (dateFrom && d < new Date(dateFrom)) return false;
    if (dateTo && d > new Date(`${dateTo}T23:59:59`)) return false;
    return true;
  };

  // Campañas filtradas por campaña/fecha/empresa-proyecto(vía destinatarios)/estado — base para KPIs, embudo, comparación y evolución.
  const filteredCampaignIds = useMemo(() => {
    const q = search.trim().toLowerCase();
    return new Set(
      campaigns
        .filter(c => campaignFilter === 'all' || c.id === campaignFilter)
        .filter(c => (!q || c.title.toLowerCase().includes(q)))
        .filter(c => statusFilter === 'all' || c.status === statusFilter)
        .filter(c => inDateRange(c.sentAt))
        .map(c => c.id),
    );
  }, [campaigns, campaignFilter, search, statusFilter, dateFrom, dateTo]);

  const baseRecipients = useMemo(() => recipients
    .filter(r => filteredCampaignIds.has(r.communicationId))
    .filter(r => companyFilter === 'all' || r.company === companyFilter)
    .filter(r => projectFilter === 'all' || r.project === projectFilter),
  [recipients, filteredCampaignIds, companyFilter, projectFilter]);

  const filteredCampaigns = useMemo(() => campaigns.filter(c => filteredCampaignIds.has(c.id)), [campaigns, filteredCampaignIds]);

  const funnelStats = useMemo(() => {
    const total = baseRecipients.length;
    const sentOk = baseRecipients.filter(r => r.emailStatus === 'sent').length;
    const opened = baseRecipients.filter(r => !!r.readAt).length;
    const clicked = baseRecipients.filter(r => !!r.ctaClickedAt).length;
    const acked = baseRecipients.filter(r => !!r.ackAt).length;
    const hasAckStage = filteredCampaigns.some(c => c.requiresAck);
    return { total, sentOk, opened, clicked, acked, hasAckStage };
  }, [baseRecipients, filteredCampaigns]);

  const funnelSteps = useMemo(() => {
    const { total, sentOk, opened, clicked, acked, hasAckStage } = funnelStats;
    const steps = [
      { label: 'Enviados', value: total, ofPrevious: 100, ofTotal: 100 },
      { label: 'Envío exitoso', value: sentOk, ofPrevious: rate(sentOk, total), ofTotal: rate(sentOk, total) },
      { label: 'Abiertos', value: opened, ofPrevious: rate(opened, sentOk), ofTotal: rate(opened, total) },
      { label: 'Clics', value: clicked, ofPrevious: rate(clicked, opened), ofTotal: rate(clicked, total) },
    ];
    if (hasAckStage) steps.push({ label: 'Confirmaron', value: acked, ofPrevious: rate(acked, clicked), ofTotal: rate(acked, total) });
    return steps;
  }, [funnelStats]);

  const finalResultData = useMemo(() => {
    const counts = new Map<CommsRecipientRow['finalStatus'], number>();
    baseRecipients.forEach(r => counts.set(r.finalStatus, (counts.get(r.finalStatus) ?? 0) + 1));
    return (Object.keys(FINAL_STATUS_LABEL) as CommsRecipientRow['finalStatus'][])
      .map(key => ({ key, name: FINAL_STATUS_LABEL[key].label, value: counts.get(key) ?? 0, fill: FINAL_STATUS_LABEL[key].color }))
      .filter(d => d.value > 0);
  }, [baseRecipients]);
  const finalResultTotal = finalResultData.reduce((s, d) => s + d.value, 0);

  const comparisonData = useMemo(() => filteredCampaigns
    .filter(c => c.total > 0)
    .map(c => ({ name: c.title.length > 22 ? `${c.title.slice(0, 22)}…` : c.title, value: c[comparisonMetric] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10),
  [filteredCampaigns, comparisonMetric]);

  const evolutionData = useMemo(() => {
    if (!dateFrom && !dateTo) return timeline;
    const dayBuckets = new Map<string, { date: string; sent: number; opened: number; clicked: number }>();
    baseRecipients.forEach(r => {
      const events: Array<[Date | null, 'sent' | 'opened' | 'clicked']> = [
        [r.emailStatus === 'sent' ? r.sentAt : null, 'sent'],
        [r.readAt, 'opened'],
        [r.ctaClickedAt, 'clicked'],
      ];
      events.forEach(([d, kind]) => {
        if (!d) return;
        const key = d.toISOString().slice(0, 10);
        if (!dayBuckets.has(key)) dayBuckets.set(key, { date: d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }), sent: 0, opened: 0, clicked: 0 });
        dayBuckets.get(key)![kind]++;
      });
    });
    return [...dayBuckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [baseRecipients, timeline, dateFrom, dateTo]);
  const evolutionMax = Math.max(...evolutionData.map(d => d[evolutionMetric]), 1);

  const filteredRecipients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return baseRecipients
      .filter(r => resultFilter === 'all' || r.finalStatus === resultFilter)
      .filter(r => !q || r.userName.toLowerCase().includes(q) || r.userEmail.toLowerCase().includes(q) || r.communicationTitle.toLowerCase().includes(q))
      .sort((a, b) => {
        if (recipientSort === 'sentAt') {
          const diff = (a.sentAt?.getTime() ?? 0) - (b.sentAt?.getTime() ?? 0);
          return recipientSortDir === 'desc' ? -diff : diff;
        }
        const diff = String(a[recipientSort] ?? '').localeCompare(String(b[recipientSort] ?? ''));
        return recipientSortDir === 'desc' ? -diff : diff;
      });
  }, [baseRecipients, search, resultFilter, recipientSort, recipientSortDir]);

  const pagedRecipients = filteredRecipients.slice(recipientPage * PAGE_SIZE, (recipientPage + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filteredRecipients.length / PAGE_SIZE));

  const toggleSort = (field: RecipientSort) => {
    if (recipientSort === field) setRecipientSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setRecipientSort(field); setRecipientSortDir('desc'); }
  };
  const SortIcon = ({ field }: { field: RecipientSort }) =>
    recipientSort === field ? (recipientSortDir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />) : <ChevronDown className="w-3 h-3 opacity-30" />;

  const recipientsByCampaign = useMemo(() => {
    const map = new Map<string, CommsRecipientRow[]>();
    recipients.forEach(r => {
      if (!map.has(r.communicationId)) map.set(r.communicationId, []);
      map.get(r.communicationId)!.push(r);
    });
    return map;
  }, [recipients]);

  const toExportRow = (r: CommsRecipientRow) => ({
    Campaña: r.communicationTitle, Destinatario: r.userName, Correo: r.userEmail,
    Empresa: r.company, 'Cuenta analítica': r.project,
    'Fecha de envío': fmtDateTime(r.sentAt), 'Estado de envío': r.emailStatus,
    'Abrió': r.readAt ? 'Sí' : 'No', 'Fecha de apertura': fmtDateTime(r.readAt),
    'Clic': r.ctaClickedAt ? 'Sí' : 'No', 'Fecha de clic': fmtDateTime(r.ctaClickedAt),
    'Confirmó': r.ackAt ? 'Sí' : 'No', 'Fecha de confirmación': fmtDateTime(r.ackAt),
    'Estado final': FINAL_STATUS_LABEL[r.finalStatus].label,
  });
  const EXPORT_COL_WIDTHS = [{ wch: 28 }, { wch: 24 }, { wch: 28 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 8 }, { wch: 16 }, { wch: 8 }, { wch: 16 }, { wch: 10 }, { wch: 18 }, { wch: 18 }];

  const exportRows = (rows: ReturnType<typeof toExportRow>[], filename: string) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = EXPORT_COL_WIDTHS;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Destinatarios');
    XLSX.writeFile(wb, filename);
  };

  const handleExport = () => exportRows(
    filteredRecipients.map(toExportRow),
    `estadisticas-correos-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );

  const handleExportCampaign = (campaignId: string, title: string) => exportRows(
    (recipientsByCampaign.get(campaignId) ?? []).map(toExportRow),
    `campana-${title.replace(/[^\w\-]+/g, '_').slice(0, 40)}-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-gray-300" /></div>;
  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-gray-500">
      <AlertTriangle className="w-10 h-10 text-red-300" />
      <p className="text-sm">{error}</p>
      <button onClick={refresh} className="text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50">Reintentar</button>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estadísticas de campañas de correo</h1>
          <p className="text-sm text-gray-400 mt-0.5">Enviados, entregados, abiertos, clics y confirmaciones por campaña</p>
        </div>
        <button onClick={refresh} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors text-gray-600">
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {/* ── Filtros ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 shrink-0"><Filter className="w-3.5 h-3.5" /> Filtros:</span>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input className="h-9 pl-8 pr-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008C3C]/20 w-52"
            placeholder="Buscar campaña o destinatario..." value={search} onChange={e => { setSearch(e.target.value); setRecipientPage(0); }} />
        </div>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 px-2.5 text-sm border border-gray-200 rounded-lg" />
        <span className="text-xs text-gray-400">a</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 px-2.5 text-sm border border-gray-200 rounded-lg" />
        <select value={campaignFilter} onChange={e => { setCampaignFilter(e.target.value); setRecipientPage(0); }}
          className={`h-9 px-2.5 text-sm border rounded-lg max-w-[220px] ${campaignFilter !== 'all' ? 'border-[#008C3C] text-[#008C3C] font-medium' : 'border-gray-200 text-gray-600'}`}>
          <option value="all">Todas las campañas</option>
          {campaignOptions.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        {campaignFilter !== 'all' && (
          <button onClick={() => setCampaignFilter('all')} className="text-xs text-gray-400 hover:text-gray-600 underline">Quitar</button>
        )}
        <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} className="h-9 px-2.5 text-sm border border-gray-200 rounded-lg text-gray-600">
          <option value="all">Todas las empresas</option>
          {companyOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="h-9 px-2.5 text-sm border border-gray-200 rounded-lg text-gray-600">
          <option value="all">Todas las cuentas analíticas</option>
          {projectOptions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="h-9 px-2.5 text-sm border border-gray-200 rounded-lg text-gray-600">
          <option value="all">Cualquier estado</option>
          <option value="sent">Enviada</option>
          <option value="draft">Borrador</option>
        </select>
        <select value={resultFilter} onChange={e => setResultFilter(e.target.value as any)} className="h-9 px-2.5 text-sm border border-gray-200 rounded-lg text-gray-600">
          <option value="all">Cualquier resultado</option>
          {(Object.keys(FINAL_STATUS_LABEL) as CommsRecipientRow['finalStatus'][]).map(k => <option key={k} value={k}>{FINAL_STATUS_LABEL[k].label}</option>)}
        </select>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Send} label="Enviados" value={funnelStats.total.toLocaleString('es-CO')} sub={`${filteredCampaigns.length} campaña(s)`} iconBg="bg-gray-700"
          explainKey="enviados" onExplain={setExplainKey} />
        <KpiCard icon={CheckCircle2} label="Envío exitoso" value={pct(rate(funnelStats.sentOk, funnelStats.total))} sub={`${funnelStats.sentOk.toLocaleString('es-CO')} de ${funnelStats.total.toLocaleString('es-CO')}`} iconBg="bg-green-500"
          explainKey="envioExitoso" onExplain={setExplainKey} />
        <KpiCard icon={Eye} label="Tasa de apertura" value={pct(rate(funnelStats.opened, funnelStats.sentOk))} sub={`${funnelStats.opened.toLocaleString('es-CO')} abiertos`} iconBg="bg-[#008C3C]"
          explainKey="tasaApertura" onExplain={setExplainKey} />
        <KpiCard icon={MousePointerClick} label="Tasa de clic" value={pct(rate(funnelStats.clicked, funnelStats.sentOk))} sub={`${funnelStats.clicked.toLocaleString('es-CO')} clics`} iconBg="bg-blue-500"
          explainKey="tasaClic" onExplain={setExplainKey} />
        <KpiCard icon={ThumbsUp} label="Tasa de confirmación" value={pct(rate(funnelStats.acked, funnelStats.sentOk))} sub={`${funnelStats.acked.toLocaleString('es-CO')} confirmaron lectura`} iconBg="bg-purple-500"
          explainKey="tasaConfirmacion" onExplain={setExplainKey} />
        <KpiCard icon={XCircle} label="Fallidos" value={(funnelStats.total - funnelStats.sentOk).toLocaleString('es-CO')}
          sub="no se pudieron enviar" iconBg={funnelStats.total - funnelStats.sentOk > 0 ? 'bg-red-500' : 'bg-gray-400'}
          valueColor={funnelStats.total - funnelStats.sentOk > 0 ? 'text-red-600' : 'text-gray-900'}
          explainKey="fallidos" onExplain={setExplainKey} />
        <KpiCard icon={CheckCircle2} label="Campañas" value={filteredCampaigns.length.toLocaleString('es-CO')} sub={`de ${campaigns.length} en total`} iconBg="bg-gray-500"
          explainKey="campanas" onExplain={setExplainKey} />
        <KpiCard icon={Download} label="Destinatarios" value={filteredRecipients.length.toLocaleString('es-CO')} sub="según filtros aplicados" iconBg="bg-teal-500"
          explainKey="destinatarios" onExplain={setExplainKey} />
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-white rounded-xl border border-gray-100 p-1 w-fit">
        {([['resumen', 'Resumen'], ['campanas', 'Por campaña'], ['destinatarios', 'Destinatarios']] as [DetailTab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === id ? 'bg-[#008C3C] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Resumen ── */}
      {tab === 'resumen' && (
        <div className="space-y-4">
          {/* Embudo de conversión */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-1">Embudo de conversión</h2>
            <p className="text-xs text-gray-400 mb-4">Cantidad y porcentaje frente a la etapa anterior / al total enviado</p>
            {funnelStats.total === 0 ? (
              <div className="flex items-center justify-center h-[120px] text-sm text-gray-300">Sin datos para los filtros aplicados</div>
            ) : (
              <div className="space-y-2.5">
                {funnelSteps.map((step, i) => (
                  <div key={step.label} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-xs font-medium text-gray-500 text-right">{step.label}</span>
                    <div className="flex-1 h-8 bg-gray-50 rounded-lg overflow-hidden relative">
                      <div className="h-full rounded-lg flex items-center px-3 transition-all"
                        style={{ width: `${Math.max(step.ofTotal, 3)}%`, background: `linear-gradient(90deg, #008C3C, #22c55e)`, opacity: 1 - i * 0.08 }}>
                        <span className="text-xs font-semibold text-white whitespace-nowrap">{step.value.toLocaleString('es-CO')}</span>
                      </div>
                    </div>
                    <span className="w-36 shrink-0 text-xs text-gray-400 text-left">
                      {i === 0 ? '100%' : <>{pct(step.ofPrevious)} de la etapa anterior · <span className="text-gray-300">{pct(step.ofTotal)} del total</span></>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            {/* Comparación entre campañas */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">Comparación entre campañas</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Top 10 según la métrica seleccionada</p>
                </div>
                <select value={comparisonMetric} onChange={e => setComparisonMetric(e.target.value as ComparisonMetric)}
                  className="h-8 px-2 text-xs border border-gray-200 rounded-lg text-gray-600">
                  {COMPARISON_METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
              {comparisonData.length === 0 ? (
                <div className="flex items-center justify-center h-[220px] text-sm text-gray-300">Sin campañas con destinatarios</div>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(220, comparisonData.length * 34)}>
                  <BarChart data={comparisonData} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }} barSize={16}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} unit="%" axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: '#4b5563' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} formatter={(v: any) => `${v}%`} />
                    <Bar dataKey="value" name={COMPARISON_METRICS.find(m => m.id === comparisonMetric)?.label} fill="#008C3C" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Resultado final */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-800 mb-1">Resultado final</h2>
              <p className="text-xs text-gray-400 mb-4">Estado final de cada destinatario</p>
              {finalResultTotal === 0 ? (
                <div className="flex items-center justify-center h-[160px] text-sm text-gray-300">Sin datos</div>
              ) : (
                <div className="flex flex-col items-center">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie data={finalResultData} cx="50%" cy="50%" innerRadius={46} outerRadius={72} dataKey="value" startAngle={90} endAngle={-270}>
                        {finalResultData.map((d, i) => <Cell key={i} fill={d.fill} strokeWidth={0} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => v.toLocaleString('es-CO')} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="w-full space-y-2 mt-2">
                    {finalResultData.map(entry => (
                      <div key={entry.key} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-gray-500"><span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: entry.fill }} />{entry.name}</span>
                        <span className="font-semibold text-gray-800">{entry.value.toLocaleString('es-CO')} <span className="text-gray-400 font-normal">({rate(entry.value, finalResultTotal)}%)</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Evolución en el tiempo */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Evolución en el tiempo</h2>
                <p className="text-xs text-gray-400 mt-0.5">{dateFrom || dateTo ? 'Según el rango de fechas filtrado' : 'Últimos 30 días'}</p>
              </div>
              <div className="flex gap-1">
                {EVOLUTION_METRICS.map(m => (
                  <button key={m.id} onClick={() => setEvolutionMetric(m.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${evolutionMetric === m.id ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            {evolutionData.every(d => d.sent + d.opened + d.clicked === 0) ? (
              <div className="flex items-center justify-center h-[200px] text-sm text-gray-300">Sin actividad en el período</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={evolutionData} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gCommEvo" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={EVOLUTION_METRICS.find(m => m.id === evolutionMetric)?.color} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={EVOLUTION_METRICS.find(m => m.id === evolutionMetric)?.color} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#9ca3af' }} interval={Math.floor(evolutionData.length / 8)} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} allowDecimals={false} axisLine={false} tickLine={false} domain={[0, evolutionMax + 1]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey={evolutionMetric} name={EVOLUTION_METRICS.find(m => m.id === evolutionMetric)?.label}
                    stroke={EVOLUTION_METRICS.find(m => m.id === evolutionMetric)?.color} strokeWidth={2} fill="url(#gCommEvo)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Por campaña ── */}
      {tab === 'campanas' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 bg-gray-50/70 border-b border-gray-100">
                  <th className="text-left px-5 py-3 font-medium w-8"></th>
                  <th className="text-left px-2 py-3 font-medium">Campaña</th>
                  <th className="text-center px-3 py-3 font-medium">Estado</th>
                  <th className="text-right px-3 py-3 font-medium">Enviados</th>
                  <th className="text-right px-3 py-3 font-medium text-red-500">Fallidos</th>
                  <th className="text-right px-3 py-3 font-medium text-[#008C3C]">Abiertos</th>
                  <th className="text-right px-3 py-3 font-medium text-blue-600">Clics</th>
                  <th className="text-right px-3 py-3 font-medium text-purple-600">Confirmaron</th>
                  <th className="text-right px-5 py-3 font-medium">Apertura</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredCampaigns.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-12 text-sm text-gray-400">Sin campañas para los filtros aplicados</td></tr>
                )}
                {filteredCampaigns.map(c => {
                  const isOpen = expandedCampaigns.has(c.id);
                  const campaignRecipients = recipientsByCampaign.get(c.id) ?? [];
                  return (
                    <Fragment key={c.id}>
                      <tr className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => toggleExpand(c.id)}>
                        <td className="px-5 py-3.5">
                          {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                        </td>
                        <td className="px-2 py-3.5 max-w-xs">
                          <p className="font-medium text-gray-900 line-clamp-1">{c.title}</p>
                          <p className="text-xs text-gray-400 line-clamp-1">{c.targetName || c.targetType} · {fmtDate(c.sentAt)}</p>
                        </td>
                        <td className="px-3 py-3.5 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${c.status === 'sent' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {c.status === 'sent' ? 'Enviada' : 'Borrador'}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-right text-gray-600 tabular-nums">{c.total}</td>
                        <td className="px-3 py-3.5 text-right tabular-nums">{c.failed > 0 ? <span className="text-red-600 font-semibold">{c.failed}</span> : <span className="text-gray-300">0</span>}</td>
                        <td className="px-3 py-3.5 text-right text-[#008C3C] tabular-nums">{c.opened}</td>
                        <td className="px-3 py-3.5 text-right text-blue-600 tabular-nums">{c.clicked}</td>
                        <td className="px-3 py-3.5 text-right text-purple-600 tabular-nums">{c.requiresAck ? c.acked : <span className="text-gray-300">—</span>}</td>
                        <td className="px-5 py-3.5 text-right">{c.sent > 0 ? <RateBadge value={c.openRate} /> : <span className="text-xs text-gray-300">—</span>}</td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={9} className="p-0 bg-gray-50/60">
                            <div className="px-5 py-4">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-semibold text-gray-500">
                                  {campaignRecipients.length.toLocaleString('es-CO')} destinatario(s) de "{c.title}"
                                </p>
                                <button onClick={e => { e.stopPropagation(); handleExportCampaign(c.id, c.title); }}
                                  className="flex items-center gap-1.5 text-xs font-medium text-[#008C3C] hover:underline">
                                  <Download className="w-3.5 h-3.5" /> Exportar esta campaña
                                </button>
                              </div>
                              {campaignRecipients.length === 0 ? (
                                <p className="text-xs text-gray-400 py-4 text-center">Sin destinatarios registrados</p>
                              ) : (
                                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden overflow-x-auto max-h-80 overflow-y-auto">
                                  <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-gray-50">
                                      <tr className="text-[10px] text-gray-400 border-b border-gray-100">
                                        <th className="text-left px-3 py-2 font-medium">Destinatario</th>
                                        <th className="text-left px-3 py-2 font-medium">Empresa</th>
                                        <th className="text-left px-3 py-2 font-medium">Enviado</th>
                                        <th className="text-center px-3 py-2 font-medium">Abrió</th>
                                        <th className="text-center px-3 py-2 font-medium">Clic</th>
                                        <th className="text-left px-3 py-2 font-medium">Estado final</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                      {campaignRecipients.map(r => (
                                        <tr key={r.id} className="hover:bg-gray-50/50">
                                          <td className="px-3 py-2">
                                            <p className="font-medium text-gray-800">{r.userName}</p>
                                            <p className="text-gray-400">{r.userEmail}</p>
                                          </td>
                                          <td className="px-3 py-2 text-gray-600">{r.company}</td>
                                          <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmtDateTime(r.sentAt)}</td>
                                          <td className="px-3 py-2 text-center">{r.readAt ? <CheckCircle2 className="w-3.5 h-3.5 text-[#008C3C] inline" /> : <span className="text-gray-300">—</span>}</td>
                                          <td className="px-3 py-2 text-center">{r.ctaClickedAt ? <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 inline" /> : <span className="text-gray-300">—</span>}</td>
                                          <td className="px-3 py-2">
                                            <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: FINAL_STATUS_LABEL[r.finalStatus].color }}>
                                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: FINAL_STATUS_LABEL[r.finalStatus].color }} />
                                              {FINAL_STATUS_LABEL[r.finalStatus].label}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab: Destinatarios ── */}
      {tab === 'destinatarios' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <p className="text-xs text-gray-400">{filteredRecipients.length.toLocaleString('es-CO')} destinatario(s)</p>
            <button onClick={handleExport} className="flex items-center gap-1.5 text-xs font-medium text-[#008C3C] hover:underline">
              <Download className="w-3.5 h-3.5" /> Exportar a Excel
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 bg-gray-50/70 border-b border-gray-100">
                  <button onClick={() => toggleSort('userName')} className="contents"><th className="text-left px-5 py-3 font-medium cursor-pointer hover:text-gray-600">
                    <span className="flex items-center gap-1">Destinatario <SortIcon field="userName" /></span>
                  </th></button>
                  <th className="text-left px-3 py-3 font-medium">Campaña</th>
                  <button onClick={() => toggleSort('company')} className="contents"><th className="text-left px-3 py-3 font-medium cursor-pointer hover:text-gray-600">
                    <span className="flex items-center gap-1">Empresa <SortIcon field="company" /></span>
                  </th></button>
                  <button onClick={() => toggleSort('sentAt')} className="contents"><th className="text-left px-3 py-3 font-medium cursor-pointer hover:text-gray-600">
                    <span className="flex items-center gap-1">Enviado <SortIcon field="sentAt" /></span>
                  </th></button>
                  <th className="text-center px-3 py-3 font-medium">Abrió</th>
                  <th className="text-center px-3 py-3 font-medium">Clic</th>
                  <th className="text-left px-5 py-3 font-medium">Estado final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pagedRecipients.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-12 text-sm text-gray-400">Sin destinatarios para los filtros aplicados</td></tr>
                )}
                {pagedRecipients.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-gray-900">{r.userName}</p>
                      <p className="text-xs text-gray-400">{r.userEmail}</p>
                    </td>
                    <td className="px-3 py-3.5 max-w-[180px] text-gray-600"><span className="line-clamp-1">{r.communicationTitle}</span></td>
                    <td className="px-3 py-3.5 text-gray-600 text-xs">{r.company}</td>
                    <td className="px-3 py-3.5 text-gray-400 text-xs whitespace-nowrap">{fmtDateTime(r.sentAt)}</td>
                    <td className="px-3 py-3.5 text-center">{r.readAt ? <CheckCircle2 className="w-4 h-4 text-[#008C3C] inline" /> : <span className="text-gray-300 text-xs">—</span>}</td>
                    <td className="px-3 py-3.5 text-center">{r.ctaClickedAt ? <CheckCircle2 className="w-4 h-4 text-blue-500 inline" /> : <span className="text-gray-300 text-xs">—</span>}</td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: FINAL_STATUS_LABEL[r.finalStatus].color }}>
                        <span className="w-2 h-2 rounded-full" style={{ background: FINAL_STATUS_LABEL[r.finalStatus].color }} />
                        {FINAL_STATUS_LABEL[r.finalStatus].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 text-xs text-gray-500">
              <span>Página {recipientPage + 1} de {totalPages}</span>
              <div className="flex gap-2">
                <button disabled={recipientPage === 0} onClick={() => setRecipientPage(p => p - 1)} className="px-2.5 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50">Anterior</button>
                <button disabled={recipientPage >= totalPages - 1} onClick={() => setRecipientPage(p => p + 1)} className="px-2.5 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50">Siguiente</button>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-gray-400 flex items-center gap-1.5">
        <Eye className="w-3.5 h-3.5" /> "Abierto" y "Clic" se registran cuando el destinatario visita el enlace del correo dentro de la plataforma — el envío no pasa por un proveedor con seguimiento de rebotes ni respuestas.
      </p>

      {/* ── Explicación de cada dato (clic en una tarjeta KPI) ── */}
      <Dialog open={!!explainKey} onOpenChange={open => { if (!open) setExplainKey(null); }}>
        <DialogContent className="max-w-md">
          {explainKey && (() => {
            const info = KPI_EXPLANATIONS[explainKey];
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <Info className="w-4 h-4 text-[#008C3C]" /> {info.title}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                  {info.formula && (
                    <p className="font-mono text-xs bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-gray-700">{info.formula}</p>
                  )}
                  <p className="text-gray-600 leading-relaxed">{info.description}</p>
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">De dónde sale el dato</p>
                    <p className="text-xs text-gray-500 leading-relaxed">{info.source}</p>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
