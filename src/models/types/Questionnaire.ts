export type QuestionType = 'text' | 'textarea' | 'select' | 'multiple' | 'rating' | 'date' | 'number';

export interface QuestionOption {
  id: string;
  label: string;
  value: string;
}

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
  isRequired?: boolean; // NUEVO: Si es obligatorio completarlo
  allowMultipleCompletions?: boolean; // NUEVO: Si se puede responder múltiples veces
  
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
  answers: Record<string, any>;
  completedAt: Date;
  status: 'pending' | 'completed';

  exported?: boolean;
  exportedAt?: Date;
  exportError?: string;
}