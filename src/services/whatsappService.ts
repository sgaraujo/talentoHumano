import {
  collection, doc, onSnapshot, query, orderBy,
  limit, getDocs, updateDoc, startAfter,
  type QueryDocumentSnapshot, type Unsubscribe,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, functions, storage } from "@/config/firebase";
import { FIRESTORE_COLLECTIONS } from "@/config/firestoreCollections";
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
  return onSnapshot(collection(db, FIRESTORE_COLLECTIONS.whatsappNumbers), snap => {
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
    collection(db, `${FIRESTORE_COLLECTIONS.whatsappNumbers}/${numberId}/conversations`),
    orderBy("lastMessageAt", "desc"),
    limit(50)
  );
  return onSnapshot(q, snap => cb(snap.docs.map(toConv)));
}

// ── Conversations — paginate older ───────────────────────────────────────────
export async function fetchOlderConversations(
  numberId: string,
  before: Date,
  pageSize = 50
): Promise<WaConversation[]> {
  const snap = await getDocs(
    query(
      collection(db, `${FIRESTORE_COLLECTIONS.whatsappNumbers}/${numberId}/conversations`),
      orderBy("lastMessageAt", "desc"),
      startAfter(before),
      limit(pageSize)
    )
  );
  return snap.docs.map(toConv);
}

// ── Single conversation ──────────────────────────────────────────────────────
export function listenConversation(
  numberId: string,
  conversationId: string,
  cb: (conv: WaConversation | null) => void
): Unsubscribe {
  return onSnapshot(doc(db, `${FIRESTORE_COLLECTIONS.whatsappNumbers}/${numberId}/conversations/${conversationId}`), snap => {
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
    collection(db, `${FIRESTORE_COLLECTIONS.whatsappNumbers}/${numberId}/conversations/${conversationId}/messages`),
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
      collection(db, `${FIRESTORE_COLLECTIONS.whatsappNumbers}/${numberId}/conversations/${conversationId}/messages`),
      orderBy("ts", "desc"),
      startAfter(before),
      limit(pageSize)
    )
  );
  return snap.docs.map(d => toMsg({ id: d.id, ...d.data() })).reverse();
}

// ── Mark conversation read ───────────────────────────────────────────────────
export async function markConversationRead(numberId: string, conversationId: string): Promise<void> {
  await updateDoc(doc(db, `${FIRESTORE_COLLECTIONS.whatsappNumbers}/${numberId}/conversations/${conversationId}`), {
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
  const snap = await getDocs(collection(db, `${FIRESTORE_COLLECTIONS.whatsappNumbers}/${numberId}/templates`));
  return snap.docs
    // Las registradas a mano antes de la sincronización no tienen status; se
    // asumen aprobadas. Las de Meta en revisión, rechazadas o borradas se ocultan.
    .filter(d => !d.data().status || d.data().status === "APPROVED")
    .map(d => ({
      id:                    d.id,
      displayName:           d.data().displayName ?? d.id,
      providerTemplateName:  d.data().providerTemplateName ?? "",
      bodyText:              d.data().bodyText ?? "",
      parameterFormat:       d.data().parameterFormat ?? "POSITIONAL",
      headerFormat:          d.data().headerFormat ?? null,
      headerText:            d.data().headerText ?? null,
      buttons:               d.data().buttons ?? [],
      defaultHeaderMediaUrl: d.data().defaultHeaderMediaUrl ?? null,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));
}

// Límites de WhatsApp Cloud API para el encabezado multimedia de una plantilla.
const HEADER_MEDIA_RULES: Record<string, { types: string[]; maxMb: number; label: string }> = {
  IMAGE:    { types: ["image/jpeg", "image/png"], maxMb: 5, label: "JPG o PNG" },
  VIDEO:    { types: ["video/mp4", "video/3gpp"], maxMb: 16, label: "MP4" },
  DOCUMENT: { types: [], maxMb: 100, label: "documento" },
};

export function headerMediaAccept(headerFormat?: string | null): string {
  return HEADER_MEDIA_RULES[headerFormat ?? ""]?.types.join(",") || "";
}

/** Guarda la URL como archivo de encabezado por defecto de la plantilla. */
export async function saveTemplateDefaultHeader(numberId: string, templateId: string, url: string): Promise<void> {
  await updateDoc(doc(db, `${FIRESTORE_COLLECTIONS.whatsappNumbers}/${numberId}/templates/${templateId}`), { defaultHeaderMediaUrl: url });
}

/**
 * Sube el archivo del encabezado a Storage (URL pública con token, que Meta
 * puede descargar) y lo deja como predeterminado de la plantilla.
 */
export async function uploadTemplateHeaderMedia(
  numberId: string, template: WaTemplate, file: File,
): Promise<string> {
  const rule = HEADER_MEDIA_RULES[template.headerFormat ?? ""];
  if (!rule) throw new Error("La plantilla no tiene encabezado multimedia.");
  if (rule.types.length > 0 && !rule.types.includes(file.type)) throw new Error(`WhatsApp solo acepta ${rule.label} para este encabezado.`);
  if (file.size > rule.maxMb * 1024 * 1024) throw new Error(`El archivo supera el máximo de ${rule.maxMb} MB que permite WhatsApp.`);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageRef = ref(storage, `comunicados/whatsapp_${template.id}_${Date.now()}_${safeName}`);
  await uploadBytes(storageRef, file, { contentType: file.type || undefined });
  const url = await getDownloadURL(storageRef);
  await saveTemplateDefaultHeader(numberId, template.id, url);
  return url;
}

export type WaTemplateSyncResult = { total: number; approved: number; added: number; updated: number; removed: number };

/** Trae las plantillas de la cuenta de WhatsApp Business en Meta y las guarda en Firestore. */
export async function syncTemplates(numberId: string): Promise<WaTemplateSyncResult> {
  const fn = httpsCallable<{ numberId: string }, WaTemplateSyncResult>(functions, "syncWaTemplates");
  return (await fn({ numberId })).data;
}
