import { httpsCallable } from "firebase/functions";
import { functions } from "@/config/firebase";
import type { ChatMessage, ChatResponse } from "@/models/types/chat.types";

// Asistente del manual de usuario (Cloud Function `manualAssistant`, Gemini).
// Solo responde con base en public/manual.html.
const manualAssistant = httpsCallable<{ messages: ChatMessage[]; module?: string }, ChatResponse>(functions, "manualAssistant");

export async function sendChatMessage(messages: ChatMessage[], signal?: AbortSignal, module?: string): Promise<ChatResponse> {
  const payload = messages.map(({ role, content }) => ({ role, content }));
  const call = manualAssistant({ messages: payload, module }).then(result => result.data);
  if (!signal) return call;
  return Promise.race([
    call,
    new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("Cancelado", "AbortError")), { once: true })),
  ]);
}
