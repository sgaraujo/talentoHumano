import { CalendarClock, Send } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { bogotaInputToDate, dateToBogotaInput, fmtBogota, scheduleValidationError } from '@/services/scheduledSendService';

export type SendMode = 'now' | 'schedule';

/** Hora sugerida al activar "Programar": mañana a las 8:00 a. m. (Colombia). */
export const defaultScheduleInput = () => {
  const tomorrow = dateToBogotaInput(new Date(Date.now() + 86_400_000)).slice(0, 10);
  return `${tomorrow}T08:00`;
};

/**
 * Selector común de Correos, Boletines y WhatsApp: enviar de inmediato o
 * programar fecha y hora (siempre hora de Colombia).
 */
export function SchedulePicker({ mode, onModeChange, value, onChange, onlyDate = false }: {
  mode: SendMode;
  onModeChange: (mode: SendMode) => void;
  value: string;
  onChange: (value: string) => void;
  /** Solo la fecha, sin "Enviar ahora" (p. ej. al cambiar la fecha de un envío ya programado). */
  onlyDate?: boolean;
}) {
  const error = mode === 'schedule' ? scheduleValidationError(value) : null;
  const option = (target: SendMode, Icon: React.ElementType, label: string) => (
    <button
      type="button"
      onClick={() => { onModeChange(target); if (target === 'schedule' && !value) onChange(defaultScheduleInput()); }}
      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors
        ${mode === target ? 'bg-[#008C3C] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
    >
      <Icon className="w-3.5 h-3.5" />{label}
    </button>
  );

  return (
    <div className="space-y-2">
      {!onlyDate && (
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {option('now', Send, 'Enviar ahora')}
          {option('schedule', CalendarClock, 'Programar')}
        </div>
      )}
      {mode === 'schedule' && (
        <div className="space-y-1">
          <Input
            type="datetime-local"
            value={value}
            min={dateToBogotaInput(new Date(Date.now() + 5 * 60_000))}
            onChange={e => onChange(e.target.value)}
            className="text-sm"
          />
          {error
            ? <p className="text-[11px] text-red-600">{error}</p>
            : <p className="text-[11px] text-gray-500">
                Se enviará el <b>{fmtBogota(bogotaInputToDate(value))}</b> (hora de Colombia). Puede salir hasta 5 minutos después.
              </p>}
        </div>
      )}
    </div>
  );
}
