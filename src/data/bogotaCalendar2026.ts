// Calendario Tributario de Bogotá 2026
// Fuente: Secretaría Distrital de Hacienda — Resolución SDH 007/05 de 2025
// Las fechas de ICA y ReteICA aplican igual para todas las empresas (no dependen del dígito NIT)

export interface BogotaObligation {
  taxType: string;
  category: 'ICA' | 'Predial' | 'Vehículos' | 'ReteICA';
  period: string;
  dueDate: string; // YYYY-MM-DD
  scope: 'Distrital';
  note?: string;
}

// ── ICA Bimestral 2026 ────────────────────────────────────────────────────────
// Aplica a contribuyentes con impuesto a cargo en 2025 superior a 391 UVT
export const ICA_BIMESTRAL_BOGOTA_2026: BogotaObligation[] = [
  { taxType: 'ICA Bimestral', category: 'ICA', period: 'Bimestre 1', dueDate: '2026-04-10', scope: 'Distrital' },
  { taxType: 'ICA Bimestral', category: 'ICA', period: 'Bimestre 2', dueDate: '2026-06-12', scope: 'Distrital' },
  { taxType: 'ICA Bimestral', category: 'ICA', period: 'Bimestre 3', dueDate: '2026-08-21', scope: 'Distrital' },
  { taxType: 'ICA Bimestral', category: 'ICA', period: 'Bimestre 4', dueDate: '2026-10-09', scope: 'Distrital' },
  { taxType: 'ICA Bimestral', category: 'ICA', period: 'Bimestre 5', dueDate: '2026-12-11', scope: 'Distrital' },
  { taxType: 'ICA Bimestral', category: 'ICA', period: 'Bimestre 6', dueDate: '2027-02-12', scope: 'Distrital' },
];

// ── ICA Anual 2026 ────────────────────────────────────────────────────────────
// Para contribuyentes de régimen común y preferencial
export const ICA_ANUAL_BOGOTA_2026: BogotaObligation[] = [
  { taxType: 'ICA Régimen Común', category: 'ICA', period: 'ICA Anual 2026', dueDate: '2027-02-26', scope: 'Distrital', note: 'Régimen Común anual' },
  { taxType: 'ICA Régimen Preferencial', category: 'ICA', period: 'ICA Anual 2026', dueDate: '2027-02-26', scope: 'Distrital', note: 'Régimen Preferencial anual' },
];

// ── ReteICA 2026 ──────────────────────────────────────────────────────────────
// Retención del Impuesto de Industria y Comercio — bimestral
export const RETEICA_BOGOTA_2026: BogotaObligation[] = [
  { taxType: 'ReteICA', category: 'ReteICA', period: 'Bimestre 1', dueDate: '2026-03-20', scope: 'Distrital' },
  { taxType: 'ReteICA', category: 'ReteICA', period: 'Bimestre 2', dueDate: '2026-05-22', scope: 'Distrital' },
  { taxType: 'ReteICA', category: 'ReteICA', period: 'Bimestre 3', dueDate: '2026-07-17', scope: 'Distrital' },
  { taxType: 'ReteICA', category: 'ReteICA', period: 'Bimestre 4', dueDate: '2026-09-18', scope: 'Distrital' },
  { taxType: 'ReteICA', category: 'ReteICA', period: 'Bimestre 5', dueDate: '2026-11-20', scope: 'Distrital' },
  { taxType: 'ReteICA', category: 'ReteICA', period: 'Bimestre 6', dueDate: '2027-01-15', scope: 'Distrital' },
];

// ── Predial 2026 ──────────────────────────────────────────────────────────────
export const PREDIAL_BOGOTA_2026: BogotaObligation[] = [
  { taxType: 'Predial', category: 'Predial', period: 'Predial 2026 (con dcto)', dueDate: '2026-04-17', scope: 'Distrital', note: '10% de descuento por pronto pago' },
  { taxType: 'Predial', category: 'Predial', period: 'Predial 2026 (sin dcto)', dueDate: '2026-07-10', scope: 'Distrital', note: 'Pago sin descuento' },
];

// ── Vehículos 2026 ────────────────────────────────────────────────────────────
export const VEHICULOS_BOGOTA_2026: BogotaObligation[] = [
  { taxType: 'Vehículos', category: 'Vehículos', period: 'Vehículos 2026 (con dcto)', dueDate: '2026-05-15', scope: 'Distrital', note: '10% de descuento por pronto pago' },
  { taxType: 'Vehículos', category: 'Vehículos', period: 'Vehículos 2026 (sin dcto)', dueDate: '2026-07-24', scope: 'Distrital', note: 'Pago sin descuento' },
];

// ── Todos los vencimientos de Bogotá 2026 ────────────────────────────────────
export const ALL_BOGOTA_2026: BogotaObligation[] = [
  ...RETEICA_BOGOTA_2026,
  ...PREDIAL_BOGOTA_2026,
  ...VEHICULOS_BOGOTA_2026,
  ...ICA_BIMESTRAL_BOGOTA_2026,
  ...ICA_ANUAL_BOGOTA_2026,
].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

// ── Helper: obtener obligaciones próximas de Bogotá ───────────────────────────
export function getUpcomingBogotaObligations(daysAhead = 60): BogotaObligation[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const limit = new Date(today); limit.setDate(limit.getDate() + daysAhead);
  return ALL_BOGOTA_2026.filter(o => {
    const d = new Date(o.dueDate + 'T00:00:00');
    return d >= today && d <= limit;
  });
}
