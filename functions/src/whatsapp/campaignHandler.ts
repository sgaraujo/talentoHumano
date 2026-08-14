import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { appendMessage, getOrCreateConversation } from "./conversationService";
import { WHATSAPP_COLLECTIONS } from "./firestorePaths";

const META_BASE = "https://graph.facebook.com/v22.0";

type Recipient = {
  id?: string; name?: string; phone?: string; source?: "user" | "external";
  userId?: string; companyId?: string; projectId?: string; group?: string;
};

type MetaError = { code?: number; message?: string; error_subcode?: number };

// Errores de CUENTA — no dependen del destinatario, así que reintentar con la
// siguiente persona solo desperdicia tiempo porque va a fallar igual. Detiene
// la campaña de inmediato en vez de agotar los 500 destinatarios uno por uno.
const FATAL_ACCOUNT_ERROR_CODES = new Set([131042, 190, 131031]);

const FRIENDLY_WA_ERRORS: Record<number, string> = {
  131042: "La cuenta de WhatsApp Business tiene un problema de pago. Revisa el método de pago en Meta Business Manager (Configuración del negocio → Pagos) y vuelve a intentar.",
  190: "El token de acceso de WhatsApp expiró o es inválido. Debe renovarse en Meta Business Manager antes de poder enviar campañas.",
  131031: "La cuenta de WhatsApp Business está restringida por Meta. Revisa el estado y las notificaciones en WhatsApp Manager.",
  131026: "El destinatario no tiene WhatsApp activo o el número no puede recibir mensajes.",
  131047: "No se puede reabrir la conversación: pasaron más de 24h desde el último mensaje del destinatario para esta plantilla.",
  132000: "La plantilla no está aprobada o sus parámetros no coinciden con lo que Meta tiene registrado.",
  132001: "La plantilla no existe en la cuenta de WhatsApp Business o fue eliminada.",
};

// Cuando una variable de plantilla es el link de un boletín, se le agrega un
// token por destinatario (mismo esquema que el `?r=` de los envíos por email)
// para poder atribuir la vista en las estadísticas del boletín a "WhatsApp"
// en vez de perderla como sesión anónima o vista sin origen.
function withRecipientToken(value: string, phone: string): string {
  if (!value.includes("/boletin/")) return value;
  const token = Buffer.from(phone, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const separator = value.includes("?") ? "&" : "?";
  return `${value}${separator}wr=${token}`;
}

function parseMetaError(rawBody: string): { metaError: MetaError | null; friendly: string } {
  let metaError: MetaError | null = null;
  try {
    const parsed = JSON.parse(rawBody);
    if (parsed?.error) metaError = parsed.error;
  } catch { /* respuesta no era JSON — se usa el texto crudo abajo */ }
  const code = metaError?.code;
  const friendly = (code && FRIENDLY_WA_ERRORS[code])
    || metaError?.message
    || rawBody.slice(0, 300)
    || "Error desconocido al enviar el mensaje.";
  return { metaError, friendly };
}

export const sendWaCampaign = onCall(
  { region: "us-central1", cors: true, timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    const { name, numberId, companyId, projectId, templateId, parameterValues, recipients } = (request.data ?? {}) as {
      name?: string; numberId?: string; companyId?: string; projectId?: string;
      templateId?: string; parameterValues?: Record<string, string>; recipients?: Recipient[];
    };
    if (!name?.trim() || !numberId || !templateId || !Array.isArray(recipients) || recipients.length === 0) {
      throw new HttpsError("invalid-argument", "Faltan datos de la campaña.");
    }
    if (recipients.length > 500) throw new HttpsError("invalid-argument", "Máximo 500 destinatarios por campaña.");

    const unique = new Map<string, Recipient>();
    for (const recipient of recipients) {
      const phone = String(recipient.phone ?? "").replace(/\D/g, "");
      if (phone.length >= 11 && phone.length <= 15 && !unique.has(phone)) unique.set(phone, { ...recipient, phone });
    }
    if (unique.size === 0) throw new HttpsError("invalid-argument", "No hay teléfonos válidos.");

    const db = getFirestore();
    const [numberSnap, templateSnap] = await Promise.all([
      db.doc(`${WHATSAPP_COLLECTIONS.numbers}/${numberId}`).get(),
      db.doc(`${WHATSAPP_COLLECTIONS.numbers}/${numberId}/templates/${templateId}`).get(),
    ]);
    if (!numberSnap.exists) throw new HttpsError("not-found", "Número emisor no encontrado.");
    if (!templateSnap.exists) throw new HttpsError("not-found", "Plantilla no encontrada.");

    const { phoneNumberId, metaToken } = numberSnap.data() as { phoneNumberId?: string; metaToken?: string };
    const tpl = templateSnap.data() as { providerTemplateName?: string; displayName?: string; bodyText?: string; languageCode?: string };
    if (!phoneNumberId || !metaToken || !tpl.providerTemplateName) {
      throw new HttpsError("failed-precondition", "El número o la plantilla no están completamente configurados.");
    }
    const variableNumbers = [...new Set([...(tpl.bodyText ?? "").matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map(match => Number(match[1])))]
      .sort((a, b) => a - b);
    for (const variable of variableNumbers) {
      if (variable !== 1 && !String(parameterValues?.[String(variable)] ?? "").trim()) {
        throw new HttpsError("invalid-argument", `Falta el valor de la variable {{${variable}}}.`);
      }
    }

    const campaignRef = db.collection(WHATSAPP_COLLECTIONS.campaigns).doc();
    await campaignRef.set({
      name: name.trim(), numberId, companyId: companyId ?? null, projectId: projectId ?? null,
      templateId, templateName: tpl.providerTemplateName, status: "sending",
      total: unique.size, sent: 0, failed: 0, createdBy: request.auth.uid,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });

    let sent = 0;
    let failed = 0;
    let campaignError = "";
    let lastErrorCode: number | undefined;
    let consecutiveSameError = 0;
    const CONSECUTIVE_ABORT_THRESHOLD = 3;
    const allPhones = [...unique.keys()];

    for (let index = 0; index < allPhones.length; index++) {
      const phone = allPhones[index];
      const recipient = unique.get(phone)!;
      const recipientRef = campaignRef.collection("recipients").doc(phone);
      await recipientRef.set({ ...recipient, phone, status: "sending", createdAt: FieldValue.serverTimestamp() });
      let metaError: MetaError | null = null;
      try {
        const bodyParameters = variableNumbers.map(variable => ({
          type: "text", text: variable === 1
            ? String(recipient.name || phone)
            : withRecipientToken(String(parameterValues?.[String(variable)] ?? ""), phone),
        }));
        const components = bodyParameters.length > 0 ? [{ type: "body", parameters: bodyParameters }] : [];
        const response = await fetch(`${META_BASE}/${phoneNumberId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${metaToken}` },
          body: JSON.stringify({
            messaging_product: "whatsapp", to: phone, type: "template",
            template: {
              name: tpl.providerTemplateName, language: { code: tpl.languageCode || "es_CO" },
              ...(components.length > 0 ? { components } : {}),
            },
          }),
        });
        if (!response.ok) {
          const body = await response.text();
          const parsed = parseMetaError(body);
          metaError = parsed.metaError;
          throw new Error(parsed.friendly);
        }
        const payload = await response.json().catch(() => ({})) as any;
        const wamid = payload?.messages?.[0]?.id ?? "";
        const conversation = await getOrCreateConversation(numberId, phone, {
          userId: recipient.userId, userName: recipient.name,
        });
        let messageText = tpl.bodyText ?? `[Plantilla: ${tpl.displayName ?? tpl.providerTemplateName}]`;
        for (const variable of variableNumbers) {
          const value = variable === 1 ? String(recipient.name || phone) : withRecipientToken(String(parameterValues?.[String(variable)] ?? ""), phone);
          messageText = messageText.replace(new RegExp(`\\{\\{\\s*${variable}\\s*\\}\\}`, "g"), value);
        }
        await appendMessage({
          numberId, conversationId: conversation.id,
          message: {
            role: "assistant", text: messageText, source: "AGENT", timestampMs: Date.now(),
            providerMessageId: wamid || undefined, deliveryStatus: "pending",
          },
        });
        sent++;
        consecutiveSameError = 0;
        await recipientRef.update({ status: "sent", deliveryStatus: "pending", providerMessageId: wamid, sentAt: FieldValue.serverTimestamp() });
        if (wamid) {
          await db.collection(WHATSAPP_COLLECTIONS.messageIndex).doc(encodeURIComponent(wamid)).set({
            campaignId: campaignRef.id,
            recipientPath: recipientRef.path,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
      } catch (error: any) {
        failed++;
        const friendly = metaError ? (FRIENDLY_WA_ERRORS[metaError.code ?? -1] || error?.message) : (error?.message ?? String(error));
        logger.error("Error enviando destinatario de campaña", { campaignId: campaignRef.id, phone, error: friendly, code: metaError?.code });
        await recipientRef.update({ status: "failed", error: String(friendly).slice(0, 800) });

        const code = metaError?.code;
        consecutiveSameError = code !== undefined && code === lastErrorCode ? consecutiveSameError + 1 : 1;
        lastErrorCode = code;

        const isKnownFatal = code !== undefined && FATAL_ACCOUNT_ERROR_CODES.has(code);
        const isRepeatingSystemic = code !== undefined && consecutiveSameError >= CONSECUTIVE_ABORT_THRESHOLD;
        if (isKnownFatal || isRepeatingSystemic) {
          campaignError = friendly;
          await campaignRef.update({ sent, failed, updatedAt: FieldValue.serverTimestamp() });

          // Marcar como "omitido" (no intentado) el resto de la lista, en vez de
          // dejarlos sin ningún registro — así el historial explica por qué no
          // se enviaron en lugar de simplemente faltar.
          const remaining = allPhones.slice(index + 1);
          for (let batchStart = 0; batchStart < remaining.length; batchStart += 400) {
            const batch = db.batch();
            remaining.slice(batchStart, batchStart + 400).forEach(remainingPhone => {
              const remainingRecipient = unique.get(remainingPhone)!;
              batch.set(campaignRef.collection("recipients").doc(remainingPhone), {
                ...remainingRecipient, phone: remainingPhone, status: "skipped",
                error: "No se intentó: la campaña se detuvo por el error de cuenta anterior.",
                createdAt: FieldValue.serverTimestamp(),
              });
            });
            await batch.commit();
          }
          await campaignRef.update({
            status: "stopped", error: campaignError, skipped: remaining.length,
            completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
          });
          return { campaignId: campaignRef.id, queued: unique.size, sent, failed, skipped: remaining.length, error: campaignError };
        }
      }
      await campaignRef.update({ sent, failed, updatedAt: FieldValue.serverTimestamp() });
    }

    await campaignRef.update({
      status: failed === unique.size ? "failed" : failed > 0 ? "partial" : "completed",
      completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    return { campaignId: campaignRef.id, queued: unique.size, sent, failed };
  }
);
