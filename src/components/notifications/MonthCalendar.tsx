import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { notificationService } from '@/services/notificationService';
import type { NotificationEvent } from '@/models/types/Notification';

interface MonthCalendarProps {
  events?: NotificationEvent[]; // eventos externos (para highlight en la lista lateral)
}

const DAYS   = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

const TYPE_COLOR: Record<string, string> = {
  birthday:         'bg-pink-100 text-pink-700',
  work_anniversary: 'bg-blue-100 text-blue-700',
  probation_end:    'bg-orange-100 text-orange-700',
  contract_start:   'bg-green-100 text-green-700',
  contract_end:     'bg-red-100 text-red-700',
};

export const MonthCalendar = (_props: MonthCalendarProps) => {
  const today = new Date();
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [calEvents,   setCalEvents]   = useState<NotificationEvent[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [selected,    setSelected]    = useState<NotificationEvent[] | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Load events whenever visible month changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelected(null);
    setSelectedDay(null);
    notificationService.getEventsForMonth(year, month)
      .then(evs => { if (!cancelled) setCalEvents(evs); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year, month]);

  // Build calendar grid
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth    = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const getEventsForDay = (day: number) =>
    calEvents.filter(e => e.date.getDate() === day);

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const handleDayClick = (day: number) => {
    const evs = getEventsForDay(day);
    if (evs.length === 0) { setSelected(null); setSelectedDay(null); return; }
    setSelected(evs);
    setSelectedDay(day);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-[#4A4A4A]">
          {MONTHS[month]} {year}
        </h2>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          <Button variant="outline" size="sm"
            onClick={() => setCurrentDate(new Date(year, month - 1, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm"
            onClick={() => setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1))}>
            Hoy
          </Button>
          <Button variant="outline" size="sm"
            onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="p-3">
        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAYS.map(d => (
            <div key={d} className="text-center text-[11px] font-semibold text-gray-400 py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((day, i) => {
            if (!day) return <div key={`e-${i}`} className="aspect-square" />;
            const dayEvs   = getEventsForDay(day);
            const todayDay = isToday(day);
            const isSelected = selectedDay === day;

            return (
              <div
                key={day}
                onClick={() => handleDayClick(day)}
                className={`
                  aspect-square rounded-lg p-1 cursor-pointer transition-colors select-none
                  ${todayDay   ? 'ring-2 ring-[#008C3C] bg-[#008C3C]/5' : ''}
                  ${isSelected ? 'bg-[#008C3C]/10' : 'hover:bg-gray-50'}
                  ${dayEvs.length > 0 ? 'border border-gray-100' : ''}
                `}
              >
                <p className={`text-xs font-medium leading-none mb-0.5 ${todayDay ? 'text-[#008C3C]' : 'text-gray-600'}`}>
                  {day}
                </p>
                <div className="space-y-0.5">
                  {dayEvs.slice(0, 2).map(ev => (
                    <div
                      key={ev.id}
                      className={`text-[9px] px-1 py-0.5 rounded truncate leading-tight font-medium ${TYPE_COLOR[ev.type] || 'bg-gray-100 text-gray-600'}`}
                    >
                      {ev.userName.split(' ')[0]}
                    </div>
                  ))}
                  {dayEvs.length > 2 && (
                    <p className="text-[9px] text-gray-400 pl-0.5">+{dayEvs.length - 2}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Day detail panel */}
      {selected && selectedDay && (
        <div className="border-t border-gray-100 px-4 py-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            {selectedDay} de {MONTHS[month]}
          </p>
          <div className="space-y-1.5">
            {selected.map(ev => (
              <div key={ev.id} className={`flex items-start gap-2 px-3 py-2 rounded-lg ${TYPE_COLOR[ev.type] || ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{ev.userName}</p>
                  <p className="text-xs opacity-75 truncate">{ev.title.replace(/^[^\s]+ /, '')}</p>
                  {ev.company && <p className="text-xs opacity-60 truncate">{ev.company}</p>}
                </div>
                <span className="text-[10px] opacity-70 whitespace-nowrap">
                  {ev.daysUntil === 0 ? 'Hoy' : ev.daysUntil > 0 ? `En ${ev.daysUntil}d` : `Hace ${Math.abs(ev.daysUntil)}d`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-t border-gray-100 bg-gray-50">
        {[
          { color: 'bg-pink-100 text-pink-700',   label: 'Cumpleaños' },
          { color: 'bg-blue-100 text-blue-700',   label: 'Aniversario' },
          { color: 'bg-orange-100 text-orange-700', label: 'Fin prueba' },
          { color: 'bg-green-100 text-green-700', label: 'Inicio contrato' },
          { color: 'bg-red-100 text-red-700',     label: 'Fin contrato' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1">
            <div className={`w-2.5 h-2.5 rounded-sm ${l.color.split(' ')[0]}`} />
            <span className="text-[10px] text-gray-500">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
