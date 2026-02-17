import { useChat } from "@/services/useChat";
import { useEffect, useMemo, useRef, useState } from "react";


export default function ChatPage() {
  const { messages, loading, error, send, cancel, clear } = useChat();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, loading]);

  const canSend = useMemo(() => !!text.trim() && !loading, [text, loading]);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">Asistente IA</h1>
          <p className="text-sm text-muted-foreground">
            Módulo de chat inteligente
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={clear}
            disabled={loading}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            Limpiar
          </button>
          <button
            onClick={cancel}
            disabled={!loading}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </header>

      {/* Chat body */}
      <main className="flex flex-1 justify-center overflow-hidden bg-muted/30 p-4">
        <div className="flex w-full max-w-5xl flex-col overflow-hidden rounded-xl border bg-background">
          {/* Messages */}
          <div
            ref={listRef}
            className="flex-1 space-y-4 overflow-y-auto p-6"
          >
            {messages.map((m, i) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={i}
                  className={`flex ${
                    isUser ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[75%] rounded-xl px-4 py-2 text-sm leading-relaxed ${
                      isUser
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              );
            })}

            {loading && (
              <p className="text-sm text-muted-foreground">
                Escribiendo…
              </p>
            )}

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              send(text);
              setText("");
            }}
            className="flex gap-3 border-t p-4"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escribe tu mensaje…"
              className="flex-1 rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={!canSend}
              className="rounded-xl border px-5 py-3 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Enviar
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
