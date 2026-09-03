import { useEffect, useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, LabelList,
} from 'recharts';
import {
  Users, Loader2, TrendingDown, TrendingUp,
  Building2, UserCheck, FolderKanban,
  AlertTriangle, Sparkles,
  Filter, X, MapPin, VenusAndMars, UsersRound, BarChart3,
} from 'lucide-react';
import { getEmployeeDirectoryUsers } from '@/services/employeeDirectoryService';
import { analyticsService, isSenaApprentice, toDate as toDateEmployment } from '@/services/analyticsService';
import { companyService } from '@/services/companyService';
import { projectService } from '@/services/projectService';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RotationPage } from '@/views/Analytics/RotationPage';
import type { RotationFilters } from '@/views/Analytics/RotationPage';

// ── helpers ──────────────────────────────────────────────────────────────────

// Paleta "sin colores": todo en tinta neutra salvo la rotación elevada, que
// usa el único acento del sistema (terracota) para señalar que necesita atención.
function rotacionSemaforo(pct: number) {
  if (pct <= 3)  return { color: '#14171C', label: 'Óptima',   bg: '#F1F2F4', border: '#E7E9EE', needsAttention: false };
  if (pct <= 7)  return { color: '#14171C', label: 'Moderada', bg: '#F1F2F4', border: '#E7E9EE', needsAttention: false };
  if (pct <= 12) return { color: '#A8552F', label: 'Alta',     bg: '#FDF2EE', border: '#F0DCD2', needsAttention: true  };
  return           { color: '#A8552F', label: 'Crítica',  bg: '#FDF2EE', border: '#F0DCD2', needsAttention: true  };
}

function ageGroup(birthDate: any, storedAge?: number, storedRange?: string, referenceDate = new Date()): string {
  // Las fechas de nacimiento históricas pueden venir como DD/MM/YYYY; el lector
  // de emplements valida y desambigua esos formatos antes de calcular la edad.
  const bd = toDateEmployment(birthDate);
  const today = referenceDate;
  let age: number | undefined;
  if (bd) {
    age = today.getFullYear() - bd.getFullYear();
    const hasNotHadBirthday = today.getMonth() < bd.getMonth()
      || (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate());
    if (hasNotHadBirthday) age -= 1;
  } else if (storedAge !== undefined && storedAge !== null && Number.isFinite(Number(storedAge))) {
    age = Number(storedAge);
  }
  if (age === undefined) {
    const knownRange = storedRange?.trim();
    if (!knownRange) return 'Sin dato';
    const normalized = knownRange.replace(/años?/gi, '').replace(/\s+/g, ' ').trim();
    const numbers = normalized.match(/\d+/g)?.map(Number) ?? [];
    if (numbers.length > 0) {
      const referenceAge = numbers[0];
      if (referenceAge >= 15 && referenceAge <= 100) age = referenceAge;
    }
    if (age === undefined) return 'Sin dato';
  }
  if (age < 15 || age > 100) return 'Sin dato';
  if (age < 26)  return '18–25';
  if (age < 31)  return '26–30';
  if (age < 36)  return '31–35';
  if (age < 41)  return '36–40';
  if (age < 51)  return '41–50';
  return '51+';
}

function normalizeGender(value?: string): string {
  const raw = value?.trim();
  if (!raw) return 'Sin dato';
  const key = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
  if (['m', 'masculino', 'hombre', 'male'].includes(key)) return 'Masculino';
  if (['f', 'femenino', 'mujer', 'female'].includes(key)) return 'Femenino';
  if (['no binario', 'no-binario', 'non binary', 'non-binary'].includes(key)) return 'No binario';
  if (key === 'prefiero no decir') return 'Prefiero no decir';
  return raw.charAt(0).toLocaleUpperCase('es') + raw.slice(1).toLocaleLowerCase('es');
}

function normalizeWorkModality(value?: string): string {
  const raw = value?.trim();
  if (!raw) return 'Sin dato';
  const key = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
    .replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (['no aplica', 'no aplica.', 'n/a', 'na'].includes(key)) return 'No aplica';
  if (['presencial', 'presencialidad', 'en oficina'].includes(key)) return 'Presencial';
  if (['remoto', 'remota', 'teletrabajo', 'trabajo remoto'].includes(key)) return 'Remoto';
  if (['hibrido', 'hibrida', 'mixto', 'mixta'].includes(key)) return 'Híbrido';
  return raw.charAt(0).toLocaleUpperCase('es') + raw.slice(1).toLocaleLowerCase('es');
}

const normalizeDashboardName = (value?: string): string => String(value ?? '')
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es')
  .replace(/\s+/g, ' ');

const AGE_ORDER = ['18–25','26–30','31–35','36–40','41–50','51+','Sin dato'];
const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const PIE_COLORS = ['#14171C','#565D6B','#A8552F','#8B93A1','#C98862','#2E333D','#B8BFCA','#D9AE94'];

// ── sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon, onClick }: {
  label: string; value: string | number; sub: string;
  icon: React.ReactNode; color?: string; onClick?: () => void;
}) {
  return (
    <div onClick={onClick}
      className="bg-white rounded-xl border border-[#E7E9EE] p-5 shadow-[0_1px_2px_rgba(20,23,28,0.04),0_1px_8px_rgba(20,23,28,0.03)] hover:shadow-md transition-all cursor-pointer hover:-translate-y-px">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold text-[#8B93A1] uppercase tracking-wide">{label}</span>
        <div className="w-7 h-7 rounded-lg bg-[#F1F2F4] flex items-center justify-center">{icon}</div>
      </div>
      <p className="text-3xl font-bold text-[#14171C] tracking-tight">{value}</p>
      <p className="text-xs text-[#8B93A1] mt-1.5">{sub}</p>
    </div>
  );
}

function SectionTitle({ icon, children, right }: { icon?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3 mt-7">
      <p className="flex items-center gap-1.5 text-[11px] font-bold text-[#8B93A1] uppercase tracking-wider">
        {icon}{children}
      </p>
      {right && <span className="text-[11px] text-[#8B93A1] normal-case font-normal">{right}</span>}
    </div>
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
  const [employments, setEmployments] = useState<any[]>([]);
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
        const [users, emps, comps, projs] = await Promise.all([
          getEmployeeDirectoryUsers(),
          analyticsService.getEmploymentRecords(),
          companyService.getAll(),
          projectService.getAll(),
        ]);
        setAllUsers(users);
        setEmployments(emps);
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
  type DashboardAssignment = { company?: string; project?: string; contractType?: string; modality?: string; startDate?: any; endDate?: any; status?: string };
  const assignmentsOf = (u: any): DashboardAssignment[] =>
    u._assignments?.length ? u._assignments : [u.contractInfo?.assignment].filter(Boolean);

  const companyOptions = useMemo(() =>
    thCompanies.map(c => c.name),
    [thCompanies]
  );

  // Cuando hay una empresa elegida en el filtro, solo se listan los proyectos de
  // ESA empresa — si no, el selector de Proyecto ofrece nombres que no aplican
  // a la empresa ya seleccionada.
  const projectOptions = useMemo(() => {
    const names = new Set<string>();
    allUsers.filter(u => u.role === 'colaborador').forEach(u => {
      assignmentsOf(u).forEach(a => {
        const p = a.project?.trim();
        if (!p) return;
        if (filterCompany !== 'all' && a.company?.trim() !== filterCompany) return;
        names.add(p);
      });
    });
    return [...names].sort((a, b) => a.localeCompare(b, 'es'));
  }, [allUsers, filterCompany]);

  const rotationFilters = useMemo<RotationFilters>(() => ({
    year: filterYear, month: filterMonth,
    empresa: filterCompany, proyecto: filterProject,
  }), [filterYear, filterMonth, filterCompany, filterProject]);

  const curYearNum = new Date().getFullYear();
  const yearOptions = [curYearNum - 2, curYearNum - 1, curYearNum, curYearNum + 1];

  // ── Filtered active users (respects company filter) ────────────────────────
  // Solo cuentan colaboradores de empresas con Talento Humano activo — esta
  // pantalla es la analítica de TH, no un headcount corporativo general.
  const activeUsers = useMemo(() => {
    const thNames = new Set(thCompanies.flatMap(c => [c.name, ...(c.aliases ?? [])]).map(normalizeDashboardName));
    return allUsers.filter(u => {
      if (u.role !== 'colaborador') return false;
      return assignmentsOf(u).some(a => {
        const company = a.company?.trim();
        if (!company || !thNames.has(normalizeDashboardName(company)) || isSenaApprentice(a)) return false;
        if (filterCompany !== 'all' && normalizeDashboardName(company) !== normalizeDashboardName(filterCompany)) return false;
        if (filterProject !== 'all' && normalizeDashboardName(a.project) !== normalizeDashboardName(filterProject)) return false;
        return true;
      });
    });
  }, [allUsers, filterCompany, filterProject, thCompanies]);

  // Demografía representa una foto al cierre del mes seleccionado. Para el año
  // completo usa el último día disponible del año (hoy si es el año actual).
  const demographicCutoff = useMemo(() => {
    const year = Number(filterYear);
    const requested = filterMonth === 'all'
      ? new Date(year, 11, 31)
      : new Date(year, Number(filterMonth) + 1, 0);
    return requested > now ? now : requested;
  }, [filterYear, filterMonth]);
  const demographicAssignmentsOf = (u: any): DashboardAssignment[] => {
    const relationships: DashboardAssignment[] = u._allAssignments?.length ? u._allAssignments : assignmentsOf(u);
    return relationships.filter(relationship => {
      if (relationship.status !== 'active' && relationship.status !== 'retired') return false;
      if (demographicCutoff >= now) {
        if (relationship.status !== 'active') return false;
      } else {
      const start = toDateEmployment(relationship.startDate);
      const end = toDateEmployment(relationship.endDate);
      if (!start || start > demographicCutoff) return false;
      // Misma regla usada por Movimientos: una relación retirada solo puede
      // reconstruirse históricamente cuando tiene una fecha de retiro válida.
      // Las relaciones activas no dependen de endDate para esta fotografía.
      if (relationship.status === 'retired' && (!end || end < demographicCutoff)) return false;
      }
      if (filterCompany !== 'all' && relationship.company?.trim() !== filterCompany) return false;
      if (filterProject !== 'all' && relationship.project?.trim() !== filterProject) return false;
      return true;
    });
  };
  const demographicUsers = useMemo(() => {
    const thNames = new Set(thCompanies.map(company => company.name));
    return allUsers.filter(user => demographicAssignmentsOf(user)
      .some(assignment => assignment.company?.trim() && thNames.has(assignment.company.trim())));
  }, [allUsers, filterCompany, filterProject, filterYear, filterMonth, thCompanies]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const colaboradores   = activeUsers.length;
    const excolaboradores = allUsers.filter(u => u.role === 'excolaborador').length;

    const compFilter = (e: any) => filterCompany === 'all'
      || normalizeDashboardName(e.companyName) === normalizeDashboardName(filterCompany);

    // Un ingreso/retiro con fecha futura (ej. una terminación ya registrada con
    // preaviso) todavía no ocurrió — no debe sumar hasta que su fecha llegue.
    const ingresosMes = employments.filter(e => {
      const d = toDateEmployment(e.startDate);
      return d && d <= now && d.getMonth() === curMonth && d.getFullYear() === curYear && compFilter(e);
    }).length;

    const retirosMes = employments.filter(e => {
      const d = toDateEmployment(e.endDate);
      return e.status === 'retired' && d && d <= now && d.getMonth() === curMonth && d.getFullYear() === curYear && compFilter(e);
    }).length;

    const esVoluntario = (r = '') => {
      const l = r.toLowerCase();
      return l.includes('renuncia') || l.includes('mutuo acuerdo') || l === 'voluntario';
    };
    const retirosVol = employments.filter(e => {
      const d = toDateEmployment(e.endDate);
      return e.status === 'retired' && d && d <= now && d.getMonth() === curMonth && d.getFullYear() === curYear
        && compFilter(e) && !isSenaApprentice(e) && esVoluntario(e.terminationReason);
    }).length;
    const rotacionPct = colaboradores > 0
      ? Math.round((retirosVol / colaboradores) * 100 * 10) / 10 : 0;

    return { colaboradores, excolaboradores, ingresosMes, retirosMes, retirosVol, rotacionPct };
  }, [activeUsers, allUsers, employments, curMonth, curYear, filterCompany]);

  const semaforo = rotacionSemaforo(stats.rotacionPct);

  // Gauge de rotación: semicírculo, tope visual en 15% (más allá de eso, gauge lleno).
  const gaugeRadius = 70;
  const gaugeCircumference = Math.PI * gaugeRadius;
  const rotationGaugePct = Math.min(stats.rotacionPct / 15, 1);
  const gaugeFilled = rotationGaugePct * gaugeCircumference;

  // ── Trend 6 months ─────────────────────────────────────────────────────────
  const trendData = useMemo(() => {
    const compFilter = (e: any) => filterCompany === 'all' || e.companyName === filterCompany;
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(curYear, curMonth - 5 + i, 1);
      const mo = d.getMonth(); const yr = d.getFullYear();
      const ingresos = employments.filter(e => { const dd = toDateEmployment(e.startDate); return dd && dd <= now && dd.getMonth() === mo && dd.getFullYear() === yr && compFilter(e); }).length;
      const retiros  = employments.filter(e => { const dd = toDateEmployment(e.endDate); return e.status === 'retired' && dd && dd <= now && dd.getMonth() === mo && dd.getFullYear() === yr && compFilter(e); }).length;
      return { mes: MONTH_NAMES[mo], ingresos, retiros };
    });
  }, [employments, curMonth, curYear, filterCompany]);

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

  // Personas activas de las cuentas analíticas SENA. En los datos históricos el
  // tipo de contrato no siempre está diligenciado, por eso aquí la pertenencia
  // se determina por el nombre de la cuenta analítica.
  const projectHeadcount = useMemo(() => {
    const thNames = new Set(thCompanies.flatMap(c => [c.name, ...(c.aliases ?? [])]).map(normalizeDashboardName));
    const map = new Map<string, Set<string>>();
    allUsers.filter(u => u.role === 'colaborador').forEach(u => {
      const projectsForUser = new Set(
        assignmentsOf(u)
          .filter(a => {
            const projectName = a.project?.trim();
            return a.company?.trim()
              && thNames.has(normalizeDashboardName(a.company))
              && projectName
              && projectName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('sena');
          })
          .map(a => a.project?.trim())
          .filter(Boolean) as string[]
      );
      projectsForUser.forEach(projectName => {
        if (!map.has(projectName)) map.set(projectName, new Set());
        map.get(projectName)!.add(u.id);
      });
    });
    return [...map.entries()]
      .map(([name, ids]) => ({ name, count: ids.size }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
  }, [allUsers, thCompanies]);

  // ── Colaboradores con asignación activa en más de una empresa TH ────────────
  // Por esto la suma de las tarjetas por empresa puede superar a "Colaboradores
  // activos": esa persona se cuenta una sola vez en el total, pero aparece en
  // la tarjeta de cada empresa donde tiene una relación laboral activa.
  const dualCompanyColaboradores = useMemo(() => {
    const thNames = new Set(thCompanies.map(c => c.name));
    return activeUsers
      .map(u => ({
        name: u.fullName,
        companies: [...new Set(assignmentsOf(u).map(a => a.company?.trim()).filter((c): c is string => !!c && thNames.has(c)))],
      }))
      .filter(u => u.companies.length > 1);
  }, [activeUsers, thCompanies]);

  // ── Empresas TH ordenadas por headcount (para la vista tipo treemap) ────────
  const sortedThCompanies = useMemo(() =>
    [...thCompanies].sort((a, b) => (companyHeadcount.get(b.name) ?? 0) - (companyHeadcount.get(a.name) ?? 0)),
    [thCompanies, companyHeadcount]
  );

  // Empresa dominante para el bloque grande del treemap, y el resto alrededor.
  const totalThHeadcount = sortedThCompanies.reduce((sum, c) => sum + (companyHeadcount.get(c.name) ?? 0), 0);
  const dominantCompany = sortedThCompanies[0];
  const restCompanies = sortedThCompanies.slice(1);

  // ── Demographic breakdowns ──────────────────────────────────────────────────
  const byCompany = useMemo(() => {
    const map = new Map<string, Set<string>>();
    demographicUsers.forEach(u => {
      const companiesForUser = new Set(demographicAssignmentsOf(u).map(a => a.company?.trim()).filter(Boolean) as string[]);
      (companiesForUser.size ? companiesForUser : new Set(['Sin empresa'])).forEach(c => {
        if (!map.has(c)) map.set(c, new Set());
        map.get(c)!.add(u.id);
      });
    });
    return [...map.entries()].map(([name, ids]) => ({ name: name.length > 28 ? name.slice(0, 26) + '…' : name, value: ids.size })).sort((a, b) => b.value - a.value);
  }, [demographicUsers, filterCompany, filterProject, filterYear, filterMonth]);

  const byProject = useMemo(() => {
    const map = new Map<string, Set<string>>();
    demographicUsers.forEach(u => {
      const projectsForUser = new Set(demographicAssignmentsOf(u).map(a => a.project?.trim()).filter(Boolean) as string[]);
      (projectsForUser.size ? projectsForUser : new Set(['Sin cuenta analítica'])).forEach(p => {
        if (!map.has(p)) map.set(p, new Set());
        map.get(p)!.add(u.id);
      });
    });
    return [...map.entries()].map(([name, ids]) => ({ name: name.length > 28 ? name.slice(0, 26) + '…' : name, value: ids.size })).sort((a, b) => b.value - a.value);
  }, [demographicUsers, filterCompany, filterProject, filterYear, filterMonth]);

  const byGender = useMemo(() => {
    const map = new Map<string, number>();
    demographicUsers.forEach(u => { const g = normalizeGender(u.personalData?.gender); map.set(g, (map.get(g) ?? 0) + 1); });
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [demographicUsers]);

  const byCity = useMemo(() => {
    const map = new Map<string, number>();
    demographicUsers.forEach(u => { const c = u.location?.city?.trim() || 'Sin dato'; map.set(c, (map.get(c) ?? 0) + 1); });
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 15);
  }, [demographicUsers]);

  const byAge = useMemo(() => {
    const map = new Map<string, number>(AGE_ORDER.map(g => [g, 0]));
    demographicUsers.forEach(u => {
      const g = ageGroup(u.personalData?.birthDate, u.personalData?.age, u.personalData?.ageRange, demographicCutoff);
      map.set(g, (map.get(g) ?? 0) + 1);
    });
    return AGE_ORDER.map(name => ({ name, value: map.get(name) ?? 0 })).filter(d => d.value > 0);
  }, [demographicUsers]);

  const byContract = useMemo(() => {
    const map = new Map<string, number>();
    demographicUsers.forEach(u => {
      const assignment = demographicAssignmentsOf(u)[0];
      const t = assignment?.contractType?.trim() || u.contractInfo?.contract?.contractType?.trim() || 'No especificado';
      map.set(t, (map.get(t) ?? 0) + 1);
    });
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [demographicUsers, filterCompany, filterProject, filterYear, filterMonth]);

  const byModality = useMemo(() => {
    const map = new Map<string, number>();
    demographicUsers.forEach(u => {
      const assignment = demographicAssignmentsOf(u)[0];
      const m = normalizeWorkModality(assignment?.modality || u.contractInfo?.workConditions?.workModality);
      map.set(m, (map.get(m) ?? 0) + 1);
    });
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [demographicUsers, filterCompany, filterProject, filterYear, filterMonth]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>

      {/* Header */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <p className="text-[11px] font-semibold text-[#8B93A1] uppercase tracking-wider mb-1">Inteligencia de Talento Humano</p>
          <h1 className="text-2xl font-bold text-[#14171C] tracking-tight">Analítica de Talento Humano</h1>
          <p className="text-sm text-[#565D6B] mt-0.5">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-sm font-semibold"
            style={{ color: semaforo.color, borderColor: semaforo.border, background: semaforo.bg }}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: semaforo.color }} />
            Rotación {semaforo.label} · {stats.rotacionPct}%
          </div>
        </div>
      </div>

      {/* Filtro unificado — solo en Movimientos y Demografía */}
      {tab !== 'resumen' && (
        <div className="mb-4 p-3 bg-white rounded-xl border border-[#E7E9EE] shadow-sm">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Filter className="w-3.5 h-3.5 text-[#565D6B]" />
            <span className="text-xs font-semibold text-[#565D6B] uppercase tracking-wide">Filtros</span>
            {(filterCompany !== 'all' || filterProject !== 'all' || filterMonth !== 'all' || filterYear !== String(curYearNum)) && (
              <span className="ml-1 text-[10px] bg-[#14171C] text-white px-1.5 py-0.5 rounded-full">Activos</span>
            )}
            <button onClick={() => { setFilterCompany('all'); setFilterProject('all'); setFilterMonth('all'); setFilterYear(String(curYearNum)); }}
              className="ml-auto text-[10px] text-gray-400 hover:text-[#A8552F] flex items-center gap-1">
              <X className="w-3 h-3" /> Limpiar
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* Año */}
            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger className="border-[#E7E9EE] focus:ring-[#14171C] text-sm h-9">
                <SelectValue placeholder="Año" />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Mes */}
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="border-[#E7E9EE] focus:ring-[#14171C] text-sm h-9">
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
              <SelectTrigger className="border-[#E7E9EE] focus:ring-[#14171C] text-sm h-9">
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
              <SelectTrigger className="border-[#E7E9EE] focus:ring-[#14171C] text-sm h-9">
                <SelectValue placeholder="Todas las cuentas analíticas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las cuentas analíticas</SelectItem>
                {projectOptions.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-[#F1F2F4] rounded-xl p-1">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all
                ${tab === t.id ? 'bg-white shadow-sm text-[#14171C]' : 'text-[#8B93A1] hover:text-[#565D6B]'}`}>
              <Icon className="w-3.5 h-3.5" />{t.label}
            </button>
          );
        })}
      </div>

      {/* ── TAB: RESUMEN ─────────────────────────────────────────────────────── */}
      {tab === 'resumen' && (
        <div>
          {/* Jerarquía de distribución de talento */}
          <SectionTitle icon={<Building2 className="w-3.5 h-3.5" />} right="Tamaño proporcional al headcount">
            Distribución de talento · Empresas TH ({sortedThCompanies.length})
          </SectionTitle>
          {sortedThCompanies.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-6 text-center bg-white rounded-xl border border-[#E7E9EE]">Sin empresas de Talento Humano configuradas</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-[1.6fr_1fr] gap-2.5 mb-2">
              {/* Empresa dominante */}
              {dominantCompany && (() => {
                const hc = companyHeadcount.get(dominantCompany.name) ?? 0;
                const pct = totalThHeadcount > 0 ? Math.round((hc / totalThHeadcount) * 100) : 0;
                const active = filterCompany === dominantCompany.name;
                return (
                  <button
                    onClick={() => { setFilterCompany((prev: any) => prev === dominantCompany.name ? 'all' : dominantCompany.name); setFilterProject('all'); }}
                    className="text-left bg-white rounded-xl border p-6 shadow-sm flex flex-col justify-between transition-all hover:-translate-y-px hover:shadow-md min-h-[176px]"
                    style={{ borderWidth: 1.5, borderColor: active ? '#A8552F' : '#E7E9EE' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-[#8B93A1] uppercase tracking-wide">Entidad principal</span>
                      <span className="text-[11px] font-bold text-[#14171C] bg-[#F1F2F4] px-2 py-0.5 rounded-full">{pct}% del headcount TH</span>
                    </div>
                    <div>
                      <p className="text-4xl font-bold text-[#14171C] tracking-tight leading-none">{hc}</p>
                      <p className="text-base font-semibold text-[#14171C] mt-2">{dominantCompany.name}</p>
                      <p className="text-xs text-[#8B93A1] mt-0.5">colaboradores activos</p>
                    </div>
                  </button>
                );
              })()}

              {/* Resto de empresas */}
              <div className="grid grid-cols-2 sm:grid-cols-2 gap-2.5">
                {restCompanies.map(c => {
                  const hc = companyHeadcount.get(c.name) ?? 0;
                  const active = filterCompany === c.name;
                  return (
                    <button
                      key={c.id}
                      onClick={() => { setFilterCompany((prev: any) => prev === c.name ? 'all' : c.name); setFilterProject('all'); }}
                      className="text-left bg-white rounded-xl border p-3.5 shadow-sm hover:shadow-md transition-all hover:-translate-y-px flex flex-col justify-between"
                      style={{ borderColor: active ? '#A8552F' : '#E7E9EE' }}
                    >
                      <span className="text-[10px] font-semibold text-[#8B93A1] uppercase tracking-wide leading-tight line-clamp-2">{c.name}</span>
                      <p className="text-xl font-bold text-[#14171C] mt-1">{hc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <SectionTitle icon={<FolderKanban className="w-3.5 h-3.5" />}>Aprendices SENA por cuenta analítica</SectionTitle>
          {projectHeadcount.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-6 text-center bg-white rounded-xl border border-[#E7E9EE]">
              Sin aprendices SENA asignados a cuentas analíticas
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {projectHeadcount.map(project => (
                <div key={project.name} className="bg-white rounded-xl border border-[#E7E9EE] shadow-sm p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-[#8B93A1] uppercase tracking-wide">Cuenta analítica</p>
                      <p className="mt-1 text-sm font-semibold text-[#14171C] truncate" title={project.name}>{project.name}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-2xl font-bold text-[#14171C] leading-none">{project.count}</p>
                      <p className="mt-1 text-[10px] text-[#8B93A1]">aprendiz{project.count === 1 ? '' : 'es'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Rotación general */}
          <h2 className="mt-7 mb-4 text-lg font-bold text-[#14171C] tracking-tight">
            {filterCompany === 'all' ? 'Rotación general de las empresas' : `Rotación de ${filterCompany}`}
          </h2>
          <div className="space-y-3">

            <div className="bg-white rounded-xl border border-[#E7E9EE] shadow-sm p-6">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-[15px] font-bold text-[#14171C] tracking-tight">Estabilidad y retención</h2>
                  <p className="text-[11px] text-[#8B93A1] mt-1">
                    {filterCompany === 'all' ? 'Todas las empresas de Talento Humano' : `Empresa seleccionada: ${filterCompany}`}
                  </p>
                </div>
                {filterCompany !== 'all' && (
                  <button
                    type="button"
                    onClick={() => { setFilterCompany('all'); setFilterProject('all'); }}
                    className="text-[10px] font-semibold text-[#565D6B] bg-[#F1F2F4] hover:bg-[#E7E9EE] px-2.5 py-1 rounded-full transition-colors"
                  >
                    Ver general
                  </button>
                )}
              </div>
              <div className="flex flex-col items-center">
                <svg width="180" height="108" viewBox="0 0 200 120">
                  <path d="M30 100 A70 70 0 0 1 170 100" fill="none" stroke="#EEF0F3" strokeWidth="14" strokeLinecap="round" />
                  <path d="M30 100 A70 70 0 0 1 170 100" fill="none" stroke={semaforo.color} strokeWidth="14" strokeLinecap="round"
                    strokeDasharray={`${gaugeFilled} ${gaugeCircumference}`} />
                </svg>
                <div className="-mt-3 text-center">
                  <p className="text-3xl font-bold tracking-tight" style={{ color: semaforo.color }}>{stats.rotacionPct}%</p>
                  <p className="text-[11px] font-semibold text-[#8B93A1] uppercase tracking-wide mt-0.5">Rotación mensual</p>
                </div>
              </div>
              <div className="mt-4 rounded-lg px-4 py-3.5" style={{ background: semaforo.bg, border: `1px solid ${semaforo.border}` }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: semaforo.color }} />
                  <span className="text-xs font-bold" style={{ color: semaforo.color }}>
                    {semaforo.needsAttention ? 'Requiere atención' : 'Entorno de baja fricción'}
                  </span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: semaforo.needsAttention ? '#8A4529' : '#565D6B' }}>
                  {semaforo.needsAttention
                    ? `${stats.retirosVol} renuncia(s) voluntaria(s) este mes sobre un HT de ${stats.colaboradores}, sin aprendices SENA. Vale la pena revisar los motivos con Talento Humano.`
                    : `${stats.retirosVol === 0 ? 'Sin renuncias voluntarias registradas' : `${stats.retirosVol} renuncia(s) voluntaria(s) registrada(s)`} este mes sobre un HT de ${stats.colaboradores}, sin aprendices SENA. La organización opera dentro del rango saludable.`}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#E7E9EE] shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#14171C] flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                  <h2 className="text-[15px] font-bold text-[#14171C] tracking-tight">Novedad de contrato (tienen más de un contrato)</h2>
                </div>
                {dualCompanyColaboradores.length > 0 && (
                  <span className="text-[10px] font-bold text-[#A8552F] bg-[#FDF2EE] px-2.5 py-1 rounded-full">
                    {dualCompanyColaboradores.length} alerta{dualCompanyColaboradores.length > 1 ? 's' : ''} activa{dualCompanyColaboradores.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {dualCompanyColaboradores.length === 0 ? (
                <p className="text-xs text-gray-400 italic text-center py-6">Sin solapamientos de talento detectados</p>
              ) : (
                <div className="rounded-lg p-4" style={{ background: '#FDF7F4', border: '1px solid #F0DCD2' }}>
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-[#A8552F] flex-shrink-0" />
                    <span className="text-[11px] font-bold text-[#A8552F] uppercase tracking-wide">Solapamiento de talento detectado</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {dualCompanyColaboradores.map((u, i) => {
                      const initials = u.name.split(' ').filter(Boolean).slice(0, 2).map((p: string) => p[0]).join('').toUpperCase();
                      return (
                        <div key={i} className="flex items-center justify-between bg-white border border-[#E7E9EE] rounded-lg px-3 py-2.5">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-[#14171C] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">{initials}</div>
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-[#14171C] truncate">{u.name}</p>
                              <p className="text-[11px] text-[#8B93A1] truncate">{u.companies.join('  +  ')}</p>
                            </div>
                          </div>
                          <span className="text-[10.5px] font-bold text-[#A8552F] whitespace-nowrap flex-shrink-0 ml-2">{u.companies.length} contratos</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* KPIs */}
          <SectionTitle icon={<UserCheck className="w-3.5 h-3.5" />}>Headcount</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Colaboradores activos" value={stats.colaboradores} sub={filterCompany !== 'all' ? filterCompany : 'Total activos'} icon={<UserCheck className="w-4 h-4 text-[#14171C]" />} />
            <KpiCard label="Empresas TH" value={thCompanies.length} sub="Con talento humano" icon={<Building2 className="w-4 h-4 text-[#14171C]" />} />
            <KpiCard label="Cuentas analíticas activas" value={projects.filter(p => p.status === 'activo').length} sub={`de ${projects.length} totales`} icon={<FolderKanban className="w-4 h-4 text-[#14171C]" />} />
          </div>

          {/* Movimientos del mes */}
          <SectionTitle icon={<TrendingUp className="w-3.5 h-3.5" />}>Movimientos · {monthLabel}</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <KpiCard label="Ingresos del mes" value={stats.ingresosMes} sub="Nuevos colaboradores" icon={<TrendingUp className="w-4 h-4 text-[#14171C]" />} />
            <KpiCard label="Retiros del mes" value={stats.retirosMes} sub="Colaboradores retirados" icon={<TrendingDown className="w-4 h-4 text-[#A8552F]" />} />
            <div className="rounded-xl border p-5 shadow-sm" style={{ background: semaforo.bg, borderColor: semaforo.border }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold text-[#8B93A1] uppercase tracking-wide">% Rotación</span>
                <AlertTriangle className="w-4 h-4" style={{ color: semaforo.color }} />
              </div>
              <p className="text-3xl font-bold tracking-tight" style={{ color: semaforo.color }}>{stats.rotacionPct}%</p>
              <p className="text-xs mt-1 font-semibold" style={{ color: semaforo.color }}>{semaforo.label}</p>
              <div className="mt-2 flex gap-1.5 text-[10px] text-[#8B93A1] flex-wrap">
                <span>≤3% Óptima</span>·<span>≤7% Moderada</span>·<span>&gt;7% Alta</span>
              </div>
            </div>
          </div>

          {/* Trend chart */}
          <SectionTitle>Tendencia de ingresos y retiros · últimos 6 meses</SectionTitle>
          <div className="bg-white rounded-xl border border-[#E7E9EE] shadow-sm p-4">
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={200}>
                <BarChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F3" />
                  <XAxis dataKey="mes" stroke="#8B93A1" tick={{ fontSize: 11, fill: '#8B93A1' }} />
                  <YAxis stroke="#8B93A1" tick={{ fontSize: 11, fill: '#8B93A1' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E7E9EE', borderRadius: '10px', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="ingresos" fill="#14171C" radius={[4,4,0,0]} name="Ingresos" />
                  <Bar dataKey="retiros"  fill="#C98862" radius={[4,4,0,0]} name="Retiros" />
                </BarChart>
              </ResponsiveContainer>
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
            📊 Mostrando <span className="font-semibold">{demographicUsers.length} colaboradores vigentes al cierre del período</span>
            {filterCompany !== 'all' && <span> de <span className="font-semibold">{filterCompany}</span></span>}
            {filterProject !== 'all' && <span> · Cuenta analítica <span className="font-semibold">{filterProject}</span></span>}
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
          <SectionTitle icon={<FolderKanban className="w-3.5 h-3.5" />}>Por cuenta analítica</SectionTitle>
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
                          {demographicUsers.length > 0 ? Math.round(d.value / demographicUsers.length * 100) : 0}%
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
