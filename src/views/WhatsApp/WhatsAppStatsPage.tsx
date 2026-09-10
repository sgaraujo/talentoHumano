import { Fragment, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  RefreshCw, Loader2, MessageCircle, CheckCircle2, XCircle, AlertTriangle,
  TrendingUp, Search, ChevronDown, ChevronUp, Eye, MessagesSquare, Inbox,
  Filter, Info, Download,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, BarChart, Bar,
} from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  useWhatsAppStats, rate, type WaRecipientRow, type WaFinalStatus,
} from '@/hooks/useWhatsAppStats';

function fmtDate(d: Date | null) {
  if (!d) return '—';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(d: Date | null) {
  if (!d) return '—';
  return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function RateBadge({ rate: value }: { rate: number }) {
  const cls =
    value >= 90 ? 'bg-green-100 text-green-700' :
    value >= 60 ? 'bg-yellow-100 text-yellow-700' :
                 'bg-red-100 text-red-700';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{value}%</span>;
}

interface KpiExplanation { title: string; formula?: string; description: string; source: string }

const KPI_EXPLANATIONS: Record<string, KpiExplanation> = {
  campanas: {
    title: 'Campañas',
    description: 'Cantidad de campañas de WhatsApp que cumplen los filtros aplicados (fecha, empresa, cuenta analítica, estado), sobre el total de campañas registradas.',
    source: 'Documentos de whatsapp/data/campaigns que pasan los filtros.',
  },
  entrega: {
    title: 'Tasa de entrega',
    formula: 'entregados ÷ aceptados por Meta × 100',
    description: 'Porcentaje de mensajes aceptados por Meta que Meta confirma como entregados al teléfono del destinatario, según el webhook oficial de WhatsApp Business — no es una estimación, es el estado real reportado por Meta.',
    source: 'Campo deliveryStatus del destinatario ("delivered" o "read"), actualizado por el webhook de WhatsApp (functions/src/whatsapp/webhookHandler.ts).',
  },
  leidos: {
    title: 'Leídos',
    formula: 'leídos ÷ aceptados por Meta × 100',
    description: 'Destinatarios cuyo mensaje fue marcado como leído (doble check azul) por WhatsApp. Depende de que el destinatario tenga activadas las confirmaciones de lectura en su teléfono — si las desactivó, el mensaje puede haberse leído igual sin que Meta lo reporte.',
    source: 'Campo deliveryStatus = "read" del destinatario, reportado por el webhook de WhatsApp.',
  },
  fallidos: {
    title: 'Fallidos',
    description: 'Mensajes que no se pudieron enviar (rechazados por Meta al intentarlo) u omitidos (destinatario inválido o duplicado antes de intentar el envío), más los que Meta aceptó pero luego reportó como fallidos en la entrega.',
    source: 'Destinatarios con status = "failed" o "skipped", o deliveryStatus = "failed" reportado por el webhook.',
  },
};

const FINAL_STATUS_LABEL: Record<WaFinalStatus, { label: string; color: string }> = {
  failed:              { label: 'Falló / omitido',     color: '#ef4444' },
  sent_no_delivery:    { label: 'Aceptado, sin confirmar', color: '#9ca3af' },
  delivered_no_read:   { label: 'Entregado sin leer',  color: '#3b82f6' },
  read:                { label: 'Leído',               color: '#008C3C' },
  skipped:             { label: 'Omitido',             color: '#d1d5db' },
};

const COMPARISON_METRICS = [
  { id: 'deliveryRate', label: 'Tasa de entrega' },
  { id: 'readRate', label: 'Tasa de lectura' },
] as const;
type ComparisonMetric = typeof COMPARISON_METRICS[number]['id'];

function KpiCard({
  icon: Icon, label, value, sub, iconBg, valueColor = 'text-gray-900', explainKey, onExplain,
}: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; iconBg: string; valueColor?: string;
  explainKey: string; onExplain: (key: string) => void;
}) {
  return (
    <button type="button" onClick={() => onExplain(explainKey)}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4 text-left hover:border-[#00a884]/40 hover:shadow-md transition-all relative group w-full">
      <Info className="w-3.5 h-3.5 text-gray-300 absolute top-3 right-3 group-hover:text-[#00a884]" />
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

type SortField = 'total' | 'sent' | 'failed' | 'deliveryRate';

const STAT_FILTERS = [
  { id: 'all',       label: 'Todas',      cls: 'text-gray-600' },
  { id: 'sent',      label: 'Aceptados',  cls: 'text-green-600' },
  { id: 'delivered', label: 'Entregados', cls: 'text-blue-600' },
  { id: 'read',      label: 'Leídos',     cls: 'text-[#008C3C]' },
  { id: 'failed',    label: 'Fallidos',   cls: 'text-red-500' },
] as const;
type StatFilter = typeof STAT_FILTERS[number]['id'];

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  sending:   { label: 'Enviando',  cls: 'bg-blue-50 text-blue-700' },
  completed: { label: 'Completada', cls: 'bg-green-50 text-green-700' },
  partial:   { label: 'Parcial',   cls: 'bg-yellow-50 text-yellow-700' },
  failed:    { label: 'Fallida',   cls: 'bg-red-50 text-red-700' },
  stopped:   { label: 'Detenida',  cls: 'bg-red-50 text-red-700' },
};

export const WhatsAppStatsPage = () => {
  const { loading, error, refresh, globalStats, byCampaign, recipients, failures, timeline, conversationStats } = useWhatsAppStats();

  const [tab, setTab] = useState<'campanas' | 'destinatarios' | 'fallidos' | 'conversaciones'>('campanas');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [resultFilter, setResultFilter] = useState<'all' | WaFinalStatus>('all');
  const [comparisonMetric, setComparisonMetric] = useState<ComparisonMetric>('deliveryRate');
  const [sortField, setSortField] = useState<SortField>('total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [statFilter, setStatFilter] = useState<StatFilter>('all');
  const [explainKey, setExplainKey] = useState<string | null>(null);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('desc'); }
  };
  const SortIcon = ({ field }: { field: SortField }) =>
    sortField === field
      ? (sortDir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)
      : <ChevronDown className="w-3 h-3 opacity-30" />;

  const toggleExpand = (id: string) => setExpandedCampaigns(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const companyOptions = useMemo(() => [...new Set(recipients.map(r => r.companyName).filter(Boolean) as string[])].sort(), [recipients]);
  const projectOptions = useMemo(() => [...new Set(recipients.map(r => r.projectName).filter(Boolean) as string[])].sort(), [recipients]);

  const inDateRange = (d: Date | null) => {
    if (!d) return !dateFrom && !dateTo;
    if (dateFrom && d < new Date(dateFrom)) return false;
    if (dateTo && d > new Date(`${dateTo}T23:59:59`)) return false;
    return true;
  };

  const filteredCampaignIds = useMemo(() => {
    const q = search.toLowerCase();
    return new Set(
      byCampaign
        .filter(r => r.name.toLowerCase().includes(q) || r.templateName.toLowerCase().includes(q))
        .filter(r => inDateRange(r.createdAt))
        .filter(r => companyFilter === 'all' || r.companyName === companyFilter)
        .filter(r => projectFilter === 'all' || r.projectName === projectFilter)
        .map(r => r.id),
    );
  }, [byCampaign, search, dateFrom, dateTo, companyFilter, projectFilter]);

  const filteredCampaigns = useMemo(() => byCampaign
    .filter(r => filteredCampaignIds.has(r.id))
    .sort((a, b) => {
      const diff = (a[sortField] as number) - (b[sortField] as number);
      return sortDir === 'desc' ? -diff : diff;
    }),
  [byCampaign, filteredCampaignIds, sortField, sortDir]);

  const baseRecipients = useMemo(() => recipients.filter(r => filteredCampaignIds.has(r.campaignId)), [recipients, filteredCampaignIds]);

  const funnelStats = useMemo(() => {
    const total = baseRecipients.length;
    const accepted = baseRecipients.filter(r => r.status === 'sent').length;
    const delivered = baseRecipients.filter(r => r.deliveryStatus === 'delivered' || r.deliveryStatus === 'read').length;
    const read = baseRecipients.filter(r => r.deliveryStatus === 'read').length;
    return { total, accepted, delivered, read };
  }, [baseRecipients]);

  const funnelSteps = useMemo(() => {
    const { total, accepted, delivered, read } = funnelStats;
    return [
      { label: 'Enviados', value: total, ofPrevious: 100, ofTotal: 100 },
      { label: 'Aceptados', value: accepted, ofPrevious: rate(accepted, total), ofTotal: rate(accepted, total) },
      { label: 'Entregados', value: delivered, ofPrevious: rate(delivered, accepted), ofTotal: rate(delivered, total) },
      { label: 'Leídos', value: read, ofPrevious: rate(read, delivered), ofTotal: rate(read, total) },
    ];
  }, [funnelStats]);

  const comparisonData = useMemo(() => filteredCampaigns
    .filter(c => c.sent > 0)
    .map(c => ({ name: c.name.length > 22 ? `${c.name.slice(0, 22)}…` : c.name, value: c[comparisonMetric] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10),
  [filteredCampaigns, comparisonMetric]);

  const filteredRecipients = useMemo(() => {
    const q = search.toLowerCase();
    return baseRecipients
      .filter(r => resultFilter === 'all' || r.finalStatus === resultFilter)
      .filter(r => !q || r.name.toLowerCase().includes(q) || r.phone.includes(q) || r.campaignName.toLowerCase().includes(q))
      .sort((a, b) => (b.sentAt?.getTime() ?? b.createdAt?.getTime() ?? 0) - (a.sentAt?.getTime() ?? a.createdAt?.getTime() ?? 0));
  }, [baseRecipients, search, resultFilter]);

  const filteredFailures = useMemo(() => {
    const q = search.toLowerCase();
    return failures.filter(f => filteredCampaignIds.has(f.campaignId))
      .filter(f => !q || f.name.toLowerCase().includes(q) || f.phone.includes(q) || f.campaignName.toLowerCase().includes(q));
  }, [failures, filteredCampaignIds, search]);

  const recipientsByCampaign = useMemo(() => {
    const map = new Map<string, WaRecipientRow[]>();
    recipients.forEach(r => {
      if (!map.has(r.campaignId)) map.set(r.campaignId, []);
      map.get(r.campaignId)!.push(r);
    });
    return map;
  }, [recipients]);

  const statusLabelOf = (r: WaRecipientRow) => FINAL_STATUS_LABEL[r.finalStatus].label;

  const toExportRow = (r: WaRecipientRow) => ({
    Campaña: r.campaignName, Número: `+${r.phone}`, Nombre: r.name,
    Empresa: r.companyName || '', 'Cuenta analítica': r.projectName || '',
    'Fecha de envío': fmtDateTime(r.sentAt ?? r.createdAt), Estado: statusLabelOf(r),
  });
  const exportRows = (rows: ReturnType<typeof toExportRow>[], filename: string) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 16 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Destinatarios');
    XLSX.writeFile(wb, filename);
  };
  const handleExport = () => exportRows(filteredRecipients.map(toExportRow), `estadisticas-whatsapp-${new Date().toISOString().slice(0, 10)}.xlsx`);
  const handleExportCampaign = (campaignId: string, name: string) => exportRows(
    (recipientsByCampaign.get(campaignId) ?? []).map(toExportRow),
    `campana-whatsapp-${name.replace(/[^\w\-]+/g, '_').slice(0, 40)}-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );

  const pieData = [
    { name: 'Leídos', value: globalStats.read, fill: '#008C3C' },
    { name: 'Entregados', value: Math.max(0, globalStats.delivered - globalStats.read), fill: '#3b82f6' },
    { name: 'Pendientes', value: Math.max(0, globalStats.sent - globalStats.delivered - globalStats.deliveryFailed), fill: '#f59e0b' },
    { name: 'Fallidos', value: globalStats.failed, fill: '#ef4444' },
    { name: 'Omitidos', value: globalStats.skipped, fill: '#9ca3af' },
  ].filter(d => d.value > 0);
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

  const recentDays = timeline.filter(t => t.sent + t.failed > 0);
  const maxDay = Math.max(...timeline.map(t => t.sent + t.failed), 1);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-gray-300" /></div>
  );

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
          <h1 className="text-2xl font-bold text-gray-900">Estadísticas de WhatsApp</h1>
          <p className="text-sm text-gray-400 mt-0.5">Campañas, entregas y conversaciones</p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors text-gray-600"
        >
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {/* ── Filtros ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 shrink-0"><Filter className="w-3.5 h-3.5" /> Filtros:</span>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input className="h-9 pl-8 pr-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]/20 w-52"
            placeholder="Buscar campaña o destinatario..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 px-2.5 text-sm border border-gray-200 rounded-lg" />
        <span className="text-xs text-gray-400">a</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 px-2.5 text-sm border border-gray-200 rounded-lg" />
        <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} className="h-9 px-2.5 text-sm border border-gray-200 rounded-lg text-gray-600">
          <option value="all">Todas las empresas</option>
          {companyOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="h-9 px-2.5 text-sm border border-gray-200 rounded-lg text-gray-600">
          <option value="all">Todas las cuentas analíticas</option>
          {projectOptions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={resultFilter} onChange={e => setResultFilter(e.target.value as any)} className="h-9 px-2.5 text-sm border border-gray-200 rounded-lg text-gray-600">
          <option value="all">Cualquier resultado</option>
          {(Object.keys(FINAL_STATUS_LABEL) as WaFinalStatus[]).map(k => <option key={k} value={k}>{FINAL_STATUS_LABEL[k].label}</option>)}
        </select>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={MessageCircle} label="Campañas" value={filteredCampaigns.length.toLocaleString('es-CO')}
          sub={`${baseRecipients.length.toLocaleString('es-CO')} destinatarios`} iconBg="bg-[#00a884]"
          explainKey="campanas" onExplain={setExplainKey}
        />
        <KpiCard
          icon={TrendingUp} label="Tasa de entrega" value={`${rate(funnelStats.delivered, funnelStats.accepted)}%`}
          sub={`sobre ${funnelStats.accepted.toLocaleString('es-CO')} aceptados por Meta`} iconBg="bg-blue-500"
          valueColor={rate(funnelStats.delivered, funnelStats.accepted) >= 90 ? 'text-green-600' : rate(funnelStats.delivered, funnelStats.accepted) >= 60 ? 'text-yellow-600' : 'text-red-600'}
          explainKey="entrega" onExplain={setExplainKey}
        />
        <KpiCard
          icon={CheckCircle2} label="Leídos" value={funnelStats.read.toLocaleString('es-CO')}
          sub={`${rate(funnelStats.read, funnelStats.accepted)}% de los aceptados`} iconBg="bg-green-500"
          explainKey="leidos" onExplain={setExplainKey}
        />
        <KpiCard
          icon={XCircle} label="Fallidos" value={(funnelStats.total - funnelStats.accepted).toLocaleString('es-CO')}
          sub={globalStats.topFailReason ? globalStats.topFailReason.slice(0, 40) + (globalStats.topFailReason.length > 40 ? '…' : '') : 'sin errores recientes'}
          iconBg={funnelStats.total - funnelStats.accepted > 0 ? 'bg-red-500' : 'bg-gray-400'}
          valueColor={funnelStats.total - funnelStats.accepted > 0 ? 'text-red-600' : 'text-gray-900'}
          explainKey="fallidos" onExplain={setExplainKey}
        />
      </div>

      {/* ── Embudo de conversión ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-1">Embudo de conversión</h2>
        <p className="text-xs text-gray-400 mb-4">Cantidad y porcentaje frente a la etapa anterior / al total enviado</p>
        {funnelStats.total === 0 ? (
          <div className="flex items-center justify-center h-[120px] text-sm text-gray-300">Sin datos para los filtros aplicados</div>
        ) : (
          <div className="space-y-2.5">
            {funnelSteps.map((step, i) => (
              <div key={step.label} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs font-medium text-gray-500 text-right">{step.label}</span>
                <div className="flex-1 h-8 bg-gray-50 rounded-lg overflow-hidden relative">
                  <div className="h-full rounded-lg flex items-center px-3 transition-all"
                    style={{ width: `${Math.max(step.ofTotal, 3)}%`, background: 'linear-gradient(90deg, #00a884, #22c55e)', opacity: 1 - i * 0.08 }}>
                    <span className="text-xs font-semibold text-white whitespace-nowrap">{step.value.toLocaleString('es-CO')}</span>
                  </div>
                </div>
                <span className="w-36 shrink-0 text-xs text-gray-400 text-left">
                  {i === 0 ? '100%' : <>{step.ofPrevious}% de la etapa anterior · <span className="text-gray-300">{step.ofTotal}% del total</span></>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Overview: charts ── */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Actividad últimos 30 días</h2>
              <p className="text-xs text-gray-400 mt-0.5">Mensajes de campaña aceptados y fallidos por día</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-400 inline-block" /> Aceptados</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" /> Fallidos</span>
            </div>
          </div>
          {recentDays.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-sm text-gray-300">Sin actividad en los últimos 30 días</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={timeline} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="gWaSent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gWaFailed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#9ca3af' }} interval={Math.floor(timeline.length / 7)} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} allowDecimals={false} axisLine={false} tickLine={false} domain={[0, maxDay + 1]} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="sent" name="Aceptados" stroke="#22c55e" strokeWidth={2} fill="url(#gWaSent)" dot={false} />
                <Area type="monotone" dataKey="failed" name="Fallidos" stroke="#ef4444" strokeWidth={2} fill="url(#gWaFailed)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Distribución global</h2>
          <p className="text-xs text-gray-400 mb-4">Todos los destinatarios de campaña</p>
          {pieTotal === 0 ? (
            <div className="flex items-center justify-center h-[160px] text-sm text-gray-300">Sin datos</div>
          ) : (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={46} outerRadius={72} dataKey="value" startAngle={90} endAngle={-270}>
                    {pieData.map((d, i) => <Cell key={i} fill={d.fill} strokeWidth={0} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => v.toLocaleString('es-CO')} />
                </PieChart>
              </ResponsiveContainer>
              <div className="w-full space-y-2 mt-2">
                {pieData.map(entry => (
                  <div key={entry.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-gray-500">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: entry.fill }} />
                      {entry.name}
                    </span>
                    <span className="font-semibold text-gray-800">
                      {entry.value.toLocaleString('es-CO')}
                      <span className="text-gray-400 font-normal ml-1">({Math.round((entry.value / pieTotal) * 100)}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Comparación entre campañas ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
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
          <div className="flex items-center justify-center h-[220px] text-sm text-gray-300">Sin campañas con destinatarios aceptados</div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, comparisonData.length * 34)}>
            <BarChart data={comparisonData} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }} barSize={16}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} unit="%" axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: '#4b5563' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} formatter={(v: any) => `${v}%`} />
              <Bar dataKey="value" name={COMPARISON_METRICS.find(m => m.id === comparisonMetric)?.label} fill="#00a884" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Conversaciones — resumen rápido ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#00a884]/10"><MessagesSquare className="w-4 h-4 text-[#00a884]" /></div>
          <div><p className="text-lg font-bold text-gray-900">{conversationStats.total}</p><p className="text-[11px] text-gray-400">Conversaciones</p></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50"><Inbox className="w-4 h-4 text-blue-500" /></div>
          <div><p className="text-lg font-bold text-gray-900">{conversationStats.open}</p><p className="text-[11px] text-gray-400">Abiertas</p></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gray-100"><MessageCircle className="w-4 h-4 text-gray-500" /></div>
          <div><p className="text-lg font-bold text-gray-900">{conversationStats.closed}</p><p className="text-[11px] text-gray-400">Cerradas</p></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-50"><AlertTriangle className="w-4 h-4 text-orange-500" /></div>
          <div><p className="text-lg font-bold text-gray-900">{conversationStats.unread}</p><p className="text-[11px] text-gray-400">Mensajes sin leer</p></div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 flex-wrap gap-2">
          <div className="flex">
            {([
              { id: 'campanas', label: 'Por campaña', count: filteredCampaigns.length },
              { id: 'destinatarios', label: 'Destinatarios', count: filteredRecipients.length },
              { id: 'fallidos', label: 'Fallidos', count: filteredFailures.length, alert: filteredFailures.length > 0 },
              { id: 'conversaciones', label: 'Conversaciones', count: conversationStats.byNumber.length },
            ] as Array<{ id: typeof tab; label: string; count: number; alert?: boolean }>).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-4 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.id ? 'border-[#00a884] text-[#00a884]' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                  t.alert ? 'bg-red-100 text-red-600' : tab === t.id ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>{t.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab: Por campaña ── */}
        {tab === 'campanas' && (
          <div>
            <div className="flex items-center gap-2 flex-wrap px-5 py-3 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-400 shrink-0">Ver:</span>
              {STAT_FILTERS.map(f => (
                <button
                  key={f.id}
                  onClick={() => setStatFilter(f.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    statFilter === f.id ? `bg-gray-900 border-gray-900 text-white` : `bg-white border-gray-200 ${f.cls} hover:border-gray-400`
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 bg-gray-50/70 border-b border-gray-100">
                  <th className="text-left px-5 py-3 font-medium w-8"></th>
                  <th className="text-left px-2 py-3 font-medium">Campaña</th>
                  <th className="text-center px-3 py-3 font-medium">Estado</th>
                  <button onClick={() => toggleSort('total')} className="contents"><th className="text-right px-3 py-3 font-medium cursor-pointer hover:text-gray-600">
                    <span className="flex items-center justify-end gap-1">Total <SortIcon field="total" /></span>
                  </th></button>
                  {(statFilter === 'all' || statFilter === 'sent') && (
                    <button onClick={() => toggleSort('sent')} className="contents"><th className="text-right px-3 py-3 font-medium cursor-pointer hover:text-gray-600 text-green-600">
                      <span className="flex items-center justify-end gap-1">Aceptados <SortIcon field="sent" /></span>
                    </th></button>
                  )}
                  {(statFilter === 'all' || statFilter === 'delivered') && (
                    <th className="text-right px-3 py-3 font-medium text-blue-600">Entregados</th>
                  )}
                  {(statFilter === 'all' || statFilter === 'read') && (
                    <th className="text-right px-3 py-3 font-medium text-[#008C3C]">Leídos</th>
                  )}
                  {(statFilter === 'all' || statFilter === 'failed') && (
                    <button onClick={() => toggleSort('failed')} className="contents"><th className="text-right px-3 py-3 font-medium cursor-pointer hover:text-gray-600 text-red-500">
                      <span className="flex items-center justify-end gap-1">Fallidos <SortIcon field="failed" /></span>
                    </th></button>
                  )}
                  {statFilter === 'all' && (
                    <button onClick={() => toggleSort('deliveryRate')} className="contents"><th className="text-right px-5 py-3 font-medium cursor-pointer hover:text-gray-600">
                      <span className="flex items-center justify-end gap-1">Entrega <SortIcon field="deliveryRate" /></span>
                    </th></button>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredCampaigns.length === 0 && (
                  <tr><td colSpan={statFilter === 'all' ? 9 : 5} className="text-center py-12 text-sm text-gray-400">Sin campañas para los filtros aplicados</td></tr>
                )}
                {filteredCampaigns.map(row => {
                  const statusCfg = STATUS_LABEL[row.status] ?? { label: row.status, cls: 'bg-gray-100 text-gray-500' };
                  const isOpen = expandedCampaigns.has(row.id);
                  const campaignRecipients = recipientsByCampaign.get(row.id) ?? [];
                  return (
                    <Fragment key={row.id}>
                      <tr className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => toggleExpand(row.id)}>
                        <td className="px-5 py-3.5">
                          {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                        </td>
                        <td className="px-2 py-3.5 max-w-xs">
                          <p className="font-medium text-gray-900 line-clamp-1">{row.name}</p>
                          <p className="text-xs text-gray-400 line-clamp-1">{row.templateName} · {fmtDate(row.createdAt)}{row.companyName ? ` · ${row.companyName}` : ''}</p>
                          {row.error && <p className="text-xs text-red-500 line-clamp-1 mt-0.5">{row.error}</p>}
                        </td>
                        <td className="px-3 py-3.5 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.cls}`}>{statusCfg.label}</span>
                        </td>
                        <td className="px-3 py-3.5 text-right text-gray-600 tabular-nums">{row.total}</td>
                        {(statFilter === 'all' || statFilter === 'sent') && (
                          <td className="px-3 py-3.5 text-right text-green-700 font-semibold tabular-nums">{row.sent}</td>
                        )}
                        {(statFilter === 'all' || statFilter === 'delivered') && (
                          <td className="px-3 py-3.5 text-right text-blue-600 tabular-nums">{row.delivered}</td>
                        )}
                        {(statFilter === 'all' || statFilter === 'read') && (
                          <td className="px-3 py-3.5 text-right text-[#008C3C] tabular-nums">{row.read}</td>
                        )}
                        {(statFilter === 'all' || statFilter === 'failed') && (
                          <td className="px-3 py-3.5 text-right tabular-nums">
                            {row.failed + row.skipped > 0
                              ? <span className="text-red-600 font-semibold">{row.failed}{row.skipped > 0 ? ` (+${row.skipped} omit.)` : ''}</span>
                              : <span className="text-gray-300">0</span>}
                          </td>
                        )}
                        {statFilter === 'all' && (
                          <td className="px-5 py-3.5 text-right">
                            {row.sent > 0 ? <RateBadge rate={row.deliveryRate} /> : <span className="text-xs text-gray-300">—</span>}
                          </td>
                        )}
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={statFilter === 'all' ? 9 : 5} className="p-0 bg-gray-50/60">
                            <div className="px-5 py-4">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-semibold text-gray-500">
                                  {campaignRecipients.length.toLocaleString('es-CO')} destinatario(s) de "{row.name}"
                                </p>
                                <button onClick={e => { e.stopPropagation(); handleExportCampaign(row.id, row.name); }}
                                  className="flex items-center gap-1.5 text-xs font-medium text-[#00a884] hover:underline">
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
                                        <th className="text-left px-3 py-2 font-medium">Estado</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                      {campaignRecipients.map(r => (
                                        <tr key={r.id} className="hover:bg-gray-50/50">
                                          <td className="px-3 py-2">
                                            <p className="font-medium text-gray-800">{r.name}</p>
                                            <p className="text-gray-400 font-mono">+{r.phone}</p>
                                          </td>
                                          <td className="px-3 py-2 text-gray-600">{r.companyName || '—'}</td>
                                          <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmtDateTime(r.sentAt ?? r.createdAt)}</td>
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
          <div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <p className="text-xs text-gray-400">{filteredRecipients.length.toLocaleString('es-CO')} destinatario(s)</p>
              <button onClick={handleExport} className="flex items-center gap-1.5 text-xs font-medium text-[#00a884] hover:underline">
                <Download className="w-3.5 h-3.5" /> Exportar a Excel
              </button>
            </div>
            {filteredRecipients.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <MessageCircle className="w-10 h-10 text-gray-200 mb-2" />
                <p className="text-sm text-gray-400">Sin destinatarios para los filtros aplicados</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 bg-gray-50/70 border-b border-gray-100">
                      <th className="text-left px-5 py-3 font-medium">Destinatario</th>
                      <th className="text-left px-3 py-3 font-medium">Campaña</th>
                      <th className="text-left px-3 py-3 font-medium">Empresa</th>
                      <th className="text-left px-3 py-3 font-medium">Enviado</th>
                      <th className="text-left px-5 py-3 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredRecipients.slice(0, 300).map(r => (
                      <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-gray-900">{r.name}</p>
                          <p className="text-xs text-gray-400 font-mono">+{r.phone}</p>
                        </td>
                        <td className="px-3 py-3.5 max-w-[180px] text-gray-600"><span className="line-clamp-1">{r.campaignName}</span></td>
                        <td className="px-3 py-3.5 text-gray-600 text-xs">{r.companyName || '—'}</td>
                        <td className="px-3 py-3.5 text-gray-400 text-xs whitespace-nowrap">{fmtDateTime(r.sentAt ?? r.createdAt)}</td>
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
                {filteredRecipients.length > 300 && (
                  <p className="text-center text-xs text-gray-400 py-3">Mostrando los primeros 300 — exporta a Excel para ver el listado completo.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Fallidos ── */}
        {tab === 'fallidos' && (
          filteredFailures.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-3"><CheckCircle2 className="w-7 h-7 text-green-400" /></div>
              <p className="text-sm font-medium text-gray-700">Sin envíos fallidos</p>
              <p className="text-xs text-gray-400 mt-1">Todos los mensajes de campaña se aceptaron correctamente</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 bg-gray-50/70 border-b border-gray-100">
                    <th className="text-left px-5 py-3 font-medium">Destinatario</th>
                    <th className="text-left px-3 py-3 font-medium">Campaña</th>
                    <th className="text-left px-3 py-3 font-medium">Fecha</th>
                    <th className="text-left px-5 py-3 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredFailures.map((f, i) => (
                    <tr key={`${f.campaignId}-${f.recipientId}-${i}`} className="hover:bg-red-50/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-gray-900">{f.name}</p>
                        <p className="text-xs text-gray-400 font-mono">+{f.phone}</p>
                      </td>
                      <td className="px-3 py-3.5 text-gray-700 max-w-[180px]"><span className="line-clamp-1">{f.campaignName}</span></td>
                      <td className="px-3 py-3.5 text-gray-400 text-xs whitespace-nowrap">{fmtDate(f.date)}</td>
                      <td className="px-5 py-3.5 max-w-[280px]">
                        <span className="inline-flex items-start gap-1.5 text-red-600 text-xs">
                          <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{f.error}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* ── Tab: Conversaciones ── */}
        {tab === 'conversaciones' && (
          conversationStats.byNumber.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <MessageCircle className="w-10 h-10 text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">No hay números de WhatsApp configurados</p>
            </div>
          ) : (
            <div className="p-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {conversationStats.byNumber.map(n => (
                <div key={n.numberId} className="rounded-xl border border-gray-100 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-[#00a884]/10 flex items-center justify-center"><MessageCircle className="w-4 h-4 text-[#00a884]" /></div>
                    <p className="font-semibold text-gray-800 text-sm truncate">{n.displayName}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-lg font-bold text-gray-900">{n.conversations}</p><p className="text-[10px] text-gray-400">Total</p></div>
                    <div><p className="text-lg font-bold text-blue-600">{n.open}</p><p className="text-[10px] text-gray-400">Abiertas</p></div>
                    <div><p className="text-lg font-bold text-orange-500">{n.unread}</p><p className="text-[10px] text-gray-400">Sin leer</p></div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
      <p className="text-xs text-gray-400 flex items-center gap-1.5">
        <Eye className="w-3.5 h-3.5" /> Los datos de campaña se calculan sobre los destinatarios registrados en cada envío; entregado/leído llega mediante el webhook de Meta.
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
                    <Info className="w-4 h-4 text-[#00a884]" /> {info.title}
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
};
