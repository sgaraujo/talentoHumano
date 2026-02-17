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
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
  <div>
    <h1 className="text-3xl font-bold">Rotación & Talento</h1>
    <p className="text-gray-600 mt-1">Dashboard de análisis de personal</p>
  </div>

  <div className="flex gap-2">
    {/* Botón de registrar movimiento */}
    <Button onClick={() => setRegisterDialogOpen(true)}>
      <Plus className="w-4 h-4 mr-2" />
      Registrar Movimiento
    </Button>

    {/* Filtros */}
    <Select value={selectedYear} onValueChange={setSelectedYear}>
      <SelectTrigger className="w-[120px]">
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
      <SelectTrigger className="w-[150px]">
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

    <Button onClick={handleFilterChange}>
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Ingresos
            </CardTitle>
            <UserPlus className="w-5 h-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {metrics.totalIngresos}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Nuevos colaboradores
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Retiros
            </CardTitle>
            <UserMinus className="w-5 h-5 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">
              {metrics.totalRetiros}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Colaboradores retirados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Headcount
            </CardTitle>
            <Users className="w-5 h-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {metrics.headcount}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Colaboradores activos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Tiempo Promedio
            </CardTitle>
            <Clock className="w-5 h-5 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">
              {metrics.tiempoPromedioEmpresa}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Meses en la empresa
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tasas de Rotación */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              % Rotación General
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-yellow-600">
                {metrics.rotacionGeneral}%
              </div>
              {metrics.rotacionGeneral > 5 ? (
                <TrendingUp className="w-4 h-4 text-red-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-green-500" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              % Rotación Voluntaria
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {metrics.rotacionVoluntaria}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Tasa Voluntaria
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-pink-600">
              {metrics.tasaVoluntaria}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Cubrimiento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-teal-600">
              {metrics.cubrimiento}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Ingresos vs Retiros */}
      <Card>
        <CardHeader>
          <CardTitle>Comportamiento de Ingresos vs Retiros</CardTitle>
          <CardDescription>
            Comparativa mensual de movimientos de personal
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={metrics.ingresosPorMes}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Bar 
                yAxisId="left"
                dataKey="ingresos" 
                fill="#8B5CF6" 
                name="Ingresos" 
              />
              <Bar 
                yAxisId="left"
                dataKey="retiros" 
                fill="#EF4444" 
                name="Retiros" 
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="rotacion" 
                stroke="#F59E0B" 
                name="% Rotación"
                strokeWidth={2}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Gráficos de Comparativas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Voluntario vs Involuntario</CardTitle>
            <CardDescription>
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
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#8B5CF6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Costos de Retiros</CardTitle>
            <CardDescription>
              Impacto financiero de la rotación
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <DollarSign className="w-8 h-8 text-red-600" />
                <div>
                  <p className="text-sm text-gray-600">Costo Total Retiros</p>
                  <p className="text-xl font-bold">
                    ${metrics.costoRetiros.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <DollarSign className="w-8 h-8 text-orange-600" />
                <div>
                  <p className="text-sm text-gray-600">Fracaso Contratación</p>
                  <p className="text-xl font-bold">
                    {metrics.fracasoContratacion}%
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <UserMinus className="w-8 h-8 text-yellow-600" />
                <div>
                  <p className="text-sm text-gray-600">Retiros Tempranos</p>
                  <p className="text-xl font-bold">
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