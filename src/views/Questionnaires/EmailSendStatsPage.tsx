import { useState } from 'react';
import {
  RefreshCw, Loader2, Mail, CheckCircle2, XCircle, AlertTriangle,
  FolderKanban, FileText, Users, BarChart2, Download, Wand2,
} from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell,
  AreaChart, Area, LineChart, Line,
} from 'recharts';
import { useEmailSendStats } from '@/hooks/useEmailSendStats';
import { generateEmailSendReport } from '@/services/reportService';
import { toast } from 'sonner';

const ROLE_LABELS: Record<string, string> = {
  colaborador: 'Colaborador',
  lider: 'Líder',
  aspirante: 'Aspirante',
  excolaborador: 'Excolaborador',
  descartado: 'Descartado',
  desconocido: 'Desconocido',
};

const PIE_COLORS = ['#4ade80', '#f87171', '#d1d5db'];
const ROLE_COLORS = ['#6366f1', '#4ade80', '#f59e0b', '#f87171', '#a78bfa', '#94a3b8'];

function fmtDate(d: Date | null) {
  if (!d) return '—';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function DeliveryBar({ rate }: { rate: number }) {
  const color = rate >= 90 ? 'bg-green-500' : rate >= 70 ? 'bg-yellow-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${rate}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-9 text-right shrink-0">{rate}%</span>
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, sub, color, badge,
}: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; color: string; badge?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
            {badge && (
              <span className="mt-1.5 inline-flex px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                {badge}
              </span>
            )}
          </div>
          <div className={`p-2.5 rounded-xl ${color}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const CustomPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export const EmailSendStatsPage = () => {
  const {
    loading, error, refresh,
    globalStats, byProject, byQuestionnaire, byRole, failures, timeline,
  } = useEmailSendStats();

  const [pSearch, setPSearch] = useState('');
  const [qSearch, setQSearch] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [migrating, setMigrating] = useState(false);

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

  const filteredP = byProject.filter(r =>
    r.projectName.toLowerCase().includes(pSearch.toLowerCase())
  );
  const filteredQ = byQuestionnaire.filter(r =>
    r.title.toLowerCase().includes(qSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-gray-500">
        <AlertTriangle className="w-10 h-10 text-red-300" />
        <p className="text-sm">{error}</p>
        <Button variant="outline" size="sm" onClick={refresh}>Reintentar</Button>
      </div>
    );
  }

  // ── Computed data for charts ─────────────────────────────────────────────────

  const pieData = [
    { name: 'Entregados', value: globalStats.sent },
    { name: 'Fallidos',   value: globalStats.failed },
    { name: 'Sin estado', value: globalStats.noStatus },
  ].filter(d => d.value > 0);

  // Cumulative timeline
  let cumulative = 0;
  const cumulativeData = timeline.map(t => {
    cumulative += t.sent + t.failed;
    return { date: t.date, total: cumulative, sent: t.sent, failed: t.failed };
  });

  // Top 10 projects by delivery rate (with enough data)
  const rateData = byProject
    .filter(r => r.sent + r.failed >= 3)
    .slice(0, 10)
    .map(r => ({
      name: r.projectName.length > 20 ? r.projectName.slice(0, 18) + '…' : r.projectName,
      Tasa: r.deliveryRate,
    }));

  // Questionnaire chart top 10
  const qChartData = byQuestionnaire
    .filter(r => r.total > 0)
    .slice(0, 10)
    .map(r => ({
      name: r.title.length > 22 ? r.title.slice(0, 20) + '…' : r.title,
      Enviados: r.total,
      Entregados: r.sent,
      Fallidos: r.failed,
    }));

  // Role pie data
  const rolePieData = byRole
    .filter(r => r.total > 0)
    .map(r => ({ name: ROLE_LABELS[r.role] ?? r.role, value: r.total }));

  const maxTimeline = Math.max(...timeline.map(t => t.sent + t.failed), 1);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estadísticas de Correos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Seguimiento de entregas por proyecto, cuestionario y rol
          </p>
        </div>
        <div className="flex gap-2">
          {globalStats.noStatus > 0 && (
            <Button variant="outline" size="sm" onClick={handleMigrate} disabled={migrating}
              className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50">
              {migrating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              Corregir sin estado ({globalStats.noStatus})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={refresh} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Actualizar
          </Button>
          <Button
            size="sm"
            onClick={handleGeneratePdf}
            disabled={generatingPdf}
            className="gap-2 bg-green-600 hover:bg-green-700 text-white"
          >
            {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Generar Informe PDF
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Mail}         label="Total asignaciones"  value={globalStats.total.toLocaleString('es-CO')}  sub="correos registrados"             color="bg-blue-500" />
        <KpiCard icon={CheckCircle2} label="Entregados"          value={globalStats.sent.toLocaleString('es-CO')}   sub={`Tasa de entrega: ${globalStats.deliveryRate}%`} color="bg-green-500" />
        <KpiCard
          icon={XCircle} label="Fallidos" value={globalStats.failed.toLocaleString('es-CO')}
          sub="no llegaron al destinatario" color={globalStats.failed > 0 ? 'bg-red-500' : 'bg-gray-400'}
          badge={globalStats.topFailReason ? globalStats.topFailReason.slice(0, 30) + (globalStats.topFailReason.length > 30 ? '…' : '') : undefined}
        />
        <KpiCard icon={AlertTriangle} label="Sin estado" value={globalStats.noStatus.toLocaleString('es-CO')} sub="registros anteriores al tracking" color="bg-gray-400" />
      </div>

      {/* ── Overview charts ───────────────────────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">

        {/* Donut: distribución global */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Distribución global de envíos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%" cy="50%"
                    innerRadius={48} outerRadius={80}
                    dataKey="value"
                    labelLine={false}
                    label={CustomPieLabel}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number | undefined) => (v ?? 0).toLocaleString('es-CO')} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3 flex-1">
                {pieData.map((entry, i) => (
                  <div key={entry.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i] }} />
                      <span className="text-sm text-gray-600">{entry.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-gray-900">{entry.value.toLocaleString('es-CO')}</span>
                      <span className="text-xs text-gray-400 ml-1.5">
                        ({globalStats.total > 0 ? Math.round((entry.value / globalStats.total) * 100) : 0}%)
                      </span>
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t mt-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Total</span>
                    <span className="font-semibold text-gray-800">{globalStats.total.toLocaleString('es-CO')}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Area: actividad últimos 30 días */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Actividad últimos 30 días</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={cumulativeData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradSent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#4ade80" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#4ade80" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={Math.floor(timeline.length / 6)} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  formatter={(v: number | undefined, name: string | undefined) => [v ?? 0, name === 'total' ? 'Acumulado' : (name ?? '')]}
                  labelStyle={{ fontSize: 11 }}
                  contentStyle={{ fontSize: 11 }}
                />
                <Area
                  type="monotone" dataKey="total" name="Acumulado"
                  stroke="#22c55e" strokeWidth={2}
                  fill="url(#gradSent)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="proyectos">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="proyectos"     className="gap-1.5"><FolderKanban className="w-3.5 h-3.5" /> Por Proyecto</TabsTrigger>
          <TabsTrigger value="cuestionarios" className="gap-1.5"><FileText     className="w-3.5 h-3.5" /> Por Cuestionario</TabsTrigger>
          <TabsTrigger value="roles"         className="gap-1.5"><Users        className="w-3.5 h-3.5" /> Por Rol</TabsTrigger>
          <TabsTrigger value="tendencia"     className="gap-1.5"><BarChart2    className="w-3.5 h-3.5" /> Tendencia</TabsTrigger>
          <TabsTrigger value="fallidos"      className="gap-1.5">
            <XCircle className="w-3.5 h-3.5" /> Fallidos
            {failures.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full leading-none">
                {failures.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Por Proyecto ──────────────────────────────────────────────────── */}
        <TabsContent value="proyectos" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Entrega de correos por proyecto</CardTitle>
                <input
                  className="h-8 px-3 text-sm border rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-green-300"
                  placeholder="Buscar proyecto..."
                  value={pSearch}
                  onChange={e => setPSearch(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-gray-500 bg-gray-50">
                      <th className="text-left px-4 py-2.5 font-medium">Proyecto</th>
                      <th className="text-right px-3 py-2.5 font-medium">Asignaciones</th>
                      <th className="text-right px-3 py-2.5 font-medium"><span className="text-green-600">Entregados</span></th>
                      <th className="text-right px-3 py-2.5 font-medium"><span className="text-red-500">Fallidos</span></th>
                      <th className="text-right px-3 py-2.5 font-medium">Sin estado</th>
                      <th className="px-4 py-2.5 font-medium w-44">Tasa entrega</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredP.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-10 text-gray-400">Sin resultados</td></tr>
                    )}
                    {filteredP.map(row => (
                      <tr key={row.projectId} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900">{row.projectName}</td>
                        <td className="px-3 py-3 text-right text-gray-700">{row.total}</td>
                        <td className="px-3 py-3 text-right text-green-700 font-medium">{row.sent}</td>
                        <td className="px-3 py-3 text-right">
                          {row.failed > 0 ? <span className="text-red-600 font-medium">{row.failed}</span> : <span className="text-gray-400">0</span>}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-400">{row.noStatus}</td>
                        <td className="px-4 py-3">
                          {row.sent + row.failed > 0 ? <DeliveryBar rate={row.deliveryRate} /> : <span className="text-xs text-gray-400">Sin datos</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Gráficas en 2 columnas */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Entregados vs Fallidos — top 10 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Entregados vs Fallidos — top proyectos</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={byProject.slice(0, 10).map(r => ({
                      name: r.projectName.length > 16 ? r.projectName.slice(0, 14) + '…' : r.projectName,
                      Entregados: r.sent,
                      Fallidos: r.failed,
                    }))}
                    margin={{ top: 4, right: 8, left: -20, bottom: 44 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Entregados" fill="#4ade80" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Fallidos"   fill="#f87171" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Tasa de entrega % — horizontal */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Tasa de entrega % por proyecto</CardTitle>
              </CardHeader>
              <CardContent>
                {rateData.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">Datos insuficientes (mínimo 3 envíos por proyecto)</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      layout="vertical"
                      data={rateData}
                      margin={{ top: 4, right: 40, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={90} />
                      <Tooltip formatter={(v: number | undefined) => [`${v ?? 0}%`, 'Tasa de entrega']} />
                      <Bar dataKey="Tasa" radius={[0, 3, 3, 0]} label={{ position: 'right', fontSize: 10, formatter: (v: any) => `${v ?? 0}%` }}>
                        {rateData.map((entry, i) => (
                          <Cell key={i} fill={entry.Tasa >= 90 ? '#4ade80' : entry.Tasa >= 70 ? '#facc15' : '#f87171'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Por Cuestionario ─────────────────────────────────────────────── */}
        <TabsContent value="cuestionarios" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Entrega de correos por cuestionario</CardTitle>
                <input
                  className="h-8 px-3 text-sm border rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-green-300"
                  placeholder="Buscar cuestionario..."
                  value={qSearch}
                  onChange={e => setQSearch(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-gray-500 bg-gray-50">
                      <th className="text-left px-4 py-2.5 font-medium">Cuestionario</th>
                      <th className="text-center px-3 py-2.5 font-medium">Estado</th>
                      <th className="text-right px-3 py-2.5 font-medium">Enviados</th>
                      <th className="text-right px-3 py-2.5 font-medium text-green-600">Entregados</th>
                      <th className="text-right px-3 py-2.5 font-medium text-red-500">Fallidos</th>
                      <th className="px-4 py-2.5 font-medium w-40">Tasa entrega</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredQ.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-10 text-gray-400">Sin resultados</td></tr>
                    )}
                    {filteredQ.map(row => (
                      <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900 max-w-xs">
                          <span className="line-clamp-2">{row.title}</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${row.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {row.active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right text-gray-700">{row.total}</td>
                        <td className="px-3 py-3 text-right text-green-700 font-medium">{row.sent}</td>
                        <td className="px-3 py-3 text-right">
                          {row.failed > 0 ? <span className="text-red-600 font-medium">{row.failed}</span> : <span className="text-gray-400">0</span>}
                        </td>
                        <td className="px-4 py-3">
                          {row.sent + row.failed > 0 ? <DeliveryBar rate={row.deliveryRate} /> : <span className="text-xs text-gray-400">Sin datos</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Gráfica cuestionarios */}
          {qChartData.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Enviados / Entregados / Fallidos por cuestionario</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={qChartData} margin={{ top: 4, right: 8, left: -20, bottom: 50 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Enviados"   fill="#93c5fd" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Entregados" fill="#4ade80" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Fallidos"   fill="#f87171" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Por Rol ───────────────────────────────────────────────────────── */}
        <TabsContent value="roles" className="mt-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Tabla */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Entrega por rol</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-gray-500 bg-gray-50">
                      <th className="text-left px-4 py-2.5 font-medium">Rol</th>
                      <th className="text-right px-3 py-2.5 font-medium">Enviados</th>
                      <th className="text-right px-3 py-2.5 font-medium text-green-600">Entregados</th>
                      <th className="text-right px-3 py-2.5 font-medium text-red-500">Fallidos</th>
                      <th className="px-4 py-2.5 font-medium w-32">Tasa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {byRole.map(row => (
                      <tr key={row.role} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{ROLE_LABELS[row.role] ?? row.role}</td>
                        <td className="px-3 py-3 text-right text-gray-700">{row.total}</td>
                        <td className="px-3 py-3 text-right text-green-700 font-medium">{row.sent}</td>
                        <td className="px-3 py-3 text-right">
                          {row.failed > 0 ? <span className="text-red-600 font-medium">{row.failed}</span> : <span className="text-gray-400">0</span>}
                        </td>
                        <td className="px-4 py-3">
                          {row.sent + row.failed > 0 ? <DeliveryBar rate={row.deliveryRate} /> : <span className="text-xs text-gray-400">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Pie: distribución de envíos por rol */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Distribución de envíos por rol</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie data={rolePieData} cx="50%" cy="50%" outerRadius={72} dataKey="value" labelLine={false}>
                        {rolePieData.map((_, i) => (
                          <Cell key={i} fill={ROLE_COLORS[i % ROLE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number | undefined) => (v ?? 0).toLocaleString('es-CO')} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 flex-1">
                    {rolePieData.map((entry, i) => (
                      <div key={entry.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: ROLE_COLORS[i % ROLE_COLORS.length] }} />
                          <span className="text-gray-600">{entry.name}</span>
                        </div>
                        <span className="font-semibold text-gray-800">{entry.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Barra comparativa entregados vs fallidos */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Entregados vs Fallidos por rol</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={byRole.map(r => ({
                    name: ROLE_LABELS[r.role] ?? r.role,
                    Entregados: r.sent,
                    Fallidos: r.failed,
                  }))}
                  margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Entregados" fill="#4ade80" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Fallidos"   fill="#f87171" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tendencia ─────────────────────────────────────────────────────── */}
        <TabsContent value="tendencia" className="mt-4 space-y-4">

          {/* Barras diarias apiladas */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Correos enviados por día</CardTitle>
                  <p className="text-xs text-gray-400 mt-0.5">Últimos 30 días — apilado</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-green-400 inline-block" />
                    Entregados: <strong className="text-gray-700">{timeline.reduce((s, t) => s + t.sent, 0)}</strong>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-red-400 inline-block" />
                    Fallidos: <strong className="text-gray-700">{timeline.reduce((s, t) => s + t.failed, 0)}</strong>
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={timeline} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={Math.floor(timeline.length / 8)} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} domain={[0, maxTimeline + 1]} />
                  <Tooltip labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="sent"   name="Entregados" fill="#4ade80" radius={[3, 3, 0, 0]} stackId="a" />
                  <Bar dataKey="failed" name="Fallidos"   fill="#f87171" radius={[3, 3, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Acumulado + línea diaria */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Total acumulado de envíos</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={cumulativeData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradAcum" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={Math.floor(timeline.length / 6)} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip formatter={(v: number | undefined) => [v ?? 0, 'Acumulado']} labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="total" name="Acumulado" stroke="#6366f1" strokeWidth={2} fill="url(#gradAcum)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Línea entregados vs fallidos diario */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Entregados vs Fallidos — línea diaria</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={timeline} margin={{ top: 4, right: 12, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={Math.floor(timeline.length / 6)} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 11 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="sent"   name="Entregados" stroke="#4ade80" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="failed" name="Fallidos"   stroke="#f87171" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Fallidos ──────────────────────────────────────────────────────── */}
        <TabsContent value="fallidos" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Correos fallidos — detalle</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {failures.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <CheckCircle2 className="w-12 h-12 text-green-200 mb-3" />
                  <p className="text-sm font-medium">Sin correos fallidos</p>
                  <p className="text-xs mt-1">Todos los correos se entregaron correctamente</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-gray-500 bg-gray-50">
                        <th className="text-left px-4 py-2.5 font-medium">Persona</th>
                        <th className="text-left px-3 py-2.5 font-medium">Correo</th>
                        <th className="text-left px-3 py-2.5 font-medium">Cuestionario</th>
                        <th className="text-left px-3 py-2.5 font-medium">Fecha</th>
                        <th className="text-left px-4 py-2.5 font-medium">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {failures.map(f => (
                        <tr key={f.assignmentId} className="hover:bg-red-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900">{f.userName}</td>
                          <td className="px-3 py-3 text-gray-500 text-xs">{f.userEmail}</td>
                          <td className="px-3 py-3 text-gray-700 max-w-[180px]">
                            <span className="line-clamp-2">{f.questionnaireTitle}</span>
                          </td>
                          <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(f.assignedAt)}</td>
                          <td className="px-4 py-3 text-red-600 text-xs max-w-[220px]">
                            <span className="line-clamp-2">{f.error}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
