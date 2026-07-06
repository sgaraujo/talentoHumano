import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
} from 'recharts';
import {
  ArrowLeft, Eye, Users, Mail, LogIn, TrendingUp, Calendar, Loader2,
} from 'lucide-react';
import { bulletinService } from '@/services/bulletinService';
import type { Bulletin, BulletinViewEntry } from '@/models/types/Bulletin';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) +
    ' · ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'Ahora mismo';
  if (mins < 60)  return `Hace ${mins} min`;
  if (hours < 24) return `Hace ${hours} h`;
  if (days === 1) return 'Ayer';
  return `Hace ${days} días`;
}

function initials(email: string) {
  return email.split('@')[0].replace(/[._-]/g, ' ')
    .split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

const GREEN   = '#008C3C';
const LBLUE   = '#3b82f6';
const PIE_COLORS = [GREEN, LBLUE, '#f59e0b', '#8b5cf6'];

// ── stat card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color = GREEN }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
           style={{ background: `${color}18` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── custom tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 shadow-lg rounded-xl px-4 py-2.5 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="text-xs">
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export function BulletinStatsPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [bulletin, setBulletin] = useState<Bulletin | null>(null);
  const [views,    setViews]    = useState<BulletinViewEntry[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([bulletinService.getById(id), bulletinService.getViewLog(id)])
      .then(([b, v]) => { setBulletin(b); setViews(v); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  // ── derived data ────────────────────────────────────────────────────────────

  const unique   = useMemo(() => new Set(views.map(v => v.email)).size, [views]);
  const byEmail  = useMemo(() => views.filter(v => v.source === 'email').length, [views]);
  const byAuth   = useMemo(() => views.filter(v => v.source === 'auth').length, [views]);

  // Views grouped by day for area chart
  const viewsByDay = useMemo(() => {
    const map = new Map<string, number>();
    views.forEach(v => {
      const day = new Date(v.viewedAt).toLocaleDateString('en-CA'); // YYYY-MM-DD
      map.set(day, (map.get(day) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date: fmtDay(date + 'T12:00:00'), count }));
  }, [views]);

  // Views by hour of day for bar chart
  const viewsByHour = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}:00`, count: 0 }));
    views.forEach(v => {
      const h = new Date(v.viewedAt).getHours();
      arr[h].count++;
    });
    return arr.filter((_, i) => i >= 6 && i <= 22); // 6am–10pm
  }, [views]);

  // Source pie data
  const pieData = useMemo(() => [
    { name: 'Email', value: byEmail },
    { name: 'Sesión', value: byAuth },
  ].filter(d => d.value > 0), [byEmail, byAuth]);

  // Top viewers (most views per email)
  const topViewers = useMemo(() => {
    const map = new Map<string, number>();
    views.forEach(v => map.set(v.email, (map.get(v.email) ?? 0) + 1));
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([email, count]) => ({ email, count }));
  }, [views]);

  // ── loading / empty ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-2 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Cargando estadísticas...</span>
      </div>
    );
  }

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/boletines')}
          className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#008C3C]" />
            <h1 className="text-xl font-bold text-gray-900">Estadísticas de lectura</h1>
          </div>
          {bulletin && (
            <p className="text-sm text-gray-400 truncate mt-0.5">"{bulletin.title}"</p>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Eye}      label="Vistas totales"   value={views.length}  color={GREEN}  />
        <StatCard icon={Users}    label="Personas únicas"  value={unique}         color="#3b82f6" />
        <StatCard icon={Mail}     label="Por email"        value={byEmail}        color="#f59e0b" />
        <StatCard icon={LogIn}    label="Por sesión"       value={byAuth}         color="#8b5cf6" />
      </div>

      {views.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
          <Eye className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Aún no hay vistas registradas</p>
          <p className="text-sm text-gray-400 mt-1">
            Las vistas aparecerán aquí cuando alguien abra el boletín por email o sesión
          </p>
        </div>
      ) : (
        <div className="space-y-5">

          {/* Area chart — views over time */}
          {viewsByDay.length > 1 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#008C3C]" />
                Vistas por día
              </h2>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={viewsByDay} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={GREEN} stopOpacity={0.18} />
                      <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="count" name="Vistas"
                    stroke={GREEN} strokeWidth={2.5}
                    fill="url(#gArea)" dot={{ fill: GREEN, r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Row: Pie + Bar hour */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Pie — source */}
            {pieData.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">
                  Origen de las vistas
                </h2>
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="50%" height={180}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75}
                           dataKey="value" paddingAngle={3}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => [v, 'vistas']} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-3">
                    {pieData.map((d, i) => (
                      <div key={d.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ background: PIE_COLORS[i] }} />
                          <span className="text-sm text-gray-700">{d.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-gray-900">{d.value}</span>
                          <span className="text-xs text-gray-400 ml-1">
                            ({Math.round((d.value / views.length) * 100)}%)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Bar — hour of day */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">
                Horario de lectura
              </h2>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={viewsByHour} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                          barSize={10}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#9ca3af' }}
                         tickFormatter={h => h.replace(':00', 'h')} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Vistas" fill={GREEN} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Row: Top viewers + Full log */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

            {/* Top viewers */}
            {topViewers.length > 1 && (
              <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">
                  Quién más lo vio
                </h2>
                <div className="space-y-3">
                  {topViewers.map((v, i) => (
                    <div key={v.email} className="flex items-center gap-3">
                      <span className="w-5 text-xs text-gray-400 text-right flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="w-8 h-8 rounded-full bg-[#008C3C]/10 text-[#008C3C]
                                      flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {initials(v.email)}
                      </div>
                      <p className="flex-1 text-sm text-gray-700 truncate">{v.email}</p>
                      <span className="text-sm font-bold text-gray-900 flex-shrink-0">
                        {v.count}×
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Full view log */}
            <div className={`${topViewers.length > 1 ? 'lg:col-span-3' : 'lg:col-span-5'} bg-white rounded-2xl border border-gray-100 shadow-sm p-5`}>
              <h2 className="text-sm font-semibold text-gray-700 mb-4">
                Registro completo ({views.length})
              </h2>
              <div className="overflow-y-auto max-h-72 divide-y rounded-xl border">
                {views.map((v, i) => (
                  <div key={v.id ?? i} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-7 h-7 rounded-full bg-[#008C3C]/10 text-[#008C3C]
                                    flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                      {initials(v.email)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">{v.email}</p>
                      <p className="text-[10px] text-gray-400">{fmtDateTime(v.viewedAt)}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        v.source === 'email'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {v.source === 'email' ? 'Email' : 'Sesión'}
                      </span>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">
                        {timeAgo(v.viewedAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
