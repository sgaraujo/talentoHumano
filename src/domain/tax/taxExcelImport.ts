import type { TaxObligation, TaxStatus, ObligationType } from '@/models/types/TaxObligation';
import type { Company } from '@/models/types/Company';
import { sameCompany, normTax, correctDueDateAgainstCalendar, normalizePeriod } from './taxIdentity';

export type TaxImportAction = 'create' | 'update' | 'unchanged' | 'conflict' | 'rejected';

export interface TaxImportRow {
  sourceRow: number;
  action: TaxImportAction;
  reasons: string[];
  obligation: Omit<TaxObligation, 'id' | 'createdAt' | 'updatedAt'>;
  /** id del registro existente a actualizar — solo presente cuando action === 'update' */
  existingId?: string;
}

export interface TaxImportPlan {
  fileName: string;
  totalRows: number;
  create: number;
  update: number;
  unchanged: number;
  conflicts: number;
  rejected: number;
  rows: TaxImportRow[];
}

// ── Catálogo de valores válidos — la misma lista se muestra como instrucciones
// en la UI (TaxImportInstructions), así que documentación y validación nunca
// quedan desincronizadas. ─────────────────────────────────────────────────────

/** Tipos de obligación que ya existen en el calendario DIAN/Bogotá automático. */
export const KNOWN_TAX_TYPES = [
  'Retención en la Fuente',
  'Renta y Complementarios (PJ)',
  'IVA Bimestral',
  'IVA Cuatrimestral',
  'Impuesto al Patrimonio',
  'Exógena Nacional (GC)',
  'Exógena Nacional (PJ/Naturales)',
  'ICA Bimestral',
  'ICA Régimen Común',
  'ICA Régimen Preferencial',
  'ReteICA',
  'Predial',
  'Vehículos',
] as const;

export const VALID_STATUSES: TaxStatus[] = [
  'No iniciado', 'En revisión', 'Revisado', 'Presentado', 'Informe Enviado',
  'Informe Enviado RF', 'Impuesto Enviado para pago', 'No aplica', 'Pagado',
];

export const VALID_OBLIGATION_TYPES: ObligationType[] = ['Impuestos', 'Información Exógena', 'Reportes'];
export const VALID_SCOPES = ['Nacional', 'Distrital'] as const;

const text = (value: unknown) => String(value ?? '').trim();
const numberValue = (value: unknown) => {
  const normalized = text(value).replace(/[^\d-]/g, '');
  const parsed = Number(normalized);
  return normalized && Number.isFinite(parsed) ? parsed : undefined;
};

const matchKnown = <T extends string>(raw: string, options: readonly T[]): T | undefined =>
  options.find(option => option.toLowerCase() === raw.toLowerCase());

/** Acepta 'YYYY-MM-DD', 'DD/MM/YYYY' o un objeto Date (si el Excel trae la celda con formato fecha). */
function parseDueDate(value: unknown): string | null {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const raw = text(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function resolveCompany(companyName: string, nit: string, companies: Company[]) {
  const byNit = nit && companies.find(c => (c.nit ?? '').replace(/[^0-9]/g, '') === nit.replace(/[^0-9]/g, ''));
  if (byNit) return byNit;
  return companies.find(c => sameCompany({ company: companyName, nit: '' }, { id: c.id, name: c.name, nit: c.nit })) ?? null;
}

const FIELDS_TO_COMPARE = ['period', 'city', 'scope', 'obligationType', 'advisor', 'observation', 'projected'] as const;
function needsUpdate(existing: TaxObligation, incoming: TaxImportRow['obligation']): boolean {
  return FIELDS_TO_COMPARE.some(field => (existing[field] ?? '') !== (incoming[field] ?? ''));
}

export function buildTaxImportPlan(
  fileName: string,
  rows: Record<string, unknown>[],
  companies: Company[],
  existingObligations: TaxObligation[],
): TaxImportPlan {
  const indexedRows = rows
    .map((row, index) => ({ row, sourceRow: index + 2 }))
    .filter(({ row }) => Object.values(row).some(value => text(value) !== ''));

  // Un tipo de obligación es válido si ya está en el calendario automático o si
  // ya existe en algún vencimiento manual/legal cargado antes — así no rechazamos
  // categorías legítimas que Contabilidad ya usa, solo texto nuevo sin revisar.
  const knownTaxTypeKeys = new Set([
    ...KNOWN_TAX_TYPES.map(normTax),
    ...existingObligations.map(o => normTax(o.taxType)),
  ]);

  const seenInFile = new Map<string, number>(); // clave -> primera fila que la usó
  const result: TaxImportRow[] = [];

  for (const { row, sourceRow } of indexedRows) {
    const companyName = text(row['EMPRESA'] ?? row['Empresa']);
    const nit = text(row['NIT']);
    const taxType = text(row['TIPO DE OBLIGACIÓN'] ?? row['TIPO DE IMPUESTO'] ?? row['RESPONSABILIDAD']);
    const dueDate = parseDueDate(row['VENCIMIENTO'] ?? row['FECHA DE VENCIMIENTO']);
    const rawStatus = text(row['ESTADO']);
    const rawCategory = text(row['CATEGORÍA'] ?? row['TIPO']);
    const rawScope = text(row['ALCANCE']);

    const reasons: string[] = [];
    if (!companyName) reasons.push('Sin empresa');
    if (!taxType) reasons.push('Sin tipo de obligación');
    if (!dueDate) reasons.push('Vencimiento vacío o con formato inválido (use AAAA-MM-DD)');
    if (taxType && !knownTaxTypeKeys.has(normTax(taxType))) {
      reasons.push(`"${taxType}" no es un tipo de obligación reconocido — revisa la lista de tipos válidos o usa uno ya existente en el calendario`);
    }
    const status = rawStatus ? matchKnown(rawStatus, VALID_STATUSES) : 'No iniciado';
    if (rawStatus && !status) reasons.push(`Estado "${rawStatus}" no es válido — revisa la lista de estados permitidos`);
    const obligationType = rawCategory ? matchKnown(rawCategory, VALID_OBLIGATION_TYPES) : 'Impuestos';
    if (rawCategory && !obligationType) reasons.push(`Categoría "${rawCategory}" no es válida — usa Impuestos, Información Exógena o Reportes`);
    const scope = rawScope ? matchKnown(rawScope, VALID_SCOPES) : 'Nacional';
    if (rawScope && !scope) reasons.push(`Alcance "${rawScope}" no es válido — usa Nacional o Distrital`);

    if (!companyName || !taxType || !dueDate || !status || !obligationType || !scope) {
      result.push({ sourceRow, action: 'rejected', reasons, obligation: {} as any });
      continue;
    }

    const matchedCompany = resolveCompany(companyName, nit, companies);
    if (!matchedCompany) reasons.push('Empresa no encontrada en el catálogo — se guardará solo con el nombre escrito');

    const period = normalizePeriod(text(row['PERÍODO'] ?? row['PERIODO']));
    const officialNit = matchedCompany?.nit ?? nit;
    const correction = correctDueDateAgainstCalendar(officialNit, taxType, period, dueDate);
    if (correction.corrected) {
      reasons.push(`Vencimiento corregido automáticamente: se cargó ${dueDate} pero el calendario oficial para este NIT indica ${correction.officialDate} — se guardó la fecha oficial.`);
    }
    const finalDueDate = correction.dueDate;
    const obligation: TaxImportRow['obligation'] = {
      companyId: matchedCompany?.id,
      company: matchedCompany?.name ?? companyName,
      nit: matchedCompany?.nit ?? nit,
      city: text(row['CIUDAD']) || matchedCompany?.regional || '',
      scope,
      taxType,
      obligationType,
      period,
      dueDate: finalDueDate,
      year: finalDueDate.slice(0, 4),
      status,
      advisor: text(row['ASESOR']),
      observation: text(row['OBSERVACIÓN'] ?? row['OBSERVACION']),
      ...(numberValue(row['PROYECTADO']) !== undefined ? { projected: numberValue(row['PROYECTADO']) } : {}),
    };

    const dedupeKey = `${matchedCompany?.id ?? companyName.toLowerCase()}__${normTax(taxType)}__${finalDueDate}`;
    const firstRow = seenInFile.get(dedupeKey);
    if (firstRow !== undefined) {
      result.push({
        sourceRow, action: 'conflict',
        reasons: [`Duplicado dentro del archivo: misma empresa, tipo y vencimiento que la fila ${firstRow}`],
        obligation,
      });
      continue;
    }
    seenInFile.set(dedupeKey, sourceRow);

    const existing = existingObligations.find(o =>
      sameCompany(o, { id: matchedCompany?.id, name: matchedCompany?.name ?? companyName, nit: matchedCompany?.nit ?? nit }) &&
      normTax(o.taxType) === normTax(taxType) &&
      o.dueDate === finalDueDate,
    );

    if (existing) {
      if (needsUpdate(existing, obligation)) {
        result.push({ sourceRow, action: 'update', reasons, obligation, existingId: existing.id });
      } else {
        result.push({ sourceRow, action: 'unchanged', reasons, obligation, existingId: existing.id });
      }
      continue;
    }

    result.push({ sourceRow, action: 'create', reasons, obligation });
  }

  return {
    fileName,
    totalRows: indexedRows.length,
    create: result.filter(r => r.action === 'create').length,
    update: result.filter(r => r.action === 'update').length,
    unchanged: result.filter(r => r.action === 'unchanged').length,
    conflicts: result.filter(r => r.action === 'conflict').length,
    rejected: result.filter(r => r.action === 'rejected').length,
    rows: result,
  };
}
