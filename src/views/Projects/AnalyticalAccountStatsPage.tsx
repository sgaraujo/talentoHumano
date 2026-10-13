import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { AlertTriangle, ArrowLeft, Building2, Download, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { getAnalyticalAccountStats, type AccountPerson, type AnalyticalAccountStats } from '@/services/analyticalAccountStatsService';
import { AGE_ORDER, ageGroup, normalizeGender, normalizeWorkModality } from '@/domain/humanResources/demographics';
import { DistributionCard } from '@/components/analytics/DistributionCard';
import { HrEmployeeDetailDialog } from '@/components/users/HrEmployeeDetailDialog';

// Estadísticas de una cuenta analítica: foto actual del equipo (headcount,
// composición y calidad de datos). La rotación histórica se agrega cuando las
// cuentas tengan alias, porque el histórico usa nombres distintos.

const TENURE_ORDER = ['Menos de 3 meses', '3 a 6 meses', '6 a 12 meses', '1 a 2 años', '2 a 5 años', 'Más de 5 años', 'Sin fecha de ingreso'];

const monthsSince = (date: Date | null) => {
  if (!date) return null;
  const now = new Date();
  return Math.max(0, (now.getFullYear() - date.getFullYear()) * 12 + now.getMonth() - date.getMonth());
};

const tenureGroup = (date: Date | null) => {
  const months = monthsSince(date);
  if (months === null) return 'Sin fecha de ingreso';
  if (months < 3) return 'Menos de 3 meses';
  if (months < 6) return '3 a 6 meses';
  if (months < 12) return '6 a 12 meses';
  if (months < 24) return '1 a 2 años';
  if (months < 60) return '2 a 5 años';
  return 'Más de 5 años';
};

const formatTenure = (months: number | null) => {
  if (months === null) return '—';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (!years) return `${rest} ${rest === 1 ? 'mes' : 'meses'}`;
  return `${years} ${years === 1 ? 'año' : 'años'}${rest ? ` ${rest} ${rest === 1 ? 'mes' : 'meses'}` : ''}`;
};

const formatDate = (date: Date | null) => date
  ? date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

const clean = (value?: string) => value?.trim() || 'Sin dato';

const countBy = (people: AccountPerson[], key: (person: AccountPerson) => string, order?: string[]): [string, number][] => {
  const map = new Map<string, number>();
  people.forEach(person => map.set(key(person), (map.get(key(person)) ?? 0) + 1));
  const entries = [...map.entries()];
  return order
    ? entries.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    : entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
};

const missingFields = (person: AccountPerson) => [
  !person.position && 'Cargo',
  !person.corporateEmail && 'Correo corporativo',
  !person.corporatePhone && 'Teléfono corporativo',
  !person.startDate && 'Fecha de ingreso',
].filter(Boolean) as string[];

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-[#E7E9EE] shadow-sm p-4">
      <p className="text-[11px] font-semibold text-[#8B93A1] uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[#14171C] leading-none">{value}</p>
      {sub && <p className="mt-1.5 text-[11px] text-[#8B93A1]">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3 mt-7">
      <p className="text-[11px] font-bold text-[#8B93A1] uppercase tracking-wider">{children}</p>
      {right && <span className="text-[11px] text-[#8B93A1]">{right}</span>}
    </div>
  );
}

export const AnalyticalAccountStatsPage = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AnalyticalAccountStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openEmployeeId, setOpenEmployeeId] = useState<string | null>(null);
  // Se incrementa para recargar después de editar un expediente.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!id) return;
    let active = true;
    getAnalyticalAccountStats(id)
      .then(result => { if (active) setData(result); })
      .catch(error => toast.error('No se pudieron cargar las estadísticas', { description: (error as Error).message }))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, reloadKey]);

  // Una persona con dos relaciones vigentes en la misma cuenta se cuenta una vez.
  const people = useMemo(() => {
    const seen = new Set<string>();
    return (data?.people ?? []).filter(person => {
      if (seen.has(person.employeeId)) return false;
      seen.add(person.employeeId);
      return true;
    });
  }, [data]);

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-[#008C3C]" /></div>;
  }
  if (!data) {
    return (
      <div className="p-6">
        <Link to="/proyectos" className="text-sm text-[#008C3C] hover:underline">← Volver a Cuentas analíticas</Link>
      </div>
    );
  }

  const { project, company } = data;
  const thisYear = new Date().getFullYear();
  const staff = people.filter(person => !person.isApprentice);
  const apprentices = people.length - staff.length;
  const tenureBase = staff.length ? staff : people;
  const tenures = tenureBase.map(person => monthsSince(person.startDate)).filter((value): value is number => value !== null);
  const averageTenure = tenures.length ? Math.round(tenures.reduce((sum, value) => sum + value, 0) / tenures.length) : null;
  const joinedThisYear = people.filter(person => person.startDate?.getFullYear() === thisYear).length;
  const incomplete = people.filter(person => missingFields(person).length > 0);

  const term = search.trim().toLocaleLowerCase('es');
  const visiblePeople = !term ? people : people.filter(person =>
    [person.fullName, person.documentNumber, person.position, person.regional, person.baseLocation]
      .some(value => value?.toLocaleLowerCase('es').includes(term)));

  const exportPeople = () => {
    const sheet = XLSX.utils.json_to_sheet(people.map(person => ({
      Nombre: person.fullName,
      Documento: person.documentNumber,
      Cargo: person.position ?? '',
      'Tipo de contrato': person.contractType ?? '',
      Modalidad: person.modality ?? '',
      Regional: person.regional ?? '',
      'Base de operación': person.baseLocation ?? '',
      'Jefe inmediato': person.supervisor ?? '',
      'Fecha de ingreso': person.startDate ? person.startDate.toLocaleDateString('es-CO') : '',
      Antigüedad: formatTenure(monthsSince(person.startDate)),
      'Aprendiz SENA': person.isApprentice ? 'Sí' : 'No',
      'Datos faltantes': missingFields(person).join(', '),
    })));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Personas');
    XLSX.writeFile(book, `cuenta-${project.name.replace(/[^\w-]+/g, '_')}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="max-w-7xl mx-auto pb-12">
      <Link to="/proyectos" className="inline-flex items-center gap-1.5 text-xs text-[#565D6B] hover:text-[#008C3C]">
        <ArrowLeft className="w-3.5 h-3.5" /> Cuentas analíticas
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold text-[#8B93A1] uppercase tracking-wider">Estadísticas de la cuenta analítica</p>
          <h1 className="text-2xl font-bold text-[#14171C] tracking-tight">{project.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-[#565D6B]">
            <Building2 className="w-3.5 h-3.5" />{company?.name ?? project.companyName ?? 'Sin empresa'}
            <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full font-semibold ${project.status === 'activo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {project.status}
            </span>
          </p>
        </div>
        <button
          onClick={exportPeople}
          disabled={!people.length}
          className="flex items-center gap-1.5 text-sm font-medium rounded-lg border border-[#E7E9EE] bg-white px-3 py-2 text-[#14171C] hover:bg-gray-50 disabled:opacity-50"
        >
          <Download className="w-4 h-4" /> Exportar personas
        </button>
      </div>

      <SectionTitle right="Foto al día de hoy · contratos vigentes">Headcount</SectionTitle>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Personas activas" value={staff.length} sub="Sin aprendices SENA" />
        <Kpi label="Aprendices SENA" value={apprentices} />
        <Kpi label="Antigüedad promedio" value={formatTenure(averageTenure)} />
        <Kpi label={`Ingresaron en ${thisYear}`} value={joinedThisYear} sub="Siguen activos" />
        <Kpi label="Datos incompletos" value={incomplete.length} sub="Cargo, correo, teléfono o ingreso" />
      </div>

      {people.length === 0 ? (
        <p className="mt-6 text-sm text-gray-400 italic py-10 text-center bg-white rounded-xl border border-[#E7E9EE]">
          Esta cuenta analítica no tiene personas con contrato vigente en Expedientes.
        </p>
      ) : (
        <>
          <SectionTitle right={apprentices > 0 ? 'Incluye aprendices SENA' : undefined}>Composición del equipo</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <DistributionCard title="Cargos" items={countBy(people, p => clean(p.position))} total={people.length} maxItems={8} />
            <DistributionCard title="Tipo de contrato" items={countBy(people, p => clean(p.contractType))} total={people.length} />
            <DistributionCard title="Antigüedad" items={countBy(people, p => tenureGroup(p.startDate), TENURE_ORDER)} total={people.length} />
            <DistributionCard title="Modalidad" items={countBy(people, p => normalizeWorkModality(p.modality))} total={people.length} />
            <DistributionCard title="Regional / base" items={countBy(people, p => clean(p.regional || p.baseLocation))} total={people.length} maxItems={8} />
            <DistributionCard title="Jefe inmediato" items={countBy(people, p => clean(p.supervisor))} total={people.length} maxItems={6} />
            <DistributionCard title="Género" items={countBy(people, p => normalizeGender(p.gender))} total={people.length} />
            <DistributionCard title="Rango de edad" items={countBy(people, p => ageGroup(p.birthDate, p.age, p.ageRange), AGE_ORDER)} total={people.length} />
          </div>

          <SectionTitle right={`${incomplete.length} de ${people.length} personas`}>Calidad de datos</SectionTitle>
          {incomplete.length === 0 ? (
            <p className="text-xs text-green-700 bg-green-50 rounded-xl border border-green-100 py-4 text-center">
              Todas las personas tienen cargo, correo, teléfono corporativo y fecha de ingreso.
            </p>
          ) : (
            <div className="bg-white rounded-xl border border-[#E7E9EE] shadow-sm overflow-hidden">
              <div className="max-h-[320px] overflow-y-auto divide-y divide-[#F1F2F4]">
                {incomplete.map(person => (
                  <button
                    key={person.employmentId}
                    onClick={() => setOpenEmployeeId(person.employeeId)}
                    className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-green-50/60"
                  >
                    <span>
                      <span className="block text-sm font-medium text-[#14171C]">{person.fullName}</span>
                      <span className="block font-mono text-[10px] text-gray-400">{person.documentNumber}</span>
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {missingFields(person).map(field => (
                        <span key={field} className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FDF2EE] text-[#A8552F]">
                          <AlertTriangle className="w-3 h-3" />{field}
                        </span>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <SectionTitle right={`${people.length} personas`}>Personas de la cuenta</SectionTitle>
          <div className="bg-white rounded-xl border border-[#E7E9EE] shadow-sm">
            <div className="p-3 border-b border-[#E7E9EE]">
              <div className="relative max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por nombre, documento, cargo o regional"
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[#E7E9EE] focus:outline-none focus:border-[#008C3C]"
                />
              </div>
            </div>
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 text-[#8B93A1]">
                  <tr>
                    <th className="text-left font-semibold px-4 py-2.5">Persona</th>
                    <th className="text-left font-semibold px-4 py-2.5">Cargo</th>
                    <th className="text-left font-semibold px-4 py-2.5">Contrato</th>
                    <th className="text-left font-semibold px-4 py-2.5">Ingreso</th>
                    <th className="text-left font-semibold px-4 py-2.5">Regional / base</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F2F4]">
                  {visiblePeople.map(person => (
                    <tr
                      key={person.employmentId}
                      onClick={() => setOpenEmployeeId(person.employeeId)}
                      className="hover:bg-green-50/60 cursor-pointer transition-colors"
                      title="Abrir expediente"
                    >
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-[#14171C]">
                          {person.fullName}
                          {person.isApprentice && <span className="ml-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">SENA</span>}
                        </p>
                        <p className="font-mono text-[10px] text-gray-400">{person.documentNumber}</p>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{person.position || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{person.contractType || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">
                        <p>{formatDate(person.startDate)}</p>
                        <p className="text-[10px] text-gray-400">{formatTenure(monthsSince(person.startDate))}</p>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{[person.regional, person.baseLocation].filter(Boolean).join(' · ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visiblePeople.length && <p className="text-center text-xs text-gray-400 py-8">Ninguna persona coincide con la búsqueda.</p>}
            </div>
          </div>
        </>
      )}

      <HrEmployeeDetailDialog
        employeeId={openEmployeeId}
        open={!!openEmployeeId}
        onOpenChange={open => { if (!open) setOpenEmployeeId(null); }}
        onUpdated={() => setReloadKey(key => key + 1)}
      />
    </div>
  );
};
