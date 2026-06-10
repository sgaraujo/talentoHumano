import {
  collection, doc, onSnapshot, query, orderBy,
  limit, getDocs, updateDoc, startAfter,
  type QueryDocumentSnapshot, type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import type { WaNumber, WaConversation, WaMessage, WaTemplate } from "@/models/types/WhatsApp";

function toDate(v: any): Date {
  if (!v) return new Date(0);
  if (v?.toDate) return v.toDate();
  if (v instanceof Date) return v;
  return new Date(v);
}

function toMsg(d: any): WaMessage {
  return {
    id:                d.id,
    role:              d.role,
    text:              d.text ?? "",
    ts:                toDate(d.ts),
    source:            d.source,
    providerMessageId: d.providerMessageId,
    deliveryStatus:    d.deliveryStatus,
    mediaUrl:          d.mediaUrl,
    mediaType:         d.mediaType,
    mediaFilename:     d.mediaFilename,
    createdAt:         toDate(d.createdAt),
  };
}

function toConv(d: QueryDocumentSnapshot): WaConversation {
  const x = d.data();
  return {
    id:            d.id,
    numberId:      x.numberId,
    userAddress:   x.userAddress,
    status:        x.status ?? "OPEN",
    assigneeId:    x.assigneeId ?? null,
    userId:        x.userId ?? null,
    userName:      x.userName ?? null,
    lastMessages:  (x.lastMessages ?? []).map((m: any) => toMsg(m)),
    messageCount:  x.messageCount ?? 0,
    lastMessageAt: toDate(x.lastMessageAt),
    lastInboundAt: x.lastInboundAt ? toDate(x.lastInboundAt) : null,
    unreadCount:   x.unreadCount ?? 0,
    createdAt:     toDate(x.createdAt),
    updatedAt:     toDate(x.updatedAt),
  };
}

// ── Numbers ─────────────────────────────────────────────────────────────────
export function listenNumbers(cb: (numbers: WaNumber[]) => void): Unsubscribe {
  return onSnapshot(collection(db, "wa_numbers"), snap => {
    cb(snap.docs.map(d => ({
      id:            d.id,
      displayName:   d.data().displayName ?? d.id,
      phoneNumberId: d.data().phoneNumberId ?? "",
      createdAt:     d.data().createdAt?.toDate?.(),
    })));
  });
}

// ── Conversations inbox ──────────────────────────────────────────────────────
export function listenInbox(
  numberId: string,
  cb: (convs: WaConversation[]) => void
): Unsubscribe {
  const q = query(
    collection(db, `wa_numbers/${numberId}/conversations`),
    orderBy("lastMessageAt", "desc"),
    limit(50)
  );
  return onSnapshot(q, snap => cb(snap.docs.map(toConv)));
}

// ── Single conversation ──────────────────────────────────────────────────────
export function listenConversation(
  numberId: string,
  conversationId: string,
  cb: (conv: WaConversation | null) => void
): Unsubscribe {
  return onSnapshot(doc(db, `wa_numbers/${numberId}/conversations/${conversationId}`), snap => {
    cb(snap.exists() ? toConv(snap as any) : null);
  });
}

// ── Messages — real-time last 30 ────────────────────────────────────────────
export function listenMessages(
  numberId: string,
  conversationId: string,
  cb: (msgs: WaMessage[]) => void
): Unsubscribe {
  const q = query(
    collection(db, `wa_numbers/${numberId}/conversations/${conversationId}/messages`),
    orderBy("ts", "desc"),
    limit(30)
  );
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => toMsg({ id: d.id, ...d.data() })).reverse());
  });
}

// ── Messages — paginate older ────────────────────────────────────────────────
export async function fetchOlderMessages(
  numberId: string,
  conversationId: string,
  before: Date,
  pageSize = 30
): Promise<WaMessage[]> {
  const snap = await getDocs(
    query(
      collection(db, `wa_numbers/${numberId}/conversations/${conversationId}/messages`),
      orderBy("ts", "desc"),
      startAfter(before),
      limit(pageSize)
    )
  );
  return snap.docs.map(d => toMsg({ id: d.id, ...d.data() })).reverse();
}

// ── Mark conversation read ───────────────────────────────────────────────────
export async function markConversationRead(numberId: string, conversationId: string): Promise<void> {
  await updateDoc(doc(db, `wa_numbers/${numberId}/conversations/${conversationId}`), {
    unreadCount: 0,
  });
}

// ── Is Meta 24h window open ──────────────────────────────────────────────────
export function isMetaWindowOpen(conv: WaConversation): boolean {
  if (!conv.lastInboundAt) return false;
  return Date.now() - conv.lastInboundAt.getTime() < 24 * 60 * 60 * 1000;
}

// ── Templates ────────────────────────────────────────────────────────────────
export async function getTemplates(numberId: string): Promise<WaTemplate[]> {
  const snap = await getDocs(collection(db, `wa_numbers/${numberId}/templates`));
  return snap.docs.map(d => ({
    id:                    d.id,
    displayName:           d.data().displayName ?? d.id,
    providerTemplateName:  d.data().providerTemplateName ?? "",
    bodyText:              d.data().bodyText ?? "",
  }));
}
