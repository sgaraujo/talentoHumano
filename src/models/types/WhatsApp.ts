export type WaMessageRole   = "user" | "assistant";
export type WaMessageSource = "AGENT" | "PROVIDER";
export type WaMediaType     = "image" | "video" | "document" | "audio";
export type WaDeliveryStatus = "pending" | "sent" | "delivered" | "read" | "failed";
export type WaConvStatus    = "OPEN" | "CLOSED";

export interface WaMessage {
  id: string;
  role: WaMessageRole;
  text: string;
  ts: Date;
  source: WaMessageSource;
  providerMessageId?: string;
  deliveryStatus?: WaDeliveryStatus;
  mediaUrl?: string;
  mediaType?: WaMediaType;
  mediaFilename?: string;
  createdAt?: Date;
}

export interface WaConversation {
  id: string;           // = userAddress (phone number)
  numberId: string;
  userAddress: string;
  status: WaConvStatus;
  assigneeId: string | null;
  userId: string | null;
  userName: string | null;
  lastMessages: WaMessage[];
  messageCount: number;
  lastMessageAt: Date;
  lastInboundAt: Date | null;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WaNumber {
  id: string;
  displayName: string;
  phoneNumberId: string;
  createdAt?: Date;
}

export interface WaTemplate {
  id: string;
  displayName: string;
  providerTemplateName: string;
  bodyText: string;
  /** Formato de variables en Meta: POSITIONAL ({{1}}) o NAMED ({{nombre}}). */
  parameterFormat?: "POSITIONAL" | "NAMED";
  headerFormat?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION" | null;
  headerText?: string | null;
  buttons?: Array<{ type: string; text: string; url: string | null }>;
  /** Archivo del encabezado (imagen/video/documento) que se usa por defecto al enviar. */
  defaultHeaderMediaUrl?: string | null;
}
