import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { companyService } from '@/services/companyService';
import { analyticsService } from '@/services/analyticsService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Building2, ArrowLeft, Users, UserMinus, Clock,
  TrendingUp, Loader2, Filter, Search, X,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import type { Company } from '@/models/types/Company';
import type { MovementRecord } from '@/models/types/Analytics';

// ── Date helper (handles Firestore Timestamp, Date, string) ──────────────────

const toDate = (raw: any): Date | null => {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (typeof raw.toDate === 'function') return raw.toDate();           // Firestore Timestamp
  if (typeof raw.seconds === 'number') return new Date(raw.seconds * 1000); // plain Timestamp obj
  if (typeof raw === 'string' && raw.trim()) return new Date(raw);
  return null;
};

// ── Other helpers ─────────────────────────────────────────────────────────────

const normalizeGender = (gender?: string): 'Masculino' | 'Femenino' | 'Otro' => {
  if (!gender) return 'Otro';
  const g = gender.toLowerCase();
  if (['male', 'masculino', 'm', 'hombre'].includes(g)) return 'Masculino';
  if (['female', 'femenino', 'f', 'mujer'].includes(g)) return 'Femenino';
  return 'Otro';
};

const getAge = (user: any): number => {
  if (user.personalData?.age) {
    const n = Number(user.personalData.age);
    if (!isNaN(n) && n > 0) return n;
  }
  const birth = toDate(user.personalData?.birthDate);
  if (birth) {
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age > 0 ? age : 0;
  }
  return 0;
};

const getAgeRange = (age: number): string => {
  if (age <= 0) return 'Sin datos';
  if (age < 26) return '18-25';
  if (age < 36) return '26-35';
  if (age < 46) return '36-45';
  return '46+';
};

const monthsDiff = (start: Date, end: Date): number =>
  Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth());

const getDurationMonths = (user: any, endDate?: Date): number => {
  const start = toDate(user.contractInfo?.contract?.startDate);
  if (!start) return 0;
  return monthsDiff(start, endDate ?? new Date());
};

const getDurationRange = (months: number): string => {
  if (months <= 0) return 'Sin datos';
  if (months < 3) return '0-3 meses';
  if (months < 6) return '3-6 meses';
  if (months < 12) return '6-12 meses';
  if (months < 24) return '1-2 años';
  return '2+ años';
};

const formatDuration = (months: number): string => {
  if (months <= 0) return '—';
  if (months < 12) return `${months} mes${months === 1 ? '' : 'es'}`;
  return `${Math.round((months / 12) * 10) / 10} años`;
};

const formatDate = (raw: any): string => {
  const d = toDate(raw);
  if (!d) return '—';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const GENDER_COLORS: Record<string, string> = {
  Masculino: '#1F8FBF',
  Femenino: '#EC4899',
  Otro: '#8B5CF6',
};

const DURATION_ORDER = ['0-3 meses', '3-6 meses', '6-12 meses', '1-2 años', '2+ años', 'Sin datos'];
const AGE_ORDER = ['18-25', '26-35', '36-45', '46+', 'Sin datos'];

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const currentYear = new Date().getFullYear();
const YEARS = [currentYear, currentYear - 1, currentYear - 2];

// ── Component ─────────────────────────────────────────────────────────────────

export const CompanyAnalyticsPage = () => {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();

  const [company, setCompany] = useState<Company | null>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [movements, setMovements] = useState<MovementRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterYears, setFilterYears] = useState<number[]>([]);   // [] = todos los años
  const [filterGender, setFilterGender] = useState<string>('todos');
  const [filterTipo, setFilterTipo] = useState<string>('todos');

  const toggleYear = (y: number) =>
    setFilterYears(prev => prev.includes(y) ? prev.filter(x => x !== y) : [...prev, y]);

  // Pagination (retirados)
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const [retiradosSearch, setRetiradosSearch] = useState('');

  // Filters – activos
  const [activosSearch, setActivosSearch] = useState('');
  const [activosProject, setActivosProject] = useState('todos');
  const [activosGender, setActivosGender] = useState('todos');
  const [activosArea, setActivosArea] = useState('todos');
  const [activosSort, setActivosSort] = useState<'ninguno' | 'mas-antiguo' | 'mas-nuevo'>('ninguno');
  const [activosPage, setActivosPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const companies = await companyService.getAll();
        const found = companies.find(c => c.id === companyId);
        if (!found) return;
        setCompany(found);

        const [emps, allMovs] = await Promise.all([
          companyService.getUsersByCompany(found.name),
          analyticsService.getMovements(),
        ]);
        setEmployees(emps);
        setMovements(allMovs.filter(m => m.company === found.name));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [companyId]);

  const activos = useMemo(() => employees.filter(e => e.role === 'colaborador'), [employees]);
  const todosRetirados = useMemo(() => employees.filter(e => e.role === 'excolaborador'), [employees]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [filterYears, filterGender, filterTipo, retiradosSearch]);
  useEffect(() => { setActivosPage(1); }, [activosSearch, activosProject, activosGender, activosArea, activosSort]);

  // KPI cards: retirados del año actual (independiente de los filtros)
  const retiradosEsteAnio = useMemo(() =>
    todosRetirados.filter(e => {
      const d = toDate(e.administrativeRecord?.terminationDate);
      return d && d.getFullYear() === currentYear;
    }),
  [todosRetirados]);

  const rotacionEsteAnio = activos.length > 0
    ? Math.round((retiradosEsteAnio.length / activos.length) * 1000) / 10
    : 0;

  // Apply filters to retirados (para gráficas y tabla)
  const retirados = useMemo(() => {
    return todosRetirados.filter(e => {
      if (filterGender !== 'todos' && normalizeGender(e.personalData?.gender) !== filterGender) return false;

      if (filterTipo !== 'todos') {
        const reason = e.administrativeRecord?.terminationReason?.toLowerCase() ?? '';
        const isVoluntario = reason.includes('voluntario') || reason.includes('renuncia');
        if (filterTipo === 'voluntario' && !isVoluntario) return false;
        if (filterTipo === 'involuntario' && isVoluntario) return false;
      }

      if (filterYears.length > 0) {
        const termDate = toDate(e.administrativeRecord?.terminationDate);
        if (!termDate) return false;
        if (!filterYears.includes(termDate.getFullYear())) return false;
      }

      return true;
    });
  }, [todosRetirados, filterGender, filterTipo, filterYears]);

  // Gender distribution – filtered retirados
  const genderData = useMemo(() => {
    const counts: Record<string, number> = { Masculino: 0, Femenino: 0, Otro: 0 };
    retirados.forEach(e => counts[normalizeGender(e.personalData?.gender)]++);
    return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [retirados]);

  // Age distribution – filtered retirados
  const ageData = useMemo(() => {
    const counts: Record<string, number> = Object.fromEntries(AGE_ORDER.map(r => [r, 0]));
    retirados.forEach(e => counts[getAgeRange(getAge(e))]++);
    return AGE_ORDER.map(r => ({ name: r, value: counts[r] })).filter(d => d.value > 0);
  }, [retirados]);

  // Duration distribution – filtered retirados
  const durationData = useMemo(() => {
    const counts: Record<string, number> = Object.fromEntries(DURATION_ORDER.map(r => [r, 0]));
    retirados.forEach(e => {
      const termDate = toDate(e.administrativeRecord?.terminationDate);
      counts[getDurationRange(getDurationMonths(e, termDate ?? undefined))]++;
    });
    return DURATION_ORDER.map(r => ({ name: r, value: counts[r] })).filter(d => d.value > 0);
  }, [retirados]);

  // Monthly trend – un año: 12 meses etiquetados "Ene". Varios años: secuencia "Ene 24, Feb 24…"
  const yearsForChart = filterYears.length > 0 ? [...filterYears].sort() : [currentYear];
  const monthlyData = useMemo(() => {
    if (yearsForChart.length === 1) {
      const year = yearsForChart[0];
      return Array.from({ length: 12 }, (_, i) => ({
        month: MONTH_NAMES[i],
        retiros: movements.filter(m => { const d = toDate(m.date); return d && m.type === 'retiro'  && d.getMonth() === i && d.getFullYear() === year; }).length,
        ingresos: movements.filter(m => { const d = toDate(m.date); return d && m.type === 'ingreso' && d.getMonth() === i && d.getFullYear() === year; }).length,
      }));
    }
    // Múltiples años: mostrar en secuencia sin sumar
    return yearsForChart.flatMap(year =>
      Array.from({ length: 12 }, (_, i) => ({
        month: `${MONTH_NAMES[i]} ${String(year).slice(2)}`,
        retiros:  movements.filter(m => { const d = toDate(m.date); return d && m.type === 'retiro'  && d.getMonth() === i && d.getFullYear() === year; }).length,
        ingresos: movements.filter(m => { const d = toDate(m.date); return d && m.type === 'ingreso' && d.getMonth() === i && d.getFullYear() === year; }).length,
      }))
    );
  }, [movements, filterYears]);

  // Unique projects and areas from activos
  const activosProjects = useMemo(() => {
    const set = new Set<string>();
    activos.forEach(e => { if (e.contractInfo?.assignment?.project) set.add(e.contractInfo.assignment.project); });
    return [...set].sort();
  }, [activos]);

  const activosAreas = useMemo(() => {
    const set = new Set<string>();
    activos.forEach(e => { if (e.contractInfo?.assignment?.area) set.add(e.contractInfo.assignment.area); });
    return [...set].sort();
  }, [activos]);

  // Filtered + sorted activos
  const filteredActivos = useMemo(() => {
    const q = activosSearch.toLowerCase().trim();
    const filtered = activos.filter(e => {
      if (q && !(e.fullName || e.email || '').toLowerCase().includes(q)) return false;
      if (activosProject !== 'todos' && e.contractInfo?.assignment?.project !== activosProject) return false;
      if (activosGender !== 'todos' && normalizeGender(e.personalData?.gender) !== activosGender) return false;
      if (activosArea !== 'todos' && e.contractInfo?.assignment?.area !== activosArea) return false;
      return true;
    });

    if (activosSort === 'ninguno') return filtered;

    return [...filtered].sort((a, b) => {
      const dateA = toDate(a.contractInfo?.contract?.startDate)?.getTime() ?? 0;
      const dateB = toDate(b.contractInfo?.contract?.startDate)?.getTime() ?? 0;
      return activosSort === 'mas-antiguo' ? dateA - dateB : dateB - dateA;
    });
  }, [activos, activosSearch, activosProject, activosGender, activosArea, activosSort]);

  // Retirados after applying name search (on top of existing filters)
  const retiradosFiltrados = useMemo(() => {
    const q = retiradosSearch.toLowerCase().trim();
    if (!q) return retirados;
    return retirados.filter(e => (e.fullName || e.email || '').toLowerCase().includes(q));
  }, [retirados, retiradosSearch]);


  const avgDuration = useMemo(() => {
    const withData = activos.filter(e => toDate(e.contractInfo?.contract?.startDate));
    if (!withData.length) return 0;
    return Math.round(withData.reduce((s, e) => s + getDurationMonths(e), 0) / withData.length);
  }, [activos]);

  const retirosVoluntarios = retirados.filter(e => {
    const r = e.administrativeRecord?.terminationReason?.toLowerCase() ?? '';
    return r.includes('voluntario') || r.includes('renuncia');
  }).length;

  const retirosInvoluntarios = retirados.length - retirosVoluntarios;

  const retirosTempranos = retirados.filter(e => {
    const termDate = toDate(e.administrativeRecord?.terminationDate);
    return getDurationMonths(e, termDate ?? undefined) < 3;
  }).length;

  // ── Loading / not found ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Empresa no encontrada</p>
        <Button onClick={() => navigate('/empresas')} className="mt-4 bg-[#008C3C] hover:bg-[#006C2F] text-white">
          Volver a Empresas
        </Button>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-screen space-y-6">

      {/* ── Header ── */}
      <div>
        <Button
          variant="ghost"
          onClick={() => navigate('/empresas')}
          className="mb-4 text-gray-500 hover:text-[#008C3C] -ml-2"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver a Empresas
        </Button>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="w-14 h-14 rounded-xl bg-[#008C3C]/10 flex items-center justify-center flex-shrink-0">
            {company.logo
              ? <img src={company.logo} alt={company.name} className="w-10 h-10 object-contain rounded-lg" />
              : <Building2 className="w-7 h-7 text-[#008C3C]" />
            }
          </div>
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-[#4A4A4A]">{company.name}</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              NIT: {company.nit}
              {company.regional && ` · ${company.regional}`}
              {' · Analytics de Talento Humano'}
            </p>
          </div>
          <Badge className={company.active ? 'bg-green-100 text-green-700' : ''}>
            {company.active ? 'Activa' : 'Inactiva'}
          </Badge>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-sm font-semibold text-[#4A4A4A]">Resumen general</h2>
        <div className="flex items-center gap-1.5 bg-[#008C3C]/10 px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-[#008C3C]" />
          <span className="text-xs font-semibold text-[#008C3C]">{currentYear}</span>
        </div>
        <p className="text-xs text-gray-400">Los datos de las cards reflejan el año actual</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-[#008C3C] shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-sm font-medium text-[#4A4A4A]">Colaboradores Activos</CardTitle>
            <Users className="w-5 h-5 text-[#008C3C]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-[#008C3C]">{activos.length}</div>
            <p className="text-xs text-gray-500 mt-1">Headcount actual</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-sm font-medium text-[#4A4A4A]">Retirados</CardTitle>
            <UserMinus className="w-5 h-5 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-500">{retiradosEsteAnio.length}</div>
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-gray-500">Este año</p>
              <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                {todosRetirados.length} total
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#1F8FBF] shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-sm font-medium text-[#4A4A4A]">Rotación</CardTitle>
            <TrendingUp className="w-5 h-5 text-[#1F8FBF]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-[#1F8FBF]">{rotacionEsteAnio}%</div>
            <p className="text-xs text-gray-500 mt-1">Este año · {currentYear}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#7BCB6A] shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-sm font-medium text-[#4A4A4A]">Tiempo Promedio</CardTitle>
            <Clock className="w-5 h-5 text-[#7BCB6A]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-[#7BCB6A]">
              {avgDuration > 0 ? avgDuration : '—'}
            </div>
            <p className="text-xs text-gray-500 mt-1">Meses · activos actuales</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Retiros section ── */}
      <section>
        {/* Section header + filtros */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-[#4A4A4A] flex items-center gap-2">
            <UserMinus className="w-5 h-5 text-red-500" /> Análisis de Retiros
          </h2>

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />

            {/* Toggle de años – multi-selección */}
            <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg">
              <button
                onClick={() => setFilterYears([])}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  filterYears.length === 0
                    ? 'bg-[#008C3C] text-white shadow-sm'
                    : 'text-gray-500 hover:text-[#008C3C]'
                }`}
              >
                Todos
              </button>
              {YEARS.map(y => (
                <button
                  key={y}
                  onClick={() => toggleYear(y)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    filterYears.includes(y)
                      ? 'bg-[#008C3C] text-white shadow-sm'
                      : 'text-gray-500 hover:text-[#008C3C]'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>

            <Select value={filterGender} onValueChange={setFilterGender}>
              <SelectTrigger className="w-[130px] h-8 text-xs border-[#008C3C]/30">
                <SelectValue placeholder="Género" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los géneros</SelectItem>
                <SelectItem value="Masculino">Masculino</SelectItem>
                <SelectItem value="Femenino">Femenino</SelectItem>
                <SelectItem value="Otro">Otro</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterTipo} onValueChange={setFilterTipo}>
              <SelectTrigger className="w-[140px] h-8 text-xs border-[#008C3C]/30">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los tipos</SelectItem>
                <SelectItem value="voluntario">Voluntario</SelectItem>
                <SelectItem value="involuntario">Involuntario</SelectItem>
              </SelectContent>
            </Select>

            {(filterYears.length > 0 || filterGender !== 'todos' || filterTipo !== 'todos') && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-gray-500"
                onClick={() => { setFilterYears([]); setFilterGender('todos'); setFilterTipo('todos'); }}
              >
                Limpiar
              </Button>
            )}
          </div>
        </div>

        {/* Mini KPIs de retiros (se actualizan con filtros) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="text-center p-3 bg-red-50 rounded-lg border border-red-200">
            <p className="text-xl font-bold text-red-600">{retirados.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {retirados.length !== todosRetirados.length
                ? `Filtrados (${todosRetirados.length} total)`
                : 'Total retirados'}
            </p>
          </div>
          <div className="text-center p-3 bg-orange-50 rounded-lg border border-orange-200">
            <p className="text-xl font-bold text-orange-600">{retirosVoluntarios}</p>
            <p className="text-xs text-gray-500 mt-0.5">Voluntarios</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-xl font-bold text-gray-600">{retirosInvoluntarios}</p>
            <p className="text-xs text-gray-500 mt-0.5">Involuntarios</p>
          </div>
          <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-200">
            <p className="text-xl font-bold text-purple-600">{retirosTempranos}</p>
            <p className="text-xs text-gray-500 mt-0.5">Retiros &lt; 3 meses</p>
          </div>
        </div>

        {/* Charts 2×2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

          {/* Tendencia mensual */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm text-[#4A4A4A]">
                Tendencia {filterYears.length === 0 ? currentYear : filterYears.sort().join(' + ')}
              </CardTitle>
              <CardDescription className="text-xs">Ingresos y retiros registrados en esta empresa</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="month" stroke="#4A4A4A" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#4A4A4A" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="ingresos" fill="#008C3C" name="Ingresos" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="retiros" fill="#EF4444" name="Retiros" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Género */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm text-[#4A4A4A]">Retiros por Género</CardTitle>
              <CardDescription className="text-xs">{retirados.length} personas retiradas (filtro aplicado)</CardDescription>
            </CardHeader>
            <CardContent>
              {genderData.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-12">Sin datos</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={genderData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {genderData.map((entry, i) => (
                        <Cell key={i} fill={GENDER_COLORS[entry.name] ?? '#94A3B8'} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Rango de edad */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm text-[#4A4A4A]">Retiros por Rango de Edad</CardTitle>
            </CardHeader>
            <CardContent>
              {ageData.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-12">Sin datos de edad</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={ageData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="name" stroke="#4A4A4A" tick={{ fontSize: 12 }} />
                    <YAxis stroke="#4A4A4A" tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="value" fill="#1F8FBF" name="Personas" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Duración */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm text-[#4A4A4A]">Retiros por Duración en la Empresa</CardTitle>
              <CardDescription className="text-xs">Cuánto tiempo llevaban antes de retirarse</CardDescription>
            </CardHeader>
            <CardContent>
              {durationData.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-12">Sin datos de duración</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={durationData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="name" stroke="#4A4A4A" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#4A4A4A" tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="value" fill="#F59E0B" name="Personas" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabla detallada */}
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-sm text-[#4A4A4A]">Detalle de Personas Retiradas</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {retiradosFiltrados.length !== retirados.length
                    ? `${retiradosFiltrados.length} de ${retirados.length} registros`
                    : `${retirados.length} registros`}
                  {retiradosFiltrados.length > 0 && ` · mostrando ${Math.min(PAGE_SIZE, retiradosFiltrados.length)} por página`}
                </CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Búsqueda por nombre */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <Input
                    placeholder="Buscar por nombre..."
                    value={retiradosSearch}
                    onChange={e => setRetiradosSearch(e.target.value)}
                    className="pl-8 h-8 text-xs w-[190px] border-[#008C3C]/30 focus-visible:ring-[#008C3C]"
                  />
                  {retiradosSearch && (
                    <button onClick={() => setRetiradosSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Selector de página en header */}
                {retiradosFiltrados.length > PAGE_SIZE && (
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      disabled={page === 1}
                      onClick={() => setPage(p => p - 1)}
                    >
                      ‹ Anterior
                    </Button>
                    <span className="text-xs text-gray-500 px-2">
                      {page} / {Math.ceil(retiradosFiltrados.length / PAGE_SIZE)}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                    disabled={page >= Math.ceil(retiradosFiltrados.length / PAGE_SIZE)}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Siguiente ›
                  </Button>
                </div>
              )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {retirados.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                {todosRetirados.length > 0
                  ? 'Ningún retirado coincide con los filtros aplicados'
                  : 'No hay retirados registrados para esta empresa'}
              </p>
            ) : retiradosFiltrados.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                Ningún retirado coincide con la búsqueda
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        {['Nombre', 'Género', 'Edad', 'Cargo', 'Proyecto', 'Duración', 'Fecha Retiro', 'Motivo'].map(h => (
                          <th key={h} className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {retiradosFiltrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((emp: any) => {
                        const termDate = toDate(emp.administrativeRecord?.terminationDate);
                        const durationMonths = getDurationMonths(emp, termDate ?? undefined);
                        const age = getAge(emp);
                        const gender = normalizeGender(emp.personalData?.gender);
                        const genderColor =
                          gender === 'Masculino' ? 'border-blue-200 text-blue-700' :
                          gender === 'Femenino'  ? 'border-pink-200 text-pink-700' :
                                                    'border-gray-200 text-gray-600';
                        return (
                          <tr key={emp.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                            <td className="py-2.5 px-3 font-medium text-[#4A4A4A] whitespace-nowrap">
                              {emp.fullName || emp.email}
                            </td>
                            <td className="py-2.5 px-3">
                              <Badge variant="outline" className={`${genderColor} text-xs`}>
                                {gender}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">
                              {age > 0 ? `${age} años` : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-gray-600 text-xs whitespace-nowrap">
                              {emp.contractInfo?.assignment?.position || emp.personalData?.position || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-gray-600 text-xs whitespace-nowrap">
                              {emp.contractInfo?.assignment?.project || '—'}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className={durationMonths > 0 && durationMonths < 3 ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                                {formatDuration(durationMonths)}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-gray-600 text-xs whitespace-nowrap">
                              {formatDate(emp.administrativeRecord?.terminationDate)}
                            </td>
                            <td className="py-2.5 px-3 text-gray-600 text-xs whitespace-nowrap">
                              {emp.administrativeRecord?.terminationReason || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer de paginación */}
                {retiradosFiltrados.length > PAGE_SIZE && (
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-400">
                      Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, retiradosFiltrados.length)} de {retiradosFiltrados.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={page === 1}
                        onClick={() => setPage(p => p - 1)}
                      >
                        ‹ Anterior
                      </Button>
                      {Array.from({ length: Math.ceil(retiradosFiltrados.length / PAGE_SIZE) }, (_, i) => i + 1).map(n => (
                        <Button
                          key={n}
                          size="sm"
                          variant={page === n ? 'default' : 'outline'}
                          className={`h-7 w-7 p-0 text-xs ${page === n ? 'bg-[#008C3C] hover:bg-[#006C2F] text-white' : ''}`}
                          onClick={() => setPage(n)}
                        >
                          {n}
                        </Button>
                      ))}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={page >= Math.ceil(retiradosFiltrados.length / PAGE_SIZE)}
                        onClick={() => setPage(p => p + 1)}
                      >
                        Siguiente ›
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Colaboradores Activos ── */}
      <section>
        <h2 className="text-lg font-semibold text-[#4A4A4A] mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-[#008C3C]" /> Colaboradores Activos ({activos.length})
        </h2>

        {/* KPIs género – siempre del total */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {(['Masculino', 'Femenino', 'Otro'] as const).map(g => {
            const count = activos.filter(e => normalizeGender(e.personalData?.gender) === g).length;
            const color = g === 'Masculino' ? 'blue' : g === 'Femenino' ? 'pink' : 'purple';
            return (
              <div key={g} className={`text-center p-3 bg-${color}-50 rounded-lg border border-${color}-200`}>
                <p className={`text-xl font-bold text-${color}-600`}>{count}</p>
                <p className="text-xs text-gray-500">{g}</p>
              </div>
            );
          })}
        </div>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            {/* Barra de filtros */}
            <div className="flex flex-wrap gap-2 items-center">
              {/* Búsqueda por nombre */}
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <Input
                  placeholder="Buscar por nombre..."
                  value={activosSearch}
                  onChange={e => setActivosSearch(e.target.value)}
                  className="pl-8 h-8 text-xs border-[#008C3C]/30 focus-visible:ring-[#008C3C]"
                />
                {activosSearch && (
                  <button onClick={() => setActivosSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Proyecto */}
              <Select value={activosProject} onValueChange={setActivosProject}>
                <SelectTrigger className="w-[150px] h-8 text-xs border-[#008C3C]/30">
                  <SelectValue placeholder="Proyecto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los proyectos</SelectItem>
                  {activosProjects.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Área */}
              {activosAreas.length > 0 && (
                <Select value={activosArea} onValueChange={setActivosArea}>
                  <SelectTrigger className="w-[140px] h-8 text-xs border-[#008C3C]/30">
                    <SelectValue placeholder="Área" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas las áreas</SelectItem>
                    {activosAreas.map(a => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Género */}
              <Select value={activosGender} onValueChange={setActivosGender}>
                <SelectTrigger className="w-[120px] h-8 text-xs border-[#008C3C]/30">
                  <SelectValue placeholder="Género" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="Masculino">Masculino</SelectItem>
                  <SelectItem value="Femenino">Femenino</SelectItem>
                  <SelectItem value="Otro">Otro</SelectItem>
                </SelectContent>
              </Select>

              {/* Ordenar por antigüedad */}
              <Select value={activosSort} onValueChange={v => setActivosSort(v as typeof activosSort)}>
                <SelectTrigger className="w-[160px] h-8 text-xs border-[#008C3C]/30">
                  <SelectValue placeholder="Ordenar por" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">Sin ordenar</SelectItem>
                  <SelectItem value="mas-antiguo">Más antiguo primero</SelectItem>
                  <SelectItem value="mas-nuevo">Más nuevo primero</SelectItem>
                </SelectContent>
              </Select>

              {/* Limpiar filtros */}
              {(activosSearch || activosProject !== 'todos' || activosGender !== 'todos' || activosArea !== 'todos' || activosSort !== 'ninguno') && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-gray-500"
                  onClick={() => { setActivosSearch(''); setActivosProject('todos'); setActivosGender('todos'); setActivosArea('todos'); setActivosSort('ninguno'); }}
                >
                  Limpiar
                </Button>
              )}

              {/* Contador de resultados */}
              <span className="text-xs text-gray-400 ml-auto">
                {filteredActivos.length !== activos.length
                  ? `${filteredActivos.length} de ${activos.length}`
                  : `${activos.length} total`}
              </span>
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            {activos.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Sin colaboradores activos</p>
            ) : filteredActivos.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Ningún colaborador coincide con los filtros</p>
            ) : (
              <>
                <div className="space-y-2">
                  {filteredActivos.slice((activosPage - 1) * PAGE_SIZE, activosPage * PAGE_SIZE).map((emp: any) => {
                    const duration = getDurationMonths(emp);
                    const gender = normalizeGender(emp.personalData?.gender);
                    const avatarBg =
                      gender === 'Masculino' ? 'bg-blue-500' :
                      gender === 'Femenino'  ? 'bg-pink-500' : 'bg-purple-500';
                    return (
                      <div key={emp.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${avatarBg}`}>
                            {(emp.fullName || emp.email || '?')[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[#4A4A4A] truncate">{emp.fullName || emp.email}</p>
                            <p className="text-xs text-gray-500 truncate">
                              {emp.contractInfo?.assignment?.position || '—'}
                              {emp.contractInfo?.assignment?.project && (
                                <span className="text-[#008C3C]"> · {emp.contractInfo.assignment.project}</span>
                              )}
                              {emp.contractInfo?.assignment?.area && (
                                <span className="text-gray-400"> · {emp.contractInfo.assignment.area}</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <p className="text-xs text-gray-400">{gender}</p>
                          {duration > 0 && (
                            <p className="text-xs font-medium text-[#008C3C]">{formatDuration(duration)}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Paginación activos */}
                {filteredActivos.length > PAGE_SIZE && (
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-400">
                      Mostrando {(activosPage - 1) * PAGE_SIZE + 1}–{Math.min(activosPage * PAGE_SIZE, filteredActivos.length)} de {filteredActivos.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={activosPage === 1}
                        onClick={() => setActivosPage(p => p - 1)}
                      >
                        ‹ Anterior
                      </Button>
                      {Array.from({ length: Math.ceil(filteredActivos.length / PAGE_SIZE) }, (_, i) => i + 1).map(n => (
                        <Button
                          key={n}
                          size="sm"
                          variant={activosPage === n ? 'default' : 'outline'}
                          className={`h-7 w-7 p-0 text-xs ${activosPage === n ? 'bg-[#008C3C] hover:bg-[#006C2F] text-white' : ''}`}
                          onClick={() => setActivosPage(n)}
                        >
                          {n}
                        </Button>
                      ))}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={activosPage >= Math.ceil(filteredActivos.length / PAGE_SIZE)}
                        onClick={() => setActivosPage(p => p + 1)}
                      >
                        Siguiente ›
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};
