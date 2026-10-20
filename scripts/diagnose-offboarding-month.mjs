/**
 * Lista los retiros de un mes y, para cada persona, si se le puede enviar la
 * encuesta de salida (mismas reglas que functions/src/offboarding). Solo lee.
 *
 * Uso: node scripts/diagnose-offboarding-month.mjs 2026-10
 */
import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(scriptDir, 'serviceAccount.json'), 'utf8'));
let app;
try { app = getApp(); } catch { app = initializeApp({ credential: cert(serviceAccount) }); }
const db = getFirestore(app);

const [year, month] = (process.argv[2] || '2026-10').split('-').map(Number);

// Misma conversión que functions/src/offboarding/offboarding.ts
function toDate(value) {
  if (!value) return null;
  const valid = (date) => Number.isNaN(date.getTime()) ? null : date;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return valid(value);
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') return valid(value.toDate());
    const seconds = typeof value.seconds === 'number' ? value.seconds : value._seconds;
    return typeof seconds === 'number' ? valid(new Date(seconds * 1000)) : null;
  }
  const text = String(value).trim();
  const timestamp = text.match(/Timestamp\s*\(\s*seconds\s*=\s*(-?\d+)/i);
  if (timestamp) return valid(new Date(Number(timestamp[1]) * 1000));
  const ymd = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return valid(new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])));
  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return valid(new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
  return valid(new Date(text));
}
const iso = (d) => d ? d.toISOString().slice(0, 10) : '—';
const inMonth = (d) => d && d.getFullYear() === year && d.getMonth() === month - 1;

const settings = (await db.doc('human_resources/data/settings/offboarding').get()).data() ?? {};
console.log('Configuración offboarding:', JSON.stringify(settings));
const excluded = settings.excludedReasons ?? ['Fallecimiento', 'Anulado'];

const relationsSnap = await db.collectionGroup('employments').get();
const byEmployee = new Map();
relationsSnap.docs.forEach((snap) => {
  if (!snap.ref.path.startsWith('human_resources/data/employees/')) return;
  const employeeId = snap.ref.parent.parent.id;
  if (!byEmployee.has(employeeId)) byEmployee.set(employeeId, []);
  byEmployee.get(employeeId).push({ id: snap.id, ...snap.data() });
});

const surveys = new Set((await db.collection('human_resources/data/offboarding_surveys').get()).docs.map((d) => d.id));

const rows = [];
for (const [employeeId, relations] of byEmployee) {
  if (!relations.some((r) => r.status === 'retired' && inMonth(toDate(r.endDate)))) continue;
  const employee = (await db.doc(`human_resources/data/employees/${employeeId}`).get()).data() ?? {};
  const latest = relations.filter((r) => r.status === 'retired')
    .sort((a, b) => (toDate(b.endDate)?.getTime() ?? 0) - (toDate(a.endDate)?.getTime() ?? 0))[0];
  const email = String(employee.personalEmail ?? '').trim().toLowerCase();
  let estado = 'ENVIAR';
  if (relations.some((r) => r.status === 'active')) estado = 'tiene contrato activo';
  else if (!inMonth(toDate(latest.endDate))) estado = `último retiro es ${iso(toDate(latest.endDate))}`;
  else if (latest.terminationReason && excluded.includes(latest.terminationReason)) estado = `motivo excluido (${latest.terminationReason})`;
  else if (surveys.has(`${employeeId}_${latest.id}`)) estado = 'ya tiene encuesta';
  else if (!email) estado = 'ENVIAR (sin correo personal → quedará "no enviado")';
  rows.push({ employeeId, nombre: employee.fullName ?? '', retiro: iso(toDate(latest.endDate)), motivo: latest.terminationReason ?? '', correo: email, estado });
}

rows.sort((a, b) => a.estado.localeCompare(b.estado) || a.retiro.localeCompare(b.retiro));
console.table(rows);
console.log(`Total retirados en ${year}-${String(month).padStart(2, '0')}: ${rows.length}`);
console.log(`A enviar: ${rows.filter((r) => r.estado.startsWith('ENVIAR')).length}`);
console.log('IDS_A_ENVIAR=' + JSON.stringify(rows.filter((r) => r.estado.startsWith('ENVIAR')).map((r) => r.employeeId)));
