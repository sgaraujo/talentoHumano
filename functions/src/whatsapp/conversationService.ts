import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { WHATSAPP_COLLECTIONS } from "./firestorePaths";

const MAX_LAST_MESSAGES = 20;

function convRef(numberId: string, conversationId: string) {
  return getFirestore().collection(`${WHATSAPP_COLLECTIONS.numbers}/${numberId}/conversations`).doc(conversationId);
}

interface UserMeta {
  userId?: string;
  userName?: string;
}

// ── getOrCreateConversation ────────────────────────────────────────────────
export async function getOrCreateConversation(
  numberId: string,
  userAddress: string,
  userMeta?: UserMeta
): Promise<{ id: string; userAddress: string }> {
  const ref = convRef(numberId, userAddress);
  const snap = await ref.get();
  const now = Timestamp.now();

  if (!snap.exists) {
    await ref.set({
      conversationKey: userAddress,
      numberId,
      userAddress,
      status: "OPEN",
      assigneeId: null,
      userId: userMeta?.userId ?? null,
      userName: userMeta?.userName ?? null,
      lastMessages: [],
      messageCount: 0,
      lastInboundAt: null,
      unreadCount: 0,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    });
    logger.info("Nueva conversación WA creada", { numberId, userAddress, ...userMeta });
  } else if (userMeta?.userId && !snap.data()?.userId) {
    await ref.update({
      userId: userMeta.userId,
      userName: userMeta.userName ?? null,
      updatedAt: now,
    });
  }

  return { id: userAddress, userAddress };
}

export type MediaType = "image" | "video" | "document" | "audio";

// ── appendMessage ──────────────────────────────────────────────────────────
export async function appendMessage(params: {
  numberId: string;
  conversationId: string;
  message: {
    role: "user" | "assistant";
    text: string;
    source: "AGENT" | "PROVIDER";
    timestampMs: number;
    providerMessageId?: string;
    deliveryStatus?: "pending" | "sent" | "delivered" | "read" | "failed";
    mediaUrl?: string;
    mediaType?: MediaType;
    mediaFilename?: string;
  };
}): Promise<void> {
  const { numberId, conversationId, message } = params;
  const ref = convRef(numberId, conversationId);
  const db = getFirestore();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("CONVERSATION_NOT_FOUND");

    if (message.providerMessageId) {
      const processedRef = ref.collection("processed").doc(message.providerMessageId);
      const processedSnap = await tx.get(processedRef);
      if (processedSnap.exists) throw new Error("DUPLICATE_MESSAGE");
      tx.set(processedRef, { createdAt: Timestamp.now() });
    }

    const newMsg: Record<string, unknown> = {
      role: message.role,
      text: message.text,
      ts: Timestamp.fromMillis(message.timestampMs),
      source: message.source,
      ...(message.providerMessageId ? { providerMessageId: message.providerMessageId } : {}),
      ...(message.deliveryStatus    ? { deliveryStatus: message.deliveryStatus }        : {}),
      ...(message.mediaUrl          ? { mediaUrl: message.mediaUrl }                    : {}),
      ...(message.mediaType         ? { mediaType: message.mediaType }                  : {}),
      ...(message.mediaFilename     ? { mediaFilename: message.mediaFilename }          : {}),
    };

    const msgId = message.providerMessageId ?? ref.collection("messages").doc().id;
    tx.set(ref.collection("messages").doc(msgId), { ...newMsg, createdAt: Timestamp.now() });

    const data = snap.data() || {};
    const current: unknown[] = Array.isArray(data.lastMessages) ? data.lastMessages : [];
    const merged = [...current, newMsg].slice(-MAX_LAST_MESSAGES);

    const update: Record<string, unknown> = {
      lastMessages: merged,
      messageCount: FieldValue.increment(1),
      updatedAt: Timestamp.now(),
      lastMessageAt: Timestamp.fromMillis(message.timestampMs),
    };

    if (message.role === "user") {
      update.lastInboundAt = Timestamp.fromMillis(message.timestampMs);
      update.unreadCount = FieldValue.increment(1);
    }

    tx.update(ref, update);
  });
}

// ── updateMessageDeliveryStatus ────────────────────────────────────────────
export async function updateMessageDeliveryStatus(
  numberId: string,
  conversationId: string,
  wamid: string,
  status: "sent" | "delivered" | "read" | "failed",
  errorDetails?: { code: number; title: string }
): Promise<void> {
  const db = getFirestore();
  const msgRef = db.doc(
    `${WHATSAPP_COLLECTIONS.numbers}/${numberId}/conversations/${conversationId}/messages/${wamid}`
  );

  const snap = await msgRef.get();
  if (!snap.exists) {
    logger.warn("Mensaje no encontrado para actualizar deliveryStatus", { wamid, conversationId });
    return;
  }

  const update: Record<string, unknown> = { deliveryStatus: status };
  if (errorDetails) update.deliveryError = errorDetails;
  await msgRef.update(update);

  // Actualizar también en lastMessages del documento de conversación
  const ref = convRef(numberId, conversationId);
  const convSnap = await ref.get();
  if (!convSnap.exists) return;

  const lastMessages: any[] = Array.isArray(convSnap.data()?.lastMessages)
    ? convSnap.data()!.lastMessages : [];

  const updated = lastMessages.map((m: any) =>
    m.providerMessageId === wamid ? { ...m, deliveryStatus: status } : m
  );

  if (updated.some((m, i) => m !== lastMessages[i])) {
    await ref.update({ lastMessages: updated });
  }
}
