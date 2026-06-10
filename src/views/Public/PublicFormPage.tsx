import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, CheckCircle2, ClipboardList, User, Mail } from "lucide-react";
import { toast } from "sonner";
import { functions } from "@/config/firebase";
import { httpsCallable } from "firebase/functions";
import type { Questionnaire, Question } from "@/models/types/Questionnaire";

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

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className="h-2 rounded-full bg-[#008C3C] transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

type Step = "identity" | "form" | "done" | "already" | "unavailable";

export const PublicFormPage = () => {
  const { questionnaireId } = useParams<{ questionnaireId: string }>();

  const [loadingQ, setLoadingQ] = useState(true);
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null);
  const [step, setStep] = useState<Step>("identity");

  // Identity
  const [name, setName]   = useState("");
  const [email, setEmail] = useState("");

  // Answers
  const [answers, setAnswers]     = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!questionnaireId) { setLoadingQ(false); setStep("unavailable"); return; }
    httpsCallable(functions, "getPublicQuestionnaire")({ questionnaireId })
      .then((res: any) => {
        const data = res?.data;
        if (!data?.id) { setStep("unavailable"); return; }
        setQuestionnaire(data as Questionnaire);
      })
      .catch(() => setStep("unavailable"))
      .finally(() => setLoadingQ(false));
  }, [questionnaireId]);

  const handleIdentitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Escribe tu nombre"); return; }
    if (!email.trim() || !email.includes("@")) { toast.error("Ingresa un correo válido"); return; }
    setStep("form");
  };

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
      await httpsCallable(functions, "submitPublicFormResponse")({
        questionnaireId,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        answers,
      });
      setStep("done");
    } catch (err: any) {
      const code = err?.code ?? "";
      if (code.includes("already-exists")) {
        setStep("already");
      } else {
        toast.error("Error al enviar", { description: err?.message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderQuestion = (question: Question) => {
    switch (question.type) {
      case "text":
        return (
          <Input
            className="mt-1 border-gray-200 focus-visible:ring-[#008C3C]"
            value={answers[question.id] || ""}
            onChange={e => setAnswers(p => ({ ...p, [question.id]: e.target.value }))}
            placeholder="Tu respuesta"
          />
        );
      case "textarea":
        return (
          <Textarea
            className="mt-1 border-gray-200 focus-visible:ring-[#008C3C]"
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
              <div
                key={opt.id}
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors
                  ${answers[question.id] === opt.value
                    ? "border-[#008C3C] bg-[#008C3C]/5"
                    : "border-gray-200 hover:border-[#008C3C]/40"}`}
                onClick={() => setAnswers(p => ({ ...p, [question.id]: opt.value }))}
              >
                <RadioGroupItem value={opt.value} id={opt.id} className="text-[#008C3C]" />
                <Label htmlFor={opt.id} className="cursor-pointer font-normal text-gray-700">{opt.label}</Label>
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
                <div
                  key={opt.id}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors
                    ${checked ? "border-[#008C3C] bg-[#008C3C]/5" : "border-gray-200 hover:border-[#008C3C]/40"}`}
                  onClick={() =>
                    setAnswers(p => {
                      const cur: string[] = (p[question.id] as string[]) || [];
                      return { ...p, [question.id]: cur.includes(opt.value) ? cur.filter(v => v !== opt.value) : [...cur, opt.value] };
                    })
                  }
                >
                  <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors
                    ${checked ? "bg-[#008C3C] border-[#008C3C]" : "border-gray-300 bg-white"}`}>
                    {checked && (
                      <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
                    ? "bg-[#008C3C] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-[#008C3C]/10"}`}
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
            className="mt-1 border-gray-200 focus-visible:ring-[#008C3C]"
            value={answers[question.id] || ""}
            onChange={e => setAnswers(p => ({ ...p, [question.id]: e.target.value }))}
          />
        );
      case "number":
        return (
          <Input
            type="number"
            className="mt-1 border-gray-200 focus-visible:ring-[#008C3C]"
            value={answers[question.id] || ""}
            onChange={e => setAnswers(p => ({ ...p, [question.id]: e.target.value }))}
            placeholder="0"
          />
        );
      default:
        return null;
    }
  };

  const answeredCount = questionnaire
    ? questionnaire.questions.filter(q => {
        const a = answers[q.id];
        return a !== undefined && a !== "" && !(Array.isArray(a) && a.length === 0);
      }).length
    : 0;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loadingQ) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#008C3C]" />
        </div>
      </div>
    );
  }

  // ── No disponible ─────────────────────────────────────────────────────────
  if (step === "unavailable") {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <ClipboardList className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-[#4A4A4A] mb-2">Formulario no disponible</h2>
            <p className="text-gray-400 text-sm">
              Este enlace no es válido o el formulario ya no está activo.
            </p>
          </div>
        </div>
        <footer className="py-4 text-center text-xs text-gray-400">© {new Date().getFullYear()} Inteegrados</footer>
      </div>
    );
  }

  // ── Ya respondió ──────────────────────────────────────────────────────────
  if (step === "already") {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md w-full text-center">
            <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-10 h-10 text-blue-500" />
            </div>
            <h2 className="text-2xl font-bold text-[#4A4A4A] mb-2">Ya respondiste</h2>
            <p className="text-gray-500 text-sm">
              El correo <strong>{email}</strong> ya completó este formulario anteriormente.
            </p>
          </div>
        </div>
        <footer className="py-4 text-center text-xs text-gray-400">© {new Date().getFullYear()} Inteegrados</footer>
      </div>
    );
  }

  // ── Completado ────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md w-full text-center">
            <div className="w-20 h-20 rounded-full bg-[#008C3C]/10 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-10 h-10 text-[#008C3C]" />
            </div>
            <h2 className="text-2xl font-bold text-[#4A4A4A] mb-2">¡Gracias, {name.split(" ")[0]}!</h2>
            <p className="text-gray-600 font-medium mb-1">Tus respuestas fueron guardadas correctamente.</p>
            <p className="text-gray-400 text-sm">Puedes cerrar esta ventana.</p>
          </div>
        </div>
        <footer className="py-4 text-center text-xs text-gray-400">© {new Date().getFullYear()} Inteegrados</footer>
      </div>
    );
  }

  // ── Pantalla de identidad ─────────────────────────────────────────────────
  if (step === "identity") {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md w-full">
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-[#008C3C]/10 flex items-center justify-center mx-auto mb-3">
                <ClipboardList className="w-7 h-7 text-[#008C3C]" />
              </div>
              <h2 className="text-xl font-bold text-[#4A4A4A]">{questionnaire?.title}</h2>
              {questionnaire?.description && (
                <p className="text-gray-500 text-sm mt-1">{questionnaire.description}</p>
              )}
              <p className="text-xs text-gray-400 mt-3">
                {questionnaire?.questions.length} pregunta{questionnaire?.questions.length !== 1 ? "s" : ""}
              </p>
            </div>

            <form onSubmit={handleIdentitySubmit} className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-1">
                  <User className="w-3.5 h-3.5" /> Nombre completo
                </Label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ej: María García"
                  className="border-gray-200 focus-visible:ring-[#008C3C]"
                  autoFocus
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-1">
                  <Mail className="w-3.5 h-3.5" /> Correo electrónico
                </Label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  className="border-gray-200 focus-visible:ring-[#008C3C]"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-[#008C3C] hover:bg-[#006B2E] text-white mt-2"
              >
                Comenzar formulario
              </Button>
            </form>
          </div>
        </div>
        <footer className="py-4 text-center text-xs text-gray-400">© {new Date().getFullYear()} Inteegrados</footer>
      </div>
    );
  }

  // ── Formulario ────────────────────────────────────────────────────────────
  if (!questionnaire) return null;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />

      <div className="flex-1 max-w-2xl mx-auto w-full p-4 pb-8 space-y-4">
        {/* Meta */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-lg font-bold text-[#4A4A4A] mb-1">{questionnaire.title}</h2>
          {questionnaire.description && (
            <p className="text-gray-500 text-sm mb-3">{questionnaire.description}</p>
          )}
          <ProgressBar current={answeredCount} total={questionnaire.questions.length} />
          <p className="text-xs text-gray-400 mt-1.5">
            {answeredCount} de {questionnaire.questions.length} respondidas
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Respondiendo como: <strong className="text-gray-600">{name}</strong> · {email}
          </p>
        </div>

        {/* Preguntas */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {[...questionnaire.questions]
            .sort((a, b) => a.order - b.order)
            .map((question, idx) => (
              <div key={question.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start gap-3 mb-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#008C3C]/10 text-[#008C3C] text-xs font-bold flex items-center justify-center mt-0.5">
                    {idx + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-gray-800 font-medium leading-snug">
                      {question.text}
                      {question.required && <span className="text-red-500 ml-1">*</span>}
                    </p>
                  </div>
                </div>
                <div className="pl-10">{renderQuestion(question)}</div>
              </div>
            ))}

          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#008C3C] hover:bg-[#006B2E] text-white h-12 text-base font-semibold"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Enviando…</>
            ) : (
              "Enviar respuestas"
            )}
          </Button>
        </form>
      </div>

      <footer className="py-4 text-center text-xs text-gray-400">© {new Date().getFullYear()} Inteegrados</footer>
    </div>
  );
};
