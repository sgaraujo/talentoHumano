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

  // Base de headcount usada en rotacionGeneral/rotacionVoluntaria (para mostrar
  // debajo de las tarjetas, ej. "Base: headcount promedio Ene–Ago 2026")
  headcountBaseLabel: string;
  headcountPromedio: number;
  
  // Comparativas
  voluntarioVsInvoluntario: {
    voluntario: number;
    involuntario: number;
  };

  externoVsInterno: {
    externo: number;
    interno: number;
  };

  // Desglose por motivo de retiro
  motivosRetiro: Record<string, number>;
  retirosPorEmpresa: { empresa: string; count: number }[];

  // Headcount por proyecto
  headcountPorProyecto: { proyecto: string; empresa: string; count: number }[];
  
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
  proyecto?: string;
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
  reason?: string;
  company?: string;
  project?: string;
  sede?: string;
  area?: string;
  cost?: number;
  notes?: string;
  createdAt: Date;
  createdBy: string;
}
