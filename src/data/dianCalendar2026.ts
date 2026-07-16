// DIAN Colombia 2026 — vencimientos por último dígito del NIT
// Fuente: Decreto 2229 del 22 de diciembre de 2023
// El dígito que determina el turno es el ÚLTIMO dígito del NIT antes del guión verificador.
// Ej: NIT 901193667-1 → último dígito = 7
import { ALL_BOGOTA_2026 } from './bogotaCalendar2026';

export type NitDigit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface DianObligation {
  taxType: string;
  category: 'Retención en la Fuente' | 'IVA' | 'Renta' | 'ICA';
  period: string;
  dueDate: string; // YYYY-MM-DD
  scope: 'Nacional' | 'Distrital';
}

// ── Retención en la Fuente 2026 ───────────────────────────────────────────────
// Periodicidad mensual — 12 meses — datos oficiales por dígito NIT
const RETEFUENTE_2026: Record<NitDigit, { period: string; dueDate: string }[]> = {
  1: [
    { period: 'Enero',      dueDate: '2026-02-10' },
    { period: 'Febrero',    dueDate: '2026-03-10' },
    { period: 'Marzo',      dueDate: '2026-04-13' },
    { period: 'Abril',      dueDate: '2026-05-12' },
    { period: 'Mayo',       dueDate: '2026-06-10' },
    { period: 'Junio',      dueDate: '2026-07-09' },
    { period: 'Julio',      dueDate: '2026-08-12' },
    { period: 'Agosto',     dueDate: '2026-09-09' },
    { period: 'Septiembre', dueDate: '2026-10-09' },
    { period: 'Octubre',    dueDate: '2026-11-11' },
    { period: 'Noviembre',  dueDate: '2026-12-10' },
    { period: 'Diciembre',  dueDate: '2027-01-13' },
  ],
  2: [
    { period: 'Enero',      dueDate: '2026-02-11' },
    { period: 'Febrero',    dueDate: '2026-03-11' },
    { period: 'Marzo',      dueDate: '2026-04-14' },
    { period: 'Abril',      dueDate: '2026-05-13' },
    { period: 'Mayo',       dueDate: '2026-06-11' },
    { period: 'Junio',      dueDate: '2026-07-10' },
    { period: 'Julio',      dueDate: '2026-08-13' },
    { period: 'Agosto',     dueDate: '2026-09-10' },
    { period: 'Septiembre', dueDate: '2026-10-12' },
    { period: 'Octubre',    dueDate: '2026-11-12' },
    { period: 'Noviembre',  dueDate: '2026-12-11' },
    { period: 'Diciembre',  dueDate: '2027-01-14' },
  ],
  3: [
    { period: 'Enero',      dueDate: '2026-02-12' },
    { period: 'Febrero',    dueDate: '2026-03-12' },
    { period: 'Marzo',      dueDate: '2026-04-15' },
    { period: 'Abril',      dueDate: '2026-05-14' },
    { period: 'Mayo',       dueDate: '2026-06-12' },
    { period: 'Junio',      dueDate: '2026-07-13' },
    { period: 'Julio',      dueDate: '2026-08-14' },
    { period: 'Agosto',     dueDate: '2026-09-11' },
    { period: 'Septiembre', dueDate: '2026-10-13' },
    { period: 'Octubre',    dueDate: '2026-11-13' },
    { period: 'Noviembre',  dueDate: '2026-12-14' },
    { period: 'Diciembre',  dueDate: '2027-01-15' },
  ],
  4: [
    { period: 'Enero',      dueDate: '2026-02-13' },
    { period: 'Febrero',    dueDate: '2026-03-13' },
    { period: 'Marzo',      dueDate: '2026-04-16' },
    { period: 'Abril',      dueDate: '2026-05-15' },
    { period: 'Mayo',       dueDate: '2026-06-16' },
    { period: 'Junio',      dueDate: '2026-07-14' },
    { period: 'Julio',      dueDate: '2026-08-18' },
    { period: 'Agosto',     dueDate: '2026-09-14' },
    { period: 'Septiembre', dueDate: '2026-10-15' },
    { period: 'Octubre',    dueDate: '2026-11-17' },
    { period: 'Noviembre',  dueDate: '2026-12-15' },
    { period: 'Diciembre',  dueDate: '2027-01-18' },
  ],
  5: [
    { period: 'Enero',      dueDate: '2026-02-16' },
    { period: 'Febrero',    dueDate: '2026-03-16' },
    { period: 'Marzo',      dueDate: '2026-04-17' },
    { period: 'Abril',      dueDate: '2026-05-19' },
    { period: 'Mayo',       dueDate: '2026-06-17' },
    { period: 'Junio',      dueDate: '2026-07-15' },
    { period: 'Julio',      dueDate: '2026-08-19' },
    { period: 'Agosto',     dueDate: '2026-09-15' },
    { period: 'Septiembre', dueDate: '2026-10-16' },
    { period: 'Octubre',    dueDate: '2026-11-18' },
    { period: 'Noviembre',  dueDate: '2026-12-16' },
    { period: 'Diciembre',  dueDate: '2027-01-19' },
  ],
  6: [
    { period: 'Enero',      dueDate: '2026-02-17' },
    { period: 'Febrero',    dueDate: '2026-03-17' },
    { period: 'Marzo',      dueDate: '2026-04-20' },
    { period: 'Abril',      dueDate: '2026-05-20' },
    { period: 'Mayo',       dueDate: '2026-06-18' },
    { period: 'Junio',      dueDate: '2026-07-16' },
    { period: 'Julio',      dueDate: '2026-08-20' },
    { period: 'Agosto',     dueDate: '2026-09-16' },
    { period: 'Septiembre', dueDate: '2026-10-19' },
    { period: 'Octubre',    dueDate: '2026-11-19' },
    { period: 'Noviembre',  dueDate: '2026-12-17' },
    { period: 'Diciembre',  dueDate: '2027-01-20' },
  ],
  7: [
    { period: 'Enero',      dueDate: '2026-02-18' },
    { period: 'Febrero',    dueDate: '2026-03-18' },
    { period: 'Marzo',      dueDate: '2026-04-21' },
    { period: 'Abril',      dueDate: '2026-05-21' },
    { period: 'Mayo',       dueDate: '2026-06-19' },
    { period: 'Junio',      dueDate: '2026-07-17' },
    { period: 'Julio',      dueDate: '2026-08-21' },
    { period: 'Agosto',     dueDate: '2026-09-17' },
    { period: 'Septiembre', dueDate: '2026-10-20' },
    { period: 'Octubre',    dueDate: '2026-11-20' },
    { period: 'Noviembre',  dueDate: '2026-12-18' },
    { period: 'Diciembre',  dueDate: '2027-01-21' },
  ],
  8: [
    { period: 'Enero',      dueDate: '2026-02-19' },
    { period: 'Febrero',    dueDate: '2026-03-19' },
    { period: 'Marzo',      dueDate: '2026-04-22' },
    { period: 'Abril',      dueDate: '2026-05-22' },
    { period: 'Mayo',       dueDate: '2026-06-22' },
    { period: 'Junio',      dueDate: '2026-07-21' },
    { period: 'Julio',      dueDate: '2026-08-24' },
    { period: 'Agosto',     dueDate: '2026-09-18' },
    { period: 'Septiembre', dueDate: '2026-10-21' },
    { period: 'Octubre',    dueDate: '2026-11-23' },
    { period: 'Noviembre',  dueDate: '2026-12-21' },
    { period: 'Diciembre',  dueDate: '2027-01-22' },
  ],
  9: [
    { period: 'Enero',      dueDate: '2026-02-20' },
    { period: 'Febrero',    dueDate: '2026-03-20' },
    { period: 'Marzo',      dueDate: '2026-04-23' },
    { period: 'Abril',      dueDate: '2026-05-25' },
    { period: 'Mayo',       dueDate: '2026-06-23' },
    { period: 'Junio',      dueDate: '2026-07-22' },
    { period: 'Julio',      dueDate: '2026-08-25' },
    { period: 'Agosto',     dueDate: '2026-09-21' },
    { period: 'Septiembre', dueDate: '2026-10-22' },
    { period: 'Octubre',    dueDate: '2026-11-24' },
    { period: 'Noviembre',  dueDate: '2026-12-22' },
    { period: 'Diciembre',  dueDate: '2027-01-25' },
  ],
  0: [
    { period: 'Enero',      dueDate: '2026-02-23' },
    { period: 'Febrero',    dueDate: '2026-03-24' },
    { period: 'Marzo',      dueDate: '2026-04-24' },
    { period: 'Abril',      dueDate: '2026-05-26' },
    { period: 'Mayo',       dueDate: '2026-06-24' },
    { period: 'Junio',      dueDate: '2026-07-23' },
    { period: 'Julio',      dueDate: '2026-08-26' },
    { period: 'Agosto',     dueDate: '2026-09-22' },
    { period: 'Septiembre', dueDate: '2026-10-23' },
    { period: 'Octubre',    dueDate: '2026-11-25' },
    { period: 'Noviembre',  dueDate: '2026-12-23' },
    { period: 'Diciembre',  dueDate: '2027-01-26' },
  ],
};

// ── Renta y Complementarios 2026 (año gravable 2025) ─────────────────────────
// Personas jurídicas y demás contribuyentes (≠ Grandes Contribuyentes)
// Decreto 2229 del 22 de diciembre de 2023
const RENTA_PJ_2026: Record<NitDigit, { period: string; dueDate: string }[]> = {
  1: [
    { period: 'Renta 2025 – Cuota 1', dueDate: '2026-05-13' },
    { period: 'Renta 2025 – Cuota 2', dueDate: '2026-07-10' },
  ],
  2: [
    { period: 'Renta 2025 – Cuota 1', dueDate: '2026-05-14' },
    { period: 'Renta 2025 – Cuota 2', dueDate: '2026-07-11' },
  ],
  3: [
    { period: 'Renta 2025 – Cuota 1', dueDate: '2026-05-15' },
    { period: 'Renta 2025 – Cuota 2', dueDate: '2026-07-14' },
  ],
  4: [
    { period: 'Renta 2025 – Cuota 1', dueDate: '2026-05-16' },
    { period: 'Renta 2025 – Cuota 2', dueDate: '2026-07-15' },
  ],
  5: [
    { period: 'Renta 2025 – Cuota 1', dueDate: '2026-05-20' },
    { period: 'Renta 2025 – Cuota 2', dueDate: '2026-07-16' },
  ],
  6: [
    { period: 'Renta 2025 – Cuota 1', dueDate: '2026-05-21' },
    { period: 'Renta 2025 – Cuota 2', dueDate: '2026-07-17' },
  ],
  7: [
    { period: 'Renta 2025 – Cuota 1', dueDate: '2026-05-22' },
    { period: 'Renta 2025 – Cuota 2', dueDate: '2026-07-18' },
  ],
  8: [
    { period: 'Renta 2025 – Cuota 1', dueDate: '2026-05-23' },
    { period: 'Renta 2025 – Cuota 2', dueDate: '2026-07-22' },
  ],
  9: [
    { period: 'Renta 2025 – Cuota 1', dueDate: '2026-05-25' },
    { period: 'Renta 2025 – Cuota 2', dueDate: '2026-07-23' },
  ],
  0: [
    { period: 'Renta 2025 – Cuota 1', dueDate: '2026-05-26' },
    { period: 'Renta 2025 – Cuota 2', dueDate: '2026-07-24' },
  ],
};

// ── Impuesto al Patrimonio 2026 ───────────────────────────────────────────────
// Cuota 1: fecha diferente por dígito | Cuota 2: misma fecha para todos (2026-09-14)
const PATRIMONIO_2026: Record<NitDigit, { period: string; dueDate: string }[]> = {
  1: [ { period: 'Patrimonio 2026 – Cuota 1', dueDate: '2026-05-13' }, { period: 'Patrimonio 2026 – Cuota 2', dueDate: '2026-09-15' } ],
  2: [ { period: 'Patrimonio 2026 – Cuota 1', dueDate: '2026-05-14' }, { period: 'Patrimonio 2026 – Cuota 2', dueDate: '2026-09-15' } ],
  3: [ { period: 'Patrimonio 2026 – Cuota 1', dueDate: '2026-05-15' }, { period: 'Patrimonio 2026 – Cuota 2', dueDate: '2026-09-15' } ],
  4: [ { period: 'Patrimonio 2026 – Cuota 1', dueDate: '2026-05-16' }, { period: 'Patrimonio 2026 – Cuota 2', dueDate: '2026-09-15' } ],
  5: [ { period: 'Patrimonio 2026 – Cuota 1', dueDate: '2026-05-20' }, { period: 'Patrimonio 2026 – Cuota 2', dueDate: '2026-09-15' } ],
  6: [ { period: 'Patrimonio 2026 – Cuota 1', dueDate: '2026-05-21' }, { period: 'Patrimonio 2026 – Cuota 2', dueDate: '2026-09-15' } ],
  7: [ { period: 'Patrimonio 2026 – Cuota 1', dueDate: '2026-05-22' }, { period: 'Patrimonio 2026 – Cuota 2', dueDate: '2026-09-15' } ],
  8: [ { period: 'Patrimonio 2026 – Cuota 1', dueDate: '2026-05-23' }, { period: 'Patrimonio 2026 – Cuota 2', dueDate: '2026-09-15' } ],
  9: [ { period: 'Patrimonio 2026 – Cuota 1', dueDate: '2026-05-25' }, { period: 'Patrimonio 2026 – Cuota 2', dueDate: '2026-09-15' } ],
  0: [ { period: 'Patrimonio 2026 – Cuota 1', dueDate: '2026-05-26' }, { period: 'Patrimonio 2026 – Cuota 2', dueDate: '2026-09-15' } ],
};

// ── IVA Bimestral 2026 ────────────────────────────────────────────────────────
// 6 bimestres — Decreto 2229 del 22 de diciembre de 2023
const IVA_BIMESTRAL_2026: Record<NitDigit, { period: string; dueDate: string }[]> = {
  1: [
    { period: 'IVA Bim 1 (Ene-Feb)', dueDate: '2026-03-11' },
    { period: 'IVA Bim 2 (Mar-Abr)', dueDate: '2026-05-13' },
    { period: 'IVA Bim 3 (May-Jun)', dueDate: '2026-07-10' },
    { period: 'IVA Bim 4 (Jul-Ago)', dueDate: '2026-09-10' },
    { period: 'IVA Bim 5 (Sep-Oct)', dueDate: '2026-11-12' },
    { period: 'IVA Bim 6 (Nov-Dic)', dueDate: '2027-01-14' },
  ],
  2: [
    { period: 'IVA Bim 1 (Ene-Feb)', dueDate: '2026-03-12' },
    { period: 'IVA Bim 2 (Mar-Abr)', dueDate: '2026-05-14' },
    { period: 'IVA Bim 3 (May-Jun)', dueDate: '2026-07-11' },
    { period: 'IVA Bim 4 (Jul-Ago)', dueDate: '2026-09-11' },
    { period: 'IVA Bim 5 (Sep-Oct)', dueDate: '2026-11-13' },
    { period: 'IVA Bim 6 (Nov-Dic)', dueDate: '2027-01-15' },
  ],
  3: [
    { period: 'IVA Bim 1 (Ene-Feb)', dueDate: '2026-03-13' },
    { period: 'IVA Bim 2 (Mar-Abr)', dueDate: '2026-05-15' },
    { period: 'IVA Bim 3 (May-Jun)', dueDate: '2026-07-14' },
    { period: 'IVA Bim 4 (Jul-Ago)', dueDate: '2026-09-12' },
    { period: 'IVA Bim 5 (Sep-Oct)', dueDate: '2026-11-14' },
    { period: 'IVA Bim 6 (Nov-Dic)', dueDate: '2027-01-16' },
  ],
  4: [
    { period: 'IVA Bim 1 (Ene-Feb)', dueDate: '2026-03-14' },
    { period: 'IVA Bim 2 (Mar-Abr)', dueDate: '2026-05-16' },
    { period: 'IVA Bim 3 (May-Jun)', dueDate: '2026-07-15' },
    { period: 'IVA Bim 4 (Jul-Ago)', dueDate: '2026-09-15' },
    { period: 'IVA Bim 5 (Sep-Oct)', dueDate: '2026-11-18' },
    { period: 'IVA Bim 6 (Nov-Dic)', dueDate: '2027-01-19' },
  ],
  5: [
    { period: 'IVA Bim 1 (Ene-Feb)', dueDate: '2026-03-17' },
    { period: 'IVA Bim 2 (Mar-Abr)', dueDate: '2026-05-20' },
    { period: 'IVA Bim 3 (May-Jun)', dueDate: '2026-07-16' },
    { period: 'IVA Bim 4 (Jul-Ago)', dueDate: '2026-09-16' },
    { period: 'IVA Bim 5 (Sep-Oct)', dueDate: '2026-11-19' },
    { period: 'IVA Bim 6 (Nov-Dic)', dueDate: '2027-01-20' },
  ],
  6: [
    { period: 'IVA Bim 1 (Ene-Feb)', dueDate: '2026-03-18' },
    { period: 'IVA Bim 2 (Mar-Abr)', dueDate: '2026-05-21' },
    { period: 'IVA Bim 3 (May-Jun)', dueDate: '2026-07-17' },
    { period: 'IVA Bim 4 (Jul-Ago)', dueDate: '2026-09-17' },
    { period: 'IVA Bim 5 (Sep-Oct)', dueDate: '2026-11-20' },
    { period: 'IVA Bim 6 (Nov-Dic)', dueDate: '2027-01-21' },
  ],
  7: [
    { period: 'IVA Bim 1 (Ene-Feb)', dueDate: '2026-03-19' },
    { period: 'IVA Bim 2 (Mar-Abr)', dueDate: '2026-05-22' },
    { period: 'IVA Bim 3 (May-Jun)', dueDate: '2026-07-18' },
    { period: 'IVA Bim 4 (Jul-Ago)', dueDate: '2026-09-18' },
    { period: 'IVA Bim 5 (Sep-Oct)', dueDate: '2026-11-21' },
    { period: 'IVA Bim 6 (Nov-Dic)', dueDate: '2027-01-22' },
  ],
  8: [
    { period: 'IVA Bim 1 (Ene-Feb)', dueDate: '2026-03-20' },
    { period: 'IVA Bim 2 (Mar-Abr)', dueDate: '2026-05-23' },
    { period: 'IVA Bim 3 (May-Jun)', dueDate: '2026-07-22' },
    { period: 'IVA Bim 4 (Jul-Ago)', dueDate: '2026-09-19' },
    { period: 'IVA Bim 5 (Sep-Oct)', dueDate: '2026-11-24' },
    { period: 'IVA Bim 6 (Nov-Dic)', dueDate: '2027-01-23' },
  ],
  9: [
    { period: 'IVA Bim 1 (Ene-Feb)', dueDate: '2026-03-21' },
    { period: 'IVA Bim 2 (Mar-Abr)', dueDate: '2026-05-25' },
    { period: 'IVA Bim 3 (May-Jun)', dueDate: '2026-07-23' },
    { period: 'IVA Bim 4 (Jul-Ago)', dueDate: '2026-09-22' },
    { period: 'IVA Bim 5 (Sep-Oct)', dueDate: '2026-11-25' },
    { period: 'IVA Bim 6 (Nov-Dic)', dueDate: '2027-01-26' },
  ],
  0: [
    { period: 'IVA Bim 1 (Ene-Feb)', dueDate: '2026-03-25' },
    { period: 'IVA Bim 2 (Mar-Abr)', dueDate: '2026-05-26' },
    { period: 'IVA Bim 3 (May-Jun)', dueDate: '2026-07-24' },
    { period: 'IVA Bim 4 (Jul-Ago)', dueDate: '2026-09-23' },
    { period: 'IVA Bim 5 (Sep-Oct)', dueDate: '2026-11-26' },
    { period: 'IVA Bim 6 (Nov-Dic)', dueDate: '2027-01-27' },
  ],
};

// ── IVA Cuatrimestral 2026 ────────────────────────────────────────────────────
// 3 cuatrimestres — Decreto 2229 del 22 de diciembre de 2023
const IVA_CUATRIMESTRAL_2026: Record<NitDigit, { period: string; dueDate: string }[]> = {
  1: [
    { period: 'IVA Cuatrim 1 (Ene-Abr)', dueDate: '2026-05-13' },
    { period: 'IVA Cuatrim 2 (May-Ago)', dueDate: '2026-09-10' },
    { period: 'IVA Cuatrim 3 (Sep-Dic)', dueDate: '2027-01-14' },
  ],
  2: [
    { period: 'IVA Cuatrim 1 (Ene-Abr)', dueDate: '2026-05-14' },
    { period: 'IVA Cuatrim 2 (May-Ago)', dueDate: '2026-09-11' },
    { period: 'IVA Cuatrim 3 (Sep-Dic)', dueDate: '2027-01-15' },
  ],
  3: [
    { period: 'IVA Cuatrim 1 (Ene-Abr)', dueDate: '2026-05-15' },
    { period: 'IVA Cuatrim 2 (May-Ago)', dueDate: '2026-09-12' },
    { period: 'IVA Cuatrim 3 (Sep-Dic)', dueDate: '2027-01-16' },
  ],
  4: [
    { period: 'IVA Cuatrim 1 (Ene-Abr)', dueDate: '2026-05-16' },
    { period: 'IVA Cuatrim 2 (May-Ago)', dueDate: '2026-09-15' },
    { period: 'IVA Cuatrim 3 (Sep-Dic)', dueDate: '2027-01-19' },
  ],
  5: [
    { period: 'IVA Cuatrim 1 (Ene-Abr)', dueDate: '2026-05-20' },
    { period: 'IVA Cuatrim 2 (May-Ago)', dueDate: '2026-09-16' },
    { period: 'IVA Cuatrim 3 (Sep-Dic)', dueDate: '2027-01-20' },
  ],
  6: [
    { period: 'IVA Cuatrim 1 (Ene-Abr)', dueDate: '2026-05-21' },
    { period: 'IVA Cuatrim 2 (May-Ago)', dueDate: '2026-09-17' },
    { period: 'IVA Cuatrim 3 (Sep-Dic)', dueDate: '2027-01-21' },
  ],
  7: [
    { period: 'IVA Cuatrim 1 (Ene-Abr)', dueDate: '2026-05-22' },
    { period: 'IVA Cuatrim 2 (May-Ago)', dueDate: '2026-09-18' },
    { period: 'IVA Cuatrim 3 (Sep-Dic)', dueDate: '2027-01-22' },
  ],
  8: [
    { period: 'IVA Cuatrim 1 (Ene-Abr)', dueDate: '2026-05-23' },
    { period: 'IVA Cuatrim 2 (May-Ago)', dueDate: '2026-09-19' },
    { period: 'IVA Cuatrim 3 (Sep-Dic)', dueDate: '2027-01-23' },
  ],
  9: [
    { period: 'IVA Cuatrim 1 (Ene-Abr)', dueDate: '2026-05-25' },
    { period: 'IVA Cuatrim 2 (May-Ago)', dueDate: '2026-09-22' },
    { period: 'IVA Cuatrim 3 (Sep-Dic)', dueDate: '2027-01-26' },
  ],
  0: [
    { period: 'IVA Cuatrim 1 (Ene-Abr)', dueDate: '2026-05-26' },
    { period: 'IVA Cuatrim 2 (May-Ago)', dueDate: '2026-09-23' },
    { period: 'IVA Cuatrim 3 (Sep-Dic)', dueDate: '2027-01-27' },
  ],
};

// ── Información Exógena Nacional 2026 (AG 2025) ───────────────────────────────
// Resolución 00188 del 30 de octubre de 2024
//
// Exógena Grandes Contribuyentes: por último dígito del NIT (feb-mar 2026)
const EXOGENA_GC_2026: Record<NitDigit, string> = {
  1: '2026-04-21', 2: '2026-04-22', 3: '2026-04-23',
  4: '2026-04-24', 5: '2026-04-27', 6: '2026-04-28',
  7: '2026-04-29', 8: '2026-04-30', 9: '2026-05-04', 0: '2026-05-05',
};

// Personas jurídicas y naturales (no GC): por últimos 2 dígitos del NIT
// "96-00" significa dígitos 96-99 y 00
const EXOGENA_PJ_RANGES_2026: { from: number; to: number; dueDate: string }[] = [
  { from:  1, to:  5, dueDate: '2026-05-15' },
  { from:  6, to: 10, dueDate: '2026-05-16' },
  { from: 11, to: 15, dueDate: '2026-05-20' },
  { from: 16, to: 20, dueDate: '2026-05-21' },
  { from: 21, to: 25, dueDate: '2026-05-22' },
  { from: 26, to: 30, dueDate: '2026-05-23' },
  { from: 31, to: 35, dueDate: '2026-05-25' },
  { from: 36, to: 40, dueDate: '2026-05-27' },
  { from: 41, to: 45, dueDate: '2026-05-28' },
  { from: 46, to: 50, dueDate: '2026-05-29' },
  { from: 51, to: 55, dueDate: '2026-05-30' },
  { from: 56, to: 60, dueDate: '2026-06-02' },
  { from: 61, to: 65, dueDate: '2026-06-03' },
  { from: 66, to: 70, dueDate: '2026-06-04' },
  { from: 71, to: 75, dueDate: '2026-06-05' },
  { from: 76, to: 80, dueDate: '2026-06-06' },
  { from: 81, to: 85, dueDate: '2026-06-10' },
  { from: 86, to: 90, dueDate: '2026-06-11' },
  { from: 91, to: 95, dueDate: '2026-06-12' },
  { from: 96, to: 99, dueDate: '2026-06-13' }, // incluye "00"
];

// ── Helper: último dígito del NIT antes del guión ────────────────────────────
// Ej: "901193667-1" → 7  |  "900550189-5" → 9  |  "901193667" → 7
export function extractVerificationDigit(nit: string): NitDigit | null {
  if (!nit) return null;
  const trimmed = nit.trim();
  const hasExplicitDv = trimmed.includes('-');
  const digits = trimmed.replace(/\D/g, '');
  const nitBase = hasExplicitDv
    ? trimmed.split('-')[0].replace(/\D/g, '')
    : digits.length > 9
      ? digits.slice(0, -1)
      : digits;
  if (!nitBase) return null;
  return Number(nitBase[nitBase.length - 1]) as NitDigit;
}

// ── Obtener todas las obligaciones 2026 para un dígito NIT ───────────────────
export function getDianObligations2026(digit: NitDigit): DianObligation[] {
  const result: DianObligation[] = [];

  for (const entry of RETEFUENTE_2026[digit]) {
    result.push({
      taxType:  'Retención en la Fuente',
      category: 'Retención en la Fuente',
      period:   entry.period,
      dueDate:  entry.dueDate,
      scope:    'Nacional',
    });
  }

  for (const entry of RENTA_PJ_2026[digit]) {
    result.push({
      taxType:  'Renta y Complementarios (PJ)',
      category: 'Renta',
      period:   entry.period,
      dueDate:  entry.dueDate,
      scope:    'Nacional',
    });
  }

  for (const entry of IVA_BIMESTRAL_2026[digit]) {
    result.push({
      taxType:  'IVA Bimestral',
      category: 'IVA',
      period:   entry.period,
      dueDate:  entry.dueDate,
      scope:    'Nacional',
    });
  }

  for (const entry of IVA_CUATRIMESTRAL_2026[digit]) {
    result.push({
      taxType:  'IVA Cuatrimestral',
      category: 'IVA',
      period:   entry.period,
      dueDate:  entry.dueDate,
      scope:    'Nacional',
    });
  }

  for (const entry of PATRIMONIO_2026[digit]) {
    result.push({
      taxType:  'Impuesto al Patrimonio',
      category: 'Renta',
      period:   entry.period,
      dueDate:  entry.dueDate,
      scope:    'Nacional',
    });
  }

  // Exógena Grandes Contribuyentes (por último 1 dígito)
  result.push({
    taxType:  'Exógena Nacional (GC)',
    category: 'ICA',
    period:   'Exógena AG 2025',
    dueDate:  EXOGENA_GC_2026[digit],
    scope:    'Nacional',
  });

  return result.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

// ── Exógena PJ/naturales por últimos 2 dígitos del NIT ───────────────────────
function getExogenaPJDueDate(nit: string): string | null {
  const trimmed = nit.trim();
  const digits = trimmed.replace(/\D/g, '');
  const base = trimmed.includes('-')
    ? trimmed.split('-')[0].replace(/\D/g, '')
    : digits.length > 9
      ? digits.slice(0, -1)
      : digits;
  if (!base) return null;
  const last2 = parseInt(base.slice(-2), 10); // "00" → 0
  if (last2 === 0) return '2026-06-13'; // grupo "96-00"
  const range = EXOGENA_PJ_RANGES_2026.find(r => last2 >= r.from && last2 <= r.to);
  return range?.dueDate ?? null;
}

// ── getDianObligationsByNit: incluye Exógena PJ además de las obligaciones por dígito ──
export function getDianObligationsByNit(nit: string): DianObligation[] {
  const digit = extractVerificationDigit(nit);
  if (digit === null) return [];

  const result = getDianObligations2026(digit);

  const exogenaPJDate = getExogenaPJDueDate(nit);
  if (exogenaPJDate) {
    result.push({
      taxType:  'Exógena Nacional (PJ/Naturales)',
      category: 'ICA',
      period:   'Exógena AG 2025',
      dueDate:  exogenaPJDate,
      scope:    'Nacional',
    });
  }

  return result.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

// ── Solo obligaciones próximas — por dígito (backward compat) ────────────────
export function getUpcomingObligations(digit: NitDigit, daysAhead = 60): DianObligation[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const limit = new Date(today); limit.setDate(limit.getDate() + daysAhead);
  return getDianObligations2026(digit).filter(o => {
    const d = new Date(o.dueDate + 'T00:00:00');
    return d >= today && d <= limit;
  });
}

// ── Obligaciones pasadas — por NIT completo (incluye Bogotá) ─────────────────
export function getAllObligationsByNit(nit: string): DianObligation[] {
  const nacional = getDianObligationsByNit(nit);
  const bogota: DianObligation[] = ALL_BOGOTA_2026.map(o => ({
    taxType: o.taxType,
    category: 'ICA' as const,
    period: o.period,
    dueDate: o.dueDate,
    scope: 'Distrital' as const,
  }));
  return [...nacional, ...bogota].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function getPastObligationsByNit(nit: string): DianObligation[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const nacional = getDianObligationsByNit(nit);
  const bogota: DianObligation[] = ALL_BOGOTA_2026.map(o => ({
    taxType: o.taxType,
    category: 'ICA' as const,
    period: o.period,
    dueDate: o.dueDate,
    scope: 'Distrital' as const,
  }));
  return [...nacional, ...bogota]
    .filter(o => o.dueDate < todayStr)
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate)); // más reciente primero
}

// ── Solo obligaciones próximas — por NIT completo (incluye Exógena PJ + Bogotá) ─
export function getUpcomingObligationsByNit(nit: string, daysAhead = 60): DianObligation[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const limit = new Date(today); limit.setDate(limit.getDate() + daysAhead);
  // Lookback de 14 días para mostrar vencidas recientes sin traer todo el histórico
  const overdueFrom = new Date(today); overdueFrom.setDate(overdueFrom.getDate() - 14);
  const nacional = getDianObligationsByNit(nit);
  const bogota: DianObligation[] = ALL_BOGOTA_2026.map(o => ({
    taxType: o.taxType,
    category: 'ICA' as const,
    period: o.period,
    dueDate: o.dueDate,
    scope: 'Distrital' as const,
  }));
  return [...nacional, ...bogota]
    .filter(o => {
      const d = new Date(o.dueDate + 'T00:00:00');
      return d >= overdueFrom && d <= limit;
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
