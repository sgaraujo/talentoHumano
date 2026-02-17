import { useRef, useState } from "react";
import type { ChatMessage } from "@/models/types/chat.types";
import { sendChatMessage } from "@/services/aiChatService";

export function useChat(initial?: ChatMessage[]) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initial ?? [{ role: "assistant", content: "Hola 👋 ¿En qué te ayudo hoy?" }]
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  async function send(text: string) {
    if (!text.trim()) return;

    setError(null);
    setLoading(true);

    const userMsg: ChatMessage = { role: "user", content: text, createdAt: Date.now() };
    const next = [...messages, userMsg];
    setMessages(next);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const { reply } = await sendChatMessage(next, abortRef.current.signal);
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: reply,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e: any) {
      setError(e?.message ?? "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setLoading(false);
  }

  function clear() {
    setMessages([{ role: "assistant", content: "Listo ✅ ¿qué hacemos ahora?" }]);
  }

  return { messages, loading, error, send, cancel, clear };
}
