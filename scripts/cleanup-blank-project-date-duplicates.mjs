/** Limpia pares vacíos que solo difieren en representación de fecha. */
import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
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
  const parts = String(value).split(/[\/-]/).map(Number);
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    const [a, b, c] = parts; const year = c < 100 ? 2000 + c : c;
    const date = a > 12 ? new Date(year, b - 1, a) : new Date(year, a - 1, b);
    return date.toLocaleDateString('en-CA');
  }
  return String(value);
};

const snap = await db.collectionGroup('employments').get();
const groups = new Map();
for (const document of snap.docs) {
  const data = document.data();
  const employeeId = data.employeeId || document.ref.parent.parent?.id;
  const key = `${employeeId}|${normalize(data.companyName)}|${data.status}|${dateKey(data.startDate)}|${dateKey(data.endDate)}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({ ref: document.ref, id: document.id, employeeId, ...data });
}

const ignored = new Set(['id', 'ref', 'source', 'updatedAt', 'createdAt', 'startDate', 'endDate']);
const actions = [];
for (const docs of groups.values()) {
  if (docs.length !== 2 || docs.some(item => String(item.projectName ?? '').trim())) continue;
  const [a, b] = docs;
  const fields = new Set([...Object.keys(a), ...Object.keys(b)]);
  const materialDiffs = [...fields].filter(field => !ignored.has(field) && JSON.stringify(a[field] ?? null) !== JSON.stringify(b[field] ?? null));
  if (materialDiffs.length) continue;
  const aTimestamp = typeof a.startDate?.toDate === 'function';
  const bTimestamp = typeof b.startDate?.toDate === 'function';
  if (aTimestamp === bTimestamp) continue;
  actions.push(aTimestamp ? { keep: a, remove: b } : { keep: b, remove: a });
}

const batch = db.batch();
const archive = db.collection('human_resources/data/employment_archive');
for (const { keep, remove } of actions) {
  const { ref, ...data } = remove;
  batch.set(archive.doc(`${remove.employeeId}__${remove.id}`), {
    ...data,
    originalPath: ref.path,
    archivedAt: FieldValue.serverTimestamp(),
    archivedReason: 'duplicate-import-date-representation-both-projects-blank',
    consolidatedInto: keep.ref.path,
  });
  batch.delete(ref);
}
await batch.commit();
console.log(`OK: ${actions.length} duplicados de fecha archivados y eliminados.`);
