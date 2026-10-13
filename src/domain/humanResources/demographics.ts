import { toDate } from '@/services/analyticsService';

// Reglas de demografía compartidas por la Analítica de TH y las estadísticas
// por cuenta analítica, para que ambas agrupen igual.

export const AGE_ORDER = ['18–25', '26–30', '31–35', '36–40', '41–50', '51+', 'Sin dato'];

export function ageGroup(birthDate: unknown, storedAge?: number, storedRange?: string, referenceDate = new Date()): string {
  // Las fechas de nacimiento históricas pueden venir como DD/MM/YYYY; el lector
  // de emplements valida y desambigua esos formatos antes de calcular la edad.
  const bd = toDate(birthDate);
  const today = referenceDate;
  let age: number | undefined;
  if (bd) {
    age = today.getFullYear() - bd.getFullYear();
    const hasNotHadBirthday = today.getMonth() < bd.getMonth()
      || (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate());
    if (hasNotHadBirthday) age -= 1;
  } else if (storedAge !== undefined && storedAge !== null && Number.isFinite(Number(storedAge))) {
    age = Number(storedAge);
  }
  if (age === undefined) {
    const knownRange = storedRange?.trim();
    if (!knownRange) return 'Sin dato';
    const normalized = knownRange.replace(/años?/gi, '').replace(/\s+/g, ' ').trim();
    const numbers = normalized.match(/\d+/g)?.map(Number) ?? [];
    if (numbers.length > 0) {
      const referenceAge = numbers[0];
      if (referenceAge >= 15 && referenceAge <= 100) age = referenceAge;
    }
    if (age === undefined) return 'Sin dato';
  }
  if (age < 15 || age > 100) return 'Sin dato';
  if (age < 26)  return '18–25';
  if (age < 31)  return '26–30';
  if (age < 36)  return '31–35';
  if (age < 41)  return '36–40';
  if (age < 51)  return '41–50';
  return '51+';
}

export function normalizeGender(value?: string): string {
  const raw = value?.trim();
  if (!raw) return 'Sin dato';
  const key = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
  if (['m', 'masculino', 'hombre', 'male'].includes(key)) return 'Masculino';
  if (['f', 'femenino', 'mujer', 'female'].includes(key)) return 'Femenino';
  if (['no binario', 'no-binario', 'non binary', 'non-binary'].includes(key)) return 'No binario';
  if (key === 'prefiero no decir') return 'Prefiero no decir';
  return raw.charAt(0).toLocaleUpperCase('es') + raw.slice(1).toLocaleLowerCase('es');
}

export function normalizeWorkModality(value?: string): string {
  const raw = value?.trim();
  if (!raw) return 'Sin dato';
  const key = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
    .replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (['no aplica', 'no aplica.', 'n/a', 'na'].includes(key)) return 'No aplica';
  if (['presencial', 'presencialidad', 'en oficina'].includes(key)) return 'Presencial';
  if (['remoto', 'remota', 'teletrabajo', 'trabajo remoto'].includes(key)) return 'Remoto';
  if (['hibrido', 'hibrida', 'mixto', 'mixta'].includes(key)) return 'Híbrido';
  return raw.charAt(0).toLocaleUpperCase('es') + raw.slice(1).toLocaleLowerCase('es');
}
