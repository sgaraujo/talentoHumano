import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import { FIRESTORE_COLLECTIONS } from '@/config/firestoreCollections';

// Cola única de envíos programados (Correos, Boletines, WhatsApp). La escriben
// solo las Cloud Functions de functions/src/scheduling/scheduledSends.ts.

export type ScheduledKind = 'email' | 'bulletin' | 'whatsapp';
export type ScheduledStatus = 'scheduled' | 'processing' | 'sent' | 'partial' | 'failed' | 'cancelled';

export interface ScheduledSend {
  id: string;
  kind: ScheduledKind;
  title: string;
  runAt: Date;
  status: ScheduledStatus;
  recipientCount: number;
  createdBy: string;
  createdByName?: string;
  createdAt: Date | null;
  completedAt: Date | null;
  result?: { sent: number; failed: number; skipped: number; refId?: string; error?: string };
  error?: string;
}

export const KIND_LABEL: Record<ScheduledKind, string> = {
  email: 'Correo', bulletin: 'Boletín', whatsapp: 'WhatsApp',
};

export const STATUS_LABEL: Record<ScheduledStatus, { label: string; className: string }> = {
  scheduled:  { label: 'Programado',  className: 'bg-blue-100 text-blue-700' },
  processing: { label: 'Enviando…',   className: 'bg-amber-100 text-amber-700' },
  sent:       { label: 'Enviado',     className: 'bg-green-100 text-green-700' },
  partial:    { label: 'Con errores', className: 'bg-orange-100 text-orange-700' },
  failed:     { label: 'Falló',       className: 'bg-red-100 text-red-700' },
  cancelled:  { label: 'Cancelado',   className: 'bg-gray-100 text-gray-500' },
};

// ── Hora de Colombia ───────────────────────────────────────────────────────
// Bogotá es UTC-5 todo el año (sin horario de verano), así que la hora elegida
// se interpreta siempre en Colombia, sin importar la zona del navegador.

/** "2026-10-25T08:00" (input datetime-local) → instante en hora de Colombia. */
export const bogotaInputToDate = (value: string): Date => new Date(`${value}:00-05:00`);

/** Instante → "2026-10-25T08:00" en hora de Colombia, para un input datetime-local. */
export const dateToBogotaInput = (date: Date): string =>
  new Date(date.getTime() - 5 * 3_600_000).toISOString().slice(0, 16);

export const fmtBogota = (date: Date | null | undefined): string => date
  ? date.toLocaleString('es-CO', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota',
    })
  : '—';

/** Mensaje de error si la fecha no sirve para programar; null si es válida. */
export function scheduleValidationError(value: string): string | null {
  if (!value) return 'Elige la fecha y hora del envío.';
  const date = bogotaInputToDate(value);
  if (Number.isNaN(date.getTime())) return 'Fecha inválida.';
  if (date.getTime() - Date.now() < 2 * 60_000) return 'Elige una hora al menos 2 minutos en el futuro.';
  if (date.getTime() - Date.now() > 120 * 86_400_000) return 'Solo se puede programar hasta 4 meses adelante.';
  return null;
}

// ── Operaciones ────────────────────────────────────────────────────────────

export async function scheduleSend(kind: ScheduledKind, runAtInput: string, title: string, payload: unknown): Promise<string> {
  const call = httpsCallable<{ kind: ScheduledKind; runAt: string; title: string; payload: unknown }, { id: string }>(functions, 'scheduleSend');
  const result = await call({ kind, runAt: bogotaInputToDate(runAtInput).toISOString(), title, payload });
  return result.data.id;
}

export async function rescheduleSend(id: string, runAtInput: string): Promise<void> {
  const call = httpsCallable(functions, 'updateScheduledSend');
  await call({ id, action: 'reschedule', runAt: bogotaInputToDate(runAtInput).toISOString() });
}

export async function cancelScheduledSend(id: string): Promise<void> {
  const call = httpsCallable(functions, 'updateScheduledSend');
  await call({ id, action: 'cancel' });
}

const toDate = (value: any): Date | null => value?.toDate?.() ?? null;

/** Últimos envíos programados en vivo (los estados cambian solos al enviarse). */
export function watchScheduledSends(onChange: (items: ScheduledSend[]) => void, onError?: (e: Error) => void) {
  const q = query(collection(db, FIRESTORE_COLLECTIONS.scheduledSends), orderBy('runAt', 'desc'), limit(150));
  return onSnapshot(q, snap => {
    onChange(snap.docs.map(d => {
      const data = d.data() as any;
      return {
        id: d.id, kind: data.kind, title: data.title, status: data.status,
        recipientCount: data.recipientCount ?? 0, createdBy: data.createdBy, createdByName: data.createdByName,
        runAt: toDate(data.runAt) ?? new Date(0), createdAt: toDate(data.createdAt), completedAt: toDate(data.completedAt),
        result: data.result, error: data.error,
      } as ScheduledSend;
    }));
  }, error => onError?.(error));
}
