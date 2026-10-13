/** Lista estándar de motivos de retiro, en el orden en que se muestran en los reportes. */
export const MOTIVOS_RETIRO = [
  'Fallecimiento',
  'Anulado',
  'Renuncia voluntaria',
  'Sustitución patronal',
  'Terminación contrato a término fijo',
  'Terminación contrato con justa causa',
  'Terminación contrato sin justa causa',
  'Terminación contrato de aprendizaje',
  'Terminación de contrato por mutuo acuerdo',
  'Terminación de contrato por obra o labor',
  'Terminación de contrato por periodo de prueba',
  'Terminación de contrato unilateral de aprendizaje',
  'Terminación de contrato por prestación de servicios',
] as const;

/** Motivo asignado cuando el texto del Excel no corresponde a ningún motivo del catálogo. */
export const SIN_CLASIFICAR = 'Sin clasificar';

// Valores que en el Excel significan "no hay motivo" (relación activa o celda de relleno).
const EMPTY_REASON_VALUES = new Set(['', '-', 'n/a', 'na', 'n.a', 'n.a.', 'no aplica']);

/** Clave de comparación: sin tildes, sin mayúsculas, con espacios colapsados y TRIM. */
const comparableReason = (value: unknown) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const CATALOG_BY_KEY = new Map<string, string>(MOTIVOS_RETIRO.map(reason => [comparableReason(reason), reason]));

// Variantes frecuentes del Excel → motivo del catálogo. El orden importa:
// "involuntario" y "sin justa causa" deben evaluarse antes que "voluntario" y "justa causa".
const KEYWORD_RULES: Array<[(text: string) => boolean, string]> = [
  [t => t.includes('fallec') || t.includes('muerte'), 'Fallecimiento'],
  [t => t.includes('anula'), 'Anulado'],
  [t => t.includes('involuntar') || t.includes('despid'), 'Terminación contrato sin justa causa'],
  [t => t.includes('renuncia') || t.includes('voluntar'), 'Renuncia voluntaria'],
  [t => t.includes('sustit') || t.includes('patronal'), 'Sustitución patronal'],
  [t => t.includes('sin justa') || t.includes('injusta'), 'Terminación contrato sin justa causa'],
  [t => t.includes('justa causa'), 'Terminación contrato con justa causa'],
  [t => t.includes('aprendiz') && t.includes('unilateral'), 'Terminación de contrato unilateral de aprendizaje'],
  [t => t.includes('aprendiz'), 'Terminación contrato de aprendizaje'],
  [t => t.includes('mutuo') || t.includes('acuerdo'), 'Terminación de contrato por mutuo acuerdo'],
  [t => t.includes('prestacion') && t.includes('servicio'), 'Terminación de contrato por prestación de servicios'],
  [t => t.includes('obra') || t.includes('labor'), 'Terminación de contrato por obra o labor'],
  [t => t.includes('prueba') || t.includes('periodo'), 'Terminación de contrato por periodo de prueba'],
  [t => t.includes('fijo'), 'Terminación contrato a término fijo'],
];

/**
 * Normaliza el texto libre de la columna MOTIVO del Excel al motivo del catálogo.
 * - Relación activa, vacío, "-" o "N/A" → `reason: null` (no hay retiro que clasificar).
 * - Texto reconocido → el motivo del catálogo.
 * - Texto no reconocido → "Sin clasificar", con el original en `raw` para revisarlo.
 * Antes, cualquier texto no reconocido (e incluso el vacío) quedaba como
 * "Renuncia voluntaria", inflando la rotación voluntaria.
 */
export function normalizeRetiroReason(
  motivo: unknown,
  options: { active?: boolean } = {},
): { reason: string | null; raw?: string } {
  if (options.active) return { reason: null };
  const key = comparableReason(motivo);
  if (EMPTY_REASON_VALUES.has(key)) return { reason: null };
  const exact = CATALOG_BY_KEY.get(key);
  if (exact) return { reason: exact };
  const rule = KEYWORD_RULES.find(([matches]) => matches(key));
  if (rule) return { reason: rule[1] };
  return { reason: SIN_CLASIFICAR, raw: String(motivo).trim() };
}

/** Determina si un motivo de retiro (ya normalizado o crudo) corresponde a un retiro voluntario. */
export function esVoluntario(reason?: string): boolean {
  const l = (reason || '').toLowerCase();
  return l.includes('renuncia') || l.includes('mutuo acuerdo') || l === 'voluntario';
}
