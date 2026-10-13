export interface RotationMetrics {
  // KPIs principales
  totalIngresos: number;
  totalRetiros: number;
  // Con un mes específico, es el headcount puntual de ese mes. Con "todos los
  // meses", es el promedio de los headcounts mensuales del rango (no el
  // headcount puntual del cierre, que subestima/sobreestima el tamaño real
  // del equipo durante el año).
  headcount: number;
  // Headcount puntual (foto real de personas al cierre del período, sin
  // promediar) — usar solo para reconciliar contra desgloses que también son
  // una foto puntual (ej. headcountPorProyecto), no como KPI de portada.
  headcountSnapshot: number;
  tiempoPromedioEmpresa: number; // en meses
  
  // Tasas
  rotacionGeneral: number; // porcentaje
  rotacionVoluntaria: number;
  rotacionInvoluntaria: number;
  rotacionEvitable: number;
  cubrimiento: number;

  // Base de headcount usada en rotacionGeneral/rotacionVoluntaria (para mostrar
  // debajo de las tarjetas, ej. "Base: headcount al cierre de Agosto 2026")
  headcountBaseLabel: string;
  headcountBase: number;
  
  // Comparativas
  voluntarioVsInvoluntario: {
    voluntario: number;
    involuntario: number;
  };

  // Retiros por sustitución patronal: no cuentan como voluntarios ni involuntarios.
  sustitucionPatronal: number;
  // Base de las tasas: HC promedio del mes, o promedio de los HC promedio mensuales.
  hcPromedio: number;
  // Una fila por mes del período, con las columnas de la tabla oficial de TH.
  detalleMensual: MonthlyData[];
  // Aprendices SENA (excluidos de los totales de trabajadores, informados aparte).
  aprendices: { headcount: number; ingresos: number; retiros: number };

  externoVsInterno: {
    externo: number;
    interno: number;
  };

  // Desglose por motivo de retiro
  motivosRetiro: Record<string, number>;
  retirosPorEmpresa: { empresa: string; count: number; personas: RetiredPerson[] }[];

  // Headcount por proyecto
  // count = vigentes al cierre; ingresos = nuevos ingresos del período filtrado.
  headcountPorProyecto: { proyecto: string; empresa: string; count: number; ingresos: number; personasIngreso: NewHirePerson[] }[];
  
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

export interface RetiredPerson {
  employeeId: string;
  nombre: string;
  documento: string;
  motivo: string;      // clave usada en motivosRetiro
  fechaRetiro: string; // YYYY-MM-DD
  cargo?: string;
}

export interface NewHirePerson {
  employeeId: string;
  nombre: string;
  documento: string;
  empresa: string;
  fechaIngreso: string; // YYYY-MM-DD
  cargo?: string;
  retirado: boolean;    // ya se retiró de ese contrato
}

export interface MonthlyData {
  month: string;
  year: number;
  ingresos: number;
  retiros: number;
  rotacion: number;          // retiros / HC promedio
  rotacionEvitable: number;  // = rotación voluntaria
  hcInicial: number;
  hcFinal: number;
  hcPromedio: number;
  retirosVoluntarios: number;
  retirosInvoluntarios: number;
  sustitucionPatronal: number;
  rotacionVoluntaria: number;
  rotacionInvoluntaria: number;
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
