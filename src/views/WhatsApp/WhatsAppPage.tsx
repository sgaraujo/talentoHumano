import { useState, useEffect, useRef, useMemo } from "react";
import {
  MessageCircle, Send, Paperclip, Search, X, Phone,
  CheckCheck, Check, Clock, AlertCircle, Lock,
  FileText, Loader2, ChevronLeft, MessageSquare,
} from "lucide-react";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { storage, functions } from "@/config/firebase";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  listenNumbers, listenInbox, listenConversation,
  listenMessages, fetchOlderMessages, markConversationRead,
  isMetaWindowOpen,
} from "@/services/whatsappService";
import type { WaNumber, WaConversation, WaMessage } from "@/models/types/WhatsApp";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtTime(d: Date) {
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86_400_000) return d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  if (diff < 7 * 86_400_000) return d.toLocaleDateString("es-CO", { weekday: "short" });
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

function DeliveryIcon({ status }: { status?: string }) {
  if (status === "read")      return <CheckCheck className="w-3.5 h-3.5 text-blue-400" />;
  if (status === "delivered") return <CheckCheck className="w-3.5 h-3.5 text-gray-400" />;
  if (status === "sent")      return <Check className="w-3.5 h-3.5 text-gray-400" />;
  if (status === "failed")    return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
  return <Clock className="w-3 h-3 text-gray-300" />;
}

function ChatBubble({ msg }: { msg: WaMessage }) {
  const isMe = msg.role === "assistant";
  return (
    <div className={`flex ${isMe ? "justify-end" : "justify-start"} mb-1.5`}>
      <div className={`max-w-[72%] px-3 py-2 rounded-2xl text-sm shadow-sm
        ${isMe
          ? "bg-[#005c4b] text-white rounded-br-sm"
          : "bg-white text-gray-800 rounded-bl-sm border border-gray-100"}`}>

        {/* Media */}
        {msg.mediaType === "image" && msg.mediaUrl && (
          <a href={msg.mediaUrl} target="_blank" rel="noreferrer">
            <img src={msg.mediaUrl} alt="imagen" className="rounded-lg mb-1 max-w-full max-h-48 object-cover" />
          </a>
        )}
        {msg.mediaType === "document" && msg.mediaUrl && (
          <a href={msg.mediaUrl} target="_blank" rel="noreferrer"
            className="flex items-center gap-2 bg-white/20 rounded-lg px-3 py-2 mb-1">
            <FileText className="w-4 h-4 flex-shrink-0" />
            <span className="text-xs truncate">{msg.mediaFilename ?? "Documento"}</span>
          </a>
        )}
        {msg.mediaType === "audio" && msg.mediaUrl && (
          <audio controls src={msg.mediaUrl} className="max-w-[200px] mb-1" />
        )}

        {/* Text */}
        {msg.text && <p className="leading-snug whitespace-pre-wrap break-words">{msg.text}</p>}

        {/* Meta */}
        <div className={`flex items-center gap-1 mt-0.5 ${isMe ? "justify-end" : "justify-start"}`}>
          <span className={`text-[10px] ${isMe ? "text-white/60" : "text-gray-400"}`}>
            {fmtTime(msg.ts)}
          </span>
          {isMe && <DeliveryIcon status={msg.deliveryStatus} />}
        </div>
      </div>
    </div>
  );
}

// ── ReplyBox ─────────────────────────────────────────────────────────────────

function ReplyBox({
  numberId, conversationId, windowOpen, onSent,
}: {
  numberId: string; conversationId: string; windowOpen: boolean; onSent: () => void;
}) {
  const [text, setText]         = useState("");
  const [sending, setSending]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const sendFn = httpsCallable(functions, "sendWhatsAppMessage");

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await sendFn({ numberId, conversationId, text: text.trim() });
      setText("");
      onSent();
    } catch (e: any) {
      toast.error("Error al enviar", { description: e.message });
    } finally { setSending(false); }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const isImage = file.type.startsWith("image/");
    const mediaType = isImage ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "document";

    setUploading(true);
    const path = `whatsapp/outgoing/${numberId}/${conversationId}/${Date.now()}_${file.name}`;
    const task = uploadBytesResumable(storageRef(storage, path), file);
    task.on("state_changed", undefined,
      err => { toast.error("Error subiendo archivo", { description: err.message }); setUploading(false); },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        setSending(true);
        try {
          await sendFn({ numberId, conversationId, mediaUrl: url, mediaType, mediaFilename: file.name });
          onSent();
        } catch (e: any) {
          toast.error("Error al enviar archivo", { description: e.message });
        } finally { setSending(false); setUploading(false); }
      }
    );
  };

  if (!windowOpen) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
        <Lock className="w-3.5 h-3.5" />
        Ventana de 24h cerrada — solo puedes enviar plantillas
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2 px-3 py-3 bg-[#f0f2f5] border-t border-gray-200">
      <button onClick={() => fileRef.current?.click()}
        className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-white text-gray-500 hover:bg-gray-100 transition-colors shadow-sm">
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
      </button>
      <input ref={fileRef} type="file" className="hidden" onChange={handleFile}
        accept="image/*,video/*,audio/*,.pdf,.docx,.xlsx" />

      <div className="flex-1 bg-white rounded-2xl shadow-sm px-3 py-2 flex items-end gap-2">
        <textarea
          rows={1}
          className="flex-1 resize-none text-sm focus:outline-none max-h-32 bg-transparent"
          placeholder="Escribe un mensaje..."
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          style={{ height: "auto", minHeight: "24px" }}
          onInput={e => {
            const t = e.target as HTMLTextAreaElement;
            t.style.height = "auto";
            t.style.height = Math.min(t.scrollHeight, 128) + "px";
          }}
        />
      </div>

      <button
        onClick={handleSend}
        disabled={!text.trim() || sending}
        className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-[#00a884] text-white hover:bg-[#017a61] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">
        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
      </button>
    </div>
  );
}

// ── ConversationThread ────────────────────────────────────────────────────────

function ConversationThread({
  numberId, convId, onBack,
}: {
  numberId: string; convId: string; onBack: () => void;
}) {
  const [conv, setConv]       = useState<WaConversation | null>(null);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const didScrollRef = useRef(false);

  useEffect(() => {
    const unsub1 = listenConversation(numberId, convId, setConv);
    const unsub2 = listenMessages(numberId, convId, msgs => {
      setMessages(prev => {
        const map = new Map(prev.map(m => [m.id, m]));
        msgs.forEach(m => map.set(m.id, m));
        return [...map.values()].sort((a, b) => a.ts.getTime() - b.ts.getTime());
      });
    });
    markConversationRead(numberId, convId).catch(() => {});
    return () => { unsub1(); unsub2(); };
  }, [numberId, convId]);

  useEffect(() => {
    if (!didScrollRef.current && messages.length > 0) {
      bottomRef.current?.scrollIntoView();
      didScrollRef.current = true;
    }
  }, [messages]);

  const loadMore = async () => {
    if (!messages.length || loadingMore) return;
    setLoadingMore(true);
    try {
      const older = await fetchOlderMessages(numberId, convId, messages[0].ts);
      if (older.length === 0) { setHasMore(false); return; }
      setMessages(prev => {
        const map = new Map([...older, ...prev].map(m => [m.id, m]));
        return [...map.values()].sort((a, b) => a.ts.getTime() - b.ts.getTime());
      });
    } finally { setLoadingMore(false); }
  };

  const windowOpen = conv ? isMetaWindowOpen(conv) : false;
  const displayName = conv?.userName || conv?.userAddress || convId;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#f0f2f5] border-b border-gray-200">
        <button onClick={onBack} className="lg:hidden text-gray-500 hover:text-gray-700">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="w-9 h-9 rounded-full bg-[#00a884] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{displayName}</p>
          <p className="text-[11px] text-gray-500 truncate">{conv?.userAddress}</p>
        </div>
        {!windowOpen && (
          <span className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            <Lock className="w-3 h-3" /> 24h cerrada
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 bg-[#efeae2]"
        style={{ backgroundImage: "url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PC9zdmc+')" }}>
        {hasMore && (
          <div className="text-center mb-3">
            <button onClick={loadMore} disabled={loadingMore}
              className="text-xs text-[#00a884] bg-white rounded-full px-4 py-1.5 shadow-sm hover:shadow transition-shadow disabled:opacity-50">
              {loadingMore ? "Cargando..." : "Ver mensajes anteriores"}
            </button>
          </div>
        )}

        {messages.map(m => <ChatBubble key={m.id} msg={m} />)}
        <div ref={bottomRef} />
      </div>

      {/* Reply */}
      <ReplyBox
        numberId={numberId}
        conversationId={convId}
        windowOpen={windowOpen}
        onSent={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
      />
    </div>
  );
}

// ── InboxPanel ────────────────────────────────────────────────────────────────

function InboxPanel({
  numberId, activeConvId, onSelect,
}: {
  numberId: string; activeConvId: string | null; onSelect: (id: string) => void;
}) {
  const [convs, setConvs]   = useState<WaConversation[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    return listenInbox(numberId, setConvs);
  }, [numberId]);

  const filtered = useMemo(() =>
    convs.filter(c => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (c.userName?.toLowerCase().includes(q) || c.userAddress.includes(q));
    }),
    [convs, search]
  );

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Search */}
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <Input
            placeholder="Buscar conversación..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-8 text-sm border-gray-200 bg-[#f0f2f5] rounded-full focus-visible:ring-[#00a884]"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
            <MessageCircle className="w-8 h-8 opacity-30" />
            <p className="text-sm">{search ? "Sin resultados" : "Sin conversaciones"}</p>
          </div>
        ) : (
          filtered.map(c => {
            const lastMsg = c.lastMessages[c.lastMessages.length - 1];
            const isActive = c.id === activeConvId;
            const windowOpen = isMetaWindowOpen(c);
            return (
              <button key={c.id} onClick={() => onSelect(c.id)}
                className={`w-full text-left px-4 py-3 flex items-start gap-3 border-b border-gray-50 transition-colors hover:bg-gray-50
                  ${isActive ? "bg-[#f0f2f5]" : ""} ${!windowOpen ? "opacity-70" : ""}`}>
                <div className="w-10 h-10 rounded-full bg-[#00a884] flex items-center justify-center text-white font-bold text-sm flex-shrink-0 relative">
                  {(c.userName || c.userAddress).charAt(0).toUpperCase()}
                  {c.unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#00a884] border-2 border-white rounded-full text-[9px] flex items-center justify-center text-white font-bold">
                      {c.unreadCount > 9 ? "9+" : c.unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {c.userName || c.userAddress}
                    </p>
                    <span className="text-[10px] text-gray-400 flex-shrink-0 ml-1">
                      {fmtTime(c.lastMessageAt)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {lastMsg?.mediaType ? `📎 ${lastMsg.mediaType}` : (lastMsg?.text || "...")}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── NumberSelect ──────────────────────────────────────────────────────────────

function NumberSelect({ numbers, onSelect }: { numbers: WaNumber[]; onSelect: (id: string) => void }) {
  return (
    <div className="flex items-center justify-center h-full bg-[#f0f2f5]">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-sm w-full mx-4">
        <div className="w-16 h-16 rounded-full bg-[#00a884]/10 flex items-center justify-center mx-auto mb-4">
          <MessageCircle className="w-8 h-8 text-[#00a884]" />
        </div>
        <h2 className="text-lg font-bold text-gray-800 text-center mb-1">WhatsApp Business</h2>
        <p className="text-sm text-gray-500 text-center mb-6">Selecciona el número desde el que quieres gestionar conversaciones</p>
        {numbers.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-4">
            <p>No hay números configurados.</p>
            <p className="text-xs mt-1">Un administrador debe agregar un número en Firestore.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {numbers.map(n => (
              <button key={n.id} onClick={() => onSelect(n.id)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:border-[#00a884] hover:bg-[#00a884]/5 transition-all text-left">
                <div className="w-10 h-10 rounded-full bg-[#00a884] flex items-center justify-center flex-shrink-0">
                  <Phone className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{n.displayName}</p>
                  <p className="text-xs text-gray-400">ID: {n.phoneNumberId || "—"}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export const WhatsAppPage = () => {
  const [numbers,   setNumbers]   = useState<WaNumber[]>([]);
  const [numberId,  setNumberId]  = useState<string | null>(null);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"inbox" | "thread">("inbox");

  useEffect(() => listenNumbers(setNumbers), []);

  // Auto-select if only one number
  useEffect(() => {
    if (numbers.length === 1 && !numberId) setNumberId(numbers[0].id);
  }, [numbers, numberId]);

  const openConv = (id: string) => {
    setActiveConv(id);
    setMobileView("thread");
  };

  if (!numberId) return <NumberSelect numbers={numbers} onSelect={setNumberId} />;

  return (
    <div className="flex h-full" style={{ height: "calc(100vh - 64px)" }}>

      {/* Inbox — hidden on mobile when thread is open */}
      <div className={`${mobileView === "thread" ? "hidden lg:flex" : "flex"} flex-col w-full lg:w-80 xl:w-96 flex-shrink-0`}>
        {/* Header inbox */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#f0f2f5] border-b border-gray-200">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-[#00a884]" />
            <span className="font-semibold text-gray-800 text-sm">WhatsApp</span>
          </div>
          {numbers.length > 1 && (
            <button onClick={() => setNumberId(null)} className="text-xs text-gray-400 hover:text-gray-600">
              Cambiar número
            </button>
          )}
        </div>
        <InboxPanel numberId={numberId} activeConvId={activeConv} onSelect={openConv} />
      </div>

      {/* Thread / placeholder */}
      <div className={`${mobileView === "inbox" ? "hidden lg:flex" : "flex"} flex-1 flex-col`}>
        {activeConv ? (
          <ConversationThread
            key={activeConv}
            numberId={numberId}
            convId={activeConv}
            onBack={() => { setActiveConv(null); setMobileView("inbox"); }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full bg-[#f0f2f5] gap-3 text-gray-400">
            <MessageSquare className="w-12 h-12 opacity-20" />
            <p className="text-sm">Selecciona una conversación para comenzar</p>
          </div>
        )}
      </div>
    </div>
  );
};
