import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Banknote, BriefcaseBusiness, Building2, Clock, Download, Loader2, Search, ShieldAlert, TrendingUp, UserRoundX, Users } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getCompanyWorkforce, type CompanyWorkforceSummary } from '@/services/companyWorkforceService';
import { HrEmployeeDetailDialog } from '@/components/users/HrEmployeeDetailDialog';
import { useAppRole } from '@/hooks/useAppRole';

type Tab = 'summary' | 'stats' | 'people' | 'projects' | 'payroll' | 'quality';

const unique = (values: Array<string | undefined>) => [...new Set(values.filter(Boolean) as string[])];

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const GENDER_COLORS: Record<string, string> = { Masculino: '#1F8FBF', Femenino: '#EC4899', Otro: '#8B5CF6' };
const toDate = (raw?: string) => {
  if (!raw) return null;
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed;
};
const monthsBetween = (start: Date, end: Date) => Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth());
const normalizeGender = (raw?: string): 'Masculino' | 'Femenino' | 'Otro' => {
  const g = (raw ?? '').trim().toLowerCase();
  if (['male', 'masculino', 'm', 'hombre'].includes(g)) return 'Masculino';
  if (['female', 'femenino', 'f', 'mujer'].includes(g)) return 'Femenino';
  return 'Otro';
};

const RADIAN = Math.PI / 180;
const renderPieSliceLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.06) return null; // porciones muy pequeñas: el texto no cabe, se lee en el tooltip
  const radius = innerRadius + (outerRadius - innerRadius) / 2;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700}>
      {`${Math.round(percent * 100)}%`}
    </text>
  );
};

export function CompanyWorkforcePage() {
  const { companyId = '' } = useParams();
  const navigate = useNavigate();
  const { role } = useAppRole();
  const canSeePayroll = role === 'admin' || role === 'talento_humano';
  const [data, setData] = useState<CompanyWorkforceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('summary');
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const load = async () => {
    setLoading(true); setError('');
    try { setData(await getCompanyWorkforce(companyId)); }
    catch (reason: any) { setError(reason?.message || 'No fue posible cargar la empresa.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [companyId]);
  const active = useMemo(() => data?.people.filter(item => item.status === 'active') ?? [], [data]);
  const filtered = useMemo(() => active.filter(item => {
    const term = search.trim().toLowerCase();
    return !term || [item.fullName, item.documentNumber, item.projectName, item.position, item.area].some(value => value?.toLowerCase().includes(term));
  }), [active, search]);
  const qualityRows = active.filter(item => !item.projectName || !item.position || !item.corporateEmail || !item.corporatePhone);

  const handleExportQuality = () => {
    if (!data) return;
    const rows = qualityRows.map(item => ({
      Persona: item.fullName,
      Documento: item.documentNumber,
      Cargo: item.position || '',
      'Cuenta analítica': item.projectName || '',
      'Correo corporativo': item.corporateEmail || '',
      'Teléfono corporativo': item.corporatePhone || '',
      'Información faltante': [
        !item.projectName && 'Cuenta analítica',
        !item.position && 'Cargo',
        !item.corporateEmail && 'Correo',
        !item.corporatePhone && 'Teléfono',
      ].filter(Boolean).join(', '),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 32 }, { wch: 16 }, { wch: 24 }, { wch: 24 }, { wch: 28 }, { wch: 18 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Calidad de datos');
    XLSX.writeFile(wb, `calidad-de-datos-${data.company.name.replace(/[^\w\-]+/g, '_')}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleExportPeople = () => {
    if (!data) return;
    const rows = filtered.map(item => ({
      Persona: item.fullName,
      Documento: item.documentNumber,
      Cargo: item.position || '',
      'Cuenta analítica': item.projectName || '',
      Regional: item.regional || '',
      Sede: item.baseLocation || '',
      'Correo corporativo': item.corporateEmail || '',
      'Teléfono corporativo': item.corporatePhone || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 32 }, { wch: 16 }, { wch: 24 }, { wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 28 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Personas');
    XLSX.writeFile(wb, `personas-${data.company.name.replace(/[^\w\-]+/g, '_')}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const statsData = useMemo(() => {
    if (!data) return null;
    const people = data.people;
    const retired = people.filter(p => p.status === 'retired');
    const today = new Date();
    const currentYear = today.getFullYear();

    const months = Array.from({ length: 12 }, (_, index) => {
      const ref = new Date(today.getFullYear(), today.getMonth() - (11 - index), 1);
      const month = ref.getMonth(); const year = ref.getFullYear();
      return {
        month: `${MONTH_NAMES[month]} ${String(year).slice(2)}`,
        ingresos: people.filter(p => { const d = toDate(p.startDate); return d && d.getMonth() === month && d.getFullYear() === year; }).length,
        retiros: retired.filter(p => { const d = toDate(p.endDate); return d && d.getMonth() === month && d.getFullYear() === year; }).length,
      };
    });

    const retiredThisYear = retired.filter(p => toDate(p.endDate)?.getFullYear() === currentYear);
    const rotacionAnual = data.activePeople > 0 ? Math.round((retiredThisYear.length / data.activePeople) * 1000) / 10 : 0;

    let tenureMonths = 0; let tenureCount = 0;
    active.forEach(p => { const start = toDate(p.startDate); if (start) { tenureMonths += monthsBetween(start, today); tenureCount++; } });
    const avgTenure = tenureCount > 0 ? Math.round(tenureMonths / tenureCount) : 0;

    const genderCounts = new Map<string, number>();
    active.forEach(p => { const key = normalizeGender(p.gender); genderCounts.set(key, (genderCounts.get(key) ?? 0) + 1); });
    const genderData = [...genderCounts.entries()].map(([name, value]) => ({ name, value }));

    const motivos = new Map<string, number>();
    retired.forEach(p => { const key = p.terminationReason?.trim() || 'Sin motivo'; motivos.set(key, (motivos.get(key) ?? 0) + 1); });
    const motivosData = [...motivos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }));

    const costoRetiros = retired.reduce((sum, p) => sum + (Number(p.terminationCost) || 0), 0);

    return { months, retiredThisYearCount: retiredThisYear.length, rotacionAnual, avgTenure, genderData, motivosData, costoRetiros, retiredCount: retired.length };
  }, [data, active]);

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" /></div>;
  if (!data || error) return <div className="p-6"><Button variant="outline" onClick={() => navigate('/empresas')}><ArrowLeft className="w-4 h-4 mr-2" />Empresas</Button><p className="mt-8 text-red-600">{error}</p></div>;

  const stats = [
    ['Personas activas', data.activePeople, Users, 'text-green-700 bg-green-50'],
    ['Cuentas analíticas activas', data.activeProjects, BriefcaseBusiness, 'text-blue-700 bg-blue-50'],
    ['Sin acceso', data.withoutAccess, UserRoundX, 'text-purple-700 bg-purple-50'],
    ['Datos incompletos', data.incompleteRecords, ShieldAlert, 'text-amber-700 bg-amber-50'],
  ] as const;
  const tabs: Array<[Tab, string]> = [['summary','Resumen'],['stats','Estadísticas'],['people','Personas'],['projects','Cuentas analíticas'],...(canSeePayroll ? [['payroll','Nómina'] as [Tab, string]] : []),['quality','Calidad de datos']];

  return <div className="p-4 sm:p-6 bg-gray-50 min-h-screen space-y-5">
    <div className="flex items-start gap-3">
      <Button variant="outline" size="sm" onClick={() => navigate('/empresas')}><ArrowLeft className="w-4 h-4" /></Button>
      <div className="w-11 h-11 rounded-xl bg-green-100 flex items-center justify-center">{data.company.logo ? <img src={data.company.logo} className="w-9 h-9 object-contain" /> : <Building2 className="w-6 h-6 text-[#008C3C]" />}</div>
      <div className="flex-1"><h1 className="text-2xl font-bold text-gray-800">{data.company.name}</h1><p className="text-sm text-gray-500">NIT {data.company.nit} · Empresas y dotación</p></div>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{stats.map(([label,value,Icon,color]) => <div key={label} className={`rounded-xl border border-white p-4 ${color}`}><Icon className="w-5 h-5 mb-2" /><p className="text-2xl font-bold">{value.toLocaleString('es-CO')}</p><p className="text-xs font-medium">{label}</p></div>)}</div>

    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="flex gap-1 p-2 border-b overflow-x-auto">{tabs.map(([value,label]) => <button key={value} onClick={() => setTab(value)} className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${tab === value ? 'bg-[#008C3C] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>{label}</button>)}</div>

      {tab === 'summary' && <div className="p-5 grid lg:grid-cols-3 gap-4">
        <SummaryCard title="Distribución por cuenta analítica" rows={unique(active.map(item => item.projectName)).map(name => [name, new Set(active.filter(item => item.projectName === name).map(item => item.employeeId)).size] as [string, number])} empty="No hay cuentas analíticas asociadas" />
        <SummaryCard title="Cargos principales" rows={unique(active.map(item => item.position)).map(name => [name, new Set(active.filter(item => item.position === name).map(item => item.employeeId)).size] as [string, number]).sort((a,b) => b[1]-a[1]).slice(0,8)} empty="No hay cargos registrados" />
        <SummaryCard title="Regionales" rows={unique(active.map(item => item.regional)).map(name => [name, new Set(active.filter(item => item.regional === name).map(item => item.employeeId)).size] as [string, number])} empty="No hay regionales registradas" />
      </div>}

      {tab === 'stats' && statsData && <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-white bg-red-50 p-4"><UserRoundX className="w-5 h-5 mb-2 text-red-700" /><p className="text-2xl font-bold text-red-700">{statsData.retiredThisYearCount}</p><p className="text-xs font-medium text-red-700">Retiros este año</p></div>
          <div className="rounded-xl border border-white bg-blue-50 p-4"><TrendingUp className="w-5 h-5 mb-2 text-blue-700" /><p className="text-2xl font-bold text-blue-700">{statsData.rotacionAnual}%</p><p className="text-xs font-medium text-blue-700">Rotación anual</p></div>
          <div className="rounded-xl border border-white bg-green-50 p-4"><Clock className="w-5 h-5 mb-2 text-green-700" /><p className="text-2xl font-bold text-green-700">{statsData.avgTenure}</p><p className="text-xs font-medium text-green-700">Meses de antigüedad promedio</p></div>
          <div className="rounded-xl border border-white bg-amber-50 p-4"><Banknote className="w-5 h-5 mb-2 text-amber-700" /><p className="text-2xl font-bold text-amber-700">{money(statsData.costoRetiros)}</p><p className="text-xs font-medium text-amber-700">Costo histórico de retiros</p></div>
        </div>

        <div className="rounded-xl border p-4">
          <h2 className="font-semibold text-gray-800">Ingresos y retiros</h2>
          <p className="text-xs text-gray-400 mb-3">Últimos 12 meses, según fecha de ingreso y de retiro de cada relación laboral.</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={statsData.months}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
              <XAxis dataKey="month" stroke="#9CA3AF" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis stroke="#9CA3AF" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="ingresos" fill="#008C3C" name="Ingresos" radius={[3, 3, 0, 0]} maxBarSize={22} />
              <Bar dataKey="retiros" fill="#EF4444" name="Retiros" radius={[3, 3, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="rounded-xl border p-4">
            <h2 className="font-semibold text-gray-800 mb-3">Composición por género</h2>
            {statsData.genderData.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={statsData.genderData}
                    cx="50%" cy="50%"
                    innerRadius={56} outerRadius={92}
                    paddingAngle={statsData.genderData.length > 1 ? 3 : 0}
                    dataKey="value" nameKey="name"
                    labelLine={false}
                    label={renderPieSliceLabel}
                    isAnimationActive={false}
                  >
                    {statsData.genderData.map((entry, index) => <Cell key={index} fill={GENDER_COLORS[entry.name] ?? '#94A3B8'} stroke="#fff" strokeWidth={2} />)}
                  </Pie>
                  <Tooltip formatter={(value, name) => [`${value} persona${value === 1 ? '' : 's'}`, name]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }} />
                  <Legend verticalAlign="bottom" height={32} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-gray-400 text-center py-16">Sin datos de género para el personal activo</p>}
          </div>

          <div className="rounded-xl border p-4">
            <h2 className="font-semibold text-gray-800">Motivos de retiro</h2>
            <p className="text-xs text-gray-400 mb-3">{statsData.retiredCount} retiro{statsData.retiredCount !== 1 ? 's' : ''} histórico{statsData.retiredCount !== 1 ? 's' : ''} en total.</p>
            {statsData.motivosData.length ? (
              <ResponsiveContainer width="100%" height={Math.max(180, statsData.motivosData.length * 36)}>
                <BarChart layout="vertical" data={statsData.motivosData} margin={{ left: 4, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                  <XAxis type="number" stroke="#9CA3AF" tick={{ fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" stroke="#9CA3AF" tick={{ fontSize: 11 }} width={140} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }} />
                  <Bar dataKey="value" fill="#D97706" radius={[0, 3, 3, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-gray-400 text-center py-16">Sin retiros registrados para esta empresa</p>}
          </div>
        </div>
      </div>}

      {tab === 'people' && <div><div className="p-4 border-b flex flex-col sm:flex-row gap-3 sm:items-center"><div className="relative flex-1"><Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><Input className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar persona, cédula, cargo o cuenta analítica…" /></div><Button variant="outline" size="sm" disabled={!filtered.length} onClick={handleExportPeople} className="flex-shrink-0"><Download className="w-4 h-4 mr-1.5" />Exportar Excel</Button></div><PeopleTable rows={filtered} onOpen={setEmployeeId} /></div>}

      {tab === 'projects' && <div className="p-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{data.projects.map(project => { const count = new Set(active.filter(item => item.projectName?.toLowerCase() === project.name.toLowerCase()).map(item => item.employeeId)).size; return <div key={project.id} className="rounded-xl border p-4"><div className="flex justify-between gap-2"><p className="font-semibold text-gray-800">{project.name}</p><span className={`h-fit text-[10px] px-2 py-1 rounded-full ${project.status === 'activo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{project.status}</span></div><p className="text-sm text-gray-500 mt-3"><Users className="inline w-4 h-4 mr-1" />{count} personas activas</p><p className="text-xs text-gray-400 mt-1">{project.area || project.sede || 'Sin clasificación'}</p></div>; })}{!data.projects.length && <p className="text-gray-400">No hay cuentas analíticas vinculadas.</p>}</div>}

      {tab === 'payroll' && canSeePayroll && <div className="p-5 space-y-5">
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex gap-3"><Banknote className="w-5 h-5 text-green-700" /><div><p className="font-semibold text-green-800">Costo salarial mensual estimado</p><p className="text-xs text-green-700 mt-1">Calculado con las relaciones activas y la última información importada. No incluye prestaciones ni aportes patronales.</p></div></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <MoneyCard label="Salario base" value={data.monthlyBaseSalary} />
          <MoneyCard label="Auxilios" value={data.monthlyAllowances} />
          <MoneyCard label="KPI salarial" value={data.monthlySalaryKpi} />
          <MoneyCard label="Total estimado" value={data.monthlyPayrollTotal} featured />
        </div>
        <div className="rounded-xl border overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="text-left px-4 py-3">Persona</th><th className="text-left px-4 py-3">Cargo</th><th className="text-right px-4 py-3">Salario base</th><th className="text-right px-4 py-3">Auxilios</th><th className="text-right px-4 py-3">KPI</th></tr></thead><tbody className="divide-y">{active.filter((item,index,all) => all.findIndex(value => value.employeeId === item.employeeId) === index).map(item => { const p = item.payroll; const allowances = ['transportAllowance','operationalAllowance','foodAllowance','supportAllowance','vehicleAllowance','toolsAllowance','communicationAllowance'].reduce((sum,field) => sum + (Number((p as any)?.[field]) || 0),0); return <tr key={item.employeeId} onClick={() => setEmployeeId(item.employeeId)} className="hover:bg-green-50 cursor-pointer"><td className="px-4 py-3 font-medium text-gray-700">{item.fullName}</td><td className="px-4 py-3 text-gray-500">{item.position || '—'}</td><td className="px-4 py-3 text-right">{money(p?.baseSalary)}</td><td className="px-4 py-3 text-right">{money(allowances)}</td><td className="px-4 py-3 text-right">{money(p?.salaryKpi)}</td></tr>; })}</tbody></table></div>
      </div>}

      {tab === 'quality' && <div className="p-5"><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-4 flex gap-3 items-start"><AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" /><div className="flex-1"><p className="font-semibold text-amber-800">{qualityRows.length} relaciones requieren revisión</p><p className="text-xs text-amber-700 mt-1">Se revisan cuenta analítica, cargo, correo corporativo y teléfono corporativo.</p></div><Button variant="outline" size="sm" disabled={!qualityRows.length} onClick={handleExportQuality} className="bg-white flex-shrink-0"><Download className="w-4 h-4 mr-1.5" />Exportar Excel</Button></div><PeopleTable rows={qualityRows} onOpen={setEmployeeId} quality /></div>}
    </div>
    <HrEmployeeDetailDialog employeeId={employeeId} open={!!employeeId} onOpenChange={open => { if (!open) setEmployeeId(null); }} onUpdated={load} />
  </div>;
}

const money = (value?: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value) || 0);

function MoneyCard({ label, value, featured = false }: { label: string; value: number; featured?: boolean }) {
  return <div className={`rounded-xl border p-4 ${featured ? 'bg-[#008C3C] border-[#008C3C] text-white' : 'bg-white'}`}><p className={`text-xs ${featured ? 'text-green-100' : 'text-gray-500'}`}>{label}</p><p className="text-xl font-bold mt-1">{money(value)}</p></div>;
}

function SummaryCard({ title, rows, empty }: { title: string; rows: Array<[string, number]>; empty: string }) {
  return <div className="rounded-xl border p-4"><h2 className="font-semibold text-gray-800 mb-3">{title}</h2><div className="space-y-2">{rows.map(([label,count]) => <div key={label} className="flex justify-between gap-3 text-sm"><span className="text-gray-600 truncate">{label}</span><b className="text-gray-800">{count}</b></div>)}{!rows.length && <p className="text-sm text-gray-400">{empty}</p>}</div></div>;
}

function PeopleTable({ rows, onOpen, quality = false }: { rows: CompanyWorkforceSummary['people']; onOpen: (id: string) => void; quality?: boolean }) {
  return <div className="overflow-x-auto max-h-[55vh] overflow-y-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-gray-50 text-xs text-gray-500"><tr><th className="text-left px-4 py-3">Persona</th><th className="text-left px-4 py-3">Cargo</th><th className="text-left px-4 py-3">Cuenta analítica</th><th className="text-left px-4 py-3">{quality ? 'Información faltante' : 'Regional / base'}</th></tr></thead><tbody className="divide-y">{rows.map((item,index) => <tr key={`${item.employeeId}-${index}`} onClick={() => onOpen(item.employeeId)} className="hover:bg-green-50 cursor-pointer"><td className="px-4 py-3"><p className="font-medium text-gray-700">{item.fullName}</p><p className="font-mono text-xs text-gray-400">{item.documentNumber}</p></td><td className="px-4 py-3 text-gray-600">{item.position || '—'}</td><td className="px-4 py-3 text-gray-600">{item.projectName || '—'}</td><td className="px-4 py-3 text-gray-500">{quality ? [!item.projectName && 'Cuenta analítica', !item.position && 'Cargo', !item.corporateEmail && 'Correo', !item.corporatePhone && 'Teléfono'].filter(Boolean).join(', ') : [item.regional,item.baseLocation].filter(Boolean).join(' · ') || '—'}</td></tr>)}</tbody></table>{!rows.length && <p className="text-center text-gray-400 py-12">No hay registros.</p>}</div>;
}
