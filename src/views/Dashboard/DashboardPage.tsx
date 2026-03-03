import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, FileText, Loader2,
  TrendingDown, TrendingUp, Building2,
  UserCheck, UserX, UserPlus,
} from 'lucide-react';
import { userService } from '@/services/userService';
import { questionnaireService } from '@/services/questionnaireService';
import { analyticsService } from '@/services/analyticsService';
import { companyService } from '@/services/companyService';

interface StatCardProps {
  label: string;
  value: number;
  sub: string;
  icon: React.ReactNode;
  borderColor: string;
  onClick?: () => void;
}

function StatCard({ label, value, sub, icon, borderColor, onClick }: StatCardProps) {
  return (
    <div
      onClick={onClick}
      style={{ borderLeftColor: borderColor }}
      className="bg-white rounded-xl border border-gray-100 border-l-4 p-4 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer hover:-translate-y-px"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
      </div>
      <p className="text-3xl font-bold text-[#4A4A4A]">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  );
}

export const DashboardPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userStats, setUserStats] = useState({ total: 0, colaborador: 0, aspirante: 0, excolaborador: 0 });
  const [qStats, setQStats] = useState({ total: 0, active: 0 });
  const [companiesCount, setCompaniesCount] = useState(0);
  const [movStats, setMovStats] = useState({ retirosMes: 0, ingresosMes: 0 });

  useEffect(() => {
    const load = async () => {
      try {
        const now = new Date();
        const curMonth = now.getMonth();
        const curYear = now.getFullYear();

        const [userData, qData, companies, movements] = await Promise.all([
          userService.getStats(),
          questionnaireService.getStats(),
          companyService.getAll(),
          analyticsService.getMovements(),
        ]);

        setUserStats({
          total: userData.total,
          colaborador: userData.colaboradores,
          aspirante: userData.aspirantes,
          excolaborador: userData.excolaboradores,
        });

        setQStats({ total: qData.total, active: qData.active });
        setCompaniesCount(companies.length);

        const retirosMes = movements.filter(mov => {
          const d = mov.date instanceof Date ? mov.date : new Date(mov.date);
          return mov.type === 'retiro' && d.getMonth() === curMonth && d.getFullYear() === curYear;
        }).length;

        const ingresosMes = movements.filter(mov => {
          const d = mov.date instanceof Date ? mov.date : new Date(mov.date);
          return mov.type === 'ingreso' && d.getMonth() === curMonth && d.getFullYear() === curYear;
        }).length;

        setMovStats({ retirosMes, ingresosMes });
      } catch (err) {
        console.error('Error cargando dashboard:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" />
      </div>
    );
  }

  const now = new Date();
  const monthLabel = now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-[#4A4A4A]">Dashboard</h1>
          <span className="px-2.5 py-0.5 rounded-full bg-[#008C3C]/10 text-[#008C3C] text-xs font-semibold capitalize">
            {monthLabel}
          </span>
        </div>
        <p className="text-sm text-gray-500">Resumen general del sistema de gestión de talento humano</p>
      </div>

      {/* User stats */}
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Usuarios</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Usuarios"
          value={userStats.total}
          sub="En el sistema"
          icon={<Users className="w-4 h-4 text-[#4A4A4A]" />}
          borderColor="#4A4A4A"
          onClick={() => navigate('/usuarios')}
        />
        <StatCard
          label="Colaboradores"
          value={userStats.colaborador}
          sub="Activos"
          icon={<UserCheck className="w-4 h-4 text-[#1F8FBF]" />}
          borderColor="#1F8FBF"
          onClick={() => navigate('/usuarios')}
        />
        <StatCard
          label="Aspirantes"
          value={userStats.aspirante}
          sub="En proceso"
          icon={<UserPlus className="w-4 h-4 text-[#008C3C]" />}
          borderColor="#008C3C"
          onClick={() => navigate('/usuarios')}
        />
        <StatCard
          label="Ex-colaboradores"
          value={userStats.excolaborador}
          sub="Retirados"
          icon={<UserX className="w-4 h-4 text-orange-500" />}
          borderColor="#F97316"
          onClick={() => navigate('/usuarios')}
        />
      </div>

      {/* Activity */}
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Actividad del mes</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Cuestionarios activos"
          value={qStats.active}
          sub={`${qStats.total} en total`}
          icon={<FileText className="w-4 h-4 text-purple-500" />}
          borderColor="#8B5CF6"
          onClick={() => navigate('/questionarios')}
        />
        <StatCard
          label="Empresas"
          value={companiesCount}
          sub="Registradas"
          icon={<Building2 className="w-4 h-4 text-[#1F8FBF]" />}
          borderColor="#1F8FBF"
          onClick={() => navigate('/empresas')}
        />
        <StatCard
          label="Retiros del mes"
          value={movStats.retirosMes}
          sub="Este mes"
          icon={<TrendingDown className="w-4 h-4 text-red-500" />}
          borderColor="#EF4444"
          onClick={() => navigate('/rotacion-talento')}
        />
        <StatCard
          label="Ingresos del mes"
          value={movStats.ingresosMes}
          sub="Este mes"
          icon={<TrendingUp className="w-4 h-4 text-[#008C3C]" />}
          borderColor="#008C3C"
          onClick={() => navigate('/rotacion-talento')}
        />
      </div>
    </div>
  );
};
