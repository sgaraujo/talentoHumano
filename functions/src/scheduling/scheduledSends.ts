import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret, defineString } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getFirestore, FieldValue, Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { randomBytes } from "crypto";
import { deliverCommunicationEmails } from "../communications/communicationEmail";
import { runWaCampaign, type WaCampaignInput } from "../whatsapp/campaignHandler";

// ── ENVÍOS PROGRAMADOS ──────────────────────────────────────────────────────
// Una sola cola para Correos, Boletines y WhatsApp. Talento Humano programa el
// envío (scheduleSend), puede cambiar la fecha o cancelarlo mientras esté
// "scheduled" (updateScheduledSend) y processScheduledSends lo envía cuando
// llega su hora, con los mismos motores que el envío inmediato.

const TENANT_ID_2 = defineSecret("TENANT_ID_2");
const CLIENT_ID_2 = defineSecret("CLIENT_ID_2");
const CLIENT_SECRET_2 = defineSecret("CLIENT_SECRET_2");
const SENDER_EMAIL_2 = defineSecret("SENDER_EMAIL_2");
const APP_URL = defineString("APP_URL", { default: "https://people-analitics.inteegra.net.co" });

export const SCHEDULING_PATHS = {
  scheduledSends: "communications/data/scheduled_sends",
  messages: "communications/data/messages",
  recipients: "communications/data/recipients",
  assignments: "questionnaires/data/assignments",
  employees: "human_resources/data/employees",
  platformRoles: "identity/data/platform_roles",
} as const;

export type ScheduledKind = "email" | "bulletin" | "whatsapp";
export type ScheduledStatus = "scheduled" | "processing" | "sent" | "partial" | "failed" | "cancelled";

interface EmailRecipientInput { userId: string; userName: string; userEmail: string; company: string; project: string }
interface EmailPayload {
  title: string; body: string;
  targetType: string; targetId?: string; targetName?: string;
  requiresAck?: boolean;
  recipients: EmailRecipientInput[];
  attachments?: Array<{ name: string; url: string; link?: string }>;
  ctaButton?: { text: string; url: string } | null;
  questionnaireId?: string; questionnaireName?: string;
}
interface BulletinPayload {
  bulletinId: string; title: string; body: string;
  recipients: Array<{ email: string; name: string; link: string }>;
}

const MAX_RECIPIENTS: Record<ScheduledKind, number> = { email: 3000, bulletin: 3000, whatsapp: 500 };
const MIN_LEAD_MS = 60_000;                 // al menos 1 minuto en el futuro
const MAX_LEAD_MS = 120 * 86_400_000;       // máximo 4 meses
const JOBS_PER_RUN = 10;
// Si una ejecución se interrumpe (timeout), el envío queda "processing". No se
// reintenta solo para no duplicar correos: se marca fallido para revisarlo.
const STUCK_AFTER_MS = 30 * 60_000;

const normalizeEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();

async function getGraphToken(): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID_2.value()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID_2.value(),
      scope: "https://graph.microsoft.com/.default",
      client_secret: CLIENT_SECRET_2.value(),
      grant_type: "client_credentials",
    }),
  });
  const data = await res.json() as { access_token?: string };
  if (!res.ok || !data.access_token) throw new Error(`GRAPH_TOKEN_FAILED ${JSON.stringify(data).slice(0, 300)}`);
  return data.access_token;
}

/** Solo Talento Humano y administradores hacen envíos masivos. */
async function assertSender(email: string): Promise<{ email: string; name: string }> {
  if (!email) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  const data = (await getFirestore().collection(SCHEDULING_PATHS.platformRoles).doc(email).get()).data();
  if (data?.role !== "admin" && data?.role !== "talento_humano") {
    throw new HttpsError("permission-denied", "Solo Talento Humano puede programar envíos.");
  }
  return { email, name: String(data?.name || email) };
}

function parseRunAt(value: unknown): Timestamp {
  const millis = typeof value === "number" ? value : Date.parse(String(value ?? ""));
  if (!Number.isFinite(millis)) throw new HttpsError("invalid-argument", "Fecha de envío inválida.");
  const lead = millis - Date.now();
  if (lead < MIN_LEAD_MS) throw new HttpsError("invalid-argument", "La fecha de envío debe ser al menos 1 minuto en el futuro.");
  if (lead > MAX_LEAD_MS) throw new HttpsError("invalid-argument", "Solo se puede programar hasta 4 meses adelante.");
  return Timestamp.fromMillis(millis);
}

function recipientCountOf(kind: ScheduledKind, payload: any): number {
  const recipients = payload?.recipients;
  if (!Array.isArray(recipients) || recipients.length === 0) throw new HttpsError("invalid-argument", "El envío no tiene destinatarios.");
  if (recipients.length > MAX_RECIPIENTS[kind]) {
    throw new HttpsError("invalid-argument", `Máximo ${MAX_RECIPIENTS[kind]} destinatarios por envío programado.`);
  }
  if (kind === "email" && (!payload.title?.trim() || !payload.body?.trim())) throw new HttpsError("invalid-argument", "Falta el asunto o el mensaje.");
  if (kind === "bulletin" && !payload.bulletinId) throw new HttpsError("invalid-argument", "Falta el boletín.");
  if (kind === "whatsapp" && (!payload.name?.trim() || !payload.numberId || !payload.templateId)) {
    throw new HttpsError("invalid-argument", "Faltan datos de la campaña.");
  }
  return recipients.length;
}

export const scheduleSend = onCall({ region: "us-central1" }, async (request) => {
  const actor = await assertSender(normalizeEmail(request.auth?.token.email));
  const kind = String(request.data?.kind ?? "") as ScheduledKind;
  if (!["email", "bulletin", "whatsapp"].includes(kind)) throw new HttpsError("invalid-argument", "Tipo de envío inválido.");
  const payload = request.data?.payload ?? {};
  const recipientCount = recipientCountOf(kind, payload);
  const runAt = parseRunAt(request.data?.runAt);
  const title = String(request.data?.title || payload.title || payload.name || "Envío programado").slice(0, 200);

  const ref = await getFirestore().collection(SCHEDULING_PATHS.scheduledSends).add({
    kind, title, runAt, status: "scheduled", recipientCount, payload,
    createdBy: actor.email, createdByName: actor.name,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  logger.info("SCHEDULED_SEND_CREATED", { id: ref.id, kind, recipientCount, runAt: runAt.toDate().toISOString(), by: actor.email });
  return { id: ref.id };
});

/** Cambia la fecha o cancela un envío que todavía no ha salido. */
export const updateScheduledSend = onCall({ region: "us-central1" }, async (request) => {
  const actor = await assertSender(normalizeEmail(request.auth?.token.email));
  const id = String(request.data?.id ?? "");
  const action = String(request.data?.action ?? "");
  if (!id || !["cancel", "reschedule"].includes(action)) throw new HttpsError("invalid-argument", "Solicitud inválida.");
  const runAt = action === "reschedule" ? parseRunAt(request.data?.runAt) : null;
  const ref = getFirestore().collection(SCHEDULING_PATHS.scheduledSends).doc(id);

  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "El envío no existe.");
    if (snap.data()?.status !== "scheduled") {
      throw new HttpsError("failed-precondition", "Este envío ya salió o fue cancelado; no se puede modificar.");
    }
    tx.update(ref, runAt ?
      { runAt, rescheduledBy: actor.email, updatedAt: FieldValue.serverTimestamp() } :
      { status: "cancelled", cancelledBy: actor.email, cancelledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

// ── Procesamiento ───────────────────────────────────────────────────────────

/**
 * Personas retiradas en Expedientes, por correo e id de usuario del directorio.
 * Quien se retiró entre la programación y el envío no debe recibirlo; si el
 * mismo correo tiene otro expediente activo, sí se envía.
 */
async function loadRetiredFilter() {
  const snap = await getFirestore().collection(SCHEDULING_PATHS.employees).get();
  const retiredEmails = new Set<string>(); const activeEmails = new Set<string>();
  const retiredIds = new Set<string>(); const activeIds = new Set<string>();
  snap.docs.forEach((doc) => {
    const data = doc.data();
    const retired = data.status === "retired";
    const emails = [data.corporateEmail, data.personalEmail].map(normalizeEmail).filter(Boolean);
    const ids = [`employee:${doc.id}`, data.identityUserId].filter(Boolean) as string[];
    emails.forEach((email) => (retired ? retiredEmails : activeEmails).add(email));
    ids.forEach((id) => (retired ? retiredIds : activeIds).add(id));
  });
  return {
    isRetiredEmail: (email: string) => retiredEmails.has(normalizeEmail(email)) && !activeEmails.has(normalizeEmail(email)),
    isRetiredId: (id?: string) => !!id && retiredIds.has(id) && !activeIds.has(id),
  };
}

type RetiredFilter = Awaited<ReturnType<typeof loadRetiredFilter>>;
interface SendResult { sent: number; failed: number; skipped: number; refId?: string; error?: string }

const token = () => randomBytes(12).toString("hex");

/** Mismo resultado que communicationService.create del frontend, hecho en el servidor. */
async function processEmail(payload: EmailPayload, createdBy: string, scheduledId: string, filter: RetiredFilter): Promise<SendResult> {
  const db = getFirestore();
  const recipients = payload.recipients.filter((r) => r.userEmail && !filter.isRetiredEmail(r.userEmail));
  const skipped = payload.recipients.length - recipients.length;
  if (!recipients.length) return { sent: 0, failed: 0, skipped, error: "Todos los destinatarios se retiraron antes de la fecha de envío." };

  const baseUrl = APP_URL.value().replace(/\/$/, "");
  const commRef = db.collection(SCHEDULING_PATHS.messages).doc();
  await commRef.set({
    title: payload.title, body: payload.body, sentBy: createdBy,
    targetType: payload.targetType || "manual", targetId: payload.targetId || "", targetName: payload.targetName || "",
    requiresAck: payload.requiresAck || false,
    attachments: payload.attachments || [],
    ...(payload.ctaButton ? { ctaButton: payload.ctaButton } : {}),
    ...(payload.questionnaireId ? { questionnaireId: payload.questionnaireId, questionnaireName: payload.questionnaireName || "" } : {}),
    totalSent: recipients.length, totalRead: 0, status: "sent",
    sentAt: FieldValue.serverTimestamp(), scheduledSendId: scheduledId,
  });

  const emailRecipients: Array<{ email: string; name: string; link: string; quizLink?: string; ctaTrackingUrl?: string }> = [];
  const recipientRefs: Array<{ ref: DocumentReference; email: string }> = [];
  // Con cuestionario son 2 escrituras por persona: lotes de 200 para no pasar el límite de 500.
  for (let start = 0; start < recipients.length; start += 200) {
    const batch = db.batch();
    for (const r of recipients.slice(start, start + 200)) {
      const recipientToken = token();
      const rRef = db.collection(SCHEDULING_PATHS.recipients).doc();
      let quizToken: string | undefined;
      if (payload.questionnaireId) {
        quizToken = token();
        batch.set(db.collection(SCHEDULING_PATHS.assignments).doc(), {
          questionnaireId: payload.questionnaireId, token: quizToken,
          userId: r.userId, userName: r.userName, userEmail: r.userEmail,
          status: "pending", source: "communication", communicationId: commRef.id, recipientId: rRef.id,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      batch.set(rRef, {
        communicationId: commRef.id, userId: r.userId, userName: r.userName, userEmail: r.userEmail,
        company: r.company, project: r.project, token: recipientToken,
        ...(quizToken ? { quizToken } : {}),
        status: "pending", emailStatus: "pending", sentAt: FieldValue.serverTimestamp(),
      });
      recipientRefs.push({ ref: rRef, email: r.userEmail });
      emailRecipients.push({
        email: r.userEmail, name: r.userName, link: `${baseUrl}/comunicado/${recipientToken}`,
        ...(quizToken ? { quizLink: `${baseUrl}/responder/${quizToken}` } : {}),
        ...(payload.ctaButton ? { ctaTrackingUrl: `${baseUrl}/comunicado/${recipientToken}/cta` } : {}),
      });
    }
    await batch.commit();
  }

  const { sent, errors } = await deliverCommunicationEmails({
    communicationId: commRef.id, title: payload.title, body: payload.body, recipients: emailRecipients,
    attachments: payload.attachments || [], ctaButton: payload.ctaButton || null,
    questionnaireName: payload.questionnaireName || null,
  }, await getGraphToken(), SENDER_EMAIL_2.value().trim());

  const errorByEmail = new Map(errors.map((e) => [e.email, e.error]));
  for (let start = 0; start < recipientRefs.length; start += 400) {
    const batch = db.batch();
    recipientRefs.slice(start, start + 400).forEach(({ ref, email }) => {
      const error = errorByEmail.get(email);
      batch.update(ref, error ? { emailStatus: "failed", emailError: error.slice(0, 500) } : { emailStatus: "sent" });
    });
    await batch.commit();
  }
  return { sent, failed: errors.length, skipped, refId: commRef.id };
}

async function processBulletin(payload: BulletinPayload, filter: RetiredFilter): Promise<SendResult> {
  const recipients = payload.recipients.filter((r) => r.email && !filter.isRetiredEmail(r.email));
  const skipped = payload.recipients.length - recipients.length;
  if (!recipients.length) return { sent: 0, failed: 0, skipped, error: "Todos los destinatarios se retiraron antes de la fecha de envío." };
  const { sent, errors } = await deliverCommunicationEmails({
    communicationId: `bulletin_${payload.bulletinId}`, title: payload.title, body: payload.body, recipients,
  }, await getGraphToken(), SENDER_EMAIL_2.value().trim());
  return { sent, failed: errors.length, skipped, refId: payload.bulletinId };
}

async function processWhatsapp(payload: WaCampaignInput, createdBy: string, filter: RetiredFilter): Promise<SendResult> {
  const all = payload.recipients ?? [];
  const recipients = all.filter((r) => r.source === "external" || !filter.isRetiredId(r.userId));
  const skipped = all.length - recipients.length;
  if (!recipients.length) return { sent: 0, failed: 0, skipped, error: "Todos los destinatarios se retiraron antes de la fecha de envío." };
  const result = await runWaCampaign({ ...payload, recipients }, createdBy);
  return {
    sent: result.sent, failed: result.failed + (result.skipped ?? 0), skipped,
    refId: result.campaignId, ...(result.error ? { error: result.error } : {}),
  };
}

/** Pasa el envío de "scheduled" a "processing" solo si nadie más lo tomó. */
async function claim(ref: DocumentReference): Promise<FirebaseFirestore.DocumentData | null> {
  return getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (!data || data.status !== "scheduled" || data.runAt.toMillis() > Date.now()) return null;
    tx.update(ref, { status: "processing", startedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return data;
  });
}

export const processScheduledSends = onSchedule(
  {
    schedule: "*/5 * * * *",
    timeZone: "America/Bogota",
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "512MiB",
    secrets: [TENANT_ID_2, CLIENT_ID_2, CLIENT_SECRET_2, SENDER_EMAIL_2],
  },
  async () => {
    const db = getFirestore();
    const col = db.collection(SCHEDULING_PATHS.scheduledSends);
    // Sin índice compuesto: hay pocos envíos activos, se filtra la fecha en memoria.
    const [scheduledSnap, processingSnap] = await Promise.all([
      col.where("status", "==", "scheduled").get(),
      col.where("status", "==", "processing").get(),
    ]);

    for (const doc of processingSnap.docs) {
      const started = doc.data().startedAt?.toMillis?.() ?? 0;
      if (Date.now() - started > STUCK_AFTER_MS) {
        await doc.ref.update({
          status: "failed", error: "El envío se interrumpió. Revisa el historial del módulo antes de volver a enviarlo.",
          completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        });
        logger.error("SCHEDULED_SEND_STUCK", { id: doc.id });
      }
    }

    const due = scheduledSnap.docs
      .filter((doc) => doc.data().runAt?.toMillis?.() <= Date.now())
      .sort((a, b) => a.data().runAt.toMillis() - b.data().runAt.toMillis())
      .slice(0, JOBS_PER_RUN);
    if (!due.length) return;

    const filter = await loadRetiredFilter();
    for (const doc of due) {
      const job = await claim(doc.ref);
      if (!job) continue;
      let result: SendResult;
      try {
        const kind = job.kind as ScheduledKind;
        result = kind === "email" ? await processEmail(job.payload, job.createdBy, doc.id, filter) :
          kind === "bulletin" ? await processBulletin(job.payload, filter) :
            await processWhatsapp(job.payload, job.createdBy, filter);
      } catch (err: any) {
        logger.error("SCHEDULED_SEND_ERROR", { id: doc.id, err: String(err?.message ?? err) });
        result = { sent: 0, failed: 0, skipped: 0, error: String(err?.message ?? err).slice(0, 500) };
      }
      const status: ScheduledStatus = result.sent === 0 ? "failed" : result.failed > 0 || result.error ? "partial" : "sent";
      await doc.ref.update({
        status, result, ...(result.error ? { error: result.error } : {}),
        completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      logger.info("SCHEDULED_SEND_DONE", { id: doc.id, kind: job.kind, status, ...result });
    }
  },
);
