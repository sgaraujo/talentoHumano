import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, FileText, BarChart3, Loader2 } from 'lucide-react';
import { userService } from '@/services/userService';

export const DashboardPage = () => {
  const [stats, setStats] = useState({
    total: 0,
    colaborador: 0,
    aspirante: 0,
    excolaborador: 0,
    descartado: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const data = await userService.getStats();
      setStats({
        total: data.total,
        colaborador: data.colaboradores,
        aspirante: data.aspirantes,
        excolaborador: data.excolaboradores,
        descartado: data.descartados,
      });
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-gray-600 mt-1">Bienvenido al Sistema de Gestión de Talento Humano</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Total Usuarios</CardDescription>
            <Users className="w-4 h-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">{stats.total}</p>
            <p className="text-xs text-gray-500 mt-1">En el sistema</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Colaboradores</CardDescription>
            <Users className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold text-blue-600">{stats.colaborador}</p>
            <p className="text-xs text-gray-500 mt-1">Activos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Aspirantes</CardDescription>
            <Users className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold text-green-600">{stats.aspirante}</p>
            <p className="text-xs text-gray-500 mt-1">En proceso</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Ex-colaboradores</CardDescription>
            <Users className="w-4 h-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold text-orange-600">{stats.excolaborador}</p>
            <p className="text-xs text-gray-500 mt-1">Retirados</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Cuestionarios
            </CardTitle>
            <CardDescription>Gestión de encuestas</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">0</p>
            <p className="text-sm text-gray-500 mt-2">Cuestionarios activos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Respuestas
            </CardTitle>
            <CardDescription>Completadas</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">0</p>
            <p className="text-sm text-gray-500 mt-2">Respuestas recibidas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Reportes
            </CardTitle>
            <CardDescription>Análisis y métricas</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">0</p>
            <p className="text-sm text-gray-500 mt-2">Generados este mes</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};