import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Sparkles, X, Send, RotateCcw, BookOpen, Loader2, Lightbulb } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useChat } from '@/services/useChat';

// Acompañante flotante: el asistente del manual disponible en cualquier
// pantalla. Se monta una sola vez en App (fuera de <Routes>) para que la
// conversación no se pierda al navegar entre módulos.

interface ModuleHelp { prefix: string; label: string; suggestions: string[] }

// Ordenado de la ruta más específica a la más general.
const MODULES: ModuleHelp[] = [
  { prefix: '/talento-humano/control', label: 'Expedientes y control', suggestions: ['¿Cómo registro un retiro?', '¿Cómo creo una persona nueva?', '¿Cómo hago una actualización parcial por cédula?'] },
  { prefix: '/offboarding', label: 'Offboarding', suggestions: ['¿Cómo funciona la encuesta de salida?', '¿Por qué una encuesta aparece como No enviada?', '¿Qué preguntas debería tener una entrevista de retiro?'] },
  { prefix: '/configuraciones/empresas', label: 'Configuración de empresas', suggestions: ['¿Para qué sirven los alias?', '¿Cómo creo una empresa nueva?'] },
  { prefix: '/empresas', label: 'Empresas', suggestions: ['¿Qué cuenta el indicador Alertas?', '¿Qué significa Sin acceso?', '¿Cómo bajo las alertas de una empresa?'] },
  { prefix: '/proyectos', label: 'Cuentas analíticas', suggestions: ['¿Qué muestran las estadísticas de una cuenta?', '¿Cómo creo una cuenta analítica?', '¿Cómo asigno un líder?'] },
  { prefix: '/estadisticas-campanas-correo', label: 'Estadísticas de campañas de correo', suggestions: ['¿Cómo leo el embudo de conversión?', '¿De dónde sale la tasa de apertura?'] },
  { prefix: '/estadisticas-whatsapp', label: 'Estadísticas de WhatsApp', suggestions: ['¿Qué significa Aceptado?', '¿Dónde veo los envíos fallidos?'] },
  { prefix: '/estadisticas-cuestionarios', label: 'Estadísticas de envíos', suggestions: ['¿Qué son las alertas de cuestionarios?'] },
  { prefix: '/comunicaciones', label: 'Correos', suggestions: ['¿Cómo envío un comunicado?', '¿Cómo reenvío a los pendientes?', '¿Cómo adjunto un cuestionario?'] },
  { prefix: '/boletines', label: 'Boletines', suggestions: ['¿Cómo creo un boletín?', '¿Qué secciones puedo agregar?'] },
  { prefix: '/whatsapp', label: 'WhatsApp', suggestions: ['¿Cómo creo una campaña?', '¿Cómo importo contactos externos?', '¿Cómo programo una campaña?'] },
  { prefix: '/envios-programados', label: 'Envíos programados', suggestions: ['¿Cómo programo un envío?', '¿Cómo cambio la fecha o cancelo un envío programado?'] },
  { prefix: '/notificaciones', label: 'Notificaciones', suggestions: ['¿Qué eventos muestra este módulo?'] },
  { prefix: '/questionarios', label: 'Cuestionarios', suggestions: ['¿Cómo cambio el orden de las preguntas?', 'Dame 8 preguntas para una encuesta de clima laboral', '¿Qué preguntas debería tener un onboarding?'] },
  { prefix: '/exportador', label: 'Exportador', suggestions: ['¿Cómo descargo las respuestas en Excel?'] },
  { prefix: '/contabilidad/informe', label: 'Informe Tributario', suggestions: ['¿Qué muestra el informe tributario?'] },
  { prefix: '/contabilidad/mensajes', label: 'Mensajes de Contabilidad', suggestions: ['¿Cómo envío un mensaje a una empresa?'] },
  { prefix: '/contabilidad', label: 'Calendario Tributario', suggestions: ['¿Cuáles son los pasos del proceso tributario?', '¿Cómo creo un vencimiento?', '¿Quién puede revertir un paso?'] },
  { prefix: '/roles', label: 'Roles y Accesos', suggestions: ['¿Cómo le doy acceso a alguien?', '¿Qué ve cada rol?'] },
  { prefix: '/dashboard', label: 'Analítica de Talento Humano', suggestions: ['¿Cómo se calcula la rotación?', '¿Dónde veo los aprendices SENA activos?', '¿Por qué no cuentan los aprendices SENA?'] },
];
const GENERAL = ['¿Qué ve cada rol?', '¿Cómo ingreso a la plataforma?'];

// Pantallas donde no se muestra: públicas, login y el propio manual.
const HIDDEN_PREFIXES = ['/login', '/responder/', '/f/', '/comunicado/', '/boletin/', '/manual'];

const findModule = (path: string) => MODULES.find(m => path === m.prefix || path.startsWith(`${m.prefix}/`));

// Marca con la que el asistente cierra las respuestas que no salen del manual
// (redacción de preguntas, buenas prácticas de TH).
const GENERAL_SOURCE_RE = /\n*\s*\**Fuente:\s*conocimiento general[^\n]*/i;

/** Formato mínimo: **negrilla**, saltos de línea, la cita "Sección del manual" y la marca de orientación general. */
function renderReply(rawText: string): ReactNode {
  const isGeneral = GENERAL_SOURCE_RE.test(rawText);
  const text = rawText.replace(GENERAL_SOURCE_RE, '').trimEnd();
  const sectionMatch = text.match(/\n*\s*Secci[oó]n del manual:\s*(.+)\s*$/i);
  const body = sectionMatch ? text.slice(0, sectionMatch.index).trimEnd() : text;
  const withBold = body.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part);
  return (
    <>
      <span className="whitespace-pre-wrap">{withBold}</span>
      {sectionMatch && (
        <Link to="/manual" className="mt-2 flex w-fit items-center gap-1.5 rounded-md bg-[#008C3C]/10 px-2 py-1 text-[11px] font-medium text-[#006C2F] hover:bg-[#008C3C]/20">
          <BookOpen className="h-3 w-3" /> {sectionMatch[1].replace(/[*.]/g, '').trim()}
        </Link>
      )}
      {isGeneral && (
        <span className="mt-2 flex w-fit items-center gap-1.5 rounded-md bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-500">
          <Lightbulb className="h-3 w-3" /> Orientación general · no está en el manual
        </span>
      )}
    </>
  );
}

export function AssistantCompanion() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const { messages, loading, error, send, clear } = useChat();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const current = findModule(location.pathname);
  const suggestions = current?.suggestions ?? GENERAL;
  const hasConversation = messages.some(m => m.role === 'user');

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, loading, open]);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!isAuthenticated || HIDDEN_PREFIXES.some(p => location.pathname.startsWith(p))) return null;

  const ask = (question: string) => {
    if (!question.trim() || loading) return;
    send(question.trim(), current?.label);
    setText('');
  };

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Asistente de Inteegrados"
          className="fixed inset-0 z-50 flex flex-col bg-white sm:inset-auto sm:bottom-24 sm:right-5 sm:h-[min(600px,calc(100vh-8rem))] sm:w-[380px] sm:rounded-2xl sm:border sm:border-gray-200 sm:shadow-2xl overflow-hidden"
        >
          <header className="flex items-center gap-3 bg-gradient-to-r from-[#006330] to-[#008C3C] px-4 py-3 text-white">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15"><Sparkles className="h-5 w-5 text-[#7BCB6A]" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">Asistente de Inteegrados</p>
              <p className="truncate text-[11px] text-green-100">{current ? `Te acompaño en ${current.label}` : 'Uso de la plataforma, preguntas de cuestionarios y dudas de TH'}</p>
            </div>
            {hasConversation && (
              <button onClick={clear} disabled={loading} title="Nueva conversación" className="rounded-lg p-1.5 hover:bg-white/15 disabled:opacity-50"><RotateCcw className="h-4 w-4" /></button>
            )}
            <button onClick={() => setOpen(false)} title="Cerrar" className="rounded-lg p-1.5 hover:bg-white/15"><X className="h-4 w-4" /></button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-gray-50 px-4 py-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === 'user' ? 'rounded-br-md bg-[#008C3C] text-white' : 'rounded-bl-md border border-gray-100 bg-white text-gray-800 shadow-sm'
                }`}>
                  {m.role === 'user' ? <span className="whitespace-pre-wrap">{m.content}</span> : renderReply(m.content)}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Pensando…</div>
            )}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
            )}

            {!hasConversation && !loading && (
              <div className="space-y-2 pt-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Preguntas frecuentes{current ? ` · ${current.label}` : ''}</p>
                {suggestions.map(q => (
                  <button key={q} onClick={() => ask(q)} className="block w-full rounded-xl border border-[#008C3C]/20 bg-white px-3 py-2 text-left text-sm text-[#006C2F] hover:border-[#008C3C]/50 hover:bg-[#008C3C]/5">
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={e => { e.preventDefault(); ask(text); }} className="flex items-end gap-2 border-t border-gray-100 bg-white p-3">
            <textarea
              id="assistant-input"
              ref={inputRef}
              rows={1}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(text); } }}
              placeholder="Pregunta cómo hacer algo o pide ideas de preguntas…"
              className="max-h-28 flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#008C3C]/40"
            />
            <button type="submit" disabled={!text.trim() || loading} title="Enviar" className="rounded-xl bg-[#008C3C] p-2.5 text-white hover:bg-[#006C2F] disabled:opacity-40">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen(v => !v)}
        aria-label={open ? 'Cerrar asistente' : 'Abrir asistente'}
        className={`fixed bottom-8 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#008C3C] to-[#006330] text-white shadow-lg transition-transform hover:scale-105 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#7BCB6A]/50 ${open ? 'hidden sm:flex' : 'flex'}`}
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </button>
    </>
  );
}
