/**
 * Diagnóstico de SOLO LECTURA: tipos de startDate/endDate y motivos de retiro
 * en las relaciones laborales. No escribe nada.
 *   node scripts/diagnose-employment-dates-and-reasons.mjs
 */
import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(scriptDir, 'serviceAccount.json'), 'utf8'));
let app;
try { app = getApp(); } catch { app = initializeApp({ credential: cert(serviceAccount) }); }
const db = getFirestore(app);

const kind = value => {
  if (value === undefined) return 'ausente';
  if (value === null) return 'null';
  if (typeof value?.toDate === 'function') return 'Timestamp';
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return 'texto vacío';
    if (s === '-') return 'texto "-"';
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return 'texto ISO';
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) return 'texto d/m o m/d';
    return 'texto otro';
  }
  return typeof value;
};
const count = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

const snap = await db.collectionGroup('employments').get();
const start = new Map(), end = new Map(), reasonByStatus = new Map(), sources = new Map();
const noStartGroups = new Map();
snap.docs.forEach(doc => {
  const r = doc.data();
  const employeeId = r.employeeId || doc.ref.parent.parent?.id;
  count(start, `${r.status}|${kind(r.startDate)}`);
  count(end, `${r.status}|${kind(r.endDate)}`);
  count(reasonByStatus, `${r.status}|${r.terminationReason ?? '(sin motivo)'}`);
  count(sources, `${r.source?.system ?? '(sin source)'}`);
  if (!['Timestamp'].includes(kind(r.startDate))) {
    const key = `${employeeId}|${String(r.companyName ?? '').trim().toLowerCase()}`;
    noStartGroups.set(key, (noStartGroups.get(key) ?? 0) + 1);
  }
});
const print = (title, map) => {
  console.log(`\n== ${title}`);
  [...map.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(String(v).padStart(6), k));
};
console.log('Relaciones:', snap.size);
print('startDate por estado|tipo', start);
print('endDate por estado|tipo', end);
print('motivo por estado (top)', new Map([...reasonByStatus.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)));
print('origen', sources);
const multi = [...noStartGroups.values()].filter(v => v > 1);
console.log(`\nPersona+empresa con >1 relación sin startDate Timestamp: ${multi.length} grupos, ${multi.reduce((s, v) => s + v, 0)} relaciones`);
