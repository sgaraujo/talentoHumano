export type QuestionType = 'text' | 'textarea' | 'select' | 'multiple' | 'rating' | 'date' | 'number';

export interface QuestionOption {
  id: string;
  label: string;
  value: string;
}

export type ResponseMode = 'identified' | 'anonymous';

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  options?: QuestionOption[]; // Para select y multiple
  required: boolean;
  order: number;
}

export interface Questionnaire {
  id: string;
  title: string;
  description: string;
  questions: Question[];
  targetRole?: 'colaborador' | 'aspirante' | 'excolaborador' | 'all';
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  
  // Onboarding
  isOnboarding?: boolean;
  isRequired?: boolean;
  allowMultipleCompletions?: boolean;

  // Formulario público
  isPublic?: boolean;

  // Modo de respuesta:
  // - 'identified': se guarda nombre y correo (en el formulario público se piden).
  // - 'anonymous': la respuesta se guarda sin datos de quien responde.
  // Sin definir (cuestionarios antiguos): enlace asignado = identificado, formulario público = anónimo.
  responseMode?: ResponseMode;

  // Mapeo de preguntas a campos del perfil
  fieldMappings?: Array<{
    questionId: string;
    fieldPath: string;
    overwrite?: boolean; // NUEVO: Si debe sobrescribir valores existentes
  }>;
}



export interface QuestionnaireResponse {
  id: string;
  questionnaireId: string;
  userId: string;
  userName?: string;
  userEmail?: string | null;
  anonymous?: boolean;
  answers: Record<string, any>;
  completedAt: Date;
  status: 'pending' | 'completed';

  exported?: boolean;
  exportedAt?: Date;
  exportError?: string;
}