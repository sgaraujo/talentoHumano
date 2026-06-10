import { useState } from 'react';
import { RefreshCw, Loader2, Send, CheckCircle2, Clock, AlertTriangle, TrendingUp, Users, FileText, FolderKanban, BarChart2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { useQuestionnaireStats } from '@/hooks/useQuestionnaireStats';

const ROLE_LABELS: Record<string, string> = {
  colaborador: 'Colaborador',
  lider: 'Líder',
  aspirante: 'Aspirante',
  excolaborador: 'Excolaborador',
  descartado: 'Descartado',
  desconocido: 'Desconocido',
};

function RateBar({ rate, size = 'md' }: { rate: number; size?: 'sm' | 'md' }) {
  const color =
    rate >= 80 ? 'bg-green-500' : rate >= 50 ? 'bg-yellow-400' : 'bg-red-400';
  const h = size === 'sm' ? 'h-1.5' : 'h-2';
  return (
    <div className={`w-full bg-gray-100 rounded-full overflow-hidden ${h}`}>
      <div
        className={`${h} ${color} rounded-full transition-all`}
        style={{ width: `${rate}%` }}
      />
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-xl ${color}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export const QuestionnaireSendStatsPage = () => {
  const {
    loading, error, refresh,
    globalStats, byQuestionnaire, byRole, byProject, timeline, pendingAlerts,
  } = useQuestionnaireStats();

  const [qSearch, setQSearch] = useState('');
  const [pSearch, setPSearch] = useState('');

  const filteredQ = byQuestionnaire.filter(r =>
    r.title.toLowerCase().includes(qSearch.toLowerCase())
  );
  const filteredP = byProject.filter(r =>
    r.projectName.toLowerCase().includes(pSearch.toLowerCase())
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

  const maxTimeline = Math.max(...timeline.map(t => t.completions), 1);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estadísticas de Envíos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Seguimiento de cuestionarios, respuestas y pendientes</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Actualizar
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={FileText}
          label="Cuestionarios"
          value={globalStats.activeQuestionnaires}
          sub={`${globalStats.totalQuestionnaires} en total`}
          color="bg-blue-500"
        />
        <KpiCard
          icon={Send}
          label="Total enviados"
          value={globalStats.totalAssigned.toLocaleString('es-CO')}
          sub="asignaciones activas"
          color="bg-indigo-500"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Respondieron"
          value={globalStats.totalCompleted.toLocaleString('es-CO')}
          sub={`Tasa global: ${globalStats.globalRate}%`}
          color="bg-green-500"
        />
        <KpiCard
          icon={Clock}
          label="Pendientes"
          value={globalStats.totalPending.toLocaleString('es-CO')}
          sub={
            pendingAlerts.length > 0
              ? `${pendingAlerts.length} personas con +3 días`
              : 'Sin alertas críticas'
          }
          color={globalStats.totalPending > 0 ? 'bg-orange-500' : 'bg-gray-400'}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="cuestionarios">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="cuestionarios" className="gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Por Cuestionario
          </TabsTrigger>
          <TabsTrigger value="proyectos" className="gap-1.5">
            <FolderKanban className="w-3.5 h-3.5" /> Por Proyecto
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-1.5">
            <Users className="w-3.5 h-3.5" /> Por Rol
          </TabsTrigger>
          <TabsTrigger value="tendencia" className="gap-1.5">
            <BarChart2 className="w-3.5 h-3.5" /> Tendencia
          </TabsTrigger>
          <TabsTrigger value="alertas" className="gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Alertas
            {pendingAlerts.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs font-bold bg-orange-500 text-white rounded-full leading-none">
                {pendingAlerts.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Por Cuestionario ─────────────────────────────────────────────── */}
        <TabsContent value="cuestionarios" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Desglose por cuestionario</CardTitle>
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
                      <th className="text-right px-3 py-2.5 font-medium">Respondieron</th>
                      <th className="text-right px-3 py-2.5 font-medium">Pendientes</th>
                      <th className="text-right px-3 py-2.5 font-medium">Tiempo prom.</th>
                      <th className="px-4 py-2.5 font-medium w-40">Progreso</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredQ.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center py-10 text-gray-400">Sin resultados</td>
                      </tr>
                    )}
                    {filteredQ.map(row => (
                      <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900 max-w-xs">
                          <span className="line-clamp-2">{row.title}</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${row.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {row.active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right text-gray-700">{row.assigned}</td>
                        <td className="px-3 py-3 text-right text-green-700 font-medium">{row.completed}</td>
                        <td className="px-3 py-3 text-right text-orange-600">{row.pending}</td>
                        <td className="px-3 py-3 text-right text-gray-500">
                          {row.avgDays != null ? `${row.avgDays}d` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <RateBar rate={row.rate} />
                            <span className="text-xs font-semibold text-gray-700 w-9 text-right shrink-0">
                              {row.rate}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Por Proyecto ──────────────────────────────────────────────────── */}
        <TabsContent value="proyectos" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Desglose por proyecto</CardTitle>
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
                      <th className="text-right px-3 py-2.5 font-medium">Enviados</th>
                      <th className="text-right px-3 py-2.5 font-medium">Respondieron</th>
                      <th className="text-right px-3 py-2.5 font-medium">Pendientes</th>
                      <th className="px-4 py-2.5 font-medium w-44">Cumplimiento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredP.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center py-10 text-gray-400">Sin resultados</td>
                      </tr>
                    )}
                    {filteredP.map(row => (
                      <tr key={row.projectId} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900">{row.projectName}</td>
                        <td className="px-3 py-3 text-right text-gray-700">{row.assigned}</td>
                        <td className="px-3 py-3 text-right text-green-700 font-medium">{row.completed}</td>
                        <td className="px-3 py-3 text-right text-orange-600">{row.assigned - row.completed}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <RateBar rate={row.rate} />
                            <span className="text-xs font-semibold text-gray-700 w-9 text-right shrink-0">
                              {row.rate}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Por Rol ───────────────────────────────────────────────────────── */}
        <TabsContent value="roles" className="mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Table */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Tasa de respuesta por rol</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-gray-500 bg-gray-50">
                      <th className="text-left px-4 py-2.5 font-medium">Rol</th>
                      <th className="text-right px-3 py-2.5 font-medium">Enviados</th>
                      <th className="text-right px-3 py-2.5 font-medium">Respondieron</th>
                      <th className="px-4 py-2.5 font-medium w-36">Tasa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {byRole.map(row => (
                      <tr key={row.role} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {ROLE_LABELS[row.role] ?? row.role}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-700">{row.assigned}</td>
                        <td className="px-3 py-3 text-right text-green-700 font-medium">{row.completed}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <RateBar rate={row.rate} size="sm" />
                            <span className="text-xs font-semibold text-gray-700 w-9 text-right shrink-0">
                              {row.rate}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Bar chart */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Comparativo por rol</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={byRole.map(r => ({
                      name: ROLE_LABELS[r.role] ?? r.role,
                      Enviados: r.assigned,
                      Respondieron: r.completed,
                    }))}
                    margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="Enviados" fill="#a5b4fc" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Respondieron" fill="#4ade80" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Tendencia ─────────────────────────────────────────────────────── */}
        <TabsContent value="tendencia" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Respuestas por día</CardTitle>
                  <p className="text-xs text-gray-400 mt-0.5">Últimos 30 días</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  Total período:{' '}
                  <span className="font-semibold text-gray-700">
                    {timeline.reduce((s, t) => s + t.completions, 0)}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={timeline}
                  margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    interval={Math.floor(timeline.length / 8)}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    allowDecimals={false}
                    domain={[0, maxTimeline + 1]}
                  />
                  <Tooltip
                    formatter={(v: number | undefined) => [v ?? 0, 'Respuestas']}
                    labelStyle={{ fontSize: 12 }}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="completions" name="Respuestas" fill="#4ade80" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Alertas ───────────────────────────────────────────────────────── */}
        <TabsContent value="alertas" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Personas con más de 3 días sin responder
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {pendingAlerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <CheckCircle2 className="w-12 h-12 text-green-200 mb-3" />
                  <p className="text-sm font-medium">Sin alertas pendientes</p>
                  <p className="text-xs mt-1">Todos respondieron dentro de los 3 días</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-gray-500 bg-gray-50">
                        <th className="text-left px-4 py-2.5 font-medium">Persona</th>
                        <th className="text-left px-3 py-2.5 font-medium">Correo</th>
                        <th className="text-center px-3 py-2.5 font-medium">Días pendiente</th>
                        <th className="text-left px-4 py-2.5 font-medium">Cuestionarios</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {pendingAlerts.map(alert => (
                        <tr key={alert.userId} className="hover:bg-orange-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900">{alert.userName}</td>
                          <td className="px-3 py-3 text-gray-500 text-xs">{alert.userEmail}</td>
                          <td className="px-3 py-3 text-center">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${alert.days >= 14 ? 'bg-red-100 text-red-700' : alert.days >= 7 ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {alert.days}d
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {alert.questionnaires.map((q, i) => (
                                <span key={i} className="inline-flex px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-md">
                                  {q}
                                </span>
                              ))}
                            </div>
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
