export type CommunicationTarget = 'all' | 'company' | 'project' | 'manual';
export type CommunicationStatus = 'draft' | 'sent';
export type RecipientStatus     = 'pending' | 'read' | 'failed';

export interface CommunicationAttachment {
  name: string;
  url: string;
  link?: string;
}

export interface Communication {
  id: string;
  title: string;
  body: string;
  sentAt: Date;
  sentBy: string;
  targetType: CommunicationTarget;
  targetId?: string;
  targetName?: string;
  totalSent: number;
  totalRead: number;
  status: CommunicationStatus;
  requiresAck?: boolean;
  attachments?: CommunicationAttachment[];
  ctaButton?: { text: string; url: string };
  questionnaireId?: string;
  questionnaireName?: string;
}

export interface CommunicationRecipient {
  id: string;
  communicationId: string;
  userId: string;
  userName: string;
  userEmail: string;
  company: string;
  project: string;
  token: string;
  quizToken?: string;
  status: RecipientStatus;
  readAt?: Date;
  ackAt?: Date;
  quizSubmittedAt?: Date;
  emailStatus: 'sent' | 'failed' | 'pending';
  sentAt: Date;
}
