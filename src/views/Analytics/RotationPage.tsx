import { useState } from 'react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Loader2, Users, UserPlus, UserMinus, Clock,
  TrendingUp, TrendingDown, DollarSign, Filter,
} from 'lucide-react';
import {
  Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ComposedChart,
} from 'recharts';

export const RotationPage = () => {
  const { metrics, loading, refreshMetrics, filterOptions } = useAnalytics();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedEmpresa, setSelectedEmpresa] = useState('all');
  const [selectedProyecto, setSelectedProyecto] = useState('all');

  const handleFilterChange = () => {
    refreshMetrics({
      año:     parseInt(selectedYear),
      mes:     selectedMonth === 'all' ? undefined : parseInt(selectedMonth),
      empresa:  selectedEmpresa === 'all' ? undefined : selectedEmpresa,
      proyecto: selectedProyecto === 'all' ? undefined : selectedProyecto,
    });
  };

  if (loading || !metrics) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" />
      </div>
    );
  }

  const months = [
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

  const years = [
    new Date().getFullYear() - 2,
    new Date().getFullYear() - 1,
    new Date().getFullYear(),
  ];

  const tooltipStyle = {
    backgroundColor: '#FFFFFF',
    border: '1px solid #008C3C',
    borderRadius: '8px',
    fontSize: 12,
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 bg-gray-50 min-h-screen">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[#4A4A4A]">Rotación & Talento</h1>
        <p className="text-[#4A4A4A]/70 text-sm mt-0.5">Dashboard de análisis de personal</p>
      </div>

      {/* ── Filtros ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <Filter className="w-3.5 h-3.5 text-[#008C3C]" />
          <span className="text-xs font-semibold text-[#008C3C] uppercase tracking-wide">Filtros</span>
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
              {months.map(m => (
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

        <Button
          onClick={handleFilterChange}
          variant="outline"
          className="w-full mt-3 border-[#008C3C] text-[#008C3C] hover:bg-[#008C3C] hover:text-white text-sm"
        >
          Aplicar Filtros
        </Button>
      </div>


      {/* ── KPIs principales ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="border-l-4 border-l-[#008C3C] shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs sm:text-sm font-medium text-[#4A4A4A]">Ingresos</CardTitle>
            <UserPlus className="w-4 h-4 sm:w-5 sm:h-5 text-[#008C3C] flex-shrink-0" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl sm:text-3xl font-bold text-[#008C3C]">{metrics.totalIngresos}</div>
            <p className="text-xs text-[#4A4A4A]/60 mt-1">Nuevos colaboradores</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-600 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs sm:text-sm font-medium text-[#4A4A4A]">Retiros</CardTitle>
            <UserMinus className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 flex-shrink-0" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl sm:text-3xl font-bold text-red-600">{metrics.totalRetiros}</div>
            <p className="text-xs text-[#4A4A4A]/60 mt-1">Colaboradores retirados</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#1F8FBF] shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs sm:text-sm font-medium text-[#4A4A4A]">Headcount</CardTitle>
            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-[#1F8FBF] flex-shrink-0" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl sm:text-3xl font-bold text-[#1F8FBF]">{metrics.headcount}</div>
            <p className="text-xs text-[#4A4A4A]/60 mt-1">Colaboradores activos</p>
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs sm:text-sm font-medium text-[#4A4A4A]">% Rot. General</CardTitle>
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
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-xl sm:text-2xl font-bold text-orange-600">{metrics.rotacionVoluntaria}%</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs sm:text-sm font-medium text-[#4A4A4A]">Tasa Voluntaria</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-xl sm:text-2xl font-bold text-pink-600">{metrics.tasaVoluntaria}%</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs sm:text-sm font-medium text-[#4A4A4A]">Cubrimiento</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-xl sm:text-2xl font-bold text-[#1F8FBF]">{metrics.cubrimiento}%</div>
          </CardContent>
        </Card>
      </div>

      {/* ── Gráfico Ingresos vs Retiros ── */}
      <Card className="shadow-sm">
        <CardHeader className="px-4 pt-4 pb-2">
          <CardTitle className="text-sm sm:text-base text-[#4A4A4A]">Ingresos vs Retiros</CardTitle>
          <CardDescription className="text-xs text-[#4A4A4A]/70">
            Comparativa mensual de movimientos de personal
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

      {/* ── Voluntario vs Involuntario + Costos ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Card className="shadow-sm">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardTitle className="text-sm sm:text-base text-[#4A4A4A]">Voluntario vs Involuntario</CardTitle>
            <CardDescription className="text-xs text-[#4A4A4A]/70">
              {metrics.voluntarioVsInvoluntario.voluntario} voluntarios · {metrics.voluntarioVsInvoluntario.involuntario} involuntarios
            </CardDescription>
          </CardHeader>
          <CardContent className="px-2 sm:px-4 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={[
                  { name: 'Voluntario',   value: metrics.voluntarioVsInvoluntario.voluntario },
                  { name: 'Involuntario', value: metrics.voluntarioVsInvoluntario.involuntario },
                ]}
                margin={{ left: -10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="name" stroke="#4A4A4A" tick={{ fontSize: 11 }} />
                <YAxis stroke="#4A4A4A" tick={{ fontSize: 11 }} width={28} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" fill="#008C3C" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardTitle className="text-sm sm:text-base text-[#4A4A4A]">Costos de Retiros</CardTitle>
            <CardDescription className="text-xs text-[#4A4A4A]/70">Impacto financiero de la rotación</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="flex items-center gap-3 p-3 sm:p-4 bg-red-50 rounded-xl border border-red-200">
              <div className="p-2 bg-white rounded-lg shadow-sm flex-shrink-0">
                <DollarSign className="w-5 h-5 text-red-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-[#4A4A4A]/70 font-medium">Costo Total Retiros</p>
                <p className="text-lg sm:text-xl font-bold text-red-600">${metrics.costoRetiros.toLocaleString()}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 sm:p-4 bg-orange-50 rounded-xl border border-orange-200">
              <div className="p-2 bg-white rounded-lg shadow-sm flex-shrink-0">
                <DollarSign className="w-5 h-5 text-orange-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-[#4A4A4A]/70 font-medium">Fracaso Contratación</p>
                <p className="text-lg sm:text-xl font-bold text-orange-600">{metrics.fracasoContratacion}%</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 sm:p-4 bg-[#7BCB6A]/10 rounded-xl border border-[#7BCB6A]/30">
              <div className="p-2 bg-white rounded-lg shadow-sm flex-shrink-0">
                <UserMinus className="w-5 h-5 text-[#008C3C]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-[#4A4A4A]/70 font-medium">Retiros Tempranos</p>
                <p className="text-lg sm:text-xl font-bold text-[#008C3C]">{metrics.retirosTempranos}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
