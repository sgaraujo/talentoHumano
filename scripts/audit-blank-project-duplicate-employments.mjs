/** Audita pares duplicados con cuenta analítica vacía. Solo lectura. */
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
const normalize = value => String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const dateKey = value => {
  if (!value) return 'null';
  if (typeof value?.toDate === 'function') return value.toDate().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const raw = String(value);
  const parts = raw.split(/[\/-]/).map(Number);
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    const [a, b, c] = parts;
    const year = c < 100 ? 2000 + c : c;
    const date = a > 12 ? new Date(year, b - 1, a) : new Date(year, a - 1, b);
    return date.toLocaleDateString('en-CA');
  }
  return raw;
};
const snap = await db.collectionGroup('employments').get();
const groups = new Map();
for (const doc of snap.docs) {
  const data = doc.data();
  const employeeId = data.employeeId || doc.ref.parent.parent?.id;
  const key = `${employeeId}|${normalize(data.companyName)}|${data.status}|${dateKey(data.startDate)}|${dateKey(data.endDate)}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({ id: doc.id, path: doc.ref.path, ...data });
}
const ignored = new Set(['id', 'path', 'source', 'updatedAt', 'createdAt']);
for (const [key, docs] of groups) {
  if (docs.length !== 2 || docs.some(doc => String(doc.projectName ?? '').trim())) continue;
  const [a, b] = docs;
  const fields = new Set([...Object.keys(a), ...Object.keys(b)]);
  const materialDiffs = [...fields].filter(field => !ignored.has(field) && JSON.stringify(a[field] ?? null) !== JSON.stringify(b[field] ?? null));
  const conflictingNonEmpty = materialDiffs.filter(field => {
    if (field === 'startDate' || field === 'endDate') return false;
    return a[field] !== undefined && a[field] !== null && a[field] !== ''
      && b[field] !== undefined && b[field] !== null && b[field] !== '';
  });
  console.log(JSON.stringify({
    key,
    ids: [a.id, b.id],
    materialDiffs,
    conflictingNonEmpty,
    sources: [a.source ?? null, b.source ?? null],
  }));
}
