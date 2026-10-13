import { useRef, useState } from "react";
import type { ChatMessage } from "@/models/types/chat.types";
import { sendChatMessage } from "@/services/aiChatService";

const WELCOME = "Hola 👋 Soy el asistente de Inteegrados. Te ayudo con el uso de la plataforma (por ejemplo: ¿cómo registro un retiro?), a redactar o mejorar preguntas para tus cuestionarios y encuestas, y con dudas generales de Talento Humano.";

export function useChat(initial?: ChatMessage[]) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initial ?? [{ role: "assistant", content: WELCOME }]
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  async function send(text: string, module?: string) {
    if (!text.trim()) return;

    setError(null);
    setLoading(true);

    const userMsg: ChatMessage = { role: "user", content: text, createdAt: Date.now() };
    const next = [...messages, userMsg];
    setMessages(next);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const { reply } = await sendChatMessage(next, abortRef.current.signal, module);
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: reply,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
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
    setMessages([{ role: "assistant", content: WELCOME }]);
  }

  return { messages, loading, error, send, cancel, clear };
}
