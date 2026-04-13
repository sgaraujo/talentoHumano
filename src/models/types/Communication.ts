export type CommunicationTarget = 'all' | 'company' | 'project' | 'manual';
export type CommunicationStatus = 'draft' | 'sent';
export type RecipientStatus     = 'pending' | 'read' | 'failed';

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
  requiresAck?: boolean; // acuse de recibo obligatorio
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
  status: RecipientStatus;
  readAt?: Date;
  ackAt?: Date;       // acuse de recibo
  emailStatus: 'sent' | 'failed' | 'pending';
  sentAt: Date;
}
