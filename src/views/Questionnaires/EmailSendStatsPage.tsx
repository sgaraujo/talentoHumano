import { useState, useMemo, useEffect } from 'react';
import {
  RefreshCw, Loader2, Mail, CheckCircle2, XCircle, AlertTriangle,
  TrendingUp, Search, ChevronDown, ChevronUp, Wand2, Download, UserX,
  Eye, EyeOff, Building2, Users,
} from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';
import { useEmailSendStats } from '@/hooks/useEmailSendStats';
import { generateEmailSendReport } from '@/services/reportService';
import { toast } from 'sonner';
import { communicationService } from '@/services/communicationService';
import type { Communication, CommunicationRecipient } from '@/models/types/Communication';

const PIE_COLORS = ['#22c55e', '#ef4444', '#d1d5db'];

function fmtDate(d: Date | null) {
  if (!d) return '—';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function RateBadge({ rate }: { rate: number }) {
  const cls =
    rate >= 90 ? 'bg-green-100 text-green-700' :
    rate >= 70 ? 'bg-yellow-100 text-yellow-700' :
                 'bg-red-100 text-red-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {rate}%
    </span>
  );
}

function MiniBar({ sent, failed, noStatus }: { sent: number; failed: number; noStatus: number }) {
  const total = sent + failed + noStatus;
  if (total === 0) return <span className="text-xs text-gray-300">—</span>;
  const sp = Math.round((sent / total) * 100);
  const fp = Math.round((failed / total) * 100);
  const np = 100 - sp - fp;
  return (
    <div className="flex h-2 rounded-full overflow-hidden w-24 gap-px">
      {sp > 0 && <div className="bg-green-400 rounded-l-full" style={{ width: `${sp}%` }} />}
      {fp > 0 && <div className="bg-red-400" style={{ width: `${fp}%` }} />}
      {np > 0 && <div className="bg-gray-200 rounded-r-full" style={{ width: `${np}%` }} />}
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, sub, iconBg, valueColor = 'text-gray-900',
}: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; iconBg: string; valueColor?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
      <div className={`p-3 rounded-xl flex-shrink-0 ${iconBg}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-bold mt-0.5 ${valueColor}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 shadow-lg rounded-xl p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-semibold text-gray-800">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

type SortField = 'total' | 'sent' | 'failed' | 'deliveryRate';

export const EmailSendStatsPage = () => {
  const {
    loading, error, refresh,
    globalStats, byProject, byQuestionnaire, byRole, failures, timeline, noProjectUsers,
  } = useEmailSendStats();

  const [tab, setTab] = useState<'cuestionarios' | 'proyectos' | 'fallidos' | 'comunicados'>('cuestionarios');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showNoProject, setShowNoProject] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [migrating, setMigrating] = useState(false);

  // ── Comunicados tab state ─────────────────────────────────────────────────
  const [comms, setComms] = useState<Communication[]>([]);
  const [commsLoading, setCommsLoading] = useState(false);
  const [expandedCommId, setExpandedCommId] = useState<string | null>(null);
  const [commRecipients, setCommRecipients] = useState<Record<string, CommunicationRecipient[]>>({});
  const [commRecLoading, setCommRecLoading] = useState<Record<string, boolean>>({});
  const [commChartTab, setCommChartTab] = useState<Record<string, 'empresa' | 'proyecto'>>({});

  useEffect(() => {
    if (tab !== 'comunicados') return;
    if (comms.length > 0) return;
    setCommsLoading(true);
    communicationService.getAll()
      .then(c => setComms(c))
      .catch(() => {})
      .finally(() => setCommsLoading(false));
  }, [tab, comms.length]);

  const toggleComm = async (commId: string) => {
    if (expandedCommId === commId) { setExpandedCommId(null); return; }
    setExpandedCommId(commId);
    if (commRecipients[commId]) return;
    setCommRecLoading(prev => ({ ...prev, [commId]: true }));
    try {
      const recs = await communicationService.getRecipients(commId);
      setCommRecipients(prev => ({ ...prev, [commId]: recs }));
    } catch (_) {}
    setCommRecLoading(prev => ({ ...prev, [commId]: false }));
  };

  const handleMigrate = async () => {
    if (!confirm('¿Marcar como "enviados" todos los registros anteriores al tracking?\n\nEsta acción es irreversible.')) return;
    setMigrating(true);
    try {
      const fn = httpsCallable(functions, 'migrateEmailStatuses');
      const res: any = await fn();
      toast.success('Migración completada', {
        description: `Marcados como enviados: ${res.data.markedSent} · Sin cuestionario: ${res.data.markedLegacy}`,
      });
      refresh();
    } catch (e: any) {
      toast.error('Error en migración', { description: e.message });
    } finally {
      setMigrating(false);
    }
  };

  const handleGeneratePdf = async () => {
    setGeneratingPdf(true);
    try {
      generateEmailSendReport({ globalStats, byProject, byQuestionnaire, byRole, failures, timeline });
      toast.success('Informe generado correctamente');
    } catch (e: any) {
      toast.error('Error al generar el informe', { description: e.message });
    } finally {
      setGeneratingPdf(false);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: SortField }) =>
    sortField === field
      ? (sortDir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)
      : <ChevronDown className="w-3 h-3 opacity-30" />;

  // Datos filtrados y ordenados — cuestionarios
  const filteredQ = useMemo(() => {
    const q = search.toLowerCase();
    return byQuestionnaire
      .filter(r => r.total > 0 && r.title.toLowerCase().includes(q))
      .sort((a, b) => {
        const diff = (a[sortField] as number) - (b[sortField] as number);
        return sortDir === 'desc' ? -diff : diff;
      });
  }, [byQuestionnaire, search, sortField, sortDir]);

  // Datos filtrados — proyectos (separa "Sin proyecto" al fondo)
  const noProjectRow = byProject.find(r => r.projectId === 'sin-proyecto');
  const filteredP = useMemo(() => {
    const q = search.toLowerCase();
    return byProject
      .filter(r => r.projectId !== 'sin-proyecto' && r.projectName.toLowerCase().includes(q))
      .sort((a, b) => {
        const diff = (a[sortField] as number) - (b[sortField] as number);
        return sortDir === 'desc' ? -diff : diff;
      });
  }, [byProject, search, sortField, sortDir]);

  // Pie data — solo enviados con tracking
  const pieData = [
    { name: 'Entregados', value: globalStats.sent },
    { name: 'Fallidos',   value: globalStats.failed },
    { name: 'Sin estado', value: globalStats.noStatus },
  ].filter(d => d.value > 0);

  // Timeline — últimos 30 días
  const recentDays = timeline.filter(t => t.sent + t.failed > 0);
  const maxDay = Math.max(...timeline.map(t => t.sent + t.failed), 1);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-gray-500">
      <AlertTriangle className="w-10 h-10 text-red-300" />
      <p className="text-sm">{error}</p>
      <button onClick={refresh} className="text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50">Reintentar</button>
    </div>
  );

  const trackingTotal = globalStats.sent + globalStats.failed;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estadísticas de Correos</h1>
          <p className="text-sm text-gray-400 mt-0.5">Seguimiento de entregas de cuestionarios por correo electrónico</p>
        </div>
        <div className="flex items-center gap-2">
          {globalStats.noStatus > 0 && (
            <button
              onClick={handleMigrate}
              disabled={migrating}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-amber-200 text-amber-700 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50"
            >
              {migrating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              Corregir sin estado ({globalStats.noStatus.toLocaleString('es-CO')})
            </button>
          )}
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors text-gray-600"
          >
            <RefreshCw className="w-4 h-4" />
            Actualizar
          </button>
          <button
            onClick={handleGeneratePdf}
            disabled={generatingPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#008C3C] hover:bg-[#006C2F] text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Informe PDF
          </button>
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Mail}
          label="Total registros"
          value={globalStats.total.toLocaleString('es-CO')}
          sub={`${globalStats.noStatus.toLocaleString('es-CO')} sin tracking`}
          iconBg="bg-blue-500"
        />
        <KpiCard
          icon={TrendingUp}
          label="Tasa de entrega"
          value={`${globalStats.deliveryRate}%`}
          sub={`sobre ${trackingTotal.toLocaleString('es-CO')} con tracking`}
          iconBg="bg-[#008C3C]"
          valueColor={globalStats.deliveryRate >= 90 ? 'text-green-600' : globalStats.deliveryRate >= 70 ? 'text-yellow-600' : 'text-red-600'}
        />
        <KpiCard
          icon={CheckCircle2}
          label="Entregados"
          value={globalStats.sent.toLocaleString('es-CO')}
          sub="correos confirmados"
          iconBg="bg-green-500"
        />
        <KpiCard
          icon={XCircle}
          label="Fallidos"
          value={globalStats.failed.toLocaleString('es-CO')}
          sub={globalStats.topFailReason ? globalStats.topFailReason.slice(0, 35) + '…' : 'sin errores recientes'}
          iconBg={globalStats.failed > 0 ? 'bg-red-500' : 'bg-gray-400'}
          valueColor={globalStats.failed > 0 ? 'text-red-600' : 'text-gray-900'}
        />
      </div>

      {/* ── Overview: charts ────────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* Actividad últimos 30 días — 2/3 del ancho */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Actividad últimos 30 días</h2>
              <p className="text-xs text-gray-400 mt-0.5">Correos enviados y fallidos por día</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-400 inline-block" /> Entregados</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" /> Fallidos</span>
            </div>
          </div>
          {recentDays.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-sm text-gray-300">Sin actividad en los últimos 30 días</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={timeline} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gFailed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#9ca3af' }} interval={Math.floor(timeline.length / 7)} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} allowDecimals={false} axisLine={false} tickLine={false} domain={[0, maxDay + 1]} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="sent"   name="Entregados" stroke="#22c55e" strokeWidth={2} fill="url(#gSent)"   dot={false} />
                <Area type="monotone" dataKey="failed" name="Fallidos"   stroke="#ef4444" strokeWidth={2} fill="url(#gFailed)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Donut distribución — 1/3 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Distribución global</h2>
          <p className="text-xs text-gray-400 mb-4">Todos los registros</p>
          <div className="flex flex-col items-center">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%" cy="50%"
                  innerRadius={46} outerRadius={72}
                  dataKey="value"
                  startAngle={90} endAngle={-270}
                >
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} strokeWidth={0} />)}
                </Pie>
                <Tooltip formatter={(v: any) => v.toLocaleString('es-CO')} />
              </PieChart>
            </ResponsiveContainer>
            <div className="w-full space-y-2 mt-2">
              {pieData.map((entry, i) => (
                <div key={entry.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-gray-500">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i] }} />
                    {entry.name}
                  </span>
                  <span className="font-semibold text-gray-800">
                    {entry.value.toLocaleString('es-CO')}
                    <span className="text-gray-400 font-normal ml-1">
                      ({globalStats.total > 0 ? Math.round((entry.value / globalStats.total) * 100) : 0}%)
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

        {/* Tab bar */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5">
          <div className="flex">
            {([
              { id: 'cuestionarios', label: 'Por Cuestionario', count: byQuestionnaire.filter(r => r.total > 0).length },
              { id: 'proyectos',     label: 'Por Proyecto',     count: byProject.length },
              { id: 'comunicados',   label: 'Comunicados',      count: comms.length },
              { id: 'fallidos',      label: 'Fallidos',         count: failures.length, alert: failures.length > 0 },
            ] as Array<{ id: typeof tab; label: string; count: number; alert?: boolean }>).map(t => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setSearch(''); }}
                className={`flex items-center gap-2 px-4 py-4 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.id
                    ? 'border-[#008C3C] text-[#008C3C]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                  t.alert
                    ? 'bg-red-100 text-red-600'
                    : tab === t.id ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              className="h-8 pl-8 pr-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008C3C]/20 w-48"
              placeholder="Buscar..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* ── Tab: Cuestionarios ──────────────────────────────────────────────── */}
        {tab === 'cuestionarios' && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 bg-gray-50/70 border-b border-gray-100">
                    <th className="text-left px-5 py-3 font-medium">Cuestionario</th>
                    <th className="text-center px-3 py-3 font-medium">Estado</th>
                    <button onClick={() => toggleSort('total')}
                      className="contents"><th className="text-right px-3 py-3 font-medium cursor-pointer hover:text-gray-600">
                        <span className="flex items-center justify-end gap-1">Total <SortIcon field="total" /></span>
                    </th></button>
                    <button onClick={() => toggleSort('sent')}
                      className="contents"><th className="text-right px-3 py-3 font-medium cursor-pointer hover:text-gray-600 text-green-600">
                        <span className="flex items-center justify-end gap-1">Entregados <SortIcon field="sent" /></span>
                    </th></button>
                    <button onClick={() => toggleSort('failed')}
                      className="contents"><th className="text-right px-3 py-3 font-medium cursor-pointer hover:text-gray-600 text-red-500">
                        <span className="flex items-center justify-end gap-1">Fallidos <SortIcon field="failed" /></span>
                    </th></button>
                    <button onClick={() => toggleSort('deliveryRate')}
                      className="contents"><th className="text-right px-5 py-3 font-medium cursor-pointer hover:text-gray-600">
                        <span className="flex items-center justify-end gap-1">Tasa <SortIcon field="deliveryRate" /></span>
                    </th></button>
                    <th className="px-5 py-3 font-medium w-28">Distribución</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredQ.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-12 text-sm text-gray-400">Sin resultados</td></tr>
                  )}
                  {filteredQ.map(row => (
                    <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5 max-w-xs">
                        <p className="font-medium text-gray-900 line-clamp-1">{row.title}</p>
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${row.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                          {row.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-right text-gray-600 tabular-nums">{row.total}</td>
                      <td className="px-3 py-3.5 text-right text-green-700 font-semibold tabular-nums">{row.sent}</td>
                      <td className="px-3 py-3.5 text-right tabular-nums">
                        {row.failed > 0
                          ? <span className="text-red-600 font-semibold">{row.failed}</span>
                          : <span className="text-gray-300">0</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {row.sent + row.failed > 0
                          ? <RateBadge rate={row.deliveryRate} />
                          : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <MiniBar sent={row.sent} failed={row.failed} noStatus={row.total - row.sent - row.failed} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mini bar chart top cuestionarios */}
            {filteredQ.length >= 3 && (
              <div className="border-t border-gray-100 p-5">
                <p className="text-xs font-medium text-gray-500 mb-3">Top cuestionarios por envíos</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart
                    data={filteredQ.slice(0, 8).map(r => ({
                      name: r.title.length > 18 ? r.title.slice(0, 16) + '…' : r.title,
                      Entregados: r.sent,
                      Fallidos: r.failed,
                    }))}
                    margin={{ top: 0, right: 8, left: -24, bottom: 36 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#9ca3af' }} angle={-25} textAnchor="end" axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} allowDecimals={false} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="Entregados" fill="#22c55e" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Fallidos"   fill="#ef4444" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}

        {/* ── Tab: Proyectos ──────────────────────────────────────────────────── */}
        {tab === 'proyectos' && (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 bg-gray-50/70 border-b border-gray-100">
                    <th className="text-left px-5 py-3 font-medium">Proyecto</th>
                    <button onClick={() => toggleSort('total')} className="contents">
                      <th className="text-right px-3 py-3 font-medium cursor-pointer hover:text-gray-600">
                        <span className="flex items-center justify-end gap-1">Total <SortIcon field="total" /></span>
                      </th>
                    </button>
                    <button onClick={() => toggleSort('sent')} className="contents">
                      <th className="text-right px-3 py-3 font-medium cursor-pointer hover:text-gray-600 text-green-600">
                        <span className="flex items-center justify-end gap-1">Entregados <SortIcon field="sent" /></span>
                      </th>
                    </button>
                    <button onClick={() => toggleSort('failed')} className="contents">
                      <th className="text-right px-3 py-3 font-medium cursor-pointer hover:text-gray-600 text-red-500">
                        <span className="flex items-center justify-end gap-1">Fallidos <SortIcon field="failed" /></span>
                      </th>
                    </button>
                    <button onClick={() => toggleSort('deliveryRate')} className="contents">
                      <th className="text-right px-5 py-3 font-medium cursor-pointer hover:text-gray-600">
                        <span className="flex items-center justify-end gap-1">Tasa <SortIcon field="deliveryRate" /></span>
                      </th>
                    </button>
                    <th className="px-5 py-3 font-medium w-28">Distribución</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredP.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-12 text-sm text-gray-400">Sin resultados</td></tr>
                  )}
                  {filteredP.map(row => (
                    <tr key={row.projectId} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-gray-900">{row.projectName}</td>
                      <td className="px-3 py-3.5 text-right text-gray-600 tabular-nums">{row.total}</td>
                      <td className="px-3 py-3.5 text-right text-green-700 font-semibold tabular-nums">{row.sent}</td>
                      <td className="px-3 py-3.5 text-right tabular-nums">
                        {row.failed > 0
                          ? <span className="text-red-600 font-semibold">{row.failed}</span>
                          : <span className="text-gray-300">0</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {row.sent + row.failed > 0
                          ? <RateBadge rate={row.deliveryRate} />
                          : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <MiniBar sent={row.sent} failed={row.failed} noStatus={row.noStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Sección "Sin proyecto" colapsable con detalle por usuario */}
            {noProjectRow && (
              <div className="border-t border-dashed border-gray-200">
                <button
                  onClick={() => setShowNoProject(v => !v)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50/60 transition-colors"
                >
                  <span className="flex items-center gap-2.5">
                    <UserX className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-500">Sin proyecto asignado</span>
                    <span className="text-xs text-gray-400">
                      {noProjectUsers.length} usuario{noProjectUsers.length !== 1 ? 's' : ''} · {noProjectRow.total.toLocaleString('es-CO')} registros
                    </span>
                    {noProjectRow.failed > 0 && (
                      <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full font-medium">
                        {noProjectRow.failed} fallidos
                      </span>
                    )}
                  </span>
                  {showNoProject ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                </button>

                {showNoProject && (
                  <div className="border-t border-gray-100 bg-gray-50/30">
                    {/* Resumen */}
                    <div className="flex items-center gap-6 px-5 py-3 text-xs text-gray-500 border-b border-gray-100">
                      <span>Total registros: <strong className="text-gray-700">{noProjectRow.total.toLocaleString('es-CO')}</strong></span>
                      <span className="text-green-600">Entregados: <strong>{noProjectRow.sent.toLocaleString('es-CO')}</strong></span>
                      <span className="text-red-500">Fallidos: <strong>{noProjectRow.failed.toLocaleString('es-CO')}</strong></span>
                      <span className="text-gray-400">Legacy (sin tracking): <strong>{noProjectRow.noStatus.toLocaleString('es-CO')}</strong></span>
                    </div>

                    {/* Tabla de usuarios */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-400 border-b border-gray-100">
                            <th className="text-left px-5 py-2.5 font-medium">Nombre</th>
                            <th className="text-left px-3 py-2.5 font-medium">Correo</th>
                            <th className="text-left px-3 py-2.5 font-medium">Rol</th>
                            <th className="text-left px-3 py-2.5 font-medium">Empresa</th>
                            <th className="text-right px-3 py-2.5 font-medium">Cuestionarios</th>
                            <th className="text-right px-3 py-2.5 font-medium text-green-600">Entregados</th>
                            <th className="text-right px-3 py-2.5 font-medium text-red-500">Fallidos</th>
                            <th className="text-left px-5 py-2.5 font-medium">Última actividad</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {noProjectUsers.map(u => (
                            <tr key={u.userId} className="hover:bg-white/60 transition-colors">
                              <td className="px-5 py-2.5 font-medium text-gray-800">{u.userName}</td>
                              <td className="px-3 py-2.5 text-gray-500">{u.userEmail}</td>
                              <td className="px-3 py-2.5">
                                <span className="capitalize text-gray-500">{u.role}</span>
                              </td>
                              <td className="px-3 py-2.5 text-gray-500 max-w-[140px]">
                                <span className="line-clamp-1">{u.company}</span>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className="font-semibold text-gray-700">{u.assignments}</span>
                                {u.questionnaires.length > 0 && (
                                  <span className="block text-gray-400 text-[10px] mt-0.5 line-clamp-1 max-w-[140px] text-right">
                                    {u.questionnaires.slice(0, 2).join(', ')}{u.questionnaires.length > 2 ? ` +${u.questionnaires.length - 2}` : ''}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right text-green-700 font-semibold tabular-nums">{u.sent}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">
                                {u.failed > 0
                                  ? <span className="text-red-600 font-semibold">{u.failed}</span>
                                  : <span className="text-gray-300">0</span>}
                              </td>
                              <td className="px-5 py-2.5 text-gray-400 whitespace-nowrap">{fmtDate(u.lastActivity)}</td>
                            </tr>
                          ))}
                          {noProjectUsers.length === 0 && (
                            <tr><td colSpan={8} className="px-5 py-6 text-center text-gray-400">Sin usuarios identificados</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <p className="px-5 py-2.5 text-xs text-gray-400 border-t border-gray-100">
                      Estos usuarios no tienen proyecto asignado en su perfil. Ve a Usuarios → edita su perfil → asigna un proyecto.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Comunicados ────────────────────────────────────────────────── */}
        {tab === 'comunicados' && (
          commsLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-gray-300" /></div>
          ) : comms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Mail className="w-10 h-10 text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">No hay comunicados enviados</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {comms
                .filter(c => !search || c.title.toLowerCase().includes(search.toLowerCase()))
                .map(comm => {
                  const isExp = expandedCommId === comm.id;
                  const recs = commRecipients[comm.id] ?? [];
                  const recLoading = commRecLoading[comm.id] ?? false;
                  const pending = comm.totalSent - comm.totalRead;
                  const rate = comm.totalSent > 0 ? Math.round((comm.totalRead / comm.totalSent) * 100) : 0;
                  const rateColor = rate >= 80 ? '#008C3C' : rate >= 50 ? '#ca8a04' : '#dc2626';

                  // Chart data (computed only when expanded + recs loaded)
                  const pieData = [
                    { name: 'Leídos', value: recs.filter(r => r.status === 'read').length, fill: '#008C3C' },
                    { name: 'Pendientes', value: recs.filter(r => r.status === 'pending').length, fill: '#f97316' },
                  ];
                  const allCompanies = [...new Set(recs.map(r => r.company).filter(Boolean))].sort();
                  const barByCompany = allCompanies.map(co => {
                    const coRecs = recs.filter(r => r.company === co);
                    return {
                      name: co.length > 18 ? co.slice(0, 17) + '…' : co,
                      Leídos: coRecs.filter(r => r.status === 'read').length,
                      Pendientes: coRecs.filter(r => r.status === 'pending').length,
                    };
                  }).sort((a, b) => (b.Leídos + b.Pendientes) - (a.Leídos + a.Pendientes));
                  const allProjects = [...new Set(recs.map(r => r.project).filter(Boolean))].sort();
                  const barByProject = allProjects.map(proj => {
                    const pRecs = recs.filter(r => r.project === proj);
                    return {
                      name: proj.length > 18 ? proj.slice(0, 17) + '…' : proj,
                      Leídos: pRecs.filter(r => r.status === 'read').length,
                      Pendientes: pRecs.filter(r => r.status === 'pending').length,
                    };
                  }).sort((a, b) => (b.Leídos + b.Pendientes) - (a.Leídos + a.Pendientes));
                  const curTab = commChartTab[comm.id] ?? 'empresa';
                  const activeBar = curTab === 'empresa' ? barByCompany : barByProject;

                  return (
                    <div key={comm.id}>
                      {/* Row */}
                      <button
                        onClick={() => toggleComm(comm.id)}
                        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/60 transition-colors text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{comm.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {comm.sentAt.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                            {comm.targetName ? ` · ${comm.targetName}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0 text-sm">
                          <span className="flex items-center gap-1 text-gray-500">
                            <Users className="w-3 h-3" /> {comm.totalSent}
                          </span>
                          <span className="text-[#008C3C] font-semibold tabular-nums">{comm.totalRead} leídos</span>
                          <span className={`tabular-nums text-xs ${pending > 0 ? 'text-orange-500' : 'text-gray-300'}`}>
                            {pending} pend.
                          </span>
                          <div className="flex items-center gap-1.5 w-28">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${rate}%`, background: rateColor }} />
                            </div>
                            <span className="text-xs font-semibold tabular-nums" style={{ color: rateColor }}>{rate}%</span>
                          </div>
                          {isExp
                            ? <EyeOff className="w-3.5 h-3.5 text-gray-400" />
                            : <Eye className="w-3.5 h-3.5 text-gray-400" />}
                        </div>
                      </button>

                      {/* Detail panel */}
                      {isExp && (
                        <div className="bg-gray-50/60 border-t border-b border-gray-100">
                          {recLoading ? (
                            <div className="flex justify-center py-8">
                              <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
                            </div>
                          ) : (
                            <div className="px-5 py-4 space-y-4">
                              {/* KPIs */}
                              <div className="grid grid-cols-3 gap-3">
                                {[
                                  { label: 'Enviados', value: comm.totalSent, color: 'text-gray-700', bg: 'bg-white' },
                                  { label: 'Leídos', value: comm.totalRead, color: 'text-[#008C3C]', bg: 'bg-green-50' },
                                  { label: 'Pendientes', value: pending, color: pending > 0 ? 'text-orange-500' : 'text-gray-300', bg: pending > 0 ? 'bg-orange-50' : 'bg-white' },
                                ].map(s => (
                                  <div key={s.label} className={`${s.bg} rounded-xl border border-gray-100 p-3 text-center`}>
                                    <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                                    <p className="text-[10px] text-gray-400 mt-0.5">{s.label}</p>
                                  </div>
                                ))}
                              </div>

                              {/* Charts */}
                              {recs.length > 0 && (
                                <div className="flex flex-col sm:flex-row gap-4">
                                  {/* Donut */}
                                  <div className="flex flex-col items-center flex-shrink-0">
                                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">General</p>
                                    <div className="relative">
                                      <ResponsiveContainer width={130} height={120}>
                                        <PieChart>
                                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={32} outerRadius={50} dataKey="value" strokeWidth={0}>
                                            {pieData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                                          </Pie>
                                          <Tooltip formatter={(v) => v} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                                        </PieChart>
                                      </ResponsiveContainer>
                                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="text-center">
                                          <p className="text-sm font-bold text-gray-700">{rate}%</p>
                                          <p className="text-[9px] text-gray-400">apertura</p>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex gap-2 mt-0.5">
                                      <span className="flex items-center gap-1 text-[10px] text-gray-600">
                                        <span className="w-2 h-2 rounded-full bg-[#008C3C]" />Leídos ({comm.totalRead})
                                      </span>
                                      <span className="flex items-center gap-1 text-[10px] text-gray-600">
                                        <span className="w-2 h-2 rounded-full bg-orange-400" />Pend. ({pending})
                                      </span>
                                    </div>
                                  </div>

                                  {/* Bar por empresa / proyecto */}
                                  {activeBar.length > 0 && (
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between mb-1.5">
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                                          {curTab === 'empresa'
                                            ? <><Building2 className="w-3 h-3" /> Por empresa</>
                                            : <><Users className="w-3 h-3" /> Por proyecto</>}
                                        </p>
                                        {allProjects.length > 0 && (
                                          <div className="flex rounded overflow-hidden border border-gray-200 text-[10px]">
                                            <button
                                              onClick={() => setCommChartTab(p => ({ ...p, [comm.id]: 'empresa' }))}
                                              className={`px-2 py-0.5 font-medium transition-colors ${curTab === 'empresa' ? 'bg-[#008C3C] text-white' : 'bg-white text-gray-400 hover:bg-gray-50'}`}>
                                              Empresa
                                            </button>
                                            <button
                                              onClick={() => setCommChartTab(p => ({ ...p, [comm.id]: 'proyecto' }))}
                                              className={`px-2 py-0.5 font-medium transition-colors ${curTab === 'proyecto' ? 'bg-[#008C3C] text-white' : 'bg-white text-gray-400 hover:bg-gray-50'}`}>
                                              Proyecto
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                      <ResponsiveContainer width="100%" height={Math.max(80, activeBar.length * 30)}>
                                        <BarChart data={activeBar} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barSize={9}>
                                          <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                                          <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                                          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                                          <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                                          <Bar dataKey="Leídos" fill="#008C3C" radius={[0, 3, 3, 0]} />
                                          <Bar dataKey="Pendientes" fill="#f97316" radius={[0, 3, 3, 0]} />
                                        </BarChart>
                                      </ResponsiveContainer>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Recipients table */}
                              {recs.length > 0 && (
                                <div className="rounded-xl border border-gray-100 overflow-hidden bg-white">
                                  <div className="max-h-52 overflow-y-auto">
                                    <table className="w-full text-xs">
                                      <thead className="sticky top-0 bg-gray-50/90">
                                        <tr className="text-gray-400 border-b border-gray-100">
                                          <th className="text-left px-3 py-2 font-medium">Nombre</th>
                                          <th className="text-left px-3 py-2 font-medium">Empresa</th>
                                          <th className="text-left px-3 py-2 font-medium">Proyecto</th>
                                          <th className="text-center px-3 py-2 font-medium">Estado</th>
                                          <th className="text-left px-3 py-2 font-medium">Leído el</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-50">
                                        {recs
                                          .sort((a, b) => a.status === b.status ? 0 : a.status === 'pending' ? -1 : 1)
                                          .map(r => (
                                            <tr key={r.id} className="hover:bg-gray-50/50">
                                              <td className="px-3 py-2">
                                                <p className="font-medium text-gray-800 truncate max-w-[140px]">{r.userName}</p>
                                                <p className="text-gray-400 truncate max-w-[140px]">{r.userEmail}</p>
                                              </td>
                                              <td className="px-3 py-2 text-gray-500 max-w-[100px]">
                                                <span className="line-clamp-1">{r.company || '—'}</span>
                                              </td>
                                              <td className="px-3 py-2 text-gray-500 max-w-[100px]">
                                                <span className="line-clamp-1">{r.project || '—'}</span>
                                              </td>
                                              <td className="px-3 py-2 text-center">
                                                <span className={`inline-flex px-1.5 py-0.5 rounded-full font-medium text-[10px] ${
                                                  r.status === 'read'
                                                    ? 'bg-green-100 text-green-700'
                                                    : 'bg-orange-100 text-orange-600'
                                                }`}>
                                                  {r.status === 'read' ? 'Leído' : 'Pendiente'}
                                                </span>
                                              </td>
                                              <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                                                {r.readAt ? r.readAt.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) : '—'}
                                              </td>
                                            </tr>
                                          ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )
        )}

        {/* ── Tab: Fallidos ───────────────────────────────────────────────────── */}
        {tab === 'fallidos' && (
          failures.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-7 h-7 text-green-400" />
              </div>
              <p className="text-sm font-medium text-gray-700">Sin correos fallidos</p>
              <p className="text-xs text-gray-400 mt-1">Todos los correos se entregaron correctamente</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 bg-gray-50/70 border-b border-gray-100">
                    <th className="text-left px-5 py-3 font-medium">Persona</th>
                    <th className="text-left px-3 py-3 font-medium">Correo</th>
                    <th className="text-left px-3 py-3 font-medium">Cuestionario</th>
                    <th className="text-left px-3 py-3 font-medium">Fecha</th>
                    <th className="text-left px-5 py-3 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {failures
                    .filter(f => !search || f.userName.toLowerCase().includes(search) || f.userEmail.toLowerCase().includes(search) || f.questionnaireTitle.toLowerCase().includes(search))
                    .map(f => (
                      <tr key={f.assignmentId} className="hover:bg-red-50/40 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-gray-900">{f.userName}</td>
                        <td className="px-3 py-3.5 text-gray-500 text-xs">{f.userEmail}</td>
                        <td className="px-3 py-3.5 text-gray-700 max-w-[180px]">
                          <span className="line-clamp-1">{f.questionnaireTitle}</span>
                        </td>
                        <td className="px-3 py-3.5 text-gray-400 text-xs whitespace-nowrap">{fmtDate(f.assignedAt)}</td>
                        <td className="px-5 py-3.5 max-w-[240px]">
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
      </div>
    </div>
  );
};
