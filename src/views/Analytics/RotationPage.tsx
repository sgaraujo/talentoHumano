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
  TrendingUp, TrendingDown, DollarSign, Filter, X,
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
    border: '1px solid #008C3C',
    borderRadius: '8px',
    fontSize: 12,
  };

  const motivosData = Object.entries(metrics?.motivosRetiro ?? {})
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({
      name: name.length > 32 ? name.slice(0, 30) + '…' : name,
      fullName: name,
      value,
    }));

  return (
    <div className="p-4 sm:p-6 space-y-5 bg-gray-50 min-h-screen">

      {/* Header — solo en modo standalone */}
      {!controlled && (
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#4A4A4A]">Rotación & Talento</h1>
          <p className="text-[#4A4A4A]/70 text-sm mt-0.5">Análisis histórico de movimientos de personal</p>
        </div>
      )}

      {/* Filtros — solo en modo standalone */}
      {!controlled && <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <Filter className="w-3.5 h-3.5 text-[#008C3C]" />
          <span className="text-xs font-semibold text-[#008C3C] uppercase tracking-wide">Filtros</span>
          {hasActiveFilters && (
            <span className="ml-1 text-[10px] bg-[#008C3C] text-white px-1.5 py-0.5 rounded-full font-semibold">
              Activos
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="border-gray-200 focus:ring-[#008C3C] text-sm">
              <SelectValue placeholder="Año" />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="border-gray-200 focus:ring-[#008C3C] text-sm">
              <SelectValue placeholder="Mes" />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedEmpresa} onValueChange={setSelectedEmpresa}>
            <SelectTrigger className="border-gray-200 focus:ring-[#008C3C] text-sm">
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
            <SelectTrigger className="border-gray-200 focus:ring-[#008C3C] text-sm">
              <SelectValue placeholder="Proyecto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los proyectos</SelectItem>
              {filterOptions.proyectos.map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 mt-3">
          <Button
            onClick={handleApply}
            disabled={loading}
            className="flex-1 bg-[#008C3C] hover:bg-[#006C2F] text-white text-sm"
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
              className="border-gray-200 text-gray-500 hover:text-red-500 hover:border-red-200 text-sm"
            >
              <X className="w-4 h-4 mr-1" /> Limpiar
            </Button>
          )}
        </div>

        {/* Contexto activo */}
        {!loading && metrics && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-2 text-[11px] text-gray-500">
            <span>Mostrando:</span>
            <span className="font-semibold text-[#008C3C]">{periodLabel}</span>
            {activeEmpresa !== 'all' && <span>· <span className="font-semibold text-[#4A4A4A]">{activeEmpresa}</span></span>}
            {activeProyecto !== 'all' && <span>· <span className="font-semibold text-[#4A4A4A]">{activeProyecto}</span></span>}
            <span className="ml-auto text-gray-400">
              {metrics.totalIngresos} ingresos · {metrics.totalRetiros} retiros · {metrics.headcount} activos
            </span>
          </div>
        )}
      </div>}

      {/* ── Loading overlay ── */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" />
        </div>
      )}

      {!loading && metrics && (
        <>
          {/* ── KPIs principales ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Card className="border-l-4 border-l-[#008C3C] shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-[#4A4A4A]">Ingresos</CardTitle>
                <UserPlus className="w-4 h-4 sm:w-5 sm:h-5 text-[#008C3C] flex-shrink-0" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl sm:text-3xl font-bold text-[#008C3C]">{metrics.totalIngresos}</div>
                <p className="text-xs text-[#4A4A4A]/60 mt-1">{periodLabel}</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-red-600 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-[#4A4A4A]">Retiros</CardTitle>
                <UserMinus className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 flex-shrink-0" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl sm:text-3xl font-bold text-red-600">{metrics.totalRetiros}</div>
                <p className="text-xs text-[#4A4A4A]/60 mt-1">{periodLabel}</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-[#1F8FBF] shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-[#4A4A4A]">Headcount</CardTitle>
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-[#1F8FBF] flex-shrink-0" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl sm:text-3xl font-bold text-[#1F8FBF]">{metrics.headcount}</div>
                <p className="text-xs text-[#4A4A4A]/60 mt-1">
                  {activeEmpresa !== 'all' ? activeEmpresa : 'Todos los colaboradores activos'}
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-[#7BCB6A] shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-[#4A4A4A]">Tiempo Prom.</CardTitle>
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-[#7BCB6A] flex-shrink-0" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl sm:text-3xl font-bold text-[#7BCB6A]">{metrics.tiempoPromedioEmpresa}</div>
                <p className="text-xs text-[#4A4A4A]/60 mt-1">Meses en la empresa</p>
              </CardContent>
            </Card>
          </div>

          {/* ── Tasas de Rotación ── */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-[#4A4A4A]">% Rot. General</CardTitle>
                <CardDescription className="text-[10px]">Retiros / Headcount</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="flex items-center gap-2">
                  <div className="text-xl sm:text-2xl font-bold text-[#008C3C]">{metrics.rotacionGeneral}%</div>
                  {metrics.rotacionGeneral > 5
                    ? <TrendingUp className="w-4 h-4 text-red-500 flex-shrink-0" />
                    : <TrendingDown className="w-4 h-4 text-[#008C3C] flex-shrink-0" />
                  }
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-[#4A4A4A]">% Rot. Voluntaria</CardTitle>
                <CardDescription className="text-[10px]">Retiros voluntarios / Headcount</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-xl sm:text-2xl font-bold text-orange-600">{metrics.rotacionVoluntaria}%</div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-[#4A4A4A]">Tasa Voluntaria</CardTitle>
                <CardDescription className="text-[10px]">Voluntarios / Total retiros</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-xl sm:text-2xl font-bold text-pink-600">{metrics.tasaVoluntaria}%</div>
              </CardContent>
            </Card>

          </div>

          {/* ── Gráfico Ingresos vs Retiros ── */}
          <Card className="shadow-sm">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="text-sm sm:text-base text-[#4A4A4A]">Ingresos vs Retiros</CardTitle>
              <CardDescription className="text-xs text-[#4A4A4A]/70">
                {activeMonth !== 'all'
                  ? `Últimos 12 meses hasta ${MONTHS.find(m => m.value === activeMonth)?.label} ${activeYear}`
                  : `Enero – Diciembre ${activeYear}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-2 sm:px-4 pb-4">
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={metrics.ingresosPorMes} margin={{ left: -10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="month" stroke="#4A4A4A" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" stroke="#4A4A4A" tick={{ fontSize: 10 }} width={28} />
                  <YAxis yAxisId="right" orientation="right" stroke="#4A4A4A" tick={{ fontSize: 10 }} width={28} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="ingresos" fill="#008C3C" name="Ingresos" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" dataKey="retiros"  fill="#EF4444" name="Retiros"  radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="rotacion" stroke="#1F8FBF"
                    name="% Rotación" strokeWidth={2} dot={{ fill: '#1F8FBF', r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* ── Motivos de retiro + Costos ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <Card className="shadow-sm">
              <CardHeader className="px-4 pt-4 pb-2">
                <CardTitle className="text-sm sm:text-base text-[#4A4A4A]">Motivos de Retiro</CardTitle>
                <CardDescription className="text-xs text-[#4A4A4A]/70">
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
                  <ResponsiveContainer width="100%" height={Math.max(200, motivosData.length * 40)}>
                    <BarChart
                      layout="vertical"
                      data={motivosData}
                      margin={{ left: 4, right: 16, top: 4, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                      <XAxis type="number" stroke="#4A4A4A" tick={{ fontSize: 10 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" stroke="#4A4A4A" tick={{ fontSize: 10 }} width={148} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(val, _, props: any) => [val, props.payload.fullName]}
                      />
                      <Bar dataKey="value" fill="#EF4444" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* ── Headcount por proyecto ── */}
            <Card className="shadow-sm">
              <CardHeader className="px-4 pt-4 pb-2">
                <CardTitle className="text-sm sm:text-base text-[#4A4A4A]">Headcount por Cuenta Analítica</CardTitle>
                <CardDescription className="text-xs text-[#4A4A4A]/70">
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
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                      <XAxis type="number" stroke="#4A4A4A" tick={{ fontSize: 10 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" stroke="#4A4A4A" tick={{ fontSize: 10 }} width={148} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(val, _, props: any) => [val, props.payload.fullName]}
                        labelFormatter={() => ''}
                      />
                      <Bar dataKey="count" fill="#1F8FBF" radius={[0, 4, 4, 0]} name="Colaboradores">
                        <LabelList dataKey="count" position="right" style={{ fontSize: 11, fontWeight: 600, fill: '#1F8FBF' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="px-4 pt-4 pb-2">
                <CardTitle className="text-sm sm:text-base text-[#4A4A4A]">Costos de Retiros</CardTitle>
                <CardDescription className="text-xs text-[#4A4A4A]/70">Impacto financiero · {periodLabel}</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="flex items-center gap-3 p-3 sm:p-4 bg-red-50 rounded-xl border border-red-200">
                  <div className="p-2 bg-white rounded-lg shadow-sm flex-shrink-0">
                    <DollarSign className="w-5 h-5 text-red-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-[#4A4A4A]/70 font-medium">Costo Total Retiros</p>
                    <p className="text-lg sm:text-xl font-bold text-red-600">
                      {metrics.costoRetiros > 0 ? `$${metrics.costoRetiros.toLocaleString()}` : '—'}
                    </p>
                    {metrics.costoRetiros === 0 && (
                      <p className="text-[10px] text-gray-400">No se ingresaron costos en los retiros</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 sm:p-4 bg-orange-50 rounded-xl border border-orange-200">
                  <div className="p-2 bg-white rounded-lg shadow-sm flex-shrink-0">
                    <DollarSign className="w-5 h-5 text-orange-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-[#4A4A4A]/70 font-medium">Fracaso Contratación</p>
                    <p className="text-lg sm:text-xl font-bold text-orange-600">{metrics.fracasoContratacion}%</p>
                    <p className="text-[10px] text-gray-400">Retiros en menos de 3 meses</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 sm:p-4 bg-[#7BCB6A]/10 rounded-xl border border-[#7BCB6A]/30">
                  <div className="p-2 bg-white rounded-lg shadow-sm flex-shrink-0">
                    <UserMinus className="w-5 h-5 text-[#008C3C]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-[#4A4A4A]/70 font-medium">Retiros Tempranos</p>
                    <p className="text-lg sm:text-xl font-bold text-[#008C3C]">{metrics.retirosTempranos}</p>
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
