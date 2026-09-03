/** Convierte las representaciones de fecha usadas históricamente en Firestore. */
export function parseFirestoreDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === 'function') {
    const parsed = value.toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const seconds = typeof value?.seconds === 'number'
    ? value.seconds
    : typeof value?._seconds === 'number' ? value._seconds : null;
  if (seconds !== null) {
    const parsed = new Date(seconds * 1000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'string') {
    const raw = value.trim();
    const timestampMatch = raw.match(/Timestamp\s*\(\s*seconds\s*=\s*(-?\d+)/i);
    if (timestampMatch) {
      const parsed = new Date(Number(timestampMatch[1]) * 1000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      const [year, month, day] = raw.slice(0, 10).split('-').map(Number);
      const parsed = new Date(year, month - 1, day);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function firestoreDateInput(value: any): string {
  const parsed = parseFirestoreDate(value);
  if (!parsed) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

export function firestoreDateLabel(value: any): string {
  const parsed = parseFirestoreDate(value);
  return parsed ? parsed.toLocaleDateString('es-CO') : '—';
}
