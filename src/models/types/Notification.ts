export type NotificationType = 
  | 'birthday'           // Cumpleaños
  | 'work_anniversary'   // Aniversario laboral
  | 'probation_end'      // Fin de periodo de prueba
  | 'contract_start'     // Inicio de contrato
  | 'contract_end';      // Fin de contrato

export interface Notification {
  id: string;
  type: NotificationType;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  date: Date;
  title: string;
  description: string;
  read: boolean;
  createdAt: Date;
}

export interface NotificationEvent {
  id: string;
  type: NotificationType;
  userId: string;
  userName: string;
  date: Date;
  title: string;
  daysUntil: number; // Días que faltan
}