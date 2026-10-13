import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import type { Question, QuestionType } from '@/models/types/Questionnaire';

// Borrador de cuestionario generado con IA (Cloud Function generateQuestionnaire).

export type QuestionnaireTarget = 'all' | 'colaborador' | 'aspirante' | 'excolaborador';

interface GeneratedDraft {
  title: string;
  description: string;
  questions: Array<{ text: string; type: QuestionType; required: boolean; options: string[] }>;
}

export interface QuestionnaireDraft { title: string; description: string; questions: Question[] }

const generate = httpsCallable<{ prompt: string; targetRole: QuestionnaireTarget }, GeneratedDraft>(functions, 'generateQuestionnaire');

// Mismo formato de valor que usa el editor al escribir una opción.
const optionValue = (label: string) => label.toLowerCase().replace(/\s+/g, '_');

export async function generateQuestionnaireDraft(prompt: string, targetRole: QuestionnaireTarget): Promise<QuestionnaireDraft> {
  const { data } = await generate({ prompt, targetRole });
  const stamp = Date.now();
  return {
    title: data.title,
    description: data.description,
    questions: data.questions.map((question, index) => ({
      id: `q_ai_${stamp}_${index}`,
      text: question.text,
      type: question.type,
      required: question.required,
      order: index,
      ...(question.options.length
        ? { options: question.options.map((label, i) => ({ id: `opt_ai_${stamp}_${index}_${i}`, label, value: optionValue(label) })) }
        : {}),
    })),
  };
}
