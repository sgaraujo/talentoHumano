import { useCallback, useEffect, useState } from 'react';
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

export interface WaCampaignStatRow {
  id: string; name: string; templateName: string; status: string;
  total: number; sent: number; failed: number; skipped: number;
  delivered: number; read: number; deliveryFailed: number; deliveryRate: number; readRate: number;
  createdAt: Date | null; error?: string;
}

export interface WaFailureRow {
  campaignId: string; campaignName: string; recipientId: string;
  name: string; phone: string; error: string; date: Date | null;
}

export interface WaGlobalStats {
  totalCampaigns: number; totalRecipients: number;
  sent: number; failed: number; skipped: number; delivered: number; read: number; deliveryFailed: number;
  deliveryRate: number; readRate: number; topFailReason: string;
}

export interface WaNumberSummary { numberId: string; displayName: string; conversations: number; unread: number; open: number }

export interface WaConversationStats { total: number; open: number; closed: number; unread: number; byNumber: WaNumberSummary[] }

export function useWhatsAppStats() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [byCampaign, setByCampaign] = useState<WaCampaignStatRow[]>([]);
  const [failures, setFailures] = useState<WaFailureRow[]>([]);
  const [timeline, setTimeline] = useState<{ date: string; sent: number; failed: number }[]>([]);
  const [conversationStats, setConversationStats] = useState<WaConversationStats>({ total: 0, open: 0, closed: 0, unread: 0, byNumber: [] });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const campaignsSnap = await getDocs(query(collection(db, FIRESTORE_COLLECTIONS.whatsappCampaigns), orderBy('createdAt', 'desc')));
      const campaigns = campaignsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

      const perCampaign = await Promise.all(campaigns.map(async campaign => {
        const snap = await getDocs(collection(db, FIRESTORE_COLLECTIONS.whatsappCampaigns, campaign.id, 'recipients'));
        return { campaign, recipients: snap.docs.map(d => ({ id: d.id, ...d.data() } as any)) };
      }));

      const rows: WaCampaignStatRow[] = [];
      const failRows: WaFailureRow[] = [];
      const dayBuckets = new Map<string, { sent: number; failed: number }>();

      for (const { campaign, recipients } of perCampaign) {
        let sent = 0, failed = 0, skipped = 0, delivered = 0, read = 0, deliveryFailed = 0;
        for (const r of recipients) {
          if (r.status === 'sent') sent++;
          else if (r.status === 'failed') failed++;
          else if (r.status === 'skipped') skipped++;
          // Un envío puede ser aceptado por Meta (status: 'sent') y fallar después
          // en la entrega (deliveryStatus: 'failed', reportado por el webhook) —
          // eso también cuenta como fallido, aunque nunca cambie r.status.
          if (r.deliveryStatus === 'failed') { failed++; deliveryFailed++; }
          if (r.deliveryStatus === 'delivered' || r.deliveryStatus === 'read') delivered++;
          if (r.deliveryStatus === 'read') read++;

          const sentAt = toDate(r.sentAt ?? r.createdAt);
          if (sentAt && (r.status === 'sent' || r.status === 'failed')) {
            const key = sentAt.toISOString().slice(0, 10);
            if (!dayBuckets.has(key)) dayBuckets.set(key, { sent: 0, failed: 0 });
            const bucket = dayBuckets.get(key)!;
            if (r.status === 'sent') bucket.sent++; else bucket.failed++;
          }

          if (r.status === 'failed' || r.status === 'skipped' || r.deliveryStatus === 'failed') {
            failRows.push({
              campaignId: campaign.id, campaignName: campaign.name,
              recipientId: r.id, name: r.name || r.phone, phone: r.phone,
              error: r.error || 'Sin detalle', date: toDate(r.deliveryUpdatedAt ?? r.sentAt ?? r.createdAt),
            });
          }
        }
        rows.push({
          id: campaign.id, name: campaign.name, templateName: campaign.templateName ?? '',
          status: campaign.status ?? 'sending', total: recipients.length, sent, failed, skipped,
          delivered, read, deliveryFailed,
          deliveryRate: sent > 0 ? Math.round((delivered / sent) * 100) : 0,
          readRate: sent > 0 ? Math.round((read / sent) * 100) : 0,
          createdAt: toDate(campaign.createdAt), error: campaign.error,
        });
      }

      // Timeline — últimos 30 días, con huecos rellenados en cero.
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const tl: { date: string; sent: number; failed: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const bucket = dayBuckets.get(key) ?? { sent: 0, failed: 0 };
        tl.push({ date: d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }), sent: bucket.sent, failed: bucket.failed });
      }

      // Conversaciones — recorre cada número configurado.
      const numbersSnap = await getDocs(collection(db, FIRESTORE_COLLECTIONS.whatsappNumbers));
      const byNumber: WaNumberSummary[] = [];
      let totalConv = 0, openConv = 0, closedConv = 0, totalUnread = 0;
      for (const numDoc of numbersSnap.docs) {
        const convSnap = await getDocs(collection(db, FIRESTORE_COLLECTIONS.whatsappNumbers, numDoc.id, 'conversations'));
        let open = 0, unread = 0;
        convSnap.docs.forEach(c => {
          const data = c.data();
          if ((data.status ?? 'OPEN') === 'OPEN') { open++; openConv++; } else closedConv++;
          unread += data.unreadCount ?? 0;
        });
        totalConv += convSnap.size;
        totalUnread += unread;
        byNumber.push({ numberId: numDoc.id, displayName: numDoc.data().displayName ?? numDoc.id, conversations: convSnap.size, unread, open });
      }

      setByCampaign(rows);
      setFailures(failRows.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0)));
      setTimeline(tl);
      setConversationStats({ total: totalConv, open: openConv, closed: closedConv, unread: totalUnread, byNumber });
    } catch (e: any) {
      setError(e.message || 'No fue posible cargar las estadísticas de WhatsApp.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalCampaigns = byCampaign.length;
  const totalRecipients = byCampaign.reduce((s, c) => s + c.total, 0);
  const sent = byCampaign.reduce((s, c) => s + c.sent, 0);
  const failed = byCampaign.reduce((s, c) => s + c.failed, 0);
  const skipped = byCampaign.reduce((s, c) => s + c.skipped, 0);
  const delivered = byCampaign.reduce((s, c) => s + c.delivered, 0);
  const read = byCampaign.reduce((s, c) => s + c.read, 0);
  const deliveryFailed = byCampaign.reduce((s, c) => s + c.deliveryFailed, 0);

  const reasonCounts = new Map<string, number>();
  failures.forEach(f => reasonCounts.set(f.error, (reasonCounts.get(f.error) ?? 0) + 1));
  let topFailReason = '';
  let topCount = 0;
  reasonCounts.forEach((count, reason) => { if (count > topCount) { topCount = count; topFailReason = reason; } });

  const globalStats: WaGlobalStats = {
    totalCampaigns, totalRecipients, sent, failed, skipped, delivered, read, deliveryFailed,
    deliveryRate: sent > 0 ? Math.round((delivered / sent) * 100) : 0,
    readRate: sent > 0 ? Math.round((read / sent) * 100) : 0,
    topFailReason,
  };

  return { loading, error, refresh: load, globalStats, byCampaign, failures, timeline, conversationStats };
}
