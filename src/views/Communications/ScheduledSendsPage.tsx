import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { ScheduledSendsPanel } from '@/components/scheduling/ScheduledSendsPanel';
import type { ScheduledKind } from '@/services/scheduledSendService';

const KINDS: Array<[ScheduledKind | 'all', string]> = [
  ['all', 'Todos'], ['email', 'Correos'], ['bulletin', 'Boletines'], ['whatsapp', 'WhatsApp'],
];
const STATUSES: Array<['pending' | 'done' | 'all', string]> = [
  ['pending', 'Pendientes'], ['done', 'Historial'], ['all', 'Todo'],
];

/** Vista única de los envíos programados de Correos, Boletines y WhatsApp. */
export function ScheduledSendsPage() {
  const [kind, setKind] = useState<ScheduledKind | 'all'>('all');
  const [status, setStatus] = useState<'pending' | 'done' | 'all'>('pending');
  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${active ? 'bg-[#008C3C] text-white' : 'text-gray-500 hover:bg-gray-50'}`;

  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-full space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-[#008C3C]/10 flex items-center justify-center"><CalendarClock className="w-6 h-6 text-[#008C3C]" /></div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#4A4A4A]">Envíos programados</h1>
          <p className="text-sm text-gray-500 mt-0.5">Correos, boletines y campañas de WhatsApp que saldrán en una fecha y hora definidas (hora de Colombia).</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 p-2 border-b">
          <div className="flex gap-1 overflow-x-auto">
            {KINDS.map(([value, label]) => <button key={value} onClick={() => setKind(value)} className={chip(kind === value)}>{label}</button>)}
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {STATUSES.map(([value, label]) => <button key={value} onClick={() => setStatus(value)} className={chip(status === value)}>{label}</button>)}
          </div>
        </div>
        <ScheduledSendsPanel kind={kind === 'all' ? undefined : kind} statusFilter={status} />
      </div>
    </div>
  );
}
