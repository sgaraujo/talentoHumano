import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Banknote, BriefcaseBusiness, Building2, Loader2, Search, ShieldAlert, UserRoundX, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getCompanyWorkforce, type CompanyWorkforceSummary } from '@/services/companyWorkforceService';
import { HrEmployeeDetailDialog } from '@/components/users/HrEmployeeDetailDialog';
import { useAppRole } from '@/hooks/useAppRole';

type Tab = 'summary' | 'people' | 'projects' | 'payroll' | 'quality';

const unique = (values: Array<string | undefined>) => [...new Set(values.filter(Boolean) as string[])];

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

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" /></div>;
  if (!data || error) return <div className="p-6"><Button variant="outline" onClick={() => navigate('/empresas')}><ArrowLeft className="w-4 h-4 mr-2" />Empresas</Button><p className="mt-8 text-red-600">{error}</p></div>;

  const stats = [
    ['Personas activas', data.activePeople, Users, 'text-green-700 bg-green-50'],
    ['Proyectos activos', data.activeProjects, BriefcaseBusiness, 'text-blue-700 bg-blue-50'],
    ['Sin acceso', data.withoutAccess, UserRoundX, 'text-purple-700 bg-purple-50'],
    ['Datos incompletos', data.incompleteRecords, ShieldAlert, 'text-amber-700 bg-amber-50'],
  ] as const;
  const tabs: Array<[Tab, string]> = [['summary','Resumen'],['people','Personas'],['projects','Proyectos'],...(canSeePayroll ? [['payroll','Nómina'] as [Tab, string]] : []),['quality','Calidad de datos']];

  return <div className="p-4 sm:p-6 bg-gray-50 min-h-screen space-y-5">
    <div className="flex items-start gap-3">
      <Button variant="outline" size="sm" onClick={() => navigate('/empresas')}><ArrowLeft className="w-4 h-4" /></Button>
      <div className="w-11 h-11 rounded-xl bg-green-100 flex items-center justify-center">{data.company.logo ? <img src={data.company.logo} className="w-9 h-9 object-contain" /> : <Building2 className="w-6 h-6 text-[#008C3C]" />}</div>
      <div><h1 className="text-2xl font-bold text-gray-800">{data.company.name}</h1><p className="text-sm text-gray-500">NIT {data.company.nit} · Empresas y dotación</p></div>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{stats.map(([label,value,Icon,color]) => <div key={label} className={`rounded-xl border border-white p-4 ${color}`}><Icon className="w-5 h-5 mb-2" /><p className="text-2xl font-bold">{value.toLocaleString('es-CO')}</p><p className="text-xs font-medium">{label}</p></div>)}</div>

    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="flex gap-1 p-2 border-b overflow-x-auto">{tabs.map(([value,label]) => <button key={value} onClick={() => setTab(value)} className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${tab === value ? 'bg-[#008C3C] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>{label}</button>)}</div>

      {tab === 'summary' && <div className="p-5 grid lg:grid-cols-3 gap-4">
        <SummaryCard title="Distribución por proyecto" rows={unique(active.map(item => item.projectName)).map(name => [name, new Set(active.filter(item => item.projectName === name).map(item => item.employeeId)).size] as [string, number])} empty="No hay proyectos asociados" />
        <SummaryCard title="Cargos principales" rows={unique(active.map(item => item.position)).map(name => [name, new Set(active.filter(item => item.position === name).map(item => item.employeeId)).size] as [string, number]).sort((a,b) => b[1]-a[1]).slice(0,8)} empty="No hay cargos registrados" />
        <SummaryCard title="Regionales" rows={unique(active.map(item => item.regional)).map(name => [name, new Set(active.filter(item => item.regional === name).map(item => item.employeeId)).size] as [string, number])} empty="No hay regionales registradas" />
      </div>}

      {tab === 'people' && <div><div className="p-4 border-b relative"><Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><Input className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar persona, cédula, cargo o proyecto…" /></div><PeopleTable rows={filtered} onOpen={setEmployeeId} /></div>}

      {tab === 'projects' && <div className="p-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{data.projects.map(project => { const count = new Set(active.filter(item => item.projectName?.toLowerCase() === project.name.toLowerCase()).map(item => item.employeeId)).size; return <div key={project.id} className="rounded-xl border p-4"><div className="flex justify-between gap-2"><p className="font-semibold text-gray-800">{project.name}</p><span className={`h-fit text-[10px] px-2 py-1 rounded-full ${project.status === 'activo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{project.status}</span></div><p className="text-sm text-gray-500 mt-3"><Users className="inline w-4 h-4 mr-1" />{count} personas activas</p><p className="text-xs text-gray-400 mt-1">{project.area || project.sede || 'Sin clasificación'}</p></div>; })}{!data.projects.length && <p className="text-gray-400">No hay proyectos vinculados.</p>}</div>}

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

      {tab === 'quality' && <div className="p-5"><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-4 flex gap-3"><AlertTriangle className="w-5 h-5 text-amber-600" /><div><p className="font-semibold text-amber-800">{qualityRows.length} relaciones requieren revisión</p><p className="text-xs text-amber-700 mt-1">Se revisan proyecto, cargo, correo corporativo y teléfono corporativo.</p></div></div><PeopleTable rows={qualityRows} onOpen={setEmployeeId} quality /></div>}
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
  return <div className="overflow-x-auto max-h-[55vh] overflow-y-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-gray-50 text-xs text-gray-500"><tr><th className="text-left px-4 py-3">Persona</th><th className="text-left px-4 py-3">Cargo</th><th className="text-left px-4 py-3">Proyecto</th><th className="text-left px-4 py-3">{quality ? 'Información faltante' : 'Regional / base'}</th></tr></thead><tbody className="divide-y">{rows.map((item,index) => <tr key={`${item.employeeId}-${index}`} onClick={() => onOpen(item.employeeId)} className="hover:bg-green-50 cursor-pointer"><td className="px-4 py-3"><p className="font-medium text-gray-700">{item.fullName}</p><p className="font-mono text-xs text-gray-400">{item.documentNumber}</p></td><td className="px-4 py-3 text-gray-600">{item.position || '—'}</td><td className="px-4 py-3 text-gray-600">{item.projectName || '—'}</td><td className="px-4 py-3 text-gray-500">{quality ? [!item.projectName && 'Proyecto', !item.position && 'Cargo', !item.corporateEmail && 'Correo', !item.corporatePhone && 'Teléfono'].filter(Boolean).join(', ') : [item.regional,item.baseLocation].filter(Boolean).join(' · ') || '—'}</td></tr>)}</tbody></table>{!rows.length && <p className="text-center text-gray-400 py-12">No hay registros.</p>}</div>;
}
