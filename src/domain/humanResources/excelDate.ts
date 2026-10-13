/**
 * Convierte número serial de Excel, Date o string a Date (medianoche local).
 * `dayFirstOnly`: los textos se interpretan únicamente como día/mes/año; un
 * texto que solo sería válido como mes/día (ej. "6/30/26") se rechaza en vez
 * de adivinar, porque en hojas con formatos mezclados la inversión silenciosa
 * produce fechas equivocadas.
 */
export function parseExcelDate(
  val: any,
  opts: { minYear?: number; maxYear?: number; dayFirstOnly?: boolean } = {}
): Date | undefined {
  if (!val) return undefined;
  let parsed: Date | undefined;
  const fromParts = (year: number, month: number, day: number) => {
    const dt = new Date(year, month - 1, day);
    if (
      dt.getFullYear() !== year ||
      dt.getMonth() !== month - 1 ||
      dt.getDate() !== day
    ) return undefined;
    return dt;
  };

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return undefined;
    // Re-construir en zona local para evitar desfase UTC
    parsed = new Date(val.getFullYear(), val.getMonth(), val.getDate());
  } else if (typeof val === 'number') {
    if (val <= 0) return undefined;
    // Se calcula en UTC para que ni el horario de verano ni los desfases
    // históricos de zona horaria corran el día; luego se lleva a medianoche local.
    const tmp = new Date(Date.UTC(1899, 11, 30) + Math.floor(val) * 86400000);
    if (isNaN(tmp.getTime())) return undefined;
    parsed = fromParts(tmp.getUTCFullYear(), tmp.getUTCMonth() + 1, tmp.getUTCDate());
  } else if (typeof val === 'string') {
    const s = val.trim().split(/\s+/)[0];
    if (!s) return undefined;

    // YYYYMMDD
    if (/^\d{8}$/.test(s)) {
      const y = Number(s.slice(0, 4));
      const m = Number(s.slice(4, 6));
      const d = Number(s.slice(6, 8));
      parsed = fromParts(y, m, d);
    }

    const parts = s.split(/[\/\-.]/).map(Number);
    if (!parsed && parts.length === 3 && parts.every(Number.isFinite)) {
      let [a, b, c] = parts;
      if (a > 999) {
        parsed = fromParts(a, b, c);
      } else {
        const year = c < 100 ? (c < 50 ? 2000 + c : 1900 + c) : c;
        // Colombia: preferir dia/mes/anio. Si no es valido y mes/dia si lo es,
        // aceptar el formato alterno.
        parsed = opts.dayFirstOnly ? fromParts(year, b, a) : fromParts(year, b, a) || fromParts(year, a, b);
      }
    }
  }

  if (!parsed || isNaN(parsed.getTime())) return undefined;
  const minYear = opts.minYear ?? 1900;
  const maxYear = opts.maxYear ?? new Date().getFullYear() + 10;
  if (parsed.getFullYear() < minYear || parsed.getFullYear() > maxYear) return undefined;
  return parsed;
}
