import { useState } from 'react';
import {
  RefreshCw, Loader2, CheckCircle2, Clock, AlertTriangle, TrendingUp,
  Users, FileText, FolderKanban, BarChart2, ChevronDown, ChevronUp,
  Building2, Search,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { useQuestionnaireStats } from '@/hooks/useQuestionnaireStats';
import type { QuestionnaireStatRow } from '@/hooks/useQuestionnaireStats';

const ROLE_LABELS: Record<string, string> = {
  colaborador: 'Colaborador',
  lider: 'Líder',
  aspirante: 'Aspirante',
  excolaborador: 'Excolaborador',
  descartado: 'Descartado',
  desconocido: 'Desconocido',
};

const PIE_COLORS = ['#22c55e', '#f97316'];

function RateBar({ rate, size = 'md' }: { rate: number; size?: 'sm' | 'md' }) {
  const color = rate >= 80 ? 'bg-green-500' : rate >= 50 ? 'bg-yellow-400' : 'bg-red-400';
  const h = size === 'sm' ? 'h-1.5' : 'h-2';
  return (
    <div className={`w-full bg-gray-100 rounded-full overflow-hidden ${h}`}>
      <div className={`${h} ${color} rounded-full transition-all`} style={{ width: `${rate}%` }} />
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

function QuestionnaireDetailPanel({ row, details }: {
  row: QuestionnaireStatRow;
  details: ReturnType<typeof useQuestionnaireStats>['questionnaireDetails'];
}) {
  const [recSearch, setRecSearch] = useState('');
  const [recFilter, setRecFilter] = useState<'all' | 'completed' | 'pending'>('all');
  const d = details.get(row.id);
  if (!d) return <div className="p-6 text-sm text-gray-400">Cargando detalle...</div>;

  const pieData = [
    { name: 'Respondieron', value: row.completed },
    { name: 'Pendientes',   value: row.pending },
  ].filter(v => v.value > 0);

  const filteredRec = d.recipients.filter(r => {
    const matchSearch = !recSearch ||
      r.userName.toLowerCase().includes(recSearch) ||
      r.userEmail.toLowerCase().includes(recSearch) ||
      r.company.toLowerCase().includes(recSearch);
    const matchFilter = recFilter === 'all' || r.status === recFilter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="border-t border-gray-100 bg-gray-50/40 p-5 space-y-5">

      {/* KPIs del cuestionario */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{row.assigned}</p>
          <p className="text-xs text-gray-400 mt-0.5">Enviados</p>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-100 p-4 text-center">
          <p className="text-2xl font-bold text-green-700">{row.completed}</p>
          <p className="text-xs text-green-600 mt-0.5">Respondieron</p>
        </div>
        <div className="bg-orange-50 rounded-xl border border-orange-100 p-4 text-center">
          <p className="text-2xl font-bold text-orange-600">{row.pending}</p>
          <p className="text-xs text-orange-500 mt-0.5">Pendientes</p>
        </div>
      </div>

      {/* Barra de progreso */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>Tasa de respuesta</span>
          <span className="font-semibold text-gray-800">{row.rate}%</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${row.rate >= 80 ? 'bg-green-500' : row.rate >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
            style={{ width: `${row.rate}%` }}
          />
        </div>
      </div>

      {/* Charts: donut + barras por empresa */}
      {d.byCompany.length > 0 && (
        <div className="grid md:grid-cols-5 gap-4">

          {/* Donut general */}
          <div className="md:col-span-2 bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">General</p>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={110} height={110}>
                <PieChart>
                  <Pie
                    data={pieData} cx="50%" cy="50%"
                    innerRadius={30} outerRadius={50}
                    dataKey="value" startAngle={90} endAngle={-270}
                  >
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} strokeWidth={0} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => v.toLocaleString('es-CO')} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1">
                {pieData.map((e, i) => (
                  <div key={e.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-gray-500">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i] }} />
                      {e.name}
                    </span>
                    <span className="font-semibold text-gray-800">{e.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bar chart por empresa */}
          <div className="md:col-span-3 bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Por Empresa</p>
            <ResponsiveContainer width="100%" height={Math.max(110, d.byCompany.length * 30)}>
              <BarChart
                layout="vertical"
                data={d.byCompany.map(c => ({
                  name: c.company.length > 22 ? c.company.slice(0, 20) + '…' : c.company,
                  Respondieron: c.completed,
                  Pendientes: c.pending,
                }))}
                margin={{ top: 0, right: 8, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#6b7280' }} width={100} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Bar dataKey="Respondieron" fill="#22c55e" radius={[0, 3, 3, 0]} stackId="a" />
                <Bar dataKey="Pendientes"   fill="#f97316" radius={[0, 3, 3, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Por proyecto */}
      {d.byProject.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <FolderKanban className="w-3.5 h-3.5" /> Por Proyecto
          </p>
          <div className="space-y-2">
            {d.byProject.map(p => (
              <div key={p.projectId} className="flex items-center gap-3 text-xs">
                <span className="text-gray-700 w-36 shrink-0 truncate">{p.projectName}</span>
                <div className="flex-1">
                  <RateBar rate={p.rate} size="sm" />
                </div>
                <span className="text-gray-500 tabular-nums w-8 text-right">{p.rate}%</span>
                <span className="text-gray-400 tabular-nums w-16 text-right">{p.completed}/{p.assigned}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de destinatarios */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Destinatarios ({row.assigned})
          </p>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
              {(['all', 'pending', 'completed'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setRecFilter(f)}
                  className={`px-2.5 py-1 transition-colors ${recFilter === f ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  {f === 'all' ? 'Todos' : f === 'pending' ? 'Pendientes' : 'Respondieron'}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
              <input
                className="pl-7 pr-3 py-1 text-xs border border-gray-200 rounded-lg w-40 focus:outline-none focus:ring-1 focus:ring-green-300"
                placeholder="Buscar..."
                value={recSearch}
                onChange={e => setRecSearch(e.target.value.toLowerCase())}
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
              <tr className="text-gray-400">
                <th className="text-left px-4 py-2 font-medium">Nombre</th>
                <th className="text-left px-3 py-2 font-medium">Correo</th>
                <th className="text-left px-3 py-2 font-medium">
                  <Building2 className="w-3 h-3 inline mr-1" />Empresa
                </th>
                <th className="text-center px-3 py-2 font-medium">Estado</th>
                <th className="text-right px-4 py-2 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredRec.length === 0 && (
                <tr><td colSpan={5} className="text-center py-6 text-gray-400">Sin resultados</td></tr>
              )}
              {filteredRec.map(r => (
                <tr key={r.userId + r.assignedAt?.toISOString()} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-2 font-medium text-gray-800">{r.userName}</td>
                  <td className="px-3 py-2 text-gray-500">{r.userEmail}</td>
                  <td className="px-3 py-2 text-gray-500 max-w-[140px]">
                    <span className="truncate block">{r.company}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.status === 'completed'
                      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded-full font-medium"><CheckCircle2 className="w-3 h-3" />Respondió</span>
                      : <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-600 rounded-full font-medium"><Clock className="w-3 h-3" />Pendiente</span>
                    }
                  </td>
                  <td className="px-4 py-2 text-gray-400 text-right whitespace-nowrap">
                    {(r.completedAt ?? r.assignedAt)?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export const QuestionnaireSendStatsPage = () => {
  const {
    loading, error, refresh,
    globalStats, byQuestionnaire, byRole, byProject, timeline,
    pendingAlerts, questionnaireDetails,
  } = useQuestionnaireStats();

  const [qSearch, setQSearch] = useState('');
  const [pSearch, setPSearch] = useState('');
  const [expandedQ, setExpandedQ] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'cuestionarios' | 'proyectos' | 'roles' | 'tendencia' | 'alertas'>('cuestionarios');

  const filteredQ = byQuestionnaire.filter(r =>
    r.title.toLowerCase().includes(qSearch.toLowerCase())
  );
  const filteredP = byProject.filter(r =>
    r.projectName.toLowerCase().includes(pSearch.toLowerCase())
  );

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

  const maxTimeline = Math.max(...timeline.map(t => t.completions), 1);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estadísticas de Envíos</h1>
          <p className="text-sm text-gray-400 mt-0.5">Seguimiento de cuestionarios, respuestas y pendientes</p>
        </div>
        <button onClick={refresh} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors text-gray-600">
          <RefreshCw className="w-4 h-4" />
          Actualizar
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={FileText}     label="Cuestionarios"   value={globalStats.activeQuestionnaires}                       sub={`${globalStats.totalQuestionnaires} en total`}   iconBg="bg-blue-500" />
        <KpiCard icon={Users}        label="Total enviados"  value={globalStats.totalAssigned.toLocaleString('es-CO')}      sub="asignaciones activas"                            iconBg="bg-indigo-500" />
        <KpiCard icon={CheckCircle2} label="Respondieron"    value={globalStats.totalCompleted.toLocaleString('es-CO')}     sub={`Tasa global: ${globalStats.globalRate}%`}        iconBg="bg-green-500" />
        <KpiCard icon={Clock}        label="Pendientes"      value={globalStats.totalPending.toLocaleString('es-CO')}
          sub={pendingAlerts.length > 0 ? `${pendingAlerts.length} personas con +3 días` : 'Sin alertas críticas'}
          iconBg={globalStats.totalPending > 0 ? 'bg-orange-500' : 'bg-gray-400'}
          valueColor={globalStats.totalPending > 0 ? 'text-orange-600' : 'text-gray-900'}
        />
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center border-b border-gray-100 px-5 overflow-x-auto">
          {([
            { id: 'cuestionarios', label: 'Por Cuestionario', icon: FileText },
            { id: 'proyectos',     label: 'Por Proyecto',     icon: FolderKanban },
            { id: 'roles',         label: 'Por Rol',          icon: Users },
            { id: 'tendencia',     label: 'Tendencia',        icon: BarChart2 },
            { id: 'alertas',       label: 'Alertas',          icon: AlertTriangle, badge: pendingAlerts.length },
          ] as Array<{ id: typeof activeTab; label: string; icon: React.ElementType; badge?: number }>).map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === t.id
                  ? 'border-[#008C3C] text-[#008C3C]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
              {t.badge != null && t.badge > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-orange-500 text-white rounded-full leading-none">{t.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Por Cuestionario ─────────────────────────────────────────────── */}
        {activeTab === 'cuestionarios' && (
          <div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
              <p className="text-xs text-gray-400">{filteredQ.length} cuestionario{filteredQ.length !== 1 ? 's' : ''} — clic en una fila para ver detalle</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  className="h-8 pl-8 pr-3 text-sm border border-gray-200 rounded-lg w-52 focus:outline-none focus:ring-2 focus:ring-[#008C3C]/20"
                  placeholder="Buscar cuestionario..."
                  value={qSearch}
                  onChange={e => setQSearch(e.target.value)}
                />
              </div>
            </div>
            <div>
              {filteredQ.length === 0 && (
                <div className="text-center py-12 text-sm text-gray-400">Sin resultados</div>
              )}
              {filteredQ.map(row => {
                const isOpen = expandedQ === row.id;
                return (
                  <div key={row.id} className="border-b border-gray-50 last:border-0">
                    <button
                      onClick={() => setExpandedQ(isOpen ? null : row.id)}
                      className={`w-full flex items-center gap-2 px-5 py-3.5 hover:bg-gray-50/60 transition-colors text-left ${isOpen ? 'bg-gray-50/40' : ''}`}
                    >
                      <div className="flex-1 min-w-0 grid grid-cols-[1fr_80px_70px_70px_80px_140px] items-center gap-3">
                        <span className="font-medium text-gray-900 text-sm line-clamp-1">{row.title}</span>
                        <span className={`justify-self-center inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${row.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                          {row.active ? 'Activo' : 'Inactivo'}
                        </span>
                        <span className="justify-self-end text-sm text-gray-600 tabular-nums">{row.assigned}</span>
                        <span className="justify-self-end text-sm text-green-700 font-semibold tabular-nums">{row.completed}</span>
                        <span className="justify-self-end text-sm text-orange-600 tabular-nums">{row.pending}</span>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${row.rate >= 80 ? 'bg-green-500' : row.rate >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                              style={{ width: `${row.rate}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-gray-600 w-8 text-right shrink-0">{row.rate}%</span>
                        </div>
                      </div>
                      {isOpen
                        ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                    </button>
                    {isOpen && <QuestionnaireDetailPanel row={row} details={questionnaireDetails} />}
                  </div>
                );
              })}
              {/* Header de columnas (sticky arriba) */}
            </div>
            {/* Legend row */}
            <div className="flex items-center gap-3 px-5 py-2 border-t border-gray-50 text-[10px] text-gray-400 bg-gray-50/30">
              <span className="flex-1 font-medium">Cuestionario</span>
              <span className="w-20 text-center">Estado</span>
              <span className="w-16 text-right">Enviados</span>
              <span className="w-16 text-right text-green-600">Respondieron</span>
              <span className="w-20 text-right text-orange-500">Pendientes</span>
              <span className="w-36 text-center">Progreso</span>
              <span className="w-4" />
            </div>
          </div>
        )}

        {/* ── Por Proyecto ──────────────────────────────────────────────────── */}
        {activeTab === 'proyectos' && (
          <div>
            <div className="flex items-center justify-end px-5 py-3 border-b border-gray-50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  className="h-8 pl-8 pr-3 text-sm border border-gray-200 rounded-lg w-52 focus:outline-none focus:ring-2 focus:ring-[#008C3C]/20"
                  placeholder="Buscar proyecto..."
                  value={pSearch}
                  onChange={e => setPSearch(e.target.value)}
                />
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 bg-gray-50/70 border-b border-gray-100">
                  <th className="text-left px-5 py-3 font-medium">Proyecto</th>
                  <th className="text-right px-3 py-3 font-medium">Enviados</th>
                  <th className="text-right px-3 py-3 font-medium text-green-600">Respondieron</th>
                  <th className="text-right px-3 py-3 font-medium text-orange-500">Pendientes</th>
                  <th className="px-5 py-3 font-medium w-44">Cumplimiento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredP.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-12 text-sm text-gray-400">Sin resultados</td></tr>
                )}
                {filteredP.map(row => (
                  <tr key={row.projectId} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-gray-900">{row.projectName}</td>
                    <td className="px-3 py-3.5 text-right text-gray-600 tabular-nums">{row.assigned}</td>
                    <td className="px-3 py-3.5 text-right text-green-700 font-semibold tabular-nums">{row.completed}</td>
                    <td className="px-3 py-3.5 text-right text-orange-600 tabular-nums">{row.assigned - row.completed}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <RateBar rate={row.rate} />
                        <span className="text-xs font-semibold text-gray-600 w-9 text-right shrink-0">{row.rate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Por Rol ───────────────────────────────────────────────────────── */}
        {activeTab === 'roles' && (
          <div className="p-5 grid md:grid-cols-2 gap-4">
            <table className="w-full text-sm bg-white rounded-xl border border-gray-100 overflow-hidden">
              <thead>
                <tr className="text-xs text-gray-400 bg-gray-50/70 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-medium">Rol</th>
                  <th className="text-right px-3 py-3 font-medium">Enviados</th>
                  <th className="text-right px-3 py-3 font-medium text-green-600">Respondieron</th>
                  <th className="px-4 py-3 font-medium w-36">Tasa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {byRole.map(row => (
                  <tr key={row.role} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-900">{ROLE_LABELS[row.role] ?? row.role}</td>
                    <td className="px-3 py-3 text-right text-gray-600">{row.assigned}</td>
                    <td className="px-3 py-3 text-right text-green-700 font-semibold">{row.completed}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <RateBar rate={row.rate} size="sm" />
                        <span className="text-xs font-semibold text-gray-600 w-9 text-right shrink-0">{row.rate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Comparativo por rol</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={byRole.map(r => ({
                  name: ROLE_LABELS[r.role] ?? r.role,
                  Enviados: r.assigned,
                  Respondieron: r.completed,
                }))} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="Enviados"     fill="#a5b4fc" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Respondieron" fill="#4ade80" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Tendencia ─────────────────────────────────────────────────────── */}
        {activeTab === 'tendencia' && (
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-gray-800">Respuestas por día</p>
                <p className="text-xs text-gray-400 mt-0.5">Últimos 30 días</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <TrendingUp className="w-4 h-4 text-green-500" />
                Total: <span className="font-semibold text-gray-700">{timeline.reduce((s, t) => s + t.completions, 0)}</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={timeline} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={Math.floor(timeline.length / 8)} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} domain={[0, maxTimeline + 1]} />
                <Tooltip formatter={(v: any) => [v, 'Respuestas']} />
                <Bar dataKey="completions" name="Respuestas" fill="#4ade80" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Alertas ───────────────────────────────────────────────────────── */}
        {activeTab === 'alertas' && (
          pendingAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <CheckCircle2 className="w-12 h-12 text-green-200 mb-3" />
              <p className="text-sm font-medium">Sin alertas pendientes</p>
              <p className="text-xs mt-1">Todos respondieron dentro de los 3 días</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 bg-gray-50/70 border-b border-gray-100">
                  <th className="text-left px-5 py-3 font-medium">Persona</th>
                  <th className="text-left px-3 py-3 font-medium">Correo</th>
                  <th className="text-center px-3 py-3 font-medium">Días pendiente</th>
                  <th className="text-left px-5 py-3 font-medium">Cuestionarios</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pendingAlerts.map(alert => (
                  <tr key={alert.userId} className="hover:bg-orange-50/40 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-gray-900">{alert.userName}</td>
                    <td className="px-3 py-3.5 text-gray-500 text-xs">{alert.userEmail}</td>
                    <td className="px-3 py-3.5 text-center">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${alert.days >= 14 ? 'bg-red-100 text-red-700' : alert.days >= 7 ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {alert.days}d
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {alert.questionnaires.map((q, i) => (
                          <span key={i} className="inline-flex px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-md">{q}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
};
