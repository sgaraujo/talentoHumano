import { useState, useEffect } from 'react';
import { useAnalytics } from '@/hooks/useAnalytics';

export interface RotationFilters {
  year: string;
  month: string;
  empresa: string;
  proyecto: string;
}
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Loader2, Users, UserPlus, UserMinus, Clock,
  TrendingUp, TrendingDown, DollarSign, Filter, X, CircleHelp, ChevronDown, ChevronRight, GraduationCap,
} from 'lucide-react';
import {
  Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ComposedChart, LabelList, Cell,
} from 'recharts';

const MONTHS = [
  { value: 'all', label: 'Todos los meses' },
  { value: '0',  label: 'Enero' },
  { value: '1',  label: 'Febrero' },
  { value: '2',  label: 'Marzo' },
  { value: '3',  label: 'Abril' },
  { value: '4',  label: 'Mayo' },
  { value: '5',  label: 'Junio' },
  { value: '6',  label: 'Julio' },
  { value: '7',  label: 'Agosto' },
  { value: '8',  label: 'Septiembre' },
  { value: '9',  label: 'Octubre' },
  { value: '10', label: 'Noviembre' },
  { value: '11', label: 'Diciembre' },
];

function CalculationTooltip({ title, formula, operation, note }: {
  title: string; formula: string; operation: string; note?: string;
}) {
  return (
    <div role="tooltip" className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-xl border border-[#D9DCE2] bg-[#14171C] p-3 text-left text-white opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
      <p className="text-[11px] font-bold uppercase tracking-wide text-white">{title}</p>
      <p className="mt-1.5 text-[10px] text-[#B8BFCA]">Fórmula</p>
      <p className="text-xs font-medium">{formula}</p>
      <div className="mt-2 rounded-lg bg-white/10 px-2.5 py-2 font-mono text-xs text-white">{operation}</div>
      {note && <p className="mt-2 text-[10px] leading-relaxed text-[#B8BFCA]">{note}</p>}
    </div>
  );
}

export const RotationPage = ({ controlled }: { controlled?: RotationFilters }) => {
  const { metrics, loading, refreshMetrics, filterOptions } = useAnalytics();

  const curYear = new Date().getFullYear();
  const years = [curYear - 2, curYear - 1, curYear];

  // Standalone mode state (used when NOT controlled)
  const [selectedYear,    setSelectedYear]    = useState(curYear.toString());
  const [selectedMonth,   setSelectedMonth]   = useState('all');
  const [selectedEmpresa, setSelectedEmpresa] = useState('all');
  const [selectedProyecto,setSelectedProyecto]= useState('all');
  const [appliedYear,    setAppliedYear]    = useState(curYear.toString());
  const [appliedMonth,   setAppliedMonth]   = useState('all');
  const [appliedEmpresa, setAppliedEmpresa] = useState('all');
  const [appliedProyecto,setAppliedProyecto]= useState('all');
  // Detalle de retiros: motivo seleccionado (clic en la barra) y empresas desplegadas.
  const [selectedMotivo, setSelectedMotivo] = useState<string | null>(null);
  const [motivoMonth, setMotivoMonth] = useState('all');
  const [expandedEmpresas, setExpandedEmpresas] = useState<Set<string>>(new Set());
  // Detalle de nuevos ingresos: cuentas analíticas desplegadas.
  const [expandedProyectos, setExpandedProyectos] = useState<Set<string>>(new Set());

  // When controlled from parent, auto-apply whenever filters change
  useEffect(() => {
    if (!controlled) return;
    refreshMetrics({
      año:      parseInt(controlled.year),
      mes:      controlled.month === 'all' ? undefined : parseInt(controlled.month),
      empresa:  controlled.empresa  === 'all' ? undefined : controlled.empresa,
      proyecto: controlled.proyecto === 'all' ? undefined : controlled.proyecto,
    });
  }, [controlled?.year, controlled?.month, controlled?.empresa, controlled?.proyecto]);

  const activeYear    = controlled ? controlled.year    : appliedYear;
  const activeMonth   = controlled ? controlled.month   : appliedMonth;
  const activeEmpresa = controlled ? controlled.empresa : appliedEmpresa;
  const activeProyecto= controlled ? controlled.proyecto: appliedProyecto;

  const hasActiveFilters =
    activeMonth !== 'all' || activeEmpresa !== 'all' || activeProyecto !== 'all' || activeYear !== curYear.toString();

  // Proyectos disponibles para la empresa elegida en el selector (antes de aplicar).
  const projectOptionsForSelectedEmpresa = selectedEmpresa === 'all'
    ? filterOptions.proyectos
    : (filterOptions.proyectosPorEmpresa[selectedEmpresa] ?? []);

  const handleEmpresaChange = (empresa: string) => {
    setSelectedEmpresa(empresa);
    const available = empresa === 'all' ? filterOptions.proyectos : (filterOptions.proyectosPorEmpresa[empresa] ?? []);
    if (selectedProyecto !== 'all' && !available.includes(selectedProyecto)) setSelectedProyecto('all');
  };

  const handleApply = () => {
    setAppliedYear(selectedYear);
    setAppliedMonth(selectedMonth);
    setAppliedEmpresa(selectedEmpresa);
    setAppliedProyecto(selectedProyecto);
    refreshMetrics({
      año:      parseInt(selectedYear),
      mes:      selectedMonth === 'all' ? undefined : parseInt(selectedMonth),
      empresa:  selectedEmpresa  === 'all' ? undefined : selectedEmpresa,
      proyecto: selectedProyecto === 'all' ? undefined : selectedProyecto,
    });
  };

  const handleClear = () => {
    setSelectedYear(curYear.toString());  setSelectedMonth('all');
    setSelectedEmpresa('all');            setSelectedProyecto('all');
    setAppliedYear(curYear.toString());   setAppliedMonth('all');
    setAppliedEmpresa('all');             setAppliedProyecto('all');
    refreshMetrics({});
  };

  const periodLabel = (() => {
    const m = activeMonth !== 'all' ? MONTHS.find(x => x.value === activeMonth)?.label : null;
    return m ? `${m} ${activeYear}` : `Año ${activeYear}`;
  })();

  const tooltipStyle = {
    backgroundColor: '#FFFFFF',
    border: '1px solid #E7E9EE',
    borderRadius: '10px',
    fontSize: 12,
    boxShadow: '0 8px 20px rgba(20,23,28,0.08)',
  };

  // Mes del detalle de motivos (solo aplica cuando el período es el año completo).
  const matchesMotivoMonth = (fechaRetiro: string) =>
    motivoMonth === 'all' || Number(fechaRetiro.slice(5, 7)) - 1 === Number(motivoMonth);
  const motivoMonthOptions = MONTHS.filter(m => m.value !== 'all'
    && (metrics?.retirosPorEmpresa ?? []).some(e => (e.personas ?? []).some(p => Number(p.fechaRetiro.slice(5, 7)) - 1 === Number(m.value))));

  const motivosCounts: Record<string, number> = motivoMonth === 'all'
    ? (metrics?.motivosRetiro ?? {})
    : (metrics?.retirosPorEmpresa ?? []).flatMap(e => e.personas ?? [])
      .filter(p => matchesMotivoMonth(p.fechaRetiro))
      .reduce<Record<string, number>>((acc, p) => { acc[p.motivo] = (acc[p.motivo] ?? 0) + 1; return acc; }, {});
  const motivosData = Object.entries(motivosCounts)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({
      name: name.length > 32 ? name.slice(0, 30) + '…' : name,
      fullName: name,
      value,
    }))
    .sort((a, b) => b.value - a.value);
  const totalRetirosMotivos = motivosData.reduce((sum, m) => sum + m.value, 0);
  const motivoPeriodLabel = motivoMonth === 'all'
    ? periodLabel
    : `${MONTHS.find(m => m.value === motivoMonth)?.label} ${activeYear}`;

  // Al cambiar los datos (nuevos filtros), se limpia la selección del detalle.
  useEffect(() => {
    setSelectedMotivo(null); setMotivoMonth('all'); setExpandedEmpresas(new Set()); setExpandedProyectos(new Set());
  }, [metrics]);

  const ingresosPorProyecto = (metrics?.headcountPorProyecto ?? [])
    .filter(p => (p.personasIngreso ?? []).length > 0)
    .sort((a, b) => b.ingresos - a.ingresos || a.proyecto.localeCompare(b.proyecto, 'es'));

  const toggleProyecto = (proyecto: string) => setExpandedProyectos(prev => {
    const next = new Set(prev);
    if (next.has(proyecto)) next.delete(proyecto); else next.add(proyecto);
    return next;
  });

  const retirosPorEmpresaFiltrados = (metrics?.retirosPorEmpresa ?? [])
    .map(item => {
      const personas = (item.personas ?? [])
        .filter(p => (!selectedMotivo || p.motivo === selectedMotivo) && matchesMotivoMonth(p.fechaRetiro));
      return { ...item, personas, count: personas.length };
    })
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count || a.empresa.localeCompare(b.empresa, 'es'));

  const toggleEmpresa = (empresa: string) => setExpandedEmpresas(prev => {
    const next = new Set(prev);
    if (next.has(empresa)) next.delete(empresa); else next.add(empresa);
    return next;
  });

  const formatFecha = (iso: string) => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 bg-gray-50 min-h-screen">

      {/* Header — solo en modo standalone */}
      {!controlled && (
        <div>
          <p className="text-[11px] font-semibold text-[#8B93A1] uppercase tracking-wider mb-1">Analytics</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#14171C] tracking-tight">Rotación &amp; Talento</h1>
          <p className="text-[#565D6B] text-sm mt-0.5">Análisis histórico de movimientos de personal</p>
        </div>
      )}

      {/* Filtros — solo en modo standalone */}
      {!controlled && <div className="bg-white rounded-xl border border-[#E7E9EE] shadow-sm p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <Filter className="w-3.5 h-3.5 text-[#565D6B]" />
          <span className="text-xs font-semibold text-[#565D6B] uppercase tracking-wide">Filtros</span>
          {hasActiveFilters && (
            <span className="ml-1 text-[10px] bg-[#14171C] text-white px-1.5 py-0.5 rounded-full font-semibold">
              Activos
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="border-[#E7E9EE] focus:ring-[#14171C] text-sm">
              <SelectValue placeholder="Año" />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="border-[#E7E9EE] focus:ring-[#14171C] text-sm">
              <SelectValue placeholder="Mes" />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedEmpresa} onValueChange={handleEmpresaChange}>
            <SelectTrigger className="border-[#E7E9EE] focus:ring-[#14171C] text-sm">
              <SelectValue placeholder="Empresa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las empresas</SelectItem>
              {filterOptions.empresas.map(e => (
                <SelectItem key={e} value={e}>{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedProyecto} onValueChange={setSelectedProyecto}>
            <SelectTrigger className="border-[#E7E9EE] focus:ring-[#14171C] text-sm">
              <SelectValue placeholder="Cuenta analítica" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las cuentas analíticas</SelectItem>
              {projectOptionsForSelectedEmpresa.map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 mt-3">
          <Button
            onClick={handleApply}
            disabled={loading}
            className="flex-1 bg-[#14171C] hover:bg-[#2A2F3A] text-white text-sm"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Cargando…</>
              : 'Aplicar Filtros'}
          </Button>
          {hasActiveFilters && (
            <Button
              onClick={handleClear}
              disabled={loading}
              variant="outline"
              className="border-[#E7E9EE] text-[#8B93A1] hover:text-[#A8552F] hover:border-[#F0DCD2] text-sm"
            >
              <X className="w-4 h-4 mr-1" /> Limpiar
            </Button>
          )}
        </div>

        {/* Contexto activo */}
        {!loading && metrics && (
          <div className="mt-3 pt-3 border-t border-[#EEF0F3] flex flex-wrap gap-2 text-[11px] text-[#8B93A1]">
            <span>Mostrando:</span>
            <span className="font-semibold text-[#14171C]">{periodLabel}</span>
            {activeEmpresa !== 'all' && <span>· <span className="font-semibold text-[#14171C]">{activeEmpresa}</span></span>}
            {activeProyecto !== 'all' && <span>· <span className="font-semibold text-[#14171C]">{activeProyecto}</span></span>}
            <span className="ml-auto text-[#8B93A1]">
              {metrics.totalIngresos} ingresos · {metrics.totalRetiros} retiros · {metrics.headcount} activos
            </span>
          </div>
        )}
      </div>}

      {/* ── Loading overlay ── */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#14171C]" />
        </div>
      )}

      {!loading && metrics && (
        <>
          {/* ── KPIs principales ── */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <Card className="border-[#E7E9EE] shadow-sm rounded-xl">
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-[#8B93A1] uppercase tracking-wide">Ingresos</CardTitle>
                <div className="w-7 h-7 rounded-lg bg-[#F1F2F4] flex items-center justify-center flex-shrink-0">
                  <UserPlus className="w-3.5 h-3.5 text-[#14171C]" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl sm:text-3xl font-bold text-[#14171C] tracking-tight">{metrics.totalIngresos}</div>
                <p className="text-xs text-[#8B93A1] mt-1">{periodLabel}</p>
              </CardContent>
            </Card>

            <Card className="border-[#E7E9EE] shadow-sm rounded-xl">
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-[#8B93A1] uppercase tracking-wide">Retiros</CardTitle>
                <div className="w-7 h-7 rounded-lg bg-[#FDF2EE] flex items-center justify-center flex-shrink-0">
                  <UserMinus className="w-3.5 h-3.5 text-[#A8552F]" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl sm:text-3xl font-bold text-[#A8552F] tracking-tight">{metrics.totalRetiros}</div>
                <p className="text-xs text-[#8B93A1] mt-1">{periodLabel}</p>
              </CardContent>
            </Card>

            <Card className="border-[#E7E9EE] shadow-sm rounded-xl">
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-[#8B93A1] uppercase tracking-wide">
                  {activeMonth === 'all' ? 'Headcount promedio' : 'Headcount'}
                </CardTitle>
                <div className="w-7 h-7 rounded-lg bg-[#F1F2F4] flex items-center justify-center flex-shrink-0">
                  <Users className="w-3.5 h-3.5 text-[#14171C]" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl sm:text-3xl font-bold text-[#14171C] tracking-tight">{metrics.headcount}</div>
                <p className="text-xs text-[#8B93A1] mt-1">
                  {activeEmpresa !== 'all' ? `${activeEmpresa} · contratos al cierre de ${periodLabel}` : `Contratos vigentes al cierre de ${periodLabel}`}
                </p>
              </CardContent>
            </Card>

            <Card className="border-[#E7E9EE] shadow-sm rounded-xl">
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-[#8B93A1] uppercase tracking-wide">Tiempo Prom.</CardTitle>
                <div className="w-7 h-7 rounded-lg bg-[#F1F2F4] flex items-center justify-center flex-shrink-0">
                  <Clock className="w-3.5 h-3.5 text-[#14171C]" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl sm:text-3xl font-bold text-[#14171C] tracking-tight">{metrics.tiempoPromedioEmpresa}</div>
                <p className="text-xs text-[#8B93A1] mt-1">Meses en la empresa</p>
              </CardContent>
            </Card>

            {/* Aprendices SENA: no se suman con los trabajadores en ninguna métrica. */}
            <Card className="col-span-2 lg:col-span-1 border-[#E7E9EE] shadow-sm rounded-xl">
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-[#8B93A1] uppercase tracking-wide">Aprendices</CardTitle>
                <div className="w-7 h-7 rounded-lg bg-[#F1F2F4] flex items-center justify-center flex-shrink-0">
                  <GraduationCap className="w-3.5 h-3.5 text-[#14171C]" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl sm:text-3xl font-bold text-[#14171C] tracking-tight">{metrics.aprendices.headcount}</div>
                <p className="text-xs text-[#8B93A1] mt-1">Vigentes al cierre de {periodLabel}</p>
                <div className="mt-2 flex gap-3 text-xs">
                  <span className="text-[#565D6B]"><span className="font-bold text-[#14171C]">{metrics.aprendices.ingresos}</span> ingresos</span>
                  <span className="text-[#565D6B]"><span className="font-bold text-[#A8552F]">{metrics.aprendices.retiros}</span> retiros</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Tasas de Rotación ── */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Card className="group relative border-[#E7E9EE] shadow-sm rounded-xl cursor-help" tabIndex={0}>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[#8B93A1] uppercase tracking-wide">% Rot. General <CircleHelp className="h-3.5 w-3.5" /></CardTitle>
                <CardDescription className="text-[10px] text-[#8B93A1]">Retiros del período / HC promedio</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="flex items-center gap-2">
                  <div className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: metrics.rotacionGeneral > 5 ? '#A8552F' : '#14171C' }}>{metrics.rotacionGeneral}%</div>
                  {metrics.rotacionGeneral > 5
                    ? <TrendingUp className="w-4 h-4 text-[#A8552F] flex-shrink-0" />
                    : <TrendingDown className="w-4 h-4 text-[#8B93A1] flex-shrink-0" />
                  }
                </div>
                <p className="text-[9px] text-[#8B93A1] mt-1">{metrics.headcountBaseLabel}</p>
              </CardContent>
              <CalculationTooltip
                title="Cálculo de rotación general"
                formula="(Retiros del período ÷ HC promedio) × 100 — HC promedio = (HC inicial + HC final) ÷ 2"
                operation={metrics.headcountBase > 0
                  ? `(${metrics.totalRetiros} ÷ ${metrics.headcountBase}) × 100 = ${metrics.rotacionGeneral}%`
                  : 'Sin headcount disponible = 0%'}
                note={metrics.headcountBaseLabel}
              />
            </Card>

            <Card className="group relative border-[#E7E9EE] shadow-sm rounded-xl cursor-help" tabIndex={0}>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[#8B93A1] uppercase tracking-wide">% Rot. Voluntaria <CircleHelp className="h-3.5 w-3.5" /></CardTitle>
                <CardDescription className="text-[10px] text-[#8B93A1]">Retiros voluntarios del período / HC promedio</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-xl sm:text-2xl font-bold text-[#14171C] tracking-tight">{metrics.rotacionVoluntaria}%</div>
                <p className="text-[9px] text-[#8B93A1] mt-1">{metrics.headcountBaseLabel}</p>
              </CardContent>
              <CalculationTooltip
                title="Cálculo de rotación voluntaria"
                formula="(Retiros voluntarios ÷ HC promedio) × 100"
                operation={metrics.headcountBase > 0
                  ? `(${metrics.voluntarioVsInvoluntario.voluntario} ÷ ${metrics.headcountBase}) × 100 = ${metrics.rotacionVoluntaria}%`
                  : 'Sin headcount disponible = 0%'}
                note={metrics.headcountBaseLabel}
              />
            </Card>

          </div>

          {/* ── Gráfico Ingresos vs Retiros ── */}
          <Card className="border-[#E7E9EE] shadow-sm rounded-xl">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="text-sm sm:text-base text-[#14171C] font-bold">Ingresos vs Retiros</CardTitle>
              <CardDescription className="text-xs text-[#8B93A1]">
                {activeMonth !== 'all'
                  ? `${MONTHS.find(m => m.value === activeMonth)?.label} ${activeYear}`
                  : `Enero – Diciembre ${activeYear}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-2 sm:px-4 pb-4">
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={metrics.ingresosPorMes} margin={{ left: -10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F3" />
                  <XAxis dataKey="month" stroke="#8B93A1" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" stroke="#8B93A1" tick={{ fontSize: 10 }} width={28} />
                  <YAxis yAxisId="right" orientation="right" stroke="#8B93A1" tick={{ fontSize: 10 }} width={28} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="ingresos" fill="#14171C" name="Ingresos" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" dataKey="retiros"  fill="#C98862" name="Retiros"  radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="rotacion" stroke="#8B93A1"
                    name="% Rotación" strokeWidth={2} dot={{ fill: '#8B93A1', r: 3 }} />
                  <Line yAxisId="right" type="monotone" dataKey="rotacionVoluntaria" stroke="#C98862"
                    name="% Rotación voluntaria" strokeWidth={2} strokeDasharray="4 3" dot={{ fill: '#C98862', r: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* ── Detalle mensual (mismas columnas que la tabla oficial de TH) ── */}
          <Card className="border-[#E7E9EE] shadow-sm rounded-xl">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="text-sm sm:text-base text-[#14171C] font-bold">Retiros y rotación mensual {activeYear}</CardTitle>
              <CardDescription className="text-xs text-[#8B93A1]">
                Contratos vigentes; el retiro descuenta el mismo día. HC promedio = (HC inicial + HC final) ÷ 2.
                {' '}No incluye aprendices SENA (se muestran aparte en la tarjeta Aprendices).
              </CardDescription>
            </CardHeader>
            <CardContent className="px-2 sm:px-4 pb-4 overflow-x-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="text-[#8B93A1] text-right border-b border-[#EEF0F3]">
                    {['Mes', 'HC inicial', 'Ingresos', 'Retiros', 'HC final', 'HC promedio', 'Rotación %', 'Voluntarios', 'Rot. voluntaria %', 'Involuntarios', 'Rot. involuntaria %', 'Sustitución patronal']
                      .map((header, index) => <th key={header} className={`px-2 py-2 font-medium ${index === 0 ? 'text-left' : ''}`}>{header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {metrics.detalleMensual.map(row => (
                    <tr key={`${row.year}-${row.month}`} className="text-right border-b border-[#F4F5F7] text-[#14171C]">
                      <td className="px-2 py-1.5 text-left capitalize">{row.month}</td>
                      <td className="px-2 py-1.5">{row.hcInicial}</td>
                      <td className="px-2 py-1.5">{row.ingresos}</td>
                      <td className="px-2 py-1.5">{row.retiros}</td>
                      <td className="px-2 py-1.5">{row.hcFinal}</td>
                      <td className="px-2 py-1.5">{Math.round(row.hcPromedio)}</td>
                      <td className="px-2 py-1.5 font-semibold">{row.rotacion.toFixed(1)}%</td>
                      <td className="px-2 py-1.5">{row.retirosVoluntarios}</td>
                      <td className="px-2 py-1.5">{row.rotacionVoluntaria.toFixed(1)}%</td>
                      <td className="px-2 py-1.5">{row.retirosInvoluntarios}</td>
                      <td className="px-2 py-1.5">{row.rotacionInvoluntaria.toFixed(1)}%</td>
                      <td className="px-2 py-1.5">{row.sustitucionPatronal || '-'}</td>
                    </tr>
                  ))}
                  {metrics.detalleMensual.length > 1 && (
                    <tr className="text-right font-semibold text-[#14171C] bg-[#F7F8FA]">
                      <td className="px-2 py-1.5 text-left">Acumulado {activeYear}</td>
                      <td className="px-2 py-1.5">{metrics.detalleMensual[0].hcInicial}</td>
                      <td className="px-2 py-1.5">{metrics.totalIngresos}</td>
                      <td className="px-2 py-1.5">{metrics.totalRetiros}</td>
                      <td className="px-2 py-1.5">{metrics.headcount}</td>
                      <td className="px-2 py-1.5">{Math.round(metrics.hcPromedio)}</td>
                      <td className="px-2 py-1.5">{metrics.rotacionGeneral.toFixed(1)}%</td>
                      <td className="px-2 py-1.5">{metrics.voluntarioVsInvoluntario.voluntario}</td>
                      <td className="px-2 py-1.5">{metrics.rotacionVoluntaria.toFixed(1)}%</td>
                      <td className="px-2 py-1.5">{metrics.voluntarioVsInvoluntario.involuntario}</td>
                      <td className="px-2 py-1.5">{metrics.rotacionInvoluntaria.toFixed(1)}%</td>
                      <td className="px-2 py-1.5">{metrics.sustitucionPatronal || '-'}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* ── Motivos de retiro + Costos ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <Card className="border-[#E7E9EE] shadow-sm rounded-xl">
              <CardHeader className="px-4 pt-4 pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm sm:text-base text-[#14171C] font-bold">Motivos de Retiro</CardTitle>
                    <CardDescription className="text-xs text-[#8B93A1]">
                      {totalRetirosMotivos > 0
                        ? `${totalRetirosMotivos} retiro${totalRetirosMotivos !== 1 ? 's' : ''} en ${motivoPeriodLabel}`
                        : `Sin retiros en ${motivoPeriodLabel}`}
                    </CardDescription>
                  </div>
                  {/* Con un mes ya elegido en los filtros generales, el detalle ya viene filtrado. */}
                  {activeMonth === 'all' && motivoMonthOptions.length > 0 && (
                    <Select value={motivoMonth} onValueChange={value => { setMotivoMonth(value); setSelectedMotivo(null); setExpandedEmpresas(new Set()); }}>
                      <SelectTrigger className="h-8 w-[150px] text-xs">
                        <SelectValue placeholder="Mes" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-xs">Todos los meses</SelectItem>
                        {motivoMonthOptions.map(m => (
                          <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </CardHeader>
              <CardContent className="px-2 sm:px-4 pb-4">
                {motivosData.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                    Sin retiros registrados para este período
                  </div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={Math.max(200, motivosData.length * 40)}>
                      <BarChart
                        layout="vertical"
                        data={motivosData}
                        margin={{ left: 4, right: 34, top: 4, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F3" horizontal={false} />
                        <XAxis type="number" stroke="#8B93A1" tick={{ fontSize: 10 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" stroke="#8B93A1" tick={{ fontSize: 10 }} width={148} />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(val, _, props: any) => [val, props.payload.fullName]}
                        />
                        <Bar
                          dataKey="value"
                          radius={[0, 4, 4, 0]}
                          cursor="pointer"
                          onClick={(entry: any) => {
                            const motivo = entry?.fullName ?? entry?.payload?.fullName;
                            if (motivo) setSelectedMotivo(prev => prev === motivo ? null : motivo);
                          }}
                        >
                          {motivosData.map(entry => (
                            <Cell
                              key={entry.fullName}
                              fill={!selectedMotivo || selectedMotivo === entry.fullName ? '#C98862' : '#E8D3C6'}
                            />
                          ))}
                          <LabelList dataKey="value" position="right" fill="#14171C" fontSize={11} fontWeight={700} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>

                    <div className="mt-4 pt-4 border-t border-[#E7E9EE]">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-[11px] font-bold text-[#8B93A1] uppercase tracking-wide">
                          Empresas de las cuales se retiraron
                        </p>
                        {selectedMotivo && (
                          <button
                            type="button"
                            onClick={() => setSelectedMotivo(null)}
                            className="flex items-center gap-1 rounded-full bg-[#F4E9E2] px-2 py-0.5 text-[10px] font-semibold text-[#A8552F] hover:bg-[#EEDBCF]"
                            title="Quitar filtro de motivo"
                          >
                            <span className="max-w-[160px] truncate">{selectedMotivo}</span>
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-[#8B93A1] mb-2">
                        Haz clic en una barra para ver solo ese motivo y en una empresa para ver las personas.
                      </p>
                      <div className="space-y-1.5">
                        {retirosPorEmpresaFiltrados.map(item => {
                          const open = expandedEmpresas.has(item.empresa);
                          return (
                            <div key={item.empresa} className="rounded-lg bg-[#F7F8F9]">
                              <button
                                type="button"
                                onClick={() => toggleEmpresa(item.empresa)}
                                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                                aria-expanded={open}
                              >
                                <span className="flex min-w-0 items-center gap-1.5">
                                  {open
                                    ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-[#8B93A1]" />
                                    : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[#8B93A1]" />}
                                  <span className="text-xs text-[#565D6B] truncate" title={item.empresa}>{item.empresa}</span>
                                </span>
                                <span className="text-xs font-bold text-[#14171C] flex-shrink-0">{item.count}</span>
                              </button>
                              {open && (
                                <ul className="divide-y divide-[#E7E9EE] border-t border-[#E7E9EE] px-3">
                                  {item.personas.map((persona, idx) => (
                                    <li key={`${persona.employeeId}-${persona.fechaRetiro}-${idx}`} className="py-2">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="text-xs font-semibold text-[#14171C] truncate" title={persona.nombre}>{persona.nombre}</p>
                                          <p className="text-[10px] text-[#8B93A1] truncate">
                                            CC {persona.documento}{persona.cargo ? ` · ${persona.cargo}` : ''}
                                          </p>
                                        </div>
                                        <span className="text-[10px] text-[#565D6B] flex-shrink-0">{formatFecha(persona.fechaRetiro)}</span>
                                      </div>
                                      {!selectedMotivo && (
                                        <p className="mt-0.5 text-[10px] font-medium text-[#A8552F]">{persona.motivo}</p>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* ── Headcount por proyecto ── */}
            <Card className="border-[#E7E9EE] shadow-sm rounded-xl">
              <CardHeader className="px-4 pt-4 pb-2">
                <CardTitle className="text-sm sm:text-base text-[#14171C] font-bold">Headcount por Cuenta Analítica</CardTitle>
                <CardDescription className="text-xs text-[#8B93A1]">
                  Colaboradores activos y nuevos ingresos por cuenta analítica · {periodLabel}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-2 sm:px-4 pb-4">
                {(!metrics?.headcountPorProyecto || metrics.headcountPorProyecto.length === 0) ? (
                  <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                    Sin datos de cuentas analíticas
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(220, metrics.headcountPorProyecto.length * 56 + 40)}>
                    <BarChart
                      layout="vertical"
                      data={metrics.headcountPorProyecto.map(p => ({
                        name: p.proyecto.length > 30 ? p.proyecto.slice(0, 28) + '…' : p.proyecto,
                        fullName: p.proyecto,
                        empresa: p.empresa,
                        count: p.count,
                        ingresos: p.ingresos ?? 0,
                      }))}
                      margin={{ left: 4, right: 40, top: 4, bottom: 4 }}
                      barGap={2}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F3" horizontal={false} />
                      <XAxis type="number" stroke="#8B93A1" tick={{ fontSize: 10 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" stroke="#8B93A1" tick={{ fontSize: 10 }} width={148} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        labelFormatter={(_, payload: any) => payload?.[0]?.payload?.fullName ?? ''}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="count" fill="#14171C" radius={[0, 4, 4, 0]} name="Activos al cierre">
                        <LabelList dataKey="count" position="right" style={{ fontSize: 11, fontWeight: 600, fill: '#14171C' }} />
                      </Bar>
                      <Bar dataKey="ingresos" fill="#7FA7C9" radius={[0, 4, 4, 0]} name="Nuevos ingresos">
                        <LabelList dataKey="ingresos" position="right" style={{ fontSize: 11, fontWeight: 600, fill: '#14171C' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                {metrics?.headcountPorProyecto && metrics.headcountPorProyecto.length > 0 && (() => {
                  const totalAsignaciones = metrics.headcountPorProyecto.reduce((sum, p) => sum + p.count, 0);
                  const totalIngresos = metrics.headcountPorProyecto.reduce((sum, p) => sum + (p.ingresos ?? 0), 0);
                  return (
                    <p className="text-[10px] text-[#8B93A1] mt-2 text-right">
                      Total: <span className="font-semibold text-[#14171C]">{totalAsignaciones}</span> asignaciones
                      {totalAsignaciones !== metrics.headcountSnapshot && (
                        <> ({metrics.headcountSnapshot} personas — {totalAsignaciones - metrics.headcountSnapshot} con más de una cuenta analítica activa)</>
                      )}
                      {' '}· <span className="font-semibold text-[#14171C]">{totalIngresos}</span> nuevos ingresos en {periodLabel}
                    </p>
                  );
                })()}

                {ingresosPorProyecto.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-[#E7E9EE]">
                    <p className="text-[11px] font-bold text-[#8B93A1] uppercase tracking-wide mb-1">
                      Nuevos ingresos por cuenta analítica
                    </p>
                    <p className="text-[10px] text-[#8B93A1] mb-2">
                      Haz clic en una cuenta analítica para ver las personas que ingresaron en {periodLabel}.
                    </p>
                    <div className="space-y-1.5">
                      {ingresosPorProyecto.map(item => {
                        const open = expandedProyectos.has(item.proyecto);
                        return (
                          <div key={item.proyecto} className="rounded-lg bg-[#F7F8F9]">
                            <button
                              type="button"
                              onClick={() => toggleProyecto(item.proyecto)}
                              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                              aria-expanded={open}
                            >
                              <span className="flex min-w-0 items-center gap-1.5">
                                {open
                                  ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-[#8B93A1]" />
                                  : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[#8B93A1]" />}
                                <span className="text-xs text-[#565D6B] truncate" title={item.proyecto}>{item.proyecto}</span>
                              </span>
                              <span className="text-xs font-bold text-[#14171C] flex-shrink-0">{item.ingresos}</span>
                            </button>
                            {open && (
                              <ul className="divide-y divide-[#E7E9EE] border-t border-[#E7E9EE] px-3">
                                {item.personasIngreso.map((persona, idx) => (
                                  <li key={`${persona.employeeId}-${persona.fechaIngreso}-${idx}`} className="py-2">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="text-xs font-semibold text-[#14171C] truncate" title={persona.nombre}>{persona.nombre}</p>
                                        <p className="text-[10px] text-[#8B93A1] truncate">
                                          CC {persona.documento}{persona.cargo ? ` · ${persona.cargo}` : ''}
                                        </p>
                                        {activeEmpresa === 'all' && (
                                          <p className="text-[10px] text-[#565D6B] truncate">{persona.empresa}</p>
                                        )}
                                      </div>
                                      <div className="flex flex-col items-end flex-shrink-0">
                                        <span className="text-[10px] text-[#565D6B]">{formatFecha(persona.fechaIngreso)}</span>
                                        {persona.retirado && (
                                          <span className="mt-0.5 text-[10px] font-medium text-[#A8552F]">Ya se retiró</span>
                                        )}
                                      </div>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-[#E7E9EE] shadow-sm rounded-xl">
              <CardHeader className="px-4 pt-4 pb-2">
                <CardTitle className="text-sm sm:text-base text-[#14171C] font-bold">Costos de Retiros</CardTitle>
                <CardDescription className="text-xs text-[#8B93A1]">Impacto financiero · {periodLabel}</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="flex items-center gap-3 p-3 sm:p-4 bg-[#FDF2EE] rounded-xl border border-[#F0DCD2]">
                  <div className="p-2 bg-white rounded-lg shadow-sm flex-shrink-0">
                    <DollarSign className="w-5 h-5 text-[#A8552F]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-[#8B93A1] font-medium">Costo Total Retiros</p>
                    <p className="text-lg sm:text-xl font-bold text-[#A8552F]">
                      {metrics.costoRetiros > 0 ? `$${metrics.costoRetiros.toLocaleString()}` : '—'}
                    </p>
                    {metrics.costoRetiros === 0 && (
                      <p className="text-[10px] text-gray-400">No se ingresaron costos en los retiros</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 sm:p-4 bg-[#F6F7F9] rounded-xl border border-[#E7E9EE]">
                  <div className="p-2 bg-white rounded-lg shadow-sm flex-shrink-0">
                    <DollarSign className="w-5 h-5 text-[#14171C]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-[#8B93A1] font-medium">Fracaso Contratación</p>
                    <p className="text-lg sm:text-xl font-bold text-[#14171C]">{metrics.fracasoContratacion}%</p>
                    <p className="text-[10px] text-gray-400">Retiros en menos de 3 meses</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 sm:p-4 bg-[#F6F7F9] rounded-xl border border-[#E7E9EE]">
                  <div className="p-2 bg-white rounded-lg shadow-sm flex-shrink-0">
                    <UserMinus className="w-5 h-5 text-[#14171C]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-[#8B93A1] font-medium">Retiros Tempranos</p>
                    <p className="text-lg sm:text-xl font-bold text-[#14171C]">{metrics.retirosTempranos}</p>
                    <p className="text-[10px] text-gray-400">Menos de 3 meses en la empresa</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};
