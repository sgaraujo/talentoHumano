import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import * as logger from "firebase-functions/logger";
import {
  getOrCreateConversation,
  appendMessage,
  updateMessageDeliveryStatus,
  type MediaType,
} from "./conversationService";

export const META_VERIFY_TOKEN = defineSecret("META_VERIFY_TOKEN");

const META_BASE = "https://graph.facebook.com/v22.0";

function msgTypeToMediaType(t: string): MediaType | null {
  if (t === "image")                  return "image";
  if (t === "video")                  return "video";
  if (t === "document")               return "document";
  if (t === "audio" || t === "voice") return "audio";
  return null;
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "video/mp4": "mp4", "video/3gpp": "3gp",
    "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac",
    "application/pdf": "pdf",
  };
  return map[mime] ?? mime.split("/")[1] ?? "bin";
}

async function downloadAndStoreMedia(params: {
  mediaId: string; token: string; numberId: string;
  conversationId: string; wamid: string; mimeType: string; filename?: string;
}): Promise<string> {
  const { mediaId, token, numberId, conversationId, wamid, mimeType, filename } = params;

  const metaResp = await fetch(`${META_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaResp.ok) throw new Error(`META_MEDIA_URL_FAILED status=${metaResp.status}`);
  const { url: tempUrl } = await metaResp.json() as { url?: string };
  if (!tempUrl) throw new Error("META_MEDIA_URL_EMPTY");

  const fileResp = await fetch(tempUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!fileResp.ok) throw new Error(`META_MEDIA_DOWNLOAD_FAILED status=${fileResp.status}`);
  const buffer = Buffer.from(await fileResp.arrayBuffer());

  const ext = filename ? filename.split(".").pop() ?? mimeToExt(mimeType) : mimeToExt(mimeType);
  const storageName = filename ?? `${wamid}.${ext}`;
  const storagePath = `whatsapp/${numberId}/${conversationId}/${storageName}`;

  const bucket = getStorage().bucket();
  const file = bucket.file(storagePath);
  await file.save(buffer, { metadata: { contentType: mimeType }, resumable: false });
  await file.makePublic();
  return file.publicUrl();
}

// Busca un colaborador por teléfono en la colección users
async function findUserByPhone(
  phone: string
): Promise<{ userId: string; userName: string } | null> {
  const localPhone = phone.startsWith("57") && phone.length === 12 ? phone.slice(2) : phone;
  try {
    const snap = await getFirestore()
      .collection("users")
      .where("personalData.phone", "==", localPhone)
      .limit(1)
      .get();
    if (!snap.empty) {
      const d = snap.docs[0];
      return { userId: d.id, userName: d.data().fullName ?? "" };
    }
    // También buscar por corporatePhone
    const snap2 = await getFirestore()
      .collection("users")
      .where("location.corporatePhone", "==", localPhone)
      .limit(1)
      .get();
    if (!snap2.empty) {
      const d = snap2.docs[0];
      return { userId: d.id, userName: d.data().fullName ?? "" };
    }
  } catch (err) {
    logger.warn("Error buscando usuario por teléfono", { phone, err });
  }
  return null;
}

export const waWebhook = onRequest(
  { region: "us-central1", secrets: [META_VERIFY_TOKEN] },
  async (req, res) => {

    // ── GET: verificación del webhook ───────────────────────────────────
    if (req.method === "GET") {
      const mode      = req.query["hub.mode"];
      const token     = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      if (mode === "subscribe" && token === META_VERIFY_TOKEN.value()) {
        logger.info("Webhook Meta verificado correctamente");
        res.status(200).send(challenge as string);
      } else {
        logger.warn("Verificación webhook fallida");
        res.status(403).send("Verification token mismatch");
      }
      return;
    }

    if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }

    // ── POST: mensajes y status updates ────────────────────────────────
    let body: Record<string, unknown> = {};
    try {
      body = typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body as Record<string, unknown>) || {};
    } catch {
      res.status(200).json({ ok: true, ignored: "invalid_json" });
      return;
    }

    const entry         = (body as any)?.entry?.[0];
    const value         = entry?.changes?.[0]?.value;
    const phoneNumberId = String(value?.metadata?.phone_number_id || "");
    const messages: unknown[] = value?.messages ?? [];
    const statuses: unknown[] = value?.statuses ?? [];

    if ((!messages.length && !statuses.length) || !phoneNumberId) {
      res.status(200).json({ ok: true, noContent: true });
      return;
    }

    const numbersSnap = await getFirestore()
      .collection("wa_numbers")
      .where("phoneNumberId", "==", phoneNumberId)
      .limit(1)
      .get();

    if (numbersSnap.empty) {
      logger.warn("Número WA no encontrado en Firestore", { phoneNumberId });
      res.status(200).json({ ok: true, ignored: "number_not_found" });
      return;
    }

    const numberId  = numbersSnap.docs[0].id;
    const metaToken = (numbersSnap.docs[0].data() as any)?.metaToken as string ?? "";

    // ── Mensajes entrantes ──────────────────────────────────────────────
    for (const msg of messages as any[]) {
      const from: string    = String(msg?.from || "");
      const wamid: string   = String(msg?.id   || "");
      const msgType: string = String(msg?.type  || "text");

      const text: string =
        msg?.text?.body ||
        msg?.button?.text ||
        msg?.interactive?.list_reply?.title ||
        msg?.interactive?.button_reply?.title ||
        "";

      const mediaType = msgTypeToMediaType(msgType);
      const isMedia   = mediaType !== null;

      if (!from || (!text && !isMedia)) continue;

      try {
        const userMeta = await findUserByPhone(from);
        await getOrCreateConversation(numberId, from, userMeta ?? undefined);

        if (isMedia && metaToken) {
          const mediaObj: any = msg[msgType] ?? {};
          const mediaId   = String(mediaObj?.id ?? "");
          const mimeType  = String(mediaObj?.mime_type ?? "application/octet-stream");
          const caption   = String(mediaObj?.caption ?? "");
          const filename  = String(mediaObj?.filename ?? "");

          if (!mediaId) continue;

          let mediaUrl = "";
          try {
            mediaUrl = await downloadAndStoreMedia({
              mediaId, token: metaToken, numberId,
              conversationId: from, wamid, mimeType,
              filename: filename || undefined,
            });
          } catch (err) {
            logger.error("Error descargando media", { wamid, err });
          }

          await appendMessage({
            numberId, conversationId: from,
            message: {
              role: "user", text: caption, source: "PROVIDER",
              timestampMs: Date.now(), providerMessageId: wamid,
              mediaUrl: mediaUrl || undefined, mediaType,
              mediaFilename: filename || undefined,
            },
          });
        } else {
          await appendMessage({
            numberId, conversationId: from,
            message: {
              role: "user", text, source: "PROVIDER",
              timestampMs: Date.now(), providerMessageId: wamid,
            },
          });
        }

        logger.info("Mensaje WA entrante guardado", { from, wamid, numberId });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === "DUPLICATE_MESSAGE") continue;
        logger.error("Error procesando mensaje WA entrante", err);
      }
    }

    // ── Status updates ──────────────────────────────────────────────────
    const validStatuses = new Set(["sent", "delivered", "read", "failed"]);
    for (const s of statuses as any[]) {
      const wamid       = String(s?.id           || "");
      const status      = String(s?.status       || "");
      const recipientId = String(s?.recipient_id || "");
      if (!wamid || !validStatuses.has(status) || !recipientId) continue;
      try {
        const errEntry = s?.errors?.[0];
        await updateMessageDeliveryStatus(
          numberId, recipientId, wamid,
          status as "sent" | "delivered" | "read" | "failed",
          errEntry ? { code: errEntry.code, title: errEntry.title } : undefined
        );
      } catch (err) {
        logger.error("Error actualizando deliveryStatus", { wamid, err });
      }
    }

    res.status(200).json({ ok: true });
  }
);
