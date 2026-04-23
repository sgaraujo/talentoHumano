export type TaxStatus =
  | ''
  | 'No iniciado'
  | 'Revisado'
  | 'Presentado'
  | 'Informe Enviado'
  | 'No aplica'
  | 'Pagado';

export type ObligationType = 'Impuestos' | 'Información Exógena' | 'Reportes' | string;

export interface TaxAttachment {
  name: string;
  url: string;
  size?: number;    // bytes
  uploadedAt?: string; // ISO string
}

export interface TaxObligation {
  id: string;
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
  updatedAt?: Date;
  createdAt?: Date;
}
