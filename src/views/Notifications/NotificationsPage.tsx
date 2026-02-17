import { useState } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Search, Cake, Award, Clock, FileText} from 'lucide-react';
import { MonthCalendar } from '@/components/notifications/MonthCalendar';
import type { NotificationType } from '@/models/types/Notification';

const EVENT_TYPES = {
  birthday: {
    label: 'Cumpleaños',
    icon: Cake,
    color: 'bg-pink-100 text-pink-800 border-pink-200',
  },
  work_anniversary: {
    label: 'Aniversarios',
    icon: Award,
    color: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  probation_end: {
    label: 'Periodo de Prueba',
    icon: Clock,
    color: 'bg-orange-100 text-orange-800 border-orange-200',
  },
  contract_start: {
    label: 'Inicio de Contrato',
    icon: FileText,
    color: 'bg-green-100 text-green-800 border-green-200',
  },
  contract_end: {
    label: 'Fin de Contrato',
    icon: FileText,
    color: 'bg-red-100 text-red-800 border-red-200',
  },
};

export const NotificationsPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const { events, loading, applyFilters } = useNotifications();

  const handleFilterChange = (value: string) => {
    setSelectedFilter(value);
    if (value === 'all') {
      applyFilters([]);
    } else {
      applyFilters([value as NotificationType]);
    }
  };

  const getDaysLabel = (days: number) => {
    if (days < 0) return `Hace ${Math.abs(days)} día(s)`;
    if (days === 0) return 'Hoy';
    if (days === 1) return 'Mañana';
    return `En ${days} día(s)`;
  };

  const filteredEvents = events.filter(event =>
    event.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Notificaciones</h1>
        <p className="text-gray-600 mt-1">Eventos importantes de tu equipo</p>
      </div>


      {/* Filtro Dropdown */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Filtro de Calendario</CardTitle>
              <CardDescription>Selecciona el tipo de evento que deseas visualizar</CardDescription>
            </div>
            <Select value={selectedFilter} onValueChange={handleFilterChange}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Selecciona un tipo de evento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los eventos</SelectItem>
                {(Object.entries(EVENT_TYPES) as [NotificationType, typeof EVENT_TYPES[NotificationType]][]).map(([type, config]) => {
                  const Icon = config.icon;
                  return (
                    <SelectItem key={type} value={type}>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        {config.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendario */}
          <div className="lg:col-span-2">
            <MonthCalendar events={events} />
          </div>

          {/* Lista de eventos próximos */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Próximos Eventos</CardTitle>
                <CardDescription>
                  {filteredEvents.length} evento(s)
                </CardDescription>
                <div className="relative mt-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Buscar..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </CardHeader>
              <CardContent>
                {filteredEvents.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">
                    No hay eventos próximos
                  </p>
                ) : (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto">
                    {filteredEvents.map((event) => {
                      const config = EVENT_TYPES[event.type];
                      const Icon = config.icon;
                      
                      return (
                        <div
                          key={event.id}
                          className={`p-3 rounded-lg border ${config.color}`}
                        >
                          <div className="flex items-start gap-3">
                            <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">
                                {event.userName}
                              </p>
                              <p className="text-xs opacity-75 mt-0.5">
                                {event.date.toLocaleDateString('es-CO', {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </p>
                              <Badge
                                variant={event.daysUntil < 0 ? 'destructive' : event.daysUntil === 0 ? 'default' : 'secondary'}
                                className="mt-2"
                              >
                                {getDaysLabel(event.daysUntil)}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};