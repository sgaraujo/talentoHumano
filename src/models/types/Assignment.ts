export interface QuestionnaireAssignment {
  id: string;
  questionnaireId: string;
  userId: string;
  userEmail: string;
  userName: string;
  status: 'pending' | 'completed';
  assignedAt: Date;
  completedAt?: Date;
  responseId?: string;
  token: string; // Token único para el link
}