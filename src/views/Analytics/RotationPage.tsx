import { useState } from 'react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Users, UserPlus, UserMinus, Clock, TrendingUp, TrendingDown, DollarSign, Plus } from 'lucide-react';
import {
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import { RegisterMovementDialog } from '@/components/analytics/RegisterMovementDialog';

export const RotationPage = () => {
  const { metrics, loading, refreshMetrics } = useAnalytics();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);

  const handleFilterChange = () => {
    const filters = {
      año: parseInt(selectedYear),
      mes: selectedMonth === 'all' ? undefined : parseInt(selectedMonth),
    };
    refreshMetrics(filters);
  };

  if (loading || !metrics) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" />
      </div>
    );
  }

  const months = [
    { value: 'all', label: 'Todos' },
    { value: '0', label: 'Enero' },
    { value: '1', label: 'Febrero' },
    { value: '2', label: 'Marzo' },
    { value: '3', label: 'Abril' },
    { value: '4', label: 'Mayo' },
    { value: '5', label: 'Junio' },
    { value: '6', label: 'Julio' },
    { value: '7', label: 'Agosto' },
    { value: '8', label: 'Septiembre' },
    { value: '9', label: 'Octubre' },
    { value: '10', label: 'Noviembre' },
    { value: '11', label: 'Diciembre' },
  ];

  const years = [
    new Date().getFullYear() - 2,
    new Date().getFullYear() - 1,
    new Date().getFullYear(),
  ];

  return (
    <div className="p-6 space-y-6 bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#4A4A4A]">Rotación & Talento</h1>
          <p className="text-[#4A4A4A]/70 mt-1">Dashboard de análisis de personal</p>
        </div>

        <div className="flex gap-2">
          {/* Botón de registrar movimiento */}
          <Button 
            onClick={() => setRegisterDialogOpen(true)}
            className="bg-[#008C3C] hover:bg-[#006C2F] text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Registrar Movimiento
          </Button>

          {/* Filtros */}
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[120px] border-[#008C3C]/30 focus:ring-[#008C3C]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(year => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[150px] border-[#008C3C]/30 focus:ring-[#008C3C]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map(month => (
                <SelectItem key={month.value} value={month.value}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button 
            onClick={handleFilterChange}
            variant="outline"
            className="border-[#008C3C] text-[#008C3C] hover:bg-[#008C3C] hover:text-white"
          >
            Aplicar Filtros
          </Button>
        </div>
      </div>

      <RegisterMovementDialog
        open={registerDialogOpen}
        onOpenChange={setRegisterDialogOpen}
        onSuccess={() => refreshMetrics()}
      />

      {/* KPIs Principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-[#008C3C] shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-[#4A4A4A]">
              Ingresos
            </CardTitle>
            <UserPlus className="w-5 h-5 text-[#008C3C]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-[#008C3C]">
              {metrics.totalIngresos}
            </div>
            <p className="text-xs text-[#4A4A4A]/60 mt-1">
              Nuevos colaboradores
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-600 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-[#4A4A4A]">
              Retiros
            </CardTitle>
            <UserMinus className="w-5 h-5 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">
              {metrics.totalRetiros}
            </div>
            <p className="text-xs text-[#4A4A4A]/60 mt-1">
              Colaboradores retirados
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#1F8FBF] shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-[#4A4A4A]">
              Headcount
            </CardTitle>
            <Users className="w-5 h-5 text-[#1F8FBF]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-[#1F8FBF]">
              {metrics.headcount}
            </div>
            <p className="text-xs text-[#4A4A4A]/60 mt-1">
              Colaboradores activos
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#7BCB6A] shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-[#4A4A4A]">
              Tiempo Promedio
            </CardTitle>
            <Clock className="w-5 h-5 text-[#7BCB6A]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-[#7BCB6A]">
              {metrics.tiempoPromedioEmpresa}
            </div>
            <p className="text-xs text-[#4A4A4A]/60 mt-1">
              Meses en la empresa
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tasas de Rotación */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[#4A4A4A]">
              % Rotación General
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-[#008C3C]">
                {metrics.rotacionGeneral}%
              </div>
              {metrics.rotacionGeneral > 5 ? (
                <TrendingUp className="w-4 h-4 text-red-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-[#008C3C]" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[#4A4A4A]">
              % Rotación Voluntaria
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {metrics.rotacionVoluntaria}%
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[#4A4A4A]">
              Tasa Voluntaria
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-pink-600">
              {metrics.tasaVoluntaria}%
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[#4A4A4A]">
              Cubrimiento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#1F8FBF]">
              {metrics.cubrimiento}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Ingresos vs Retiros */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-[#4A4A4A]">Comportamiento de Ingresos vs Retiros</CardTitle>
          <CardDescription className="text-[#4A4A4A]/70">
            Comparativa mensual de movimientos de personal
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={metrics.ingresosPorMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="month" stroke="#4A4A4A" />
              <YAxis yAxisId="left" stroke="#4A4A4A" />
              <YAxis yAxisId="right" orientation="right" stroke="#4A4A4A" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#FFFFFF', 
                  border: '1px solid #008C3C',
                  borderRadius: '8px'
                }}
              />
              <Legend />
              <Bar 
                yAxisId="left"
                dataKey="ingresos" 
                fill="#008C3C" 
                name="Ingresos"
                radius={[8, 8, 0, 0]}
              />
              <Bar 
                yAxisId="left"
                dataKey="retiros" 
                fill="#EF4444" 
                name="Retiros"
                radius={[8, 8, 0, 0]}
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="rotacion" 
                stroke="#1F8FBF" 
                name="% Rotación"
                strokeWidth={3}
                dot={{ fill: '#1F8FBF', r: 4 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Gráficos de Comparativas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#4A4A4A]">Voluntario vs Involuntario</CardTitle>
            <CardDescription className="text-[#4A4A4A]/70">
              {metrics.voluntarioVsInvoluntario.voluntario} voluntarios / {metrics.voluntarioVsInvoluntario.involuntario} involuntarios
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={[
                  { name: 'Voluntario', value: metrics.voluntarioVsInvoluntario.voluntario },
                  { name: 'Involuntario', value: metrics.voluntarioVsInvoluntario.involuntario },
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="name" stroke="#4A4A4A" />
                <YAxis stroke="#4A4A4A" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#FFFFFF', 
                    border: '1px solid #008C3C',
                    borderRadius: '8px'
                  }}
                />
                <Bar 
                  dataKey="value" 
                  fill="#008C3C"
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#4A4A4A]">Costos de Retiros</CardTitle>
            <CardDescription className="text-[#4A4A4A]/70">
              Impacto financiero de la rotación
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-red-50 to-red-100/50 rounded-lg border border-red-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white rounded-lg shadow-sm">
                  <DollarSign className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-[#4A4A4A]/70 font-medium">Costo Total Retiros</p>
                  <p className="text-xl font-bold text-red-600">
                    ${metrics.costoRetiros.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-orange-50 to-orange-100/50 rounded-lg border border-orange-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white rounded-lg shadow-sm">
                  <DollarSign className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-[#4A4A4A]/70 font-medium">Fracaso Contratación</p>
                  <p className="text-xl font-bold text-orange-600">
                    {metrics.fracasoContratacion}%
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-[#7BCB6A]/20 to-[#7BCB6A]/10 rounded-lg border border-[#7BCB6A]/30">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white rounded-lg shadow-sm">
                  <UserMinus className="w-6 h-6 text-[#008C3C]" />
                </div>
                <div>
                  <p className="text-sm text-[#4A4A4A]/70 font-medium">Retiros Tempranos</p>
                  <p className="text-xl font-bold text-[#008C3C]">
                    {metrics.retirosTempranos}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};