import type { TaxObligation } from '@/models/types/TaxObligation';
import type { DianObligation } from '@/data/dianCalendar2026';

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
  return saved.period === automatic.period && savedYear === automatic.dueDate.slice(0, 4);
}

