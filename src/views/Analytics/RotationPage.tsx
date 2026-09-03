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
  TrendingUp, TrendingDown, DollarSign, Filter, X, CircleHelp,
} from 'lucide-react';
import {
  Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ComposedChart, LabelList,
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

  const motivosData = Object.entries(metrics?.motivosRetiro ?? {})
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({
      name: name.length > 32 ? name.slice(0, 30) + '…' : name,
      fullName: name,
      value,
    }))
    .sort((a, b) => b.value - a.value);

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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
                <CardTitle className="text-xs sm:text-sm font-medium text-[#8B93A1] uppercase tracking-wide">Headcount</CardTitle>
                <div className="w-7 h-7 rounded-lg bg-[#F1F2F4] flex items-center justify-center flex-shrink-0">
                  <Users className="w-3.5 h-3.5 text-[#14171C]" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl sm:text-3xl font-bold text-[#14171C] tracking-tight">{metrics.headcount}</div>
                <p className="text-xs text-[#8B93A1] mt-1">
                  {activeEmpresa !== 'all' ? `${activeEmpresa} · cierre de ${periodLabel}` : `Vigentes al cierre de ${periodLabel}`}
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
          </div>

          {/* ── Tasas de Rotación ── */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <Card className="group relative border-[#E7E9EE] shadow-sm rounded-xl cursor-help" tabIndex={0}>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[#8B93A1] uppercase tracking-wide">% Rot. General <CircleHelp className="h-3.5 w-3.5" /></CardTitle>
                <CardDescription className="text-[10px] text-[#8B93A1]">Retiros del período / Headcount</CardDescription>
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
                formula="(Renuncias voluntarias ÷ HT del período, sin aprendices SENA) × 100"
                operation={metrics.headcountBase > 0
                  ? `(${metrics.voluntarioVsInvoluntario.voluntario} ÷ ${metrics.headcountBase}) × 100 = ${metrics.rotacionGeneral}%`
                  : 'Sin headcount disponible = 0%'}
                note={metrics.headcountBaseLabel}
              />
            </Card>

            <Card className="group relative border-[#E7E9EE] shadow-sm rounded-xl cursor-help" tabIndex={0}>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[#8B93A1] uppercase tracking-wide">% Rot. Voluntaria <CircleHelp className="h-3.5 w-3.5" /></CardTitle>
                <CardDescription className="text-[10px] text-[#8B93A1]">Retiros voluntarios del período / Headcount</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-xl sm:text-2xl font-bold text-[#14171C] tracking-tight">{metrics.rotacionVoluntaria}%</div>
                <p className="text-[9px] text-[#8B93A1] mt-1">{metrics.headcountBaseLabel}</p>
              </CardContent>
              <CalculationTooltip
                title="Cálculo de rotación voluntaria"
                formula="(Retiros voluntarios ÷ Headcount) × 100"
                operation={metrics.headcountBase > 0
                  ? `(${metrics.voluntarioVsInvoluntario.voluntario} ÷ ${metrics.headcountBase}) × 100 = ${metrics.rotacionVoluntaria}%`
                  : 'Sin headcount disponible = 0%'}
                note={metrics.headcountBaseLabel}
              />
            </Card>

            <Card className="group relative border-[#E7E9EE] shadow-sm rounded-xl cursor-help" tabIndex={0}>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[#8B93A1] uppercase tracking-wide">Tasa Voluntaria <CircleHelp className="h-3.5 w-3.5" /></CardTitle>
                <CardDescription className="text-[10px] text-[#8B93A1]">Voluntarios / Total retiros</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-xl sm:text-2xl font-bold text-[#14171C] tracking-tight">{metrics.tasaVoluntaria}%</div>
              </CardContent>
              <CalculationTooltip
                title="Cálculo de tasa voluntaria"
                formula="(Retiros voluntarios ÷ Total de retiros) × 100"
                operation={metrics.totalRetiros > 0
                  ? `(${metrics.voluntarioVsInvoluntario.voluntario} ÷ ${metrics.totalRetiros}) × 100 = ${metrics.tasaVoluntaria}%`
                  : 'Sin retiros en el período = 0%'}
                note="Indica qué proporción de todos los retiros fue voluntaria."
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
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* ── Motivos de retiro + Costos ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <Card className="border-[#E7E9EE] shadow-sm rounded-xl">
              <CardHeader className="px-4 pt-4 pb-2">
                <CardTitle className="text-sm sm:text-base text-[#14171C] font-bold">Motivos de Retiro</CardTitle>
                <CardDescription className="text-xs text-[#8B93A1]">
                  {metrics.totalRetiros > 0
                    ? `${metrics.totalRetiros} retiro${metrics.totalRetiros !== 1 ? 's' : ''} en ${periodLabel}`
                    : `Sin retiros en ${periodLabel}`}
                </CardDescription>
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
                        <Bar dataKey="value" fill="#C98862" radius={[0, 4, 4, 0]}>
                          <LabelList dataKey="value" position="right" fill="#14171C" fontSize={11} fontWeight={700} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>

                    <div className="mt-4 pt-4 border-t border-[#E7E9EE]">
                      <p className="text-[11px] font-bold text-[#8B93A1] uppercase tracking-wide mb-2">
                        Empresas de las cuales se retiraron
                      </p>
                      <div className="space-y-1.5">
                        {(metrics.retirosPorEmpresa ?? []).map(item => (
                          <div key={item.empresa} className="flex items-center justify-between gap-3 rounded-lg bg-[#F7F8F9] px-3 py-2">
                            <span className="text-xs text-[#565D6B] truncate" title={item.empresa}>{item.empresa}</span>
                            <span className="text-xs font-bold text-[#14171C] flex-shrink-0">{item.count}</span>
                          </div>
                        ))}
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
                  Colaboradores activos por cuenta analítica
                </CardDescription>
              </CardHeader>
              <CardContent className="px-2 sm:px-4 pb-4">
                {(!metrics?.headcountPorProyecto || metrics.headcountPorProyecto.length === 0) ? (
                  <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                    Sin datos de cuentas analíticas
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(200, metrics.headcountPorProyecto.length * 38)}>
                    <BarChart
                      layout="vertical"
                      data={metrics.headcountPorProyecto.map(p => ({
                        name: p.proyecto.length > 30 ? p.proyecto.slice(0, 28) + '…' : p.proyecto,
                        fullName: p.proyecto,
                        empresa: p.empresa,
                        count: p.count,
                      }))}
                      margin={{ left: 4, right: 40, top: 4, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F3" horizontal={false} />
                      <XAxis type="number" stroke="#8B93A1" tick={{ fontSize: 10 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" stroke="#8B93A1" tick={{ fontSize: 10 }} width={148} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(val, _, props: any) => [val, props.payload.fullName]}
                        labelFormatter={() => ''}
                      />
                      <Bar dataKey="count" fill="#14171C" radius={[0, 4, 4, 0]} name="Colaboradores">
                        <LabelList dataKey="count" position="right" style={{ fontSize: 11, fontWeight: 600, fill: '#14171C' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                {metrics?.headcountPorProyecto && metrics.headcountPorProyecto.length > 0 && (() => {
                  const totalAsignaciones = metrics.headcountPorProyecto.reduce((sum, p) => sum + p.count, 0);
                  return (
                    <p className="text-[10px] text-[#8B93A1] mt-2 text-right">
                      Total: <span className="font-semibold text-[#14171C]">{totalAsignaciones}</span> asignaciones
                      {totalAsignaciones !== metrics.headcount && (
                        <> ({metrics.headcount} personas — {totalAsignaciones - metrics.headcount} con más de una cuenta analítica activa)</>
                      )}
                    </p>
                  );
                })()}
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
