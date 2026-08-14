export type TaxStatus =
  | ''
  | 'No iniciado'
  | 'En revisión'
  | 'Revisado'
  | 'Presentado'
  | 'Informe Enviado'
  | 'Informe Enviado RF'
  | 'Impuesto Enviado para pago' //Recordar a financiera el valor pagado obligatorio --- enviar recordatorio preguntando si pago en la fecha establecida y cambiar el booleano a true --- recordatorio un día antes de que se venza el pago y maximo el dia del vencimiento.
  | 'No aplica'
  | 'Pagado';

export type ObligationType = 'Impuestos' | 'Información Exógena' | 'Reportes' | string;

export interface StatusHistoryEntry {
  status: TaxStatus;
  changedBy: string;
  changedAt: string; // ISO string
}

export interface TaxAttachment {
  name: string;
  url: string;
  size?: number;    // bytes
  uploadedAt?: string; // ISO string
}

export interface TaxObligation {
  id: string;
  companyId?: string;     // referencia canónica a companies
  company: string;
  nit: string;
  city: string;
  scope: string;         // Nacional | Distrital
  taxType: string;
  obligationType: ObligationType;
  period: string;
  dueDate: string;       // YYYY-MM-DD
  year: string;
  status: TaxStatus;
  advisor: string;
  observation: string;
  attachments?: TaxAttachment[];
  statusHistory?: StatusHistoryEntry[];
  projected?: number;
  presented?: number;    // valor declarado/presentado ante la entidad
  paid?: number;
  paidAt?: string;       // ISO date YYYY-MM-DD — fecha de pago registrada por financiera
  presentedAt?: string;  // ISO string — fecha real de presentación ante DIAN
  accountingUser?: string;  // contabilidad que diligenció el formulario
  financieraUser?: string;  // financiera que registró el pago
  stepOwners?: Partial<Record<TaxStatus, string>>; // quién hizo cada paso
  updatedAt?: Date;
  createdAt?: Date;
}
