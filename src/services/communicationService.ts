import {
  collection, addDoc, getDocs, getDoc, doc, updateDoc,
  query, where, orderBy, serverTimestamp, writeBatch, onSnapshot,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../config/firebase';
import type { Communication, CommunicationRecipient, CommunicationTarget } from '../models/types/Communication';

function toDate(v: any): Date {
  if (!v) return new Date();
  if (v instanceof Date) return v;
  if (v?.toDate) return v.toDate();
  return new Date(v);
}

function generateToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

class CommunicationService {
  private col    = 'comunicados';
  private recCol = 'comunicado_recipients';

  // ── Create & send ────────────────────────────────────────────────────────

  async create(params: {
    title: string;
    body: string;
    sentBy: string;
    targetType: CommunicationTarget;
    targetId?: string;
    targetName?: string;
    requiresAck?: boolean;
    recipients: Array<{ userId: string; userName: string; userEmail: string; company: string; project: string }>;
    attachments?: Array<{ name: string; url: string; link?: string }>;
    ctaButton?: { text: string; url: string };
    questionnaireId?: string;
    questionnaireName?: string;
    senderKey?: 'default' | 'inteegra';
  }): Promise<string> {
    const {
      title, body, sentBy, targetType, targetId, targetName,
      requiresAck, recipients, attachments,
      ctaButton, questionnaireId, questionnaireName, senderKey,
    } = params;

    const docRef = await addDoc(collection(db, this.col), {
      title, body, sentBy,
      targetType, targetId: targetId || '', targetName: targetName || '',
      requiresAck: requiresAck || false,
      attachments: attachments || [],
      ...(ctaButton        ? { ctaButton }                             : {}),
      ...(questionnaireId  ? { questionnaireId, questionnaireName: questionnaireName || '' } : {}),
      ...(senderKey && senderKey !== 'default' ? { senderKey } : {}),
      totalSent: recipients.length,
      totalRead: 0,
      status: 'sent',
      sentAt: serverTimestamp(),
    });

    const communicationId = docRef.id;
    const baseUrl = import.meta.env.VITE_APP_URL ?? window.location.origin;

    const batch = writeBatch(db);
    const tokenMap: Array<{ email: string; name: string; link: string; quizLink?: string; ctaTrackingUrl?: string }> = [];

    for (const r of recipients) {
      const token     = generateToken();
      const link      = `${baseUrl}/comunicado/${token}`;
      const rRef      = doc(collection(db, this.recCol));

      // Optionally create a questionnaire assignment per recipient
      let quizToken: string | undefined;
      let quizLink: string | undefined;
      if (questionnaireId) {
        quizToken = generateToken();
        quizLink  = `${baseUrl}/responder/${quizToken}`;
        const qRef = doc(collection(db, 'questionnaire_assignments'));
        batch.set(qRef, {
          questionnaireId,
          token: quizToken,
          userId: r.userId,
          userName: r.userName,
          userEmail: r.userEmail,
          status: 'pending',
          source: 'communication',
          communicationId,
          recipientId: rRef.id,
          createdAt: serverTimestamp(),
        });
      }

      batch.set(rRef, {
        communicationId,
        userId: r.userId,
        userName: r.userName,
        userEmail: r.userEmail,
        company: r.company,
        project: r.project,
        token,
        ...(quizToken ? { quizToken } : {}),
        status: 'pending',
        emailStatus: 'pending',
        sentAt: serverTimestamp(),
      });
      const ctaTrackingUrl = ctaButton ? `${baseUrl}/comunicado/${token}/cta` : undefined;
      tokenMap.push({ email: r.userEmail, name: r.userName, link, quizLink, ctaTrackingUrl });
    }
    await batch.commit();

    try {
      const sendFn = httpsCallable(functions, 'sendCommunicationEmail');
      await sendFn({
        communicationId, title, body,
        recipients: tokenMap,
        attachments: attachments || [],
        ctaButton: ctaButton || null,
        questionnaireName: questionnaireName || null,
        senderKey: senderKey || 'default',
      });
      const snap = await getDocs(query(collection(db, this.recCol), where('communicationId', '==', communicationId)));
      const batch2 = writeBatch(db);
      snap.docs.forEach(d => batch2.update(d.ref, { emailStatus: 'sent' }));
      await batch2.commit();
    } catch (e) {
      console.warn('Email send failed:', e);
    }

    return communicationId;
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  async getAll(): Promise<Communication[]> {
    const snap = await getDocs(query(collection(db, this.col), orderBy('sentAt', 'desc')));
    return snap.docs.map(d => ({
      id: d.id, ...d.data(),
      sentAt: toDate(d.data().sentAt),
    })) as Communication[];
  }

  subscribe(onChange: (comms: Communication[]) => void): () => void {
    return onSnapshot(
      query(collection(db, this.col), orderBy('sentAt', 'desc')),
      snap => onChange(snap.docs.map(d => ({
        id: d.id, ...d.data(),
        sentAt: toDate(d.data().sentAt),
      })) as Communication[])
    );
  }

  async getById(id: string): Promise<Communication | null> {
    const d = await getDoc(doc(db, this.col, id));
    if (!d.exists()) return null;
    return { id: d.id, ...d.data(), sentAt: toDate(d.data().sentAt) } as Communication;
  }

  subscribeRecipients(communicationId: string, onChange: (recs: CommunicationRecipient[]) => void): () => void {
    return onSnapshot(
      query(collection(db, this.recCol), where('communicationId', '==', communicationId)),
      snap => onChange(snap.docs.map(d => ({
        id: d.id, ...d.data(),
        sentAt:        toDate(d.data().sentAt),
        readAt:        d.data().readAt        ? toDate(d.data().readAt)        : undefined,
        ackAt:         d.data().ackAt         ? toDate(d.data().ackAt)         : undefined,
        ctaClickedAt:  d.data().ctaClickedAt  ? toDate(d.data().ctaClickedAt)  : undefined,
      })) as CommunicationRecipient[])
    );
  }

  async getRecipients(communicationId: string): Promise<CommunicationRecipient[]> {
    const snap = await getDocs(
      query(collection(db, this.recCol), where('communicationId', '==', communicationId))
    );
    return snap.docs.map(d => ({
      id: d.id, ...d.data(),
      sentAt:        toDate(d.data().sentAt),
      readAt:        d.data().readAt        ? toDate(d.data().readAt)        : undefined,
      ackAt:         d.data().ackAt         ? toDate(d.data().ackAt)         : undefined,
      ctaClickedAt:  d.data().ctaClickedAt  ? toDate(d.data().ctaClickedAt)  : undefined,
    })) as CommunicationRecipient[];
  }

  // ── Public token access ───────────────────────────────────────────────────

  async getByToken(token: string): Promise<{ recipient: CommunicationRecipient; communication: Communication } | null> {
    const snap = await getDocs(query(collection(db, this.recCol), where('token', '==', token)));
    if (snap.empty) return null;
    const rDoc = snap.docs[0];
    const d = rDoc.data();
    const recipient = {
      id: rDoc.id, ...d,
      sentAt: toDate(d.sentAt),
      readAt: d.readAt ? toDate(d.readAt) : undefined,
      ackAt:  d.ackAt  ? toDate(d.ackAt)  : undefined,
      quizSubmittedAt: d.quizSubmittedAt ? toDate(d.quizSubmittedAt) : undefined,
    } as CommunicationRecipient;
    const communication = await this.getById(recipient.communicationId);
    if (!communication) return null;
    return { recipient, communication };
  }

  async markAsRead(recipientId: string, communicationId: string): Promise<void> {
    await updateDoc(doc(db, this.recCol, recipientId), {
      status: 'read',
      readAt: serverTimestamp(),
    });
    try {
      const commDoc = await getDoc(doc(db, this.col, communicationId));
      if (commDoc.exists()) {
        const current = commDoc.data().totalRead || 0;
        await updateDoc(doc(db, this.col, communicationId), { totalRead: current + 1 });
      }
    } catch { /* unauthenticated */ }
  }

  async markAsAcknowledged(recipientId: string): Promise<void> {
    await updateDoc(doc(db, this.recCol, recipientId), {
      status: 'read',
      readAt: serverTimestamp(),
      ackAt: serverTimestamp(),
    });
  }

  async markCtaClicked(recipientId: string, communicationId: string): Promise<void> {
    await updateDoc(doc(db, this.recCol, recipientId), {
      ctaClickedAt: serverTimestamp(),
    });
    try {
      const commDoc = await getDoc(doc(db, this.col, communicationId));
      if (commDoc.exists()) {
        const current = commDoc.data().totalCtaClicks || 0;
        await updateDoc(doc(db, this.col, communicationId), { totalCtaClicks: current + 1 });
      }
    } catch { /* unauthenticated */ }
  }

  // ── Resend to one recipient ───────────────────────────────────────────────

  async resendOne(recipient: CommunicationRecipient, comm: Communication): Promise<void> {
    const baseUrl = import.meta.env.VITE_APP_URL ?? window.location.origin;
    const link = `${baseUrl}/comunicado/${recipient.token}`;
    const quizLink = recipient.quizToken ? `${baseUrl}/responder/${recipient.quizToken}` : undefined;
    const ctaTrackingUrl = comm.ctaButton ? `${baseUrl}/comunicado/${recipient.token}/cta` : undefined;
    const sendFn = httpsCallable(functions, 'sendCommunicationEmail');
    await sendFn({
      communicationId: comm.id,
      title: comm.title,
      body: comm.body,
      recipients: [{ email: recipient.userEmail, name: recipient.userName, link, quizLink, ctaTrackingUrl }],
      attachments: comm.attachments ?? [],
      ctaButton: comm.ctaButton ?? null,
      questionnaireName: comm.questionnaireName ?? null,
      senderKey: comm.senderKey || 'default',
    });
  }

  // ── Add a new recipient to an existing comunicado ─────────────────────────

  async addRecipient(params: {
    communicationId: string;
    userId: string;
    userName: string;
    userEmail: string;
    company: string;
    project: string;
    comm: Communication;
  }): Promise<void> {
    const { communicationId, userId, userName, userEmail, company, project, comm } = params;
    const baseUrl = import.meta.env.VITE_APP_URL ?? window.location.origin;

    // Leer el comunicado fresco de Firestore para tener questionnaireId autoritativo
    const commRef = doc(db, this.col, communicationId);
    const commSnap = await getDoc(commRef);
    const commData = commSnap.exists() ? commSnap.data() : {};
    const questionnaireId   = (commData.questionnaireId   || comm.questionnaireId)   as string | undefined;
    const questionnaireName = (commData.questionnaireName || comm.questionnaireName) as string | undefined;
    const title       = (commData.title       || comm.title)       as string;
    const body        = (commData.body        || comm.body)        as string;
    const attachments = (commData.attachments || comm.attachments  || []) as Communication['attachments'];
    const ctaButton   = (commData.ctaButton   || comm.ctaButton)   as Communication['ctaButton'] | undefined;

    const token = generateToken();
    const link  = `${baseUrl}/comunicado/${token}`;

    let quizToken: string | undefined;
    let quizLink:  string | undefined;

    const batch = writeBatch(db);
    const rRef  = doc(collection(db, this.recCol));

    if (questionnaireId) {
      quizToken = generateToken();
      quizLink  = `${baseUrl}/responder/${quizToken}`;
      const qRef = doc(collection(db, 'questionnaire_assignments'));
      batch.set(qRef, {
        questionnaireId,
        token: quizToken,
        userId, userName, userEmail,
        status: 'pending',
        source: 'communication',
        communicationId,
        recipientId: rRef.id,
        createdAt: serverTimestamp(),
      });
    }

    batch.set(rRef, {
      communicationId,
      userId, userName, userEmail,
      company, project,
      token,
      ...(quizToken ? { quizToken } : {}),
      status: 'pending',
      emailStatus: 'pending',
      sentAt: serverTimestamp(),
    });

    await batch.commit();
    await updateDoc(commRef, { totalSent: (commData.totalSent || 0) + 1 });

    const sendFn = httpsCallable(functions, 'sendCommunicationEmail');
    await sendFn({
      communicationId,
      title,
      body,
      recipients: [{ email: userEmail, name: userName, link, ...(quizLink ? { quizLink } : {}), ...(ctaButton ? { ctaTrackingUrl: `${baseUrl}/comunicado/${token}/cta` } : {}) }],
      attachments: attachments ?? [],
      ctaButton: ctaButton ?? null,
      questionnaireName: questionnaireName ?? null,
      senderKey: (commData.senderKey || comm.senderKey || 'default'),
    });
    await updateDoc(doc(db, this.recCol, rRef.id), { emailStatus: 'sent' });
  }

  // ── Update content ────────────────────────────────────────────────────────

  async updateContent(
    communicationId: string,
    fields: {
      title: string;
      body: string;
      attachments?: { name: string; url: string; link?: string }[];
      ctaButton?: { text: string; url: string } | null;
    }
  ): Promise<void> {
    await updateDoc(doc(db, this.col, communicationId), {
      title: fields.title,
      body: fields.body,
      ...(fields.attachments !== undefined ? { attachments: fields.attachments } : {}),
      ctaButton: fields.ctaButton ?? null,
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async delete(communicationId: string): Promise<void> {
    await updateDoc(doc(db, this.col, communicationId), { status: 'draft' });
    const snap = await getDocs(query(collection(db, this.recCol), where('communicationId', '==', communicationId)));
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(doc(db, this.col, communicationId));
    await batch.commit();
  }
}

export const communicationService = new CommunicationService();
