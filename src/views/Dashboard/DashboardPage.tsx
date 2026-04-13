import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend,
} from 'recharts';
import {
  Users, FileText, Loader2, TrendingDown, TrendingUp,
  Building2, UserCheck, UserX, UserPlus, FolderKanban,
  AlertTriangle, CheckCircle2, Clock, DollarSign, Cake, Download,
} from 'lucide-react';
import { userService } from '@/services/userService';
import { questionnaireService } from '@/services/questionnaireService';
import { analyticsService } from '@/services/analyticsService';
import { companyService } from '@/services/companyService';
import { projectService } from '@/services/projectService';
import { generateMonthlyReport } from '@/services/reportService';

// ── helpers ──────────────────────────────────────────────────────────────────

function toDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (v?.toDate) return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function rotacionSemaforo(pct: number): { color: string; label: string; bg: string } {
  if (pct <= 3)  return { color: '#16a34a', label: 'Óptima',  bg: 'bg-green-50'  };
  if (pct <= 7)  return { color: '#ca8a04', label: 'Moderada', bg: 'bg-yellow-50' };
  if (pct <= 12) return { color: '#ea580c', label: 'Alta',     bg: 'bg-orange-50' };
  return           { color: '#dc2626', label: 'Crítica',  bg: 'bg-red-50'    };
}

const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// ── sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon, color, onClick,
}: {
  label: string; value: string | number; sub: string;
  icon: React.ReactNode; color: string; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{ borderLeftColor: color }}
      className="bg-white rounded-xl border border-gray-100 border-l-4 p-4 shadow-sm hover:shadow-md transition-all cursor-pointer hover:-translate-y-px"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
        <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">{icon}</div>
      </div>
      <p className="text-3xl font-bold text-[#4A4A4A]">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 mt-8">
      {children}
    </p>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export const DashboardPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  // raw data
  const [allUsers,    setAllUsers]    = useState<any[]>([]);
  const [movements,   setMovements]   = useState<any[]>([]);
  const [companies,   setCompanies]   = useState<any[]>([]);
  const [projects,    setProjects]    = useState<any[]>([]);
  const [qStats,      setQStats]      = useState({ total: 0, active: 0 });

  useEffect(() => {
    (async () => {
      try {
        const [users, movs, comps, projs, qs] = await Promise.all([
          userService.getAll(),
          analyticsService.getMovements(),
          companyService.getAll(),
          projectService.getAll(),
          questionnaireService.getStats(),
        ]);
        setAllUsers(users);
        setMovements(movs);
        setCompanies(comps);
        setProjects(projs);
        setQStats(qs);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── derived ────────────────────────────────────────────────────────────────

  const now = new Date();
  const curMonth = now.getMonth();
  const curYear  = now.getFullYear();

  const stats = useMemo(() => {
    const colaboradores  = allUsers.filter(u => u.role === 'colaborador').length;
    const aspirantes     = allUsers.filter(u => u.role === 'aspirante').length;
    const excolaboradores = allUsers.filter(u => u.role === 'excolaborador').length;

    const ingresosMes = movements.filter(m => {
      const d = toDate(m.date);
      return m.type === 'ingreso' && d && d.getMonth() === curMonth && d.getFullYear() === curYear;
    }).length;

    const retirosMes = movements.filter(m => {
      const d = toDate(m.date);
      return m.type === 'retiro' && d && d.getMonth() === curMonth && d.getFullYear() === curYear;
    }).length;

    const headcount = colaboradores;
    const rotacionPct = headcount > 0 ? Math.round((retirosMes / headcount) * 100 * 10) / 10 : 0;

    // Costo estimado de rotación: retiros × 1.5 × salario promedio
    const salarios = allUsers
      .filter(u => u.role === 'colaborador')
      .map(u => u.contractInfo?.workConditions?.baseSalary || u.salaryInfo?.baseSalary || 0)
      .filter(s => s > 0);
    const salarioPromedio = salarios.length > 0
      ? salarios.reduce((a, b) => a + b, 0) / salarios.length
      : 2_500_000;
    const costoRotacion = Math.round(retirosMes * 1.5 * salarioPromedio);

    return { colaboradores, aspirantes, excolaboradores, ingresosMes, retirosMes, rotacionPct, costoRotacion, salarioPromedio };
  }, [allUsers, movements, curMonth, curYear]);

  // Tendencia últimos 6 meses
  const trendData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(curYear, curMonth - 5 + i, 1);
      const m = d.getMonth();
      const y = d.getFullYear();
      const ingresos = movements.filter(mv => {
        const dd = toDate(mv.date);
        return mv.type === 'ingreso' && dd && dd.getMonth() === m && dd.getFullYear() === y;
      }).length;
      const retiros = movements.filter(mv => {
        const dd = toDate(mv.date);
        return mv.type === 'retiro' && dd && dd.getMonth() === m && dd.getFullYear() === y;
      }).length;
      return { mes: MONTH_NAMES[m], ingresos, retiros };
    });
  }, [movements, curMonth, curYear]);

  // Top empresas por headcount
  const topEmpresas = useMemo(() => {
    const map = new Map<string, number>();
    allUsers.filter(u => u.role === 'colaborador').forEach(u => {
      const emp = u.contractInfo?.assignment?.company || 'Sin empresa';
      map.set(emp, (map.get(emp) || 0) + 1);
    });
    return [...map.entries()]
      .map(([name, count]) => ({ name: name.length > 22 ? name.slice(0, 20) + '…' : name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [allUsers]);

  // Distribución por tipo de contrato
  const contratoData = useMemo(() => {
    const map = new Map<string, number>();
    allUsers.filter(u => u.role === 'colaborador').forEach(u => {
      const tipo = u.contractInfo?.contract?.contractType || 'No especificado';
      map.set(tipo, (map.get(tipo) || 0) + 1);
    });
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [allUsers]);

  // Cumpleaños del mes
  const cumpleaniosMes = useMemo(() => {
    return allUsers
      .filter(u => {
        const bd = toDate(u.personalData?.birthDate);
        return bd && bd.getMonth() === curMonth && u.role === 'colaborador';
      })
      .map(u => ({
        name: u.fullName,
        day: toDate(u.personalData.birthDate)!.getDate(),
        company: u.contractInfo?.assignment?.company || '',
      }))
      .sort((a, b) => a.day - b.day)
      .slice(0, 8);
  }, [allUsers, curMonth]);

  // Antigüedades próximas (1, 3, 5 años este mes)
  const aniversarios = useMemo(() => {
    return allUsers
      .filter(u => {
        const start = toDate(u.contractInfo?.contract?.startDate);
        if (!start || u.role !== 'colaborador') return false;
        const years = curYear - start.getFullYear();
        return start.getMonth() === curMonth && [1, 2, 3, 5, 10].includes(years);
      })
      .map(u => {
        const start = toDate(u.contractInfo.contract.startDate)!;
        return {
          name: u.fullName,
          years: curYear - start.getFullYear(),
          company: u.contractInfo?.assignment?.company || '',
        };
      })
      .sort((a, b) => b.years - a.years)
      .slice(0, 6);
  }, [allUsers, curMonth, curYear]);

  const semaforo = rotacionSemaforo(stats.rotacionPct);
  const monthLabel = now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  const [downloading, setDownloading] = useState(false);
  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      generateMonthlyReport({ users: allUsers, movements, companies, projects, month: curMonth, year: curYear });
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#4A4A4A]">Dashboard Ejecutivo</h1>
          <p className="text-sm text-gray-500 mt-0.5 capitalize">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-semibold ${semaforo.bg}`}
            style={{ color: semaforo.color, borderColor: semaforo.color + '40' }}>
            {stats.rotacionPct <= 3
              ? <CheckCircle2 className="w-4 h-4" />
              : <AlertTriangle className="w-4 h-4" />}
            Rotación {semaforo.label} · {stats.rotacionPct}%
          </div>
          <button
            onClick={handleDownloadPDF}
            disabled={downloading}
            className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#008C3C] hover:bg-[#006C2F] text-white text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {downloading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Download className="w-4 h-4" />}
            Descargar PDF
          </button>
        </div>
      </div>

      {/* KPIs principales */}
      <SectionTitle>Headcount</SectionTitle>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
        <KpiCard label="Colaboradores" value={stats.colaboradores} sub="Activos"
          icon={<UserCheck className="w-4 h-4 text-[#1F8FBF]" />} color="#1F8FBF"
          onClick={() => navigate('/usuarios')} />
        <KpiCard label="Aspirantes" value={stats.aspirantes} sub="En proceso"
          icon={<UserPlus className="w-4 h-4 text-[#008C3C]" />} color="#008C3C"
          onClick={() => navigate('/usuarios')} />
        <KpiCard label="Ex-colaboradores" value={stats.excolaboradores} sub="Histórico"
          icon={<UserX className="w-4 h-4 text-orange-500" />} color="#F97316"
          onClick={() => navigate('/usuarios')} />
        <KpiCard label="Empresas" value={companies.length} sub={`${projects.length} proyectos`}
          icon={<Building2 className="w-4 h-4 text-purple-500" />} color="#8B5CF6"
          onClick={() => navigate('/empresas')} />
      </div>

      <SectionTitle>Movimientos · {monthLabel}</SectionTitle>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Ingresos del mes" value={stats.ingresosMes} sub="Nuevos colaboradores"
          icon={<TrendingUp className="w-4 h-4 text-[#008C3C]" />} color="#008C3C"
          onClick={() => navigate('/rotacion-talento')} />
        <KpiCard label="Retiros del mes" value={stats.retirosMes} sub="Colaboradores retirados"
          icon={<TrendingDown className="w-4 h-4 text-red-500" />} color="#EF4444"
          onClick={() => navigate('/rotacion-talento')} />

        {/* Semáforo rotación */}
        <div className={`rounded-xl border p-4 shadow-sm ${semaforo.bg}`}
          style={{ borderLeftColor: semaforo.color, borderLeftWidth: 4, borderColor: '#e5e7eb' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">% Rotación</span>
            <AlertTriangle className="w-4 h-4" style={{ color: semaforo.color }} />
          </div>
          <p className="text-3xl font-bold" style={{ color: semaforo.color }}>{stats.rotacionPct}%</p>
          <p className="text-xs mt-1 font-medium" style={{ color: semaforo.color }}>{semaforo.label}</p>
          <div className="mt-2 flex gap-1.5 text-[10px] text-gray-400">
            <span className="text-green-600">≤3% Óptima</span>·
            <span className="text-yellow-600">≤7% Moderada</span>·
            <span className="text-red-600">&gt;7% Alta</span>
          </div>
        </div>

        {/* Costo estimado */}
        <div className="bg-white rounded-xl border border-gray-100 border-l-4 p-4 shadow-sm"
          style={{ borderLeftColor: '#6366f1' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Costo Rotación Est.</span>
            <DollarSign className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-bold text-[#4A4A4A]">
            ${(stats.costoRotacion / 1_000_000).toFixed(1)}M
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {stats.retirosMes} retiros × 1.5 × ${Math.round(stats.salarioPromedio / 1000)}k prom.
          </p>
        </div>
      </div>

      {/* Tendencia 6 meses */}
      <SectionTitle>Tendencia de movimientos · últimos 6 meses</SectionTitle>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="ingresos" stroke="#008C3C" strokeWidth={2}
              dot={{ fill: '#008C3C', r: 4 }} name="Ingresos" />
            <Line type="monotone" dataKey="retiros" stroke="#EF4444" strokeWidth={2}
              dot={{ fill: '#EF4444', r: 4 }} name="Retiros" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Top empresas + contratos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-0">
        <div>
          <SectionTitle>Top empresas por headcount</SectionTitle>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topEmpresas} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                <Tooltip />
                <Bar dataKey="count" fill="#1F8FBF" radius={[0, 4, 4, 0]} name="Colaboradores" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <SectionTitle>Distribución por tipo de contrato</SectionTitle>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={contratoData} margin={{ left: 0, right: 16, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#008C3C" radius={[4, 4, 0, 0]} name="Personas" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Cumpleaños + Aniversarios */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-0">

        <div>
          <SectionTitle>
            <span className="flex items-center gap-1.5">
              <Cake className="w-3.5 h-3.5 inline" /> Cumpleaños este mes
            </span>
          </SectionTitle>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            {cumpleaniosMes.length === 0 ? (
              <p className="text-xs text-gray-400 italic text-center py-6">Sin cumpleaños este mes</p>
            ) : (
              <div className="space-y-2">
                {cumpleaniosMes.map((u, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-pink-50 border border-pink-200 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-pink-500">{u.day}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#4A4A4A] truncate">{u.name}</p>
                      <p className="text-xs text-gray-400 truncate">{u.company}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <SectionTitle>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 inline" /> Aniversarios este mes
            </span>
          </SectionTitle>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            {aniversarios.length === 0 ? (
              <p className="text-xs text-gray-400 italic text-center py-6">Sin aniversarios este mes</p>
            ) : (
              <div className="space-y-2">
                {aniversarios.map((u, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#008C3C]/10 border border-[#008C3C]/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-[#008C3C]">{u.years}a</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#4A4A4A] truncate">{u.name}</p>
                      <p className="text-xs text-gray-400 truncate">{u.company}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fila inferior */}
      <SectionTitle>Otros indicadores</SectionTitle>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pb-8">
        <KpiCard label="Proyectos activos" value={projects.filter(p => p.status === 'activo').length}
          sub={`de ${projects.length} totales`}
          icon={<FolderKanban className="w-4 h-4 text-[#008C3C]" />} color="#008C3C"
          onClick={() => navigate('/proyectos')} />
        <KpiCard label="Cuestionarios activos" value={qStats.active} sub={`${qStats.total} en total`}
          icon={<FileText className="w-4 h-4 text-purple-500" />} color="#8B5CF6"
          onClick={() => navigate('/questionarios')} />
        <KpiCard label="Total personas" value={allUsers.length} sub="En el sistema"
          icon={<Users className="w-4 h-4 text-[#4A4A4A]" />} color="#4A4A4A"
          onClick={() => navigate('/usuarios')} />
        <KpiCard
          label="Sal. promedio"
          value={stats.salarioPromedio > 0 ? `$${Math.round(stats.salarioPromedio / 1000)}k` : '—'}
          sub="Colaboradores activos"
          icon={<DollarSign className="w-4 h-4 text-indigo-500" />} color="#6366f1" />
      </div>

    </div>
  );
};
