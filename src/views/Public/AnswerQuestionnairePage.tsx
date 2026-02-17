import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";

import { Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";

import type { Questionnaire, Question } from "@/models/types/Questionnaire";

import { functions } from "@/config/firebase";
import { httpsCallable } from "firebase/functions";

export const AnswerQuestionnairePage = () => {
  
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [assignment, setAssignment] = useState<any>(null);
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null);

  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [completed, setCompleted] = useState(false);

  // ✅ Cargar asignación pública + cuestionario por token
  useEffect(() => {
    const run = async () => {
      if (!token) {
        setLoading(false);
        setAssignment(null);
        setQuestionnaire(null);
        return;
      }

      setLoading(true);
      try {
        const getPublicAssignment = httpsCallable(functions, "getPublicAssignment");
        const res: any = await getPublicAssignment({ token });
        const data = res?.data;

        if (!data?.assignment || !data?.questionnaire) {
          setAssignment(null);
          setQuestionnaire(null);
          toast.error("Link inválido o expirado");
          return;
        }

        if (data.assignment.status === "completed") {
          setCompleted(true);
          return;
        }

        if (data.questionnaire?.active === false) {
          toast.error("Este cuestionario ya no está activo");
          setAssignment(null);
          setQuestionnaire(null);
          return;
        }

        setAssignment(data.assignment);
        setQuestionnaire(data.questionnaire);
      } catch (e: any) {
        console.error("getPublicAssignment error:", e);
        toast.error("Cuestionario no disponible", {
          description: e?.message || "No se pudo cargar el cuestionario.",
        });
        setAssignment(null);
        setQuestionnaire(null);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [token]);

  const handleAnswerChange = (questionId: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleMultipleChoice = (
    questionId: string,
    optionValue: string,
    checked: boolean
  ) => {
    setAnswers((prev) => {
      const current = prev[questionId] || [];
      if (checked) return { ...prev, [questionId]: [...current, optionValue] };
      return { ...prev, [questionId]: current.filter((v: string) => v !== optionValue) };
    });
  };

  const validateAnswers = () => {
    if (!questionnaire) return false;

    const requiredQuestions = questionnaire.questions.filter((q) => q.required);
    for (const question of requiredQuestions) {
      const answer = answers[question.id];
      if (!answer || (Array.isArray(answer) && answer.length === 0)) {
        toast.error("Campos requeridos", {
          description: `Por favor responde: ${question.text}`,
        });
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAnswers()) return;

    setSubmitting(true);

    try {
      const submitPublicResponse = httpsCallable(functions, "submitPublicResponse");
      await submitPublicResponse({ token, answers });

      toast.success("¡Respuesta enviada!", {
        description: questionnaire!.isOnboarding
          ? "Tu perfil ha sido actualizado exitosamente."
          : "Gracias por completar el cuestionario.",
      });

      setCompleted(true);
    } catch (error: any) {
      console.error("Error guardando respuesta:", error);
      toast.error("Error al enviar respuesta", {
        description: error?.message || String(error),
      });
    } finally {
      setSubmitting(false);
    }
  };



  const renderQuestion = (question: Question) => {
    switch (question.type) {
      case "text":
        return (
          <Input
            value={answers[question.id] || ""}
            onChange={(e) => handleAnswerChange(question.id, e.target.value)}
            placeholder="Tu respuesta"
            required={question.required}
          />
        );

      case "textarea":
        return (
          <Textarea
            value={answers[question.id] || ""}
            onChange={(e) => handleAnswerChange(question.id, e.target.value)}
            placeholder="Tu respuesta"
            rows={4}
            required={question.required}
          />
        );

      case "select":
        return (
          <RadioGroup
            value={answers[question.id] || ""}
            onValueChange={(value) => handleAnswerChange(question.id, value)}
          >
            {question.options?.map((option) => (
              <div key={option.id} className="flex items-center space-x-2">
                <RadioGroupItem value={option.value} id={option.id} />
                <Label htmlFor={option.id} className="cursor-pointer">
                  {option.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        );

      case "multiple":
        return (
          <div className="space-y-2">
            {question.options?.map((option) => (
              <div key={option.id} className="flex items-center space-x-2">
                <Checkbox
                  id={option.id}
                  checked={(answers[question.id] || []).includes(option.value)}
                  onCheckedChange={(checked) =>
                    handleMultipleChoice(question.id, option.value, checked as boolean)
                  }
                />
                <Label htmlFor={option.id} className="cursor-pointer">
                  {option.label}
                </Label>
              </div>
            ))}
          </div>
        );

      case "rating":
        return (
          <RadioGroup
            value={answers[question.id] || ""}
            onValueChange={(value) => handleAnswerChange(question.id, value)}
            className="flex gap-2"
          >
            {[1, 2, 3, 4, 5].map((rating) => (
              <div key={rating} className="flex flex-col items-center">
                <RadioGroupItem value={rating.toString()} id={`${question.id}-${rating}`} />
                <Label htmlFor={`${question.id}-${rating}`} className="cursor-pointer text-sm">
                  {rating}
                </Label>
              </div>
            ))}
          </RadioGroup>
        );

      case "date":
        return (
          <Input
            type="date"
            value={answers[question.id] || ""}
            onChange={(e) => handleAnswerChange(question.id, e.target.value)}
            required={question.required}
          />
        );

      case "number":
        return (
          <Input
            type="number"
            value={answers[question.id] || ""}
            onChange={(e) => handleAnswerChange(question.id, e.target.value)}
            placeholder="0"
            required={question.required}
          />
        );

      default:
        return null;
    }
  };

  // =========================
  // UI STATES
  // =========================

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (completed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">¡Completado!</CardTitle>
            <CardDescription>
              Ya respondiste este cuestionario. Gracias por tu participación.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // ✅ Token inválido / sin datos
  if (!questionnaire || !assignment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle>Cuestionario no disponible</CardTitle>
            <CardDescription>
              Este link no es válido o el cuestionario ya no está activo.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // ✅ Render del cuestionario
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 py-12">
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">{questionnaire.title}</CardTitle>
            <CardDescription className="text-base mt-2">
              {questionnaire.description}
            </CardDescription>
            <div className="mt-4 text-sm text-gray-600">
              Respondiendo como: <strong>{assignment.userName}</strong>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-8">
              {questionnaire.questions
                .sort((a, b) => a.order - b.order)
                .map((question, index) => (
                  <div key={question.id} className="space-y-3">
                    <Label className="text-lg font-medium">
                      {index + 1}. {question.text}
                      {question.required && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    {renderQuestion(question)}
                  </div>
                ))}

              <div className="flex justify-end gap-4 pt-6">
                <Button
                  type="submit"
                  size="lg"
                  disabled={submitting}
                  className="min-w-[200px]"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    "Enviar Respuestas"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
