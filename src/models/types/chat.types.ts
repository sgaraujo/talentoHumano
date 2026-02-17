export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  createdAt?: number;
}

export interface ChatResponse {
  reply: string;
}
