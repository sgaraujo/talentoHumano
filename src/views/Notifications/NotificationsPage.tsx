import { useState, useMemo } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Loader2, Search, Cake, Award, Clock, FileText, Download, Building2, CalendarDays,
} from 'lucide-react';
import { MonthCalendar } from '@/components/notifications/MonthCalendar';
import type { NotificationType } from '@/models/types/Notification';

// ── constants ─────────────────────────────────────────────────────────────────

const EVENT_TYPES = {
  birthday:         { label: 'Cumpleaños',          icon: Cake,     color: 'bg-pink-100 text-pink-800 border-pink-200' },
  work_anniversary: { label: 'Aniversarios',         icon: Award,    color: 'bg-blue-100 text-blue-800 border-blue-200' },
  probation_end:    { label: 'Periodo de Prueba',    icon: Clock,    color: 'bg-orange-100 text-orange-800 border-orange-200' },
  contract_start:   { label: 'Inicio de Contrato',  icon: FileText, color: 'bg-green-100 text-green-800 border-green-200' },
  contract_end:     { label: 'Fin de Contrato',      icon: FileText, color: 'bg-red-100 text-red-800 border-red-200' },
} as const;

const PERIODS = [
  { value: '30',  label: 'Próximos 30 días' },
  { value: '60',  label: 'Próximos 60 días' },
  { value: '90',  label: 'Próximos 90 días' },
  { value: '180', label: 'Próximos 6 meses' },
  { value: '365', label: 'Próximo año' },
];

const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

/** Generate month options: 3 past + current + 11 future */
function buildMonthOptions() {
  const today = new Date();
  const options: { value: string; label: string }[] = [
    { value: 'all', label: 'Todos los meses' },
  ];
  for (let offset = -3; offset <= 11; offset++) {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    options.push({ value, label });
  }
  return options;
}
const MONTH_OPTIONS = buildMonthOptions();

const TYPE_LABELS: Record<NotificationType, string> = {
  birthday:         'Cumpleaños',
  work_anniversary: 'Aniversario laboral',
  probation_end:    'Fin de periodo de prueba',
  contract_start:   'Inicio de contrato',
  contract_end:     'Fin de contrato',
};

// ── component ─────────────────────────────────────────────────────────────────

export const NotificationsPage = () => {
  const { events, loading, applyFilters } = useNotifications();

  const [search,        setSearch]        = useState('');
  const [typeFilter,    setTypeFilter]    = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [period,        setPeriod]        = useState('365');
  const [monthFilter,   setMonthFilter]   = useState('all');
  const [exporting,     setExporting]     = useState(false);

  // Unique companies from events
  const companies = useMemo(() => {
    const set = new Set(events.map(e => e.company).filter(Boolean));
    return [...set].sort() as string[];
  }, [events]);

  // Apply type + period filter via service
  const handleTypeChange = (value: string) => {
    setTypeFilter(value);
    const types = value === 'all' ? [] : [value as NotificationType];
    applyFilters(types, Number(period));
  };

  const handlePeriodChange = (value: string) => {
    setPeriod(value);
    const types = typeFilter === 'all' ? [] : [typeFilter as NotificationType];
    applyFilters(types, Number(value));
  };

  // Client-side filters (search + company + month)
  const filtered = useMemo(() => {
    return events.filter(e => {
      if (companyFilter !== 'all' && e.company !== companyFilter) return false;
      if (search && !e.userName.toLowerCase().includes(search.toLowerCase())) return false;
      if (monthFilter !== 'all') {
        const [y, m] = monthFilter.split('-').map(Number);
        if (e.date.getFullYear() !== y || e.date.getMonth() + 1 !== m) return false;
      }
      return true;
    });
  }, [events, companyFilter, search, monthFilter]);

  const getDaysLabel = (days: number) => {
    if (days < 0)  return `Hace ${Math.abs(days)} día(s)`;
    if (days === 0) return 'Hoy';
    if (days === 1) return 'Mañana';
    return `En ${days} día(s)`;
  };

  // ── Excel export ────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const XLSX = await import('xlsx');

      const rows = filtered.map(e => ({
        'Nombre':          e.userName,
        'Tipo de evento':  TYPE_LABELS[e.type] ?? e.type,
        'Fecha':           e.date.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        'Días restantes':  e.daysUntil < 0 ? `Hace ${Math.abs(e.daysUntil)} día(s)` : e.daysUntil === 0 ? 'Hoy' : `En ${e.daysUntil} día(s)`,
        'Empresa':         e.company  || '—',
        'Proyecto':        e.project  || '—',
        'Cargo':           e.position || '—',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);

      // Column widths
      ws['!cols'] = [
        { wch: 30 }, { wch: 25 }, { wch: 14 },
        { wch: 18 }, { wch: 30 }, { wch: 25 }, { wch: 20 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Notificaciones');

      const monthLabel  = MONTH_OPTIONS.find(o => o.value === monthFilter)?.label ?? '';
      const typeLabel   = typeFilter === 'all' ? 'Todos' : TYPE_LABELS[typeFilter as NotificationType];
      const baseName    = monthFilter !== 'all'
        ? `Notificaciones_${typeLabel}_${monthLabel}`
        : `Notificaciones_${typeLabel}_${PERIODS.find(p => p.value === period)?.label ?? ''}`;
      const fileName    = `${baseName}.xlsx`
        .replace(/\s+/g, '_').replace(/[áéíóú]/gi, c => ({ á:'a',é:'e',í:'i',ó:'o',ú:'u' }[c] ?? c));

      XLSX.writeFile(wb, fileName);
    } finally {
      setExporting(false);
    }
  };

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-screen">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#4A4A4A]">Notificaciones</h1>
          <p className="text-sm text-gray-500 mt-0.5">Eventos importantes de tu equipo</p>
        </div>
        <Button
          onClick={handleExport}
          disabled={exporting || filtered.length === 0}
          className="bg-[#008C3C] hover:bg-[#006C2F] text-white"
        >
          {exporting
            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            : <Download className="w-4 h-4 mr-2" />}
          Exportar Excel ({filtered.length})
        </Button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">

          {/* Buscar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Buscar persona..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 border-gray-200"
            />
          </div>

          {/* Tipo */}
          <Select value={typeFilter} onValueChange={handleTypeChange}>
            <SelectTrigger className="border-gray-200">
              <SelectValue placeholder="Tipo de evento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los eventos</SelectItem>
              {(Object.entries(EVENT_TYPES) as [NotificationType, typeof EVENT_TYPES[NotificationType]][]).map(([type, cfg]) => {
                const Icon = cfg.icon;
                return (
                  <SelectItem key={type} value={type}>
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" /> {cfg.label}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {/* Empresa */}
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="border-gray-200">
              <SelectValue placeholder="Todas las empresas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" /> Todas las empresas
                </div>
              </SelectItem>
              {companies.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Mes */}
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="border-gray-200">
              <CalendarDays className="w-4 h-4 mr-2 text-gray-400 inline" />
              <SelectValue placeholder="Todos los meses" />
            </SelectTrigger>
            <SelectContent>
              {MONTH_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Período */}
          <Select value={period} onValueChange={handlePeriodChange}>
            <SelectTrigger className="border-gray-200">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map(p => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Indicador mes activo */}
        {monthFilter !== 'all' && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs bg-[#008C3C]/10 text-[#008C3C] font-medium px-2.5 py-1 rounded-full flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              Filtrando: {MONTH_OPTIONS.find(o => o.value === monthFilter)?.label}
            </span>
            <button
              onClick={() => setMonthFilter('all')}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Quitar filtro de mes
            </button>
          </div>
        )}
      </div>

      {/* Conteo */}
      <p className="text-sm text-gray-500 mb-4">
        {filtered.length} evento{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
        {filtered.length !== events.length && ` de ${events.length} totales`}
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Calendario */}
          <div className="lg:col-span-2">
            <MonthCalendar events={filtered} />
          </div>

          {/* Lista */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h2 className="font-semibold text-[#4A4A4A]">Próximos eventos</h2>
              <p className="text-xs text-gray-400 mt-0.5">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</p>
            </div>

            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 italic text-center py-12">Sin eventos con los filtros actuales</p>
            ) : (
              <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
                {filtered.map(event => {
                  const cfg  = EVENT_TYPES[event.type];
                  const Icon = cfg.icon;
                  return (
                    <div key={event.id} className={`p-3 ${cfg.color}`}>
                      <div className="flex items-start gap-3">
                        <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{event.userName}</p>
                          {event.company && (
                            <p className="text-xs opacity-70 truncate">{event.company}</p>
                          )}
                          <p className="text-xs opacity-75 mt-0.5">
                            {event.date.toLocaleDateString('es-CO', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </p>
                          <Badge
                            variant={event.daysUntil < 0 ? 'destructive' : event.daysUntil === 0 ? 'default' : 'secondary'}
                            className="mt-1 text-[10px]"
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
          </div>
        </div>
      )}
    </div>
  );
};
