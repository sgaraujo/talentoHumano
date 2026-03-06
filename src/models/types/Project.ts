export type ProjectStatus   = 'activo' | 'inactivo' | 'completado';
export type ProjectPriority = 'baja' | 'media' | 'alta' | 'critica';

export interface Project {
  id: string;
  name: string;
  description?: string;

  // Referencias
  companyId: string;       // FK a Company
  companyName?: string;    // desnormalizado para display sin join

  leaderId?: string;       // userId del líder del proyecto
  leaderName?: string;     // desnormalizado

  // Clasificación
  area?: string;
  sede?: string;
  client?: string;

  // Estado
  status: ProjectStatus;
  priority: ProjectPriority;

  // Fechas
  startDate?: Date;
  endDate?: Date;

  // Contadores desnormalizados
  headcount?: number;
  budget?: number;

  createdAt: Date;
  updatedAt: Date;
}
