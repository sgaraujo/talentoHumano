import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Loader2, Mail, MessageCircle, Newspaper, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  KIND_LABEL, STATUS_LABEL, cancelScheduledSend, dateToBogotaInput, fmtBogota, rescheduleSend,
  scheduleValidationError, watchScheduledSends, type ScheduledKind, type ScheduledSend,
} from '@/services/scheduledSendService';
import { SchedulePicker } from './SchedulePicker';

const KIND_ICON: Record<ScheduledKind, React.ElementType> = { email: Mail, bulletin: Newspaper, whatsapp: MessageCircle };
const isPending = (s: ScheduledSend) => s.status === 'scheduled' || s.status === 'processing';

function resultText(s: ScheduledSend): string | null {
  if (!s.result) return null;
  const parts = [`${s.result.sent} enviado${s.result.sent !== 1 ? 's' : ''}`];
  if (s.result.failed) parts.push(`${s.result.failed} con error`);
  if (s.result.skipped) parts.push(`${s.result.skipped} omitido${s.result.skipped !== 1 ? 's' : ''} (retirados)`);
  return parts.join(' · ');
}

/**
 * Lista común de envíos programados. `kind` la limita a un módulo; `compact`
 * muestra solo los pendientes (y nada si no hay), para el encabezado de cada módulo.
 */
export function ScheduledSendsPanel({ kind, compact = false, statusFilter = 'all' }: {
  kind?: ScheduledKind; compact?: boolean; statusFilter?: 'all' | 'pending' | 'done';
}) {
  const [items, setItems] = useState<ScheduledSend[] | null>(null);
  const [editing, setEditing] = useState<ScheduledSend | null>(null);
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => watchScheduledSends(setItems, e => {
    setItems([]);
    toast.error('No se pudieron cargar los envíos programados', { description: e.message });
  }), []);

  const rows = useMemo(() => (items ?? [])
    .filter(s => !kind || s.kind === kind)
    .filter(s => compact || statusFilter === 'all' ? true : statusFilter === 'pending' ? isPending(s) : !isPending(s))
    .filter(s => !compact || isPending(s))
    // Pendientes primero y en orden de salida; el historial, del más reciente al más antiguo.
    .sort((a, b) => isPending(a) !== isPending(b)
      ? (isPending(a) ? -1 : 1)
      : isPending(a) ? a.runAt.getTime() - b.runAt.getTime() : b.runAt.getTime() - a.runAt.getTime()),
  [items, kind, compact, statusFilter]);

  const cancel = async (s: ScheduledSend) => {
    if (!window.confirm(`¿Cancelar el envío programado "${s.title}"? No se enviará a nadie.`)) return;
    setBusy(s.id);
    try { await cancelScheduledSend(s.id); toast.success('Envío cancelado'); }
    catch (e: any) { toast.error('No se pudo cancelar', { description: e?.message }); }
    finally { setBusy(null); }
  };

  const saveReschedule = async () => {
    if (!editing || scheduleValidationError(editValue)) return;
    setBusy(editing.id);
    try {
      await rescheduleSend(editing.id, editValue);
      toast.success('Fecha actualizada', { description: fmtBogota(new Date(`${editValue}:00-05:00`)) });
      setEditing(null);
    } catch (e: any) { toast.error('No se pudo cambiar la fecha', { description: e?.message }); }
    finally { setBusy(null); }
  };

  if (items === null) {
    return compact ? null : <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#008C3C]" /></div>;
  }
  if (compact && rows.length === 0) return null;

  return (
    <div className={compact ? 'rounded-xl border border-blue-100 bg-blue-50/40' : ''}>
      {compact && (
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <p className="text-sm font-semibold text-blue-800 flex items-center gap-1.5">
            <CalendarClock className="w-4 h-4" />{rows.length} envío{rows.length !== 1 ? 's' : ''} programado{rows.length !== 1 ? 's' : ''}
          </p>
          <Link to="/envios-programados" className="text-xs text-blue-700 hover:underline">Ver todos</Link>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <CalendarClock className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No hay envíos {statusFilter === 'pending' ? 'pendientes' : statusFilter === 'done' ? 'en el historial' : 'programados'}.</p>
          <p className="text-xs mt-1">Al enviar un correo, boletín o campaña de WhatsApp elige <b>Programar</b>.</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map(s => {
            const Icon = KIND_ICON[s.kind];
            const status = STATUS_LABEL[s.status];
            const summary = resultText(s);
            return (
              <li key={s.id} className="flex items-start gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-white border border-gray-100 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-[#008C3C]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate" title={s.title}>{s.title}</p>
                  <p className="text-xs text-gray-500">
                    {KIND_LABEL[s.kind]} · {s.recipientCount} destinatario{s.recipientCount !== 1 ? 's' : ''} · {fmtBogota(s.runAt)}
                  </p>
                  {!compact && <p className="text-[11px] text-gray-400 truncate">Programado por {s.createdByName || s.createdBy}</p>}
                  {summary && <p className="text-[11px] text-gray-600 mt-0.5">{summary}</p>}
                  {s.error && <p className="text-[11px] text-red-600 mt-0.5 break-words">{s.error}</p>}
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${status.className}`}>{status.label}</span>
                  {s.status === 'scheduled' && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy === s.id}
                        onClick={() => { setEditing(s); setEditValue(dateToBogotaInput(s.runAt)); }}>
                        <Pencil className="w-3 h-3 mr-1" />Fecha
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50" disabled={busy === s.id}
                        onClick={() => cancel(s)}>
                        {busy === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3 mr-1" />}Cancelar
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!editing} onOpenChange={open => { if (!open && !busy) setEditing(null); }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base"><CalendarClock className="w-4 h-4 text-[#008C3C]" />Cambiar fecha de envío</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 truncate" title={editing?.title}>{editing?.title}</p>
          <SchedulePicker mode="schedule" onModeChange={() => {}} value={editValue} onChange={setEditValue} onlyDate />
          <p className="text-[11px] text-gray-500">Para cambiar el contenido o los destinatarios, cancela este envío y prográmalo de nuevo.</p>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setEditing(null)} disabled={!!busy}>Cerrar</Button>
            <Button className="flex-1 bg-[#008C3C] hover:bg-[#006C2F] text-white" onClick={saveReschedule}
              disabled={!!busy || !!scheduleValidationError(editValue)}>
              {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
