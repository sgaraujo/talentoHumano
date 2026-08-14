import { useEffect, useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, LabelList,
} from 'recharts';
import {
  Users, Loader2, TrendingDown, TrendingUp,
  Building2, UserCheck, FolderKanban,
  AlertTriangle, CheckCircle2, Cake, Clock,
  Filter, X, MapPin, VenusAndMars, UsersRound, BarChart3,
} from 'lucide-react';
import { getEmployeeDirectoryUsers } from '@/services/employeeDirectoryService';
import { analyticsService } from '@/services/analyticsService';
import { companyService } from '@/services/companyService';
import { projectService } from '@/services/projectService';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RotationPage } from '@/views/Analytics/RotationPage';
import type { RotationFilters } from '@/views/Analytics/RotationPage';

// ── helpers ──────────────────────────────────────────────────────────────────

function toDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (v?.toDate) return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function rotacionSemaforo(pct: number) {
  if (pct <= 3)  return { color: '#16a34a', label: 'Óptima',   bg: 'bg-green-50'  };
  if (pct <= 7)  return { color: '#ca8a04', label: 'Moderada', bg: 'bg-yellow-50' };
  if (pct <= 12) return { color: '#ea580c', label: 'Alta',     bg: 'bg-orange-50' };
  return           { color: '#dc2626', label: 'Crítica',  bg: 'bg-red-50'    };
}

function ageGroup(birthDate: any): string {
  const bd = toDate(birthDate);
  if (!bd) return 'Sin dato';
  const age = new Date().getFullYear() - bd.getFullYear();
  if (age < 26)  return '18–25';
  if (age < 31)  return '26–30';
  if (age < 36)  return '31–35';
  if (age < 41)  return '36–40';
  if (age < 51)  return '41–50';
  return '51+';
}

const AGE_ORDER = ['18–25','26–30','31–35','36–40','41–50','51+','Sin dato'];
const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const PIE_COLORS = ['#008C3C','#1F8FBF','#8B5CF6','#F97316','#EF4444','#10b981','#6366f1','#ec4899'];

// ── sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon, color, onClick }: {
  label: string; value: string | number; sub: string;
  icon: React.ReactNode; color: string; onClick?: () => void;
}) {
  return (
    <div onClick={onClick} style={{ borderLeftColor: color }}
      className="bg-white rounded-xl border border-gray-100 border-l-4 p-4 shadow-sm hover:shadow-md transition-all cursor-pointer hover:-translate-y-px">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
        <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">{icon}</div>
      </div>
      <p className="text-3xl font-bold text-[#4A4A4A]">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  );
}

function SectionTitle({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 mt-6">
      {icon}{children}
    </p>
  );
}

function HBarChart({ data, color = '#1F8FBF', height }: {
  data: { name: string; value: number }[]; color?: string; height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(180, data.length * 36)}>
      <BarChart layout="vertical" data={data} margin={{ left: 4, right: 40, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={130} />
        <Tooltip />
        <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} name="Personas">
          <LabelList dataKey="value" position="right" style={{ fontSize: 11, fontWeight: 600, fill: color }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const TABS = [
  { id: 'resumen',    label: 'Resumen',    icon: BarChart3 },
  { id: 'rotacion',  label: 'Movimientos',icon: TrendingUp },
  { id: 'demografia',label: 'Demografía', icon: UsersRound },
];

// ── main ──────────────────────────────────────────────────────────────────────

export const DashboardPage = () => {
  const [loading,   setLoading]   = useState(true);
  const [allUsers,  setAllUsers]  = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [projects,  setProjects]  = useState<any[]>([]);

  const LS = 'dashboard_filters';
  const saved = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } })();

  const [tab,           setTab]           = useState<'resumen'|'rotacion'|'demografia'>(saved.tab ?? 'resumen');
  const [filterCompany, setFilterCompany] = useState(saved.company ?? 'all');
  const [filterProject, setFilterProject] = useState(saved.project ?? 'all');
  const [filterYear,    setFilterYear]    = useState(saved.year    ?? String(new Date().getFullYear()));
  const [filterMonth,   setFilterMonth]   = useState(saved.month   ?? 'all');

  useEffect(() => {
    localStorage.setItem(LS, JSON.stringify({
      tab, company: filterCompany, project: filterProject,
      year: filterYear, month: filterMonth,
    }));
  }, [tab, filterCompany, filterProject, filterYear, filterMonth]);

  useEffect(() => {
    (async () => {
      try {
        const [users, movs, comps, projs] = await Promise.all([
          getEmployeeDirectoryUsers(),
          analyticsService.getMovements(),
          companyService.getAll(),
          projectService.getAll(),
        ]);
        setAllUsers(users);
        setMovements(movs);
        setCompanies(comps);
        setProjects(projs);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const now       = new Date();
  const curMonth  = now.getMonth();
  const curYear   = now.getFullYear();
  const monthLabel = (() => {
    const raw = now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  })();

  // ── TH companies (activeTH or active) ──────────────────────────────────────
  const thCompanies = useMemo(() =>
    companies.filter(c => c.activeTH).sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [companies]
  );

  // Un colaborador puede tener varias asignaciones activas (multi-empresa/proyecto);
  // usar solo contractInfo.assignment (la primera) subcontaba a esas personas en
  // el resto de sus empresas/proyectos y descuadraba los totales frente a
  // "Empresas y dotación", que sí recorre todas las relaciones activas.
  const assignmentsOf = (u: any): Array<{ company?: string; project?: string }> =>
    u._assignments?.length ? u._assignments : [u.contractInfo?.assignment].filter(Boolean);

  const companyOptions = useMemo(() => {
    const names = new Set<string>();
    allUsers.filter(u => u.role === 'colaborador').forEach(u => {
      assignmentsOf(u).forEach(a => { const c = a.company?.trim(); if (c) names.add(c); });
    });
    return [...names].sort((a, b) => a.localeCompare(b, 'es'));
  }, [allUsers]);

  const projectOptions = useMemo(() => {
    const names = new Set<string>();
    allUsers.filter(u => u.role === 'colaborador').forEach(u => {
      assignmentsOf(u).forEach(a => { const p = a.project?.trim(); if (p) names.add(p); });
    });
    return [...names].sort((a, b) => a.localeCompare(b, 'es'));
  }, [allUsers]);

  const rotationFilters = useMemo<RotationFilters>(() => ({
    year: filterYear, month: filterMonth,
    empresa: filterCompany, proyecto: filterProject,
  }), [filterYear, filterMonth, filterCompany, filterProject]);

  const curYearNum = new Date().getFullYear();
  const yearOptions = [curYearNum - 2, curYearNum - 1, curYearNum, curYearNum + 1];

  // ── Filtered active users (respects company filter) ────────────────────────
  const activeUsers = useMemo(() =>
    allUsers.filter(u => {
      if (u.role !== 'colaborador') return false;
      if (filterCompany !== 'all' && !assignmentsOf(u).some(a => a.company?.trim() === filterCompany)) return false;
      return true;
    }),
    [allUsers, filterCompany]
  );

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const activeCompanyNames = new Set(companies.filter(c => c.active).map(c => c.name));
    const colaboradores   = activeUsers.length;
    const excolaboradores = allUsers.filter(u => u.role === 'excolaborador').length;

    const compFilter = (m: any) => filterCompany === 'all' || m.company === filterCompany;

    const ingresosMes = movements.filter(m => {
      const d = toDate(m.date);
      return m.type === 'ingreso' && d && d.getMonth() === curMonth && d.getFullYear() === curYear
        && activeCompanyNames.has(m.company) && compFilter(m);
    }).length;

    const retirosMes = movements.filter(m => {
      const d = toDate(m.date);
      return m.type === 'retiro' && d && d.getMonth() === curMonth && d.getFullYear() === curYear
        && activeCompanyNames.has(m.company) && compFilter(m);
    }).length;

    const esVoluntario = (r = '') => {
      const l = r.toLowerCase();
      return l.includes('renuncia') || l.includes('mutuo acuerdo') || l === 'voluntario';
    };
    const retirosVol = movements.filter(m => {
      const d = toDate(m.date);
      return m.type === 'retiro' && d && d.getMonth() === curMonth && d.getFullYear() === curYear
        && activeCompanyNames.has(m.company) && compFilter(m) && esVoluntario(m.reason);
    }).length;
    const rotacionPct = colaboradores > 0
      ? Math.round((retirosVol / colaboradores) * 100 * 10) / 10 : 0;

    return { colaboradores, excolaboradores, ingresosMes, retirosMes, rotacionPct };
  }, [activeUsers, allUsers, movements, companies, curMonth, curYear, filterCompany]);

  const semaforo = rotacionSemaforo(stats.rotacionPct);

  // ── Trend 6 months ─────────────────────────────────────────────────────────
  const trendData = useMemo(() => {
    const compFilter = (m: any) => filterCompany === 'all' || m.company === filterCompany;
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(curYear, curMonth - 5 + i, 1);
      const mo = d.getMonth(); const yr = d.getFullYear();
      const ingresos = movements.filter(mv => { const dd = toDate(mv.date); return mv.type === 'ingreso' && dd && dd.getMonth() === mo && dd.getFullYear() === yr && compFilter(mv); }).length;
      const retiros  = movements.filter(mv => { const dd = toDate(mv.date); return mv.type === 'retiro'  && dd && dd.getMonth() === mo && dd.getFullYear() === yr && compFilter(mv); }).length;
      return { mes: MONTH_NAMES[mo], ingresos, retiros };
    });
  }, [movements, curMonth, curYear, filterCompany]);

  // ── Birthdays & anniversaries ───────────────────────────────────────────────
  const cumpleaniosMes = useMemo(() =>
    activeUsers.filter(u => { const bd = toDate(u.personalData?.birthDate); return bd && bd.getMonth() === curMonth; })
      .map(u => ({ name: u.fullName, day: toDate(u.personalData.birthDate)!.getDate(), company: u.contractInfo?.assignment?.company || '' }))
      .sort((a, b) => a.day - b.day).slice(0, 8),
    [activeUsers, curMonth]
  );

  const aniversarios = useMemo(() =>
    activeUsers.filter(u => {
      const start = toDate(u.contractInfo?.contract?.startDate);
      if (!start) return false;
      const years = curYear - start.getFullYear();
      return start.getMonth() === curMonth && [1, 2, 3, 5, 10].includes(years);
    }).map(u => {
      const start = toDate(u.contractInfo.contract.startDate)!;
      return { name: u.fullName, years: curYear - start.getFullYear(), company: u.contractInfo?.assignment?.company || '' };
    }).sort((a, b) => b.years - a.years).slice(0, 6),
    [activeUsers, curMonth, curYear]
  );

  // ── Company headcount (for cards) ──────────────────────────────────────────
  // Se cuenta cada colaborador una sola vez por empresa (Set de ids), aunque
  // tenga varias asignaciones activas en ella.
  const companyHeadcount = useMemo(() => {
    const map = new Map<string, Set<string>>();
    allUsers.filter(u => u.role === 'colaborador').forEach(u => {
      const companiesForUser = new Set(assignmentsOf(u).map(a => a.company?.trim()).filter(Boolean) as string[]);
      companiesForUser.forEach(c => {
        if (!map.has(c)) map.set(c, new Set());
        map.get(c)!.add(u.id);
      });
    });
    return new Map([...map.entries()].map(([c, ids]) => [c, ids.size]));
  }, [allUsers]);

  // ── Demographic breakdowns ──────────────────────────────────────────────────
  const byCompany = useMemo(() => {
    const map = new Map<string, Set<string>>();
    activeUsers.forEach(u => {
      const companiesForUser = new Set(assignmentsOf(u).map(a => a.company?.trim()).filter(Boolean) as string[]);
      (companiesForUser.size ? companiesForUser : new Set(['Sin empresa'])).forEach(c => {
        if (!map.has(c)) map.set(c, new Set());
        map.get(c)!.add(u.id);
      });
    });
    return [...map.entries()].map(([name, ids]) => ({ name: name.length > 28 ? name.slice(0, 26) + '…' : name, value: ids.size })).sort((a, b) => b.value - a.value);
  }, [activeUsers]);

  const byProject = useMemo(() => {
    const map = new Map<string, Set<string>>();
    activeUsers.forEach(u => {
      const projectsForUser = new Set(assignmentsOf(u).map(a => a.project?.trim()).filter(Boolean) as string[]);
      (projectsForUser.size ? projectsForUser : new Set(['Sin proyecto'])).forEach(p => {
        if (!map.has(p)) map.set(p, new Set());
        map.get(p)!.add(u.id);
      });
    });
    return [...map.entries()].map(([name, ids]) => ({ name: name.length > 28 ? name.slice(0, 26) + '…' : name, value: ids.size })).sort((a, b) => b.value - a.value);
  }, [activeUsers]);

  const byGender = useMemo(() => {
    const map = new Map<string, number>();
    activeUsers.forEach(u => { const g = u.personalData?.gender?.trim() || 'Sin dato'; map.set(g, (map.get(g) ?? 0) + 1); });
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [activeUsers]);

  const byCity = useMemo(() => {
    const map = new Map<string, number>();
    activeUsers.forEach(u => { const c = u.location?.city?.trim() || 'Sin dato'; map.set(c, (map.get(c) ?? 0) + 1); });
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 15);
  }, [activeUsers]);

  const byAge = useMemo(() => {
    const map = new Map<string, number>(AGE_ORDER.map(g => [g, 0]));
    activeUsers.forEach(u => { const g = ageGroup(u.personalData?.birthDate); map.set(g, (map.get(g) ?? 0) + 1); });
    return AGE_ORDER.map(name => ({ name, value: map.get(name) ?? 0 })).filter(d => d.value > 0);
  }, [activeUsers]);

  const byContract = useMemo(() => {
    const map = new Map<string, number>();
    activeUsers.forEach(u => { const t = u.contractInfo?.contract?.contractType?.trim() || 'No especificado'; map.set(t, (map.get(t) ?? 0) + 1); });
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [activeUsers]);

  const byModality = useMemo(() => {
    const map = new Map<string, number>();
    activeUsers.forEach(u => { const m = u.contractInfo?.workConditions?.workModality?.trim() || 'Sin dato'; map.set(m, (map.get(m) ?? 0) + 1); });
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [activeUsers]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#4A4A4A]">Analítica de Talento Humano</h1>
          <p className="text-sm text-gray-500 mt-0.5">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-semibold ${semaforo.bg}`}
            style={{ color: semaforo.color, borderColor: semaforo.color + '40' }}>
            {stats.rotacionPct <= 3 ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            Rotación {semaforo.label} · {stats.rotacionPct}%
          </div>
        </div>
      </div>

      {/* Filtro unificado */}
      <div className="mb-4 p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Filter className="w-3.5 h-3.5 text-[#008C3C]" />
          <span className="text-xs font-semibold text-[#008C3C] uppercase tracking-wide">Filtros</span>
          {(filterCompany !== 'all' || filterProject !== 'all' || filterMonth !== 'all' || filterYear !== String(curYearNum)) && (
            <span className="ml-1 text-[10px] bg-[#008C3C] text-white px-1.5 py-0.5 rounded-full">Activos</span>
          )}
          <button onClick={() => { setFilterCompany('all'); setFilterProject('all'); setFilterMonth('all'); setFilterYear(String(curYearNum)); }}
            className="ml-auto text-[10px] text-gray-400 hover:text-red-500 flex items-center gap-1">
            <X className="w-3 h-3" /> Limpiar
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {/* Año */}
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="border-gray-200 focus:ring-[#008C3C] text-sm h-9">
              <SelectValue placeholder="Año" />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Mes */}
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="border-gray-200 focus:ring-[#008C3C] text-sm h-9">
              <SelectValue placeholder="Mes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los meses</SelectItem>
              {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
                .map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Empresa */}
          <Select value={filterCompany} onValueChange={v => { setFilterCompany(v); setFilterProject('all'); }}>
            <SelectTrigger className="border-gray-200 focus:ring-[#008C3C] text-sm h-9">
              <SelectValue placeholder="Todas las empresas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las empresas</SelectItem>
              {companyOptions.map(name => (
                <SelectItem key={name} value={name}>
                  <span className="flex items-center gap-2">
                    <span className="truncate">{name}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{companyHeadcount.get(name) ?? 0}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Proyecto */}
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="border-gray-200 focus:ring-[#008C3C] text-sm h-9">
              <SelectValue placeholder="Todos los proyectos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los proyectos</SelectItem>
              {projectOptions.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all
                ${tab === t.id ? 'bg-white shadow-sm text-[#008C3C]' : 'text-gray-500 hover:text-gray-700'}`}>
              <Icon className="w-3.5 h-3.5" />{t.label}
            </button>
          );
        })}
      </div>

      {/* ── TAB: RESUMEN ─────────────────────────────────────────────────────── */}
      {tab === 'resumen' && (
        <div>
          {/* Companies — KPI-style cards */}
          <SectionTitle icon={<Building2 className="w-3.5 h-3.5" />}>
            Empresas · Talento Humano ({thCompanies.length})
          </SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-2">
            {thCompanies.map(c => {
              const hc = companyHeadcount.get(c.name) ?? 0;
              const active = filterCompany === c.name;
              return (
                <button
                  key={c.id}
                  onClick={() => setFilterCompany((prev: any) => prev === c.name ? 'all' : c.name)}
                  style={{ borderLeftColor: active ? '#008C3C' : '#e5e7eb' }}
                  className={`text-left bg-white rounded-xl border border-gray-100 border-l-4 p-4 shadow-sm
                    hover:shadow-md transition-all hover:-translate-y-px
                    ${active ? 'ring-2 ring-[#008C3C]/20' : ''}`}
                >
                  <div className="flex items-start justify-between mb-2 gap-1">
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide leading-tight line-clamp-2">
                      {c.name}
                    </span>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0
                      ${active ? 'bg-[#008C3C]/10' : 'bg-gray-50'}`}>
                      <Building2 className={`w-3.5 h-3.5 ${active ? 'text-[#008C3C]' : 'text-gray-400'}`} />
                    </div>
                  </div>
                  <p className={`text-2xl font-bold ${active ? 'text-[#008C3C]' : 'text-[#4A4A4A]'}`}>{hc}</p>
                  <p className="text-xs text-gray-400 mt-0.5">colaboradores activos</p>
                </button>
              );
            })}
          </div>

          {/* KPIs */}
          <SectionTitle icon={<UserCheck className="w-3.5 h-3.5" />}>Headcount</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Colaboradores activos" value={stats.colaboradores} sub={filterCompany !== 'all' ? filterCompany : 'Total activos'} icon={<UserCheck className="w-4 h-4 text-[#1F8FBF]" />} color="#1F8FBF" />
            <KpiCard label="Empresas TH" value={thCompanies.length} sub="Con talento humano" icon={<Building2 className="w-4 h-4 text-purple-500" />} color="#8B5CF6" />
            <KpiCard label="Proyectos activos" value={projects.filter(p => p.status === 'activo').length} sub={`de ${projects.length} totales`} icon={<FolderKanban className="w-4 h-4 text-[#008C3C]" />} color="#008C3C" />
          </div>

          {/* Movimientos del mes */}
          <SectionTitle icon={<TrendingUp className="w-3.5 h-3.5" />}>Movimientos · {monthLabel}</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <KpiCard label="Ingresos del mes" value={stats.ingresosMes} sub="Nuevos colaboradores" icon={<TrendingUp className="w-4 h-4 text-[#008C3C]" />} color="#008C3C" />
            <KpiCard label="Retiros del mes" value={stats.retirosMes} sub="Colaboradores retirados" icon={<TrendingDown className="w-4 h-4 text-red-500" />} color="#EF4444" />
            <div className={`rounded-xl border p-4 shadow-sm ${semaforo.bg}`}
              style={{ borderLeftColor: semaforo.color, borderLeftWidth: 4, borderColor: '#e5e7eb' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">% Rotación</span>
                <AlertTriangle className="w-4 h-4" style={{ color: semaforo.color }} />
              </div>
              <p className="text-3xl font-bold" style={{ color: semaforo.color }}>{stats.rotacionPct}%</p>
              <p className="text-xs mt-1 font-medium" style={{ color: semaforo.color }}>{semaforo.label}</p>
              <div className="mt-2 flex gap-1.5 text-[10px] text-gray-400 flex-wrap">
                <span className="text-green-600">≤3% Óptima</span>·
                <span className="text-yellow-600">≤7% Moderada</span>·
                <span className="text-red-600">&gt;7% Alta</span>
              </div>
            </div>
          </div>

          {/* Trend chart */}
          <SectionTitle>Tendencia · últimos 6 meses</SectionTitle>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="ingresos" fill="#008C3C" radius={[4,4,0,0]} name="Ingresos" />
                <Bar dataKey="retiros"  fill="#EF4444" radius={[4,4,0,0]} name="Retiros" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Birthdays & anniversaries */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <SectionTitle icon={<Cake className="w-3.5 h-3.5" />}>Cumpleaños este mes</SectionTitle>
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
              <SectionTitle icon={<Clock className="w-3.5 h-3.5" />}>Aniversarios este mes</SectionTitle>
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
        </div>
      )}

      {/* ── TAB: MOVIMIENTOS ─────────────────────────────────────────────────── */}
      {tab === 'rotacion' && (
        <div className="-mx-4 sm:-mx-6">
          <RotationPage controlled={rotationFilters} />
        </div>
      )}

      {/* ── TAB: DEMOGRAFÍA ──────────────────────────────────────────────────── */}
      {tab === 'demografia' && (
        <div>
          <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
            📊 Mostrando <span className="font-semibold">{stats.colaboradores} colaboradores activos</span>
            {filterCompany !== 'all' && <span> de <span className="font-semibold">{filterCompany}</span></span>}
          </div>

          {/* Por empresa */}
          {filterCompany === 'all' && (
            <>
              <SectionTitle icon={<Building2 className="w-3.5 h-3.5" />}>Empleados vigentes por empresa</SectionTitle>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-2">
                <HBarChart data={byCompany} color="#1F8FBF" />
              </div>
            </>
          )}

          {/* Por proyecto */}
          <SectionTitle icon={<FolderKanban className="w-3.5 h-3.5" />}>Por proyecto</SectionTitle>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-2">
            <HBarChart data={byProject} color="#008C3C" />
          </div>

          {/* Género + Modalidad */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <SectionTitle icon={<VenusAndMars className="w-3.5 h-3.5" />}>Por género</SectionTitle>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="55%" height={160}>
                    <PieChart>
                      <Pie data={byGender} cx="50%" cy="50%" innerRadius={40} outerRadius={70}
                        dataKey="value" nameKey="name" paddingAngle={3}>
                        {byGender.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {byGender.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-xs text-gray-600 flex-1 truncate">{d.name}</span>
                        <span className="text-xs font-bold text-[#4A4A4A]">{d.value}</span>
                        <span className="text-[10px] text-gray-400">
                          {stats.colaboradores > 0 ? Math.round(d.value / stats.colaboradores * 100) : 0}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <SectionTitle>Por modalidad de trabajo</SectionTitle>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <HBarChart data={byModality} color="#8B5CF6" height={160} />
              </div>
            </div>
          </div>

          {/* Por edad */}
          <SectionTitle icon={<Users className="w-3.5 h-3.5" />}>Por rango de edad</SectionTitle>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-2">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byAge} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#F97316" radius={[4,4,0,0]} name="Personas">
                  <LabelList dataKey="value" position="top" style={{ fontSize: 11, fontWeight: 700, fill: '#F97316' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Por ciudad */}
          <SectionTitle icon={<MapPin className="w-3.5 h-3.5" />}>Por ciudad de residencia</SectionTitle>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-2">
            <HBarChart data={byCity} color="#10b981" />
          </div>

          {/* Por tipo de contrato */}
          <SectionTitle>Por tipo de contrato</SectionTitle>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 pb-8">
            <HBarChart data={byContract} color="#6366f1" />
          </div>
        </div>
      )}

    </div>
  );
};
