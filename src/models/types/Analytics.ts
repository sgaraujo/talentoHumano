export interface RotationMetrics {
  // KPIs principales
  totalIngresos: number;
  totalRetiros: number;
  headcount: number;
  tiempoPromedioEmpresa: number; // en meses
  
  // Tasas
  rotacionGeneral: number; // porcentaje
  rotacionVoluntaria: number;
  rotacionEvitable: number;
  tasaVoluntaria: number;
  tasaVoluntariaExterna: number;
  cubrimiento: number;
  
  // Comparativas
  voluntarioVsInvoluntario: {
    voluntario: number;
    involuntario: number;
  };
  
  externoVsInterno: {
    externo: number;
    interno: number;
  };
  
  // Tendencias mensuales
  ingresosPorMes: MonthlyData[];
  retirosPorMes: MonthlyData[];
  
  // Costos
  costoRetiros: number;
  fracasoContratacion: number;
  costoRetirosTemprano: number;
  
  // Retiros tempranos
  retirosTempranos: number;
}

export interface MonthlyData {
  month: string;
  year: number;
  ingresos: number;
  retiros: number;
  rotacion: number;
  rotacionEvitable: number;
}

export interface FilterOptions {
  tipoContrato?: string;
  mes?: number;
  año?: number;
  empresa?: string;
  sede?: string;
  nivelJerarquico?: string;
  area?: string;
}

export interface MovementRecord {
  id: string;
  type: 'ingreso' | 'retiro';
  userId: string;
  userName: string;
  userEmail: string;
  date: Date;
  reason?: string; // voluntario, involuntario
  company?: string;
  sede?: string;
  area?: string;
  cost?: number;
  notes?: string;
  createdAt: Date;
  createdBy: string;
}