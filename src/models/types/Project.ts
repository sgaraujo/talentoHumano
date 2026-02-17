export type ProjectStatus = 'activo' | 'inactivo' | 'completado';
export type ProjectPriority = 'baja' | 'media' | 'alta' | 'critica';

export interface Project {
  id: string;
  companyId: string;         // FK a Company
  name: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  status: ProjectStatus;
  budget?: number;
  leaderId?: string;         // userId del líder
  area?: string;
  client?: string;
  priority: ProjectPriority;
  createdAt: Date;
  updatedAt: Date;
}
