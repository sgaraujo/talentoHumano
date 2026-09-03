/**
 * Limpia los documentos de `employments` duplicados por doble importación:
 * mismo empleado + empresa + status + fechas, uno con projectName vacío
 * ("sin dato") y otro con el proyecto real. Conserva el que tiene el dato
 * real, archiva y borra el que quedó vacío.
 *
 * Solo actúa sobre grupos que calzan EXACTAMENTE con ese patrón (2 docs,
 * uno vacío + uno con proyecto). Cualquier grupo que no calce (3+ docs,
 * ambos vacíos, ambos con proyecto distinto, etc.) se deja intacto y se
 * reporta aparte para revisión manual — no se toca a ciegas.
 *
 * Uso:
 *   node scripts/cleanup-duplicate-employments.mjs
 *   node scripts/cleanup-duplicate-employments.mjs --apply
 */
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

const APPLY = process.argv.includes('--apply');

const toDate = (raw) => {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (raw && typeof raw.toDate === 'function') { const d = raw.toDate(); return isNaN(d.getTime()) ? null : d; }
  if (raw && typeof raw.seconds === 'number') return new Date(raw.seconds * 1000);
  if (typeof raw === 'string' && raw.trim()) {
    const s = raw.trim();
    const parts = s.split(/[\/\-]/);
    if (parts.length === 3 && parts.every(p => /^\d+$/.test(p))) {
      const [a, b, c] = parts.map(Number);
      if (a > 31) { const d = new Date(a, b - 1, c); if (!isNaN(d.getTime())) return d; }
      else {
        const year = c < 100 ? (c < 50 ? 2000 + c : 1900 + c) : c;
        if (a > 12 && b <= 12) return new Date(year, b - 1, a);
        if (b > 12 && a <= 12) return new Date(year, a - 1, b);
        if (a >= 1 && a <= 12 && b >= 1 && b <= 31) return new Date(year, a - 1, b);
      }
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};
const normalize = (v) => String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const ymd = (d) => d ? d.toISOString().slice(0, 10) : 'null';
const isBlankProject = (p) => !p || !p.trim() || normalize(p) === 'sindato' || normalize(p) === 'sinproyecto';

const [companiesSnap, employmentsSnap] = await Promise.all([
  db.collection('organization/data/companies').get(),
  db.collectionGroup('employments').get(),
]);
const companies = companiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const thCompanies = companies.filter(c => c.activeTH);

let relations = employmentsSnap.docs.map(d => ({
  ref: d.ref, path: d.ref.path, id: d.id,
  employeeId: d.data().employeeId || d.ref.parent.parent?.id, ...d.data(),
}));
const relationsTH = relations.filter(r => thCompanies.some(c => {
  if (r.companyId && r.companyId === c.id) return true;
  const accepted = [c.name, ...(c.aliases ?? [])].map(normalize);
  return accepted.includes(normalize(r.companyName));
}));

const groups = new Map();
for (const r of relationsTH) {
  const startN = ymd(toDate(r.startDate));
  const endN = ymd(toDate(r.endDate));
  const key = `${r.employeeId}|${normalize(r.companyName)}|${r.status}|${startN}|${endN}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}
const dupGroups = [...groups.entries()].filter(([, docs]) => docs.length > 1);

let autoResolve = [];
let needsReview = [];
for (const [key, docs] of dupGroups) {
  if (docs.length !== 2) { needsReview.push({ key, docs, reason: `${docs.length} documentos (no 2)` }); continue; }
  const [d1, d2] = docs;
  const d1Blank = isBlankProject(d1.projectName);
  const d2Blank = isBlankProject(d2.projectName);
  if (d1Blank && !d2Blank) { autoResolve.push({ key, keep: d2, remove: d1 }); continue; }
  if (d2Blank && !d1Blank) { autoResolve.push({ key, keep: d1, remove: d2 }); continue; }
  needsReview.push({ key, docs, reason: d1Blank && d2Blank ? 'ambos con proyecto vacío' : 'ambos con proyecto (no vacío)' });
}

console.log(`Total grupos duplicados: ${dupGroups.length}`);
console.log(`Auto-resolubles (1 vacío + 1 con proyecto real): ${autoResolve.length}`);
console.log(`Necesitan revisión manual (no calzan el patrón): ${needsReview.length}`);

if (needsReview.length > 0) {
  console.log(`\n--- Grupos que necesitan revisión manual (NO se tocan) ---`);
  for (const { key, docs, reason } of needsReview.slice(0, 30)) {
    console.log(`[${reason}] ${key} -> ${docs.map(d => `${d.id}(proj:"${d.projectName ?? ''}")`).join(', ')}`);
  }
  if (needsReview.length > 30) console.log(`... y ${needsReview.length - 30} más`);
}

console.log(`\n=== ${APPLY ? 'APLICANDO' : 'SIMULACIÓN'}: se archivarán y borrarán ${autoResolve.length} documentos duplicados ===`);

if (!APPLY) {
  console.log('\nMuestra de las primeras 10 acciones planeadas:');
  for (const { keep, remove } of autoResolve.slice(0, 10)) {
    console.log(`  CONSERVAR ${keep.path} (proj:"${keep.projectName}")  |  BORRAR ${remove.path} (proj:"${remove.projectName}")`);
  }
  process.exit(0);
}

const archive = db.collection('human_resources/data/employment_archive');
let done = 0;
for (let i = 0; i < autoResolve.length; i += 400) {
  const chunk = autoResolve.slice(i, i + 400);
  const batch = db.batch();
  for (const { remove, keep } of chunk) {
    const { ref, path, ...data } = remove;
    // El mismo ID histórico puede existir bajo empleados distintos; incluir la
    // cédula evita que un archivo sobrescriba el respaldo de otra persona.
    batch.set(archive.doc(`${remove.employeeId}__${remove.id}`), {
      ...data,
      originalPath: path,
      archivedAt: FieldValue.serverTimestamp(),
      archivedReason: 'duplicate-import-blank-project',
      consolidatedInto: keep.path,
    });
    batch.delete(remove.ref);
  }
  await batch.commit();
  done += chunk.length;
  console.log(`Progreso: ${done}/${autoResolve.length}`);
}
console.log(`Listo. ${done} documentos duplicados archivados y eliminados.`);
