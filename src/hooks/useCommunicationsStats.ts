import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { FIRESTORE_COLLECTIONS } from '@/config/firestoreCollections';

const toDate = (v: any): Date | null => {
  if (!v) return null;
  if (v?.toDate) return v.toDate();
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

/** División segura — nunca NaN/Infinity, siempre 0-100 redondeado a 1 decimal. */
export function rate(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export interface CommsCampaignRow {
  id: string; title: string; status: string; targetType: string; targetName: string;
  requiresAck: boolean; senderKey: string;
  sentAt: Date | null;
  total: number; sent: number; failed: number; pending: number;
  opened: number; clicked: number; acked: number; quizSubmitted: number;
  deliveryRate: number; openRate: number; clickRate: number; ackRate: number;
}

export interface CommsRecipientRow {
  id: string; communicationId: string; communicationTitle: string;
  userId: string; userName: string; userEmail: string; company: string; project: string;
  sentAt: Date | null; emailStatus: string; emailError?: string;
  status: string; readAt: Date | null; ctaClickedAt: Date | null; ackAt: Date | null; quizSubmittedAt: Date | null;
  finalStatus: 'failed' | 'sent_no_open' | 'opened_no_click' | 'clicked' | 'acked';
}

export interface CommsTimelinePoint { date: string; sent: number; opened: number; clicked: number }

export interface CommsGlobalStats {
  totalCampaigns: number; totalRecipients: number;
  sent: number; failed: number; opened: number; clicked: number; acked: number;
  deliveryRate: number; openRate: number; clickRate: number; ackRate: number;
}

const finalStatusOf = (r: { emailStatus: string; readAt: Date | null; ctaClickedAt: Date | null; ackAt: Date | null }): CommsRecipientRow['finalStatus'] => {
  if (r.emailStatus === 'failed') return 'failed';
  if (r.ackAt) return 'acked';
  if (r.ctaClickedAt) return 'clicked';
  if (r.readAt) return 'opened_no_click';
  return 'sent_no_open';
};

export function useCommunicationsStats() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [campaigns, setCampaigns] = useState<CommsCampaignRow[]>([]);
  const [recipients, setRecipients] = useState<CommsRecipientRow[]>([]);
  const [timeline, setTimeline] = useState<CommsTimelinePoint[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [commsSnap, recsSnap] = await Promise.all([
        getDocs(query(collection(db, FIRESTORE_COLLECTIONS.communications), orderBy('sentAt', 'desc'))),
        getDocs(collection(db, FIRESTORE_COLLECTIONS.communicationRecipients)),
      ]);
      const comms = commsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const titleById = new Map(comms.map(c => [c.id, c.title as string]));

      const recRows: CommsRecipientRow[] = recsSnap.docs.map(d => {
        const x = d.data() as any;
        const readAt = toDate(x.readAt);
        const ctaClickedAt = toDate(x.ctaClickedAt);
        const ackAt = toDate(x.ackAt);
        const emailStatus = x.emailStatus || 'pending';
        return {
          id: d.id, communicationId: x.communicationId ?? '', communicationTitle: titleById.get(x.communicationId) ?? '(eliminado)',
          userId: x.userId ?? '', userName: x.userName ?? '(sin nombre)', userEmail: x.userEmail ?? '', company: x.company ?? '', project: x.project ?? '',
          sentAt: toDate(x.sentAt), emailStatus, emailError: x.emailError,
          status: x.status, readAt, ctaClickedAt, ackAt, quizSubmittedAt: toDate(x.quizSubmittedAt),
          finalStatus: finalStatusOf({ emailStatus, readAt, ctaClickedAt, ackAt }),
        };
      });

      const recsByComm = new Map<string, CommsRecipientRow[]>();
      recRows.forEach(r => {
        if (!recsByComm.has(r.communicationId)) recsByComm.set(r.communicationId, []);
        recsByComm.get(r.communicationId)!.push(r);
      });

      const rows: CommsCampaignRow[] = comms.map(c => {
        const recs = recsByComm.get(c.id) ?? [];
        const total = recs.length;
        const sent = recs.filter(r => r.emailStatus === 'sent').length;
        const failed = recs.filter(r => r.emailStatus === 'failed').length;
        const pending = recs.filter(r => r.emailStatus === 'pending').length;
        const opened = recs.filter(r => !!r.readAt).length;
        const clicked = recs.filter(r => !!r.ctaClickedAt).length;
        const acked = recs.filter(r => !!r.ackAt).length;
        const quizSubmitted = recs.filter(r => !!r.quizSubmittedAt).length;
        return {
          id: c.id, title: c.title ?? '(sin título)', status: c.status ?? 'draft', targetType: c.targetType ?? 'all', targetName: c.targetName || '',
          requiresAck: !!c.requiresAck, senderKey: c.senderKey || 'default',
          sentAt: toDate(c.sentAt),
          total, sent, failed, pending, opened, clicked, acked, quizSubmitted,
          deliveryRate: rate(sent, total),
          openRate: rate(opened, sent || total),
          clickRate: rate(clicked, sent || total),
          ackRate: rate(acked, sent || total),
        };
      });

      // Tendencia — últimos 30 días, huecos rellenados en cero.
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const dayBuckets = new Map<string, { sent: number; opened: number; clicked: number }>();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        dayBuckets.set(d.toISOString().slice(0, 10), { sent: 0, opened: 0, clicked: 0 });
      }
      recRows.forEach(r => {
        if (r.sentAt) {
          const key = r.sentAt.toISOString().slice(0, 10);
          const b = dayBuckets.get(key);
          if (b && r.emailStatus === 'sent') b.sent++;
        }
        if (r.readAt) {
          const key = r.readAt.toISOString().slice(0, 10);
          const b = dayBuckets.get(key);
          if (b) b.opened++;
        }
        if (r.ctaClickedAt) {
          const key = r.ctaClickedAt.toISOString().slice(0, 10);
          const b = dayBuckets.get(key);
          if (b) b.clicked++;
        }
      });
      const tl: CommsTimelinePoint[] = [];
      dayBuckets.forEach((v, key) => {
        const d = new Date(key);
        tl.push({ date: d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }), ...v });
      });

      setCampaigns(rows);
      setRecipients(recRows);
      setTimeline(tl);
    } catch (e: any) {
      setError(e?.message || 'No fue posible cargar las estadísticas de correos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const globalStats: CommsGlobalStats = useMemo(() => {
    const totalCampaigns = campaigns.length;
    const totalRecipients = recipients.length;
    const sent = campaigns.reduce((s, c) => s + c.sent, 0);
    const failed = campaigns.reduce((s, c) => s + c.failed, 0);
    const opened = campaigns.reduce((s, c) => s + c.opened, 0);
    const clicked = campaigns.reduce((s, c) => s + c.clicked, 0);
    const acked = campaigns.reduce((s, c) => s + c.acked, 0);
    return {
      totalCampaigns, totalRecipients, sent, failed, opened, clicked, acked,
      deliveryRate: rate(sent, totalRecipients),
      openRate: rate(opened, sent),
      clickRate: rate(clicked, sent),
      ackRate: rate(acked, sent),
    };
  }, [campaigns, recipients]);

  return { loading, error, refresh: load, globalStats, campaigns, recipients, timeline };
}
