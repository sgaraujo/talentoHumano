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
    for (const [phone, recipient] of unique) {
      const recipientRef = campaignRef.collection("recipients").doc(phone);
      await recipientRef.set({ ...recipient, phone, status: "sending", createdAt: FieldValue.serverTimestamp() });
      try {
        const bodyParameters = variableNumbers.map(variable => ({
          type: "text", text: variable === 1
            ? String(recipient.name || phone)
            : String(parameterValues?.[String(variable)] ?? ""),
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
          throw new Error(`META_${response.status}: ${body.slice(0, 500)}`);
        }
        const payload = await response.json().catch(() => ({})) as any;
        const wamid = payload?.messages?.[0]?.id ?? "";
        const conversation = await getOrCreateConversation(numberId, phone, {
          userId: recipient.userId, userName: recipient.name,
        });
        let messageText = tpl.bodyText ?? `[Plantilla: ${tpl.displayName ?? tpl.providerTemplateName}]`;
        for (const variable of variableNumbers) {
          const value = variable === 1 ? String(recipient.name || phone) : String(parameterValues?.[String(variable)] ?? "");
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
        logger.error("Error enviando destinatario de campaña", { campaignId: campaignRef.id, phone, error: error?.message });
        await recipientRef.update({ status: "failed", error: String(error?.message ?? error).slice(0, 800) });
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
