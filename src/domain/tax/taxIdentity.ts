import type { TaxObligation } from '@/models/types/TaxObligation';
import { getAllObligationsByNit, type DianObligation } from '@/data/dianCalendar2026';

/** Normalización exclusiva para búsquedas y compatibilidad legacy. */
export const normalize = (value = '') =>
  value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[.\-,]/g, '').replace(/\s+/g, ' ').trim();

export const cleanNit = (nit?: string) => (nit ?? '').replace(/[^0-9]/g, '');

export function sameCompany(
  obligation: Pick<TaxObligation, 'companyId' | 'company' | 'nit'>,
  company: { id?: string; name?: string; nit?: string },
): boolean {
  if (obligation.companyId && company.id) return obligation.companyId === company.id;
  const obligationNit = cleanNit(obligation.nit);
  const companyNit = cleanNit(company.nit);
  if (obligationNit && companyNit) return obligationNit === companyNit;
  return normalize(obligation.company) === normalize(company.name ?? '');
}

const TAX_ALIASES: Record<string, string> = {
  reteica: 'reteica',
  'retencion de ica': 'reteica',
  'retencion ica': 'reteica',
  'iva bimestral': 'iva',
  'iva cuatrimestral': 'iva',
  'impuesto a las ventas': 'iva',
  iva: 'iva',
  'retencion en la fuente': 'retencion en la fuente',
  'retencion fuente': 'retencion en la fuente',
  retefuente: 'retencion en la fuente',
  'exogena nacional (pj/naturales)': 'exogena nacional',
  'informacion exogena nacional': 'exogena nacional',
  'exogena nacional': 'exogena nacional',
  'informacion exogena': 'exogena nacional',
  'exogena pj': 'exogena nacional',
};

export const normTax = (taxType: string) => {
  const normalized = normalize(taxType);
  return TAX_ALIASES[normalized] ?? normalized;
};

const DISPLAY_NAMES: Record<string, string> = {
  'impuesto a las ventas': 'IVA',
  iva: 'IVA',
  'impuesto de industria y comercio': 'ICA Bimestral',
  retefuente: 'Retención en la Fuente',
  'retencion fuente': 'Retención en la Fuente',
  'retencion en la fuente': 'Retención en la Fuente',
  'retencion de ica': 'ReteICA',
  'retencion ica': 'ReteICA',
};

export const displayTax = (taxType: string) => DISPLAY_NAMES[normalize(taxType)] ?? taxType;

export function sameAutoDueDate(savedDate: string, automaticDate: string): boolean {
  if (savedDate === automaticDate) return true;
  const valid = /^\d{4}-\d{2}-\d{2}$/;
  if (!valid.test(savedDate) || !valid.test(automaticDate)) return false;
  const [sy, sm, sd] = savedDate.split('-').map(Number);
  const [ay, am, ad] = automaticDate.split('-').map(Number);
  return Math.abs(Date.UTC(ay, am - 1, ad) - Date.UTC(sy, sm - 1, sd)) <= 3 * 86_400_000;
}

export function sameDianObligation(saved: TaxObligation, automatic: DianObligation): boolean {
  if (normTax(saved.taxType) !== normTax(automatic.taxType)) return false;
  if (sameAutoDueDate(saved.dueDate, automatic.dueDate)) return true;
  const savedYear = saved.year || saved.dueDate?.slice(0, 4);
  return periodKey(saved.period) === periodKey(automatic.period) && savedYear === automatic.dueDate.slice(0, 4);
}

/**
 * Si el vencimiento de una obligación de calendario (Retención en la Fuente,
 * IVA, etc.) se desvía de la fecha oficial DIAN para el NIT de esa empresa, se
 * corrige a la fecha oficial. Evita errores de tipeo o de copiar la fecha del
 * dígito de verificación equivocado (p. ej. NIT terminado en 7 con la fecha
 * que corresponde al dígito 0).
 */
export function correctDueDateAgainstCalendar(
  nit: string | undefined, taxType: string, period: string, dueDate: string,
): { dueDate: string; corrected: boolean; officialDate?: string } {
  if (!nit || !dueDate) return { dueDate, corrected: false };
  const calendar = getAllObligationsByNit(nit);
  const match = calendar.find(c => normTax(c.taxType) === normTax(taxType) && periodKey(c.period) === periodKey(period));
  if (!match || sameAutoDueDate(dueDate, match.dueDate)) return { dueDate, corrected: false };
  return { dueDate: match.dueDate, corrected: true, officialDate: match.dueDate };
}

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Unifica el texto de período para que un mismo mes/bimestre/cuatrimestre se
 * muestre igual sin importar si vino del calendario automático, del formulario
 * manual o de un registro antiguo (ej. "Mensual-7" e "IVA Bim 2 (Mar-Abr)" pasan
 * a "Julio" y "Bimestre 2"). Otros períodos (Anual, Cuota, Predial, etc.) no cambian.
 */
export function normalizePeriod(period?: string): string {
  const raw = (period ?? '').trim();
  if (!raw) return '';
  const lower = normalize(raw).replace(/[()]/g, ' ');
  const monthIdx = MONTH_NAMES.findIndex(m => lower === m);
  if (monthIdx !== -1) return capitalize(MONTH_NAMES[monthIdx]);
  const mensualMatch = lower.match(/^mensual\s*(\d{1,2})$/);
  if (mensualMatch) {
    const idx = Number(mensualMatch[1]) - 1;
    if (idx >= 0 && idx < 12) return capitalize(MONTH_NAMES[idx]);
  }
  const bimMatch = lower.match(/\b(?:bim|bimestre)\s*(\d)\b/);
  if (bimMatch) return `Bimestre ${bimMatch[1]}`;
  const cuatriMatch = lower.match(/\b(?:cuatri|cuatrim|cuatrimestre)\s*(\d)\b/);
  if (cuatriMatch) return `Cuatrimestre ${cuatriMatch[1]}`;
  const triMatch = lower.match(/\btrimestre\s*(\d)\b/);
  if (triMatch) return `Trimestre ${triMatch[1]}`;
  const semesterMatch = lower.match(/\b(?:sem|semestre)\s*([12])\b/);
  if (semesterMatch) return `Semestre ${semesterMatch[1]}`;
  return raw;
}

/** Clave semántica para deduplicación y matching, independiente del texto visible. */
export function periodKey(period?: string): string {
  const display = normalizePeriod(period);
  const value = normalize(display);
  const monthIdx = MONTH_NAMES.indexOf(value);
  if (monthIdx !== -1) return `month:${monthIdx + 1}`;
  const bim = value.match(/^bimestre\s*(\d)$/);
  if (bim) return `bimester:${bim[1]}`;
  const fourMonth = value.match(/^cuatrimestre\s*(\d)$/);
  if (fourMonth) return `four-month:${fourMonth[1]}`;
  const quarter = value.match(/^trimestre\s*(\d)$/);
  if (quarter) return `quarter:${quarter[1]}`;
  const semester = value.match(/^semestre\s*([12])$/);
  if (semester) return `semester:${semester[1]}`;
  const installment = value.match(/^cuota\s*(\d+)$/);
  if (installment) return `installment:${installment[1]}`;
  if (value === 'anual') return 'annual';
  return value ? `text:${value}` : '';
}
