import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { appendMessage, type MediaType } from "./conversationService";
import { getOrCreateConversation } from "./conversationService";
import { WHATSAPP_COLLECTIONS } from "./firestorePaths";

const META_BASE = "https://graph.facebook.com/v22.0";

async function sendMetaText(phoneNumberId: string, token: string, to: string, text: string): Promise<string> {
  const resp = await fetch(`${META_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: "whatsapp", to, text: { body: text } }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => null);
    throw new Error(`META_SEND_FAILED status=${resp.status} body=${JSON.stringify(err)}`);
  }
  return ((await resp.json().catch(() => ({}))) as any)?.messages?.[0]?.id ?? "";
}

async function sendMetaMedia(
  phoneNumberId: string, token: string, to: string,
  params: { mediaUrl: string; mediaType: MediaType; caption?: string; filename?: string }
): Promise<string> {
  const { mediaUrl, mediaType, caption, filename } = params;
  const mediaBody =
    mediaType === "image"    ? { image:    { link: mediaUrl, caption: caption ?? "" } } :
    mediaType === "video"    ? { video:    { link: mediaUrl, caption: caption ?? "" } } :
    mediaType === "audio"    ? { audio:    { link: mediaUrl } } :
    { document: { link: mediaUrl, caption: caption ?? "", filename: filename ?? "archivo" } };

  const resp = await fetch(`${META_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: mediaType, ...mediaBody }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => null);
    throw new Error(`META_SEND_MEDIA_FAILED status=${resp.status} body=${JSON.stringify(err)}`);
  }
  return ((await resp.json().catch(() => ({}))) as any)?.messages?.[0]?.id ?? "";
}

// ── sendWhatsAppMessage ────────────────────────────────────────────────────
export const sendWhatsAppMessage = onCall(
  { region: "us-central1", cors: true },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

    const { numberId, conversationId, text, mediaUrl, mediaType, mediaCaption, mediaFilename } =
      (request.data ?? {}) as {
        numberId?: string; conversationId?: string;
        text?: string; mediaUrl?: string; mediaType?: string;
        mediaCaption?: string; mediaFilename?: string;
      };

    const hasText  = (text ?? "").trim().length > 0;
    const hasMedia = !!mediaUrl && !!mediaType;

    if (!numberId || !conversationId || (!hasText && !hasMedia)) {
      throw new HttpsError("invalid-argument", "Se requieren numberId, conversationId y texto o media.");
    }

    const db = getFirestore();
    const [numberSnap, convSnap] = await Promise.all([
      db.doc(`${WHATSAPP_COLLECTIONS.numbers}/${numberId}`).get(),
      db.doc(`${WHATSAPP_COLLECTIONS.numbers}/${numberId}/conversations/${conversationId}`).get(),
    ]);

    if (!numberSnap.exists) throw new HttpsError("not-found", "Número no encontrado.");
    if (!convSnap.exists)   throw new HttpsError("not-found", "Conversación no encontrada.");

    const { phoneNumberId, metaToken } = numberSnap.data() as { phoneNumberId: string; metaToken: string };
    const { userAddress } = convSnap.data() as { userAddress: string };

    let wamid = "";
    if (hasMedia) {
      wamid = await sendMetaMedia(phoneNumberId, metaToken, userAddress, {
        mediaUrl: mediaUrl!,
        mediaType: mediaType as MediaType,
        caption: mediaCaption,
        filename: mediaFilename,
      });
      await appendMessage({
        numberId, conversationId,
        message: {
          role: "assistant", text: mediaCaption ?? "", source: "AGENT",
          timestampMs: Date.now(), providerMessageId: wamid || undefined,
          deliveryStatus: "pending", mediaUrl: mediaUrl!,
          mediaType: mediaType as MediaType, mediaFilename: mediaFilename,
        },
      });
    } else {
      wamid = await sendMetaText(phoneNumberId, metaToken, userAddress, text!.trim());
      await appendMessage({
        numberId, conversationId,
        message: {
          role: "assistant", text: text!.trim(), source: "AGENT",
          timestampMs: Date.now(), providerMessageId: wamid || undefined,
          deliveryStatus: "pending",
        },
      });
    }

    logger.info("Mensaje WA enviado", { numberId, conversationId, agentId: request.auth.uid });
    return { ok: true };
  }
);

// ── sendMetaTemplate ───────────────────────────────────────────────────────
export const sendWaTemplate = onCall(
  { region: "us-central1", cors: true },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

    const { numberId, to, templateId, parameters, userId, userName } =
      (request.data ?? {}) as {
        numberId?: string; to?: string; templateId?: string;
        parameters?: { parameterName: string; value: string }[];
        userId?: string; userName?: string;
      };

    if (!numberId || !to?.trim() || !templateId) {
      throw new HttpsError("invalid-argument", "Se requieren numberId, to y templateId.");
    }

    const userAddress = to.replace(/[^\d]/g, "");
    if (userAddress.length < 10) throw new HttpsError("invalid-argument", "Número inválido.");

    const db = getFirestore();
    const numberSnap   = await db.doc(`${WHATSAPP_COLLECTIONS.numbers}/${numberId}`).get();
    const templateSnap = await db.doc(`${WHATSAPP_COLLECTIONS.numbers}/${numberId}/templates/${templateId}`).get();

    if (!numberSnap.exists)   throw new HttpsError("not-found", "Número no encontrado.");
    if (!templateSnap.exists) throw new HttpsError("not-found", "Plantilla no encontrada.");

    const { phoneNumberId, metaToken } = numberSnap.data() as { phoneNumberId: string; metaToken: string };
    const tplData = templateSnap.data() as { providerTemplateName: string; bodyText?: string; displayName?: string };

    const conv = await getOrCreateConversation(numberId, userAddress, { userId, userName });
    const params = parameters ?? [];

    const url = `${META_BASE}/${phoneNumberId}/messages`;
    const components = params.length > 0 ? [{
      type: "body",
      parameters: params.map(p => ({ type: "text", parameter_name: p.parameterName, text: p.value })),
    }] : [];

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${metaToken}` },
      body: JSON.stringify({
        messaging_product: "whatsapp", to: userAddress, type: "template",
        template: {
          name: tplData.providerTemplateName,
          language: { code: "es_CO" },
          ...(components.length > 0 && { components }),
        },
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => null);
      throw new HttpsError("internal", `META_TEMPLATE_FAILED ${JSON.stringify(err)}`);
    }

    const wamid = ((await resp.json().catch(() => ({}))) as any)?.messages?.[0]?.id ?? "";

    let messageText = tplData.bodyText ?? `[Plantilla: ${tplData.displayName ?? tplData.providerTemplateName}]`;
    for (const p of params) {
      messageText = messageText.replace(new RegExp(`\\{\\{${p.parameterName}\\}\\}`, "g"), p.value);
    }

    await appendMessage({
      numberId, conversationId: conv.id,
      message: {
        role: "assistant", text: messageText, source: "AGENT",
        timestampMs: Date.now(), providerMessageId: wamid || undefined,
        deliveryStatus: "pending",
      },
    });

    return { ok: true, conversationId: conv.id };
  }
);
