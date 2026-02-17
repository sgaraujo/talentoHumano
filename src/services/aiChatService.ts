import type { ChatMessage } from "@/models/types/chat.types";

const AI_URL = import.meta.env.VITE_AI_URL;
if (!AI_URL) {
  throw new Error("VITE_AI_URL no está definida");
}

export async function sendChatMessage(
  messages: ChatMessage[],
  signal?: AbortSignal
) {
  const res = await fetch(AI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json() as Promise<{ reply: string }>;
}
