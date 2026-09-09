/**
 * Formato único de teléfono para corporatePhone/personalPhone: "+57" seguido
 * de los 10 dígitos del número colombiano. Antes convivían valores con y sin
 * "+", con y sin el indicativo, e incluso varios números metidos en el mismo
 * campo separados por "-", "/" o "," (ej. un celular alterno) — se conserva
 * solo el primero que resuelva a 10 dígitos, ya que el campo es de un solo
 * valor y ningún otro código del sistema lee más de un número por campo.
 *
 * Si no se logra interpretar ningún número de 10 dígitos, se devuelve el
 * valor original sin tocar en vez de adivinar.
 */
export function standardizePhone(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const chunks = s.split(/[\-/,–]+/).map(c => c.trim()).filter(Boolean);
  for (const chunk of chunks) {
    const resolved = resolveTenDigits(chunk);
    if (resolved) return `+57${resolved}`;
  }
  const whole = resolveTenDigits(s);
  if (whole) return `+57${whole}`;
  return s;
}

function resolveTenDigits(value: string): string | null {
  let digits = value.replace(/\D/g, '');
  if (!digits) return null;
  while (digits.length > 10 && digits.startsWith('57')) digits = digits.slice(2);
  return digits.length === 10 ? digits : null;
}
