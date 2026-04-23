import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, CheckCircle2, ClipboardList, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { Questionnaire, Question } from "@/models/types/Questionnaire";
import { functions } from "@/config/firebase";
import { httpsCallable } from "firebase/functions";

// ─── brand header ─────────────────────────────────────────────────────────────
function Header() {
  return (
    <div className="bg-gradient-to-r from-[#005528] to-[#008C3C] py-5 px-6 text-center">
      <h1 className="text-white text-2xl font-black tracking-[4px]">
        INTE<span className="text-[#7BCB6A]">E</span>GRADOS
      </h1>
      <p className="text-[#7BCB6A] text-[11px] tracking-widest mt-0.5 uppercase">
        Gestión de Talento Humano
      </p>
    </div>
  );
}

// ─── progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div
        className="h-2 rounded-full bg-[#008C3C] transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────
export const AnswerQuestionnairePage = () => {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [assignment, setAssignment] = useState<any>(null);
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null);
  const [answers, setAnswers]     = useState<Record<string, any>>({});
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    (httpsCallable(functions, "getPublicAssignment") as any)({ token })
      .then((res: any) => {
        const data = res?.data;
        if (!data?.assignment || (!data?.questionnaire && data?.assignment?.status !== "completed")) {
          toast.error("Link inválido o expirado");
          return;
        }
        if (data.assignment.status === "completed") { setCompleted(true); return; }
        if (data.questionnaire?.active === false) {
          toast.error("Este cuestionario ya no está activo");
          return;
        }
        setAssignment(data.assignment);
        setQuestionnaire(data.questionnaire);
      })
      .catch((e: any) => {
        toast.error("Cuestionario no disponible", { description: e?.message });
      })
      .finally(() => setLoading(false));
  }, [token]);

  const answeredCount = questionnaire
    ? questionnaire.questions.filter(q => {
        const a = answers[q.id];
        return a !== undefined && a !== "" && !(Array.isArray(a) && a.length === 0);
      }).length
    : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionnaire) return;

    const missing = questionnaire.questions.filter(q => {
      if (!q.required) return false;
      const a = answers[q.id];
      return !a || (Array.isArray(a) && a.length === 0);
    });
    if (missing.length > 0) {
      toast.error("Campos requeridos", { description: `Responde: ${missing[0].text}` });
      return;
    }

    setSubmitting(true);
    try {
      await (httpsCallable(functions, "submitPublicResponse") as any)({ token, answers });
      toast.success("¡Respuesta enviada correctamente!");
      setCompleted(true);
    } catch (err: any) {
      toast.error("Error al enviar", { description: err?.message });
    } finally {
      setSubmitting(false);
    }
  };

  const renderQuestion = (question: Question) => {
    const base = "mt-1";
    switch (question.type) {
      case "text":
        return (
          <Input
            className={`${base} border-gray-200 focus-visible:ring-[#008C3C]`}
            value={answers[question.id] || ""}
            onChange={e => setAnswers(p => ({ ...p, [question.id]: e.target.value }))}
            placeholder="Tu respuesta"
          />
        );
      case "textarea":
        return (
          <Textarea
            className={`${base} border-gray-200 focus-visible:ring-[#008C3C]`}
            value={answers[question.id] || ""}
            onChange={e => setAnswers(p => ({ ...p, [question.id]: e.target.value }))}
            placeholder="Tu respuesta"
            rows={4}
          />
        );
      case "select":
        return (
          <RadioGroup
            value={answers[question.id] || ""}
            onValueChange={v => setAnswers(p => ({ ...p, [question.id]: v }))}
            className="mt-2 space-y-2"
          >
            {question.options?.map(opt => (
              <div key={opt.id}
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors
                  ${answers[question.id] === opt.value
                    ? 'border-[#008C3C] bg-[#008C3C]/5'
                    : 'border-gray-200 hover:border-[#008C3C]/40'}`}
                onClick={() => setAnswers(p => ({ ...p, [question.id]: opt.value }))}
              >
                <RadioGroupItem value={opt.value} id={opt.id} className="text-[#008C3C]" />
                <Label htmlFor={opt.id} className="cursor-pointer font-normal text-gray-700">
                  {opt.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        );
      case "multiple":
        return (
          <div className="mt-2 space-y-2">
            {question.options?.map(opt => {
              const checked = ((answers[question.id] as string[]) || []).includes(opt.value);
              return (
                <div key={opt.id}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors
                    ${checked ? 'border-[#008C3C] bg-[#008C3C]/5' : 'border-gray-200 hover:border-[#008C3C]/40'}`}
                  onClick={() => {
                    setAnswers(p => {
                      const cur: string[] = (p[question.id] as string[]) || [];
                      return {
                        ...p,
                        [question.id]: cur.includes(opt.value)
                          ? cur.filter(v => v !== opt.value)
                          : [...cur, opt.value],
                      };
                    });
                  }}
                >
                  <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors
                    ${checked ? 'bg-[#008C3C] border-[#008C3C]' : 'border-gray-300 bg-white'}`}>
                    {checked && (
                      <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8"
                          strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <span className="font-normal text-gray-700 text-sm">{opt.label}</span>
                </div>
              );
            })}
          </div>
        );
      case "rating":
        return (
          <div className="flex gap-2 mt-2 flex-wrap">
            {[1, 2, 3, 4, 5].map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setAnswers(p => ({ ...p, [question.id]: r.toString() }))}
                className={`w-12 h-12 rounded-full font-bold text-base transition-colors
                  ${answers[question.id] === r.toString()
                    ? 'bg-[#008C3C] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-[#008C3C]/10'}`}
              >
                {r}
              </button>
            ))}
          </div>
        );
      case "date":
        return (
          <Input
            type="date"
            className={`${base} border-gray-200 focus-visible:ring-[#008C3C]`}
            value={answers[question.id] || ""}
            onChange={e => setAnswers(p => ({ ...p, [question.id]: e.target.value }))}
          />
        );
      case "number":
        return (
          <Input
            type="number"
            className={`${base} border-gray-200 focus-visible:ring-[#008C3C]`}
            value={answers[question.id] || ""}
            onChange={e => setAnswers(p => ({ ...p, [question.id]: e.target.value }))}
            placeholder="0"
          />
        );
      default:
        return null;
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Loader2 className="w-10 h-10 animate-spin text-[#008C3C] mx-auto" />
            <p className="text-gray-500 text-sm">Cargando cuestionario…</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Completed ────────────────────────────────────────────────────────────
  if (completed) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md w-full text-center">
            <div className="w-20 h-20 rounded-full bg-[#008C3C]/10 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-10 h-10 text-[#008C3C]" />
            </div>
            <h2 className="text-2xl font-bold text-[#4A4A4A] mb-2">¡Gracias!</h2>
            <p className="text-gray-600 font-medium mb-1">
              Tus respuestas fueron guardadas correctamente.
            </p>
            <p className="text-gray-400 text-sm">
              Nos alegra tenerte en el equipo. Seguiremos en contacto
              para acompañarte en tu proceso. ¡Bienvenido/a a Inteegrados!
            </p>
          </div>
        </div>
        <footer className="py-4 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} Inteegrados
        </footer>
      </div>
    );
  }

  // ── Invalid / not found ───────────────────────────────────────────────────
  if (!questionnaire || !assignment) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <ClipboardList className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-[#4A4A4A] mb-2">Cuestionario no disponible</h2>
            <p className="text-gray-400 text-sm">
              Este enlace no es válido o el cuestionario ya no está activo.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const questions = [...(questionnaire.questions ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const total = questions.length;

  // ── Questionnaire form ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />

      {/* Sticky info bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="font-semibold text-[#4A4A4A] text-sm leading-tight">{questionnaire.title}</p>
              <p className="text-xs text-gray-400">Respondiendo como: <span className="font-medium text-gray-600">{assignment.userName}</span></p>
            </div>
            <span className="text-xs font-semibold text-[#008C3C] bg-[#008C3C]/10 px-2.5 py-1 rounded-full">
              {answeredCount}/{total}
            </span>
          </div>
          <ProgressBar current={answeredCount} total={total} />
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 py-8 px-4">
        <div className="max-w-2xl mx-auto">

          {/* Mensaje de bienvenida */}
          <div className="mb-6 rounded-2xl overflow-hidden border border-[#008C3C]/20 shadow-sm">
            <div className="bg-gradient-to-r from-[#005528] to-[#008C3C] px-5 py-4">
              <p className="text-white font-bold text-base leading-snug">
                ¡Hola, {assignment.userName}! 👋
              </p>
              <p className="text-[#c6f0d4] text-sm mt-0.5">
                Nos alegra tenerte en el equipo de Inteegrados
              </p>
            </div>
            <div className="bg-white px-5 py-4 space-y-2 text-sm text-gray-600 leading-relaxed">
              {questionnaire.description && (
                <p className="mt-2 pt-2 border-t border-gray-100 text-gray-500 italic">
                  {questionnaire.description}
                </p>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {questions.map((question, idx) => {
              const answered = (() => {
                const a = answers[question.id];
                return a !== undefined && a !== "" && !(Array.isArray(a) && a.length === 0);
              })();

              return (
                <div key={question.id}
                  className={`bg-white rounded-xl border transition-colors p-5
                    ${answered ? 'border-[#008C3C]/30' : 'border-gray-100'}`}>
                  <div className="flex items-start gap-3 mb-3">
                    <span className={`text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5
                      ${answered ? 'bg-[#008C3C] text-white' : 'bg-gray-100 text-gray-500'}`}>
                      {idx + 1}
                    </span>
                    <Label className="text-sm font-medium text-[#4A4A4A] leading-snug">
                      {question.text}
                      {question.required && <span className="text-red-400 ml-1">*</span>}
                    </Label>
                  </div>
                  <div className="pl-9">
                    {renderQuestion(question)}
                  </div>
                </div>
              );
            })}

            <div className="pt-4 pb-8">
              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#008C3C] hover:bg-[#006C2F] text-white h-12 text-base font-semibold rounded-xl gap-2"
              >
                {submitting
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Enviando…</>
                  : <><ChevronRight className="w-4 h-4" />Enviar respuestas</>
                }
              </Button>
            </div>
          </form>
        </div>
      </div>

      <footer className="py-4 text-center text-xs text-gray-400 border-t border-gray-100 bg-white">
        © {new Date().getFullYear()} Inteegrados · Todos los derechos reservados
      </footer>
    </div>
  );
};
