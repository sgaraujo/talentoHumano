/**
 * Diagnóstico de SOLO LECTURA:
 *  - ¿Los proyectos maestros (organization/data/projects) coinciden con PROYECTO
 *    (projectName) o con CUENTA ANALITICA (analyticalAccount) de las relaciones?
 *  - ¿Cuántas relaciones son del 2026 y qué depende del histórico?
 *   node scripts/diagnose-project-vs-analytical-account.mjs
 */
process.env.TZ = 'America/Bogota';
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

const norm = v => String(v ?? '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const year = v => {
  if (typeof v?.toDate === 'function') return v.toDate().getFullYear();
  const m = String(v ?? '').match(/(\d{2,4})\s*$/);
  if (!m) return null;
  const y = Number(m[1]);
  return y < 100 ? (y < 50 ? 2000 + y : 1900 + y) : y;
};

const [projectsSnap, companiesSnap, employmentsSnap, offboardingSnap, employeesSnap] = await Promise.all([
  db.collection('organization/data/projects').get(),
  db.collection('organization/data/companies').get(),
  db.collectionGroup('employments').get(),
  db.collection('human_resources/data/offboarding_surveys').get(),
  db.collection('human_resources/data/employees').get(),
]);
const companyNameById = new Map(companiesSnap.docs.map(d => [d.id, d.data().name]));
const projectKeys = new Set(projectsSnap.docs.map(d => {
  const p = d.data();
  return `${norm(p.companyName || companyNameById.get(p.companyId))}|${norm(p.name)}`;
}));
const projectNameKeys = new Set(projectsSnap.docs.map(d => norm(d.data().name)));

const rel = employmentsSnap.docs.map(d => d.data());
const active = rel.filter(r => r.status === 'active');
const pct = (n, t) => `${n} de ${t} (${t ? Math.round(n / t * 100) : 0} %)`;
const matchBy = (list, field) => list.filter(r => r[field] && projectKeys.has(`${norm(r.companyName)}|${norm(r[field])}`)).length;
const matchNameOnly = (list, field) => list.filter(r => r[field] && projectNameKeys.has(norm(r[field]))).length;

console.log(`Proyectos maestros: ${projectsSnap.size} (activos: ${projectsSnap.docs.filter(d => d.data().status === 'activo').length})`);
console.log(`Relaciones: ${rel.length} (activas: ${active.length})\n`);
for (const [label, list] of [['Activas', active], ['Todas', rel]]) {
  console.log(`== ${label}`);
  console.log(`  con PROYECTO (projectName):            ${pct(list.filter(r => r.projectName).length, list.length)}`);
  console.log(`  con CUENTA ANALITICA (analyticalAccount): ${pct(list.filter(r => r.analyticalAccount).length, list.length)}`);
  console.log(`  projectName coincide con proyecto maestro (empresa+nombre):       ${pct(matchBy(list, 'projectName'), list.length)}`);
  console.log(`  analyticalAccount coincide con proyecto maestro (empresa+nombre): ${pct(matchBy(list, 'analyticalAccount'), list.length)}`);
  console.log(`  analyticalAccount coincide solo por nombre:                       ${pct(matchNameOnly(list, 'analyticalAccount'), list.length)}`);
  console.log(`  projectName ≠ analyticalAccount (ambos llenos): ${list.filter(r => r.projectName && r.analyticalAccount && norm(r.projectName) !== norm(r.analyticalAccount)).length}\n`);
}

// Muestra de pares distintos PROYECTO → CUENTA ANALITICA en activas.
const pairs = new Map();
active.forEach(r => {
  if (!r.projectName && !r.analyticalAccount) return;
  const key = `${r.companyName} | PROYECTO="${r.projectName ?? ''}" → CUENTA="${r.analyticalAccount ?? ''}"`;
  pairs.set(key, (pairs.get(key) ?? 0) + 1);
});
console.log('== Pares PROYECTO → CUENTA ANALITICA en activas (top 25)');
[...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => console.log(String(v).padStart(5), k));

// Distribución por año
const byYear = new Map();
rel.forEach(r => {
  const key = r.status === 'active' ? 'activa' : `retiro ${year(r.endDate) ?? 'sin año'}`;
  byYear.set(key, (byYear.get(key) ?? 0) + 1);
});
console.log('\n== Relaciones por estado / año de retiro');
[...byYear.entries()].sort().forEach(([k, v]) => console.log(String(v).padStart(6), k));
const touches2026 = rel.filter(r => r.status === 'active' || year(r.endDate) === 2026 || year(r.startDate) === 2026).length;
console.log(`\nRelaciones activas o con ingreso/retiro en 2026: ${touches2026}; anteriores a 2026: ${rel.length - touches2026}`);

// Dependencias del histórico
const withAccess = employeesSnap.docs.filter(d => d.data().identityUserId).length;
console.log(`\nEncuestas de offboarding (referencian employmentId): ${offboardingSnap.size}`);
console.log(`Expedientes: ${employeesSnap.size}; vinculados a usuario de plataforma: ${withAccess}`);
let audits = 0, privates = 0;
for (const e of employeesSnap.docs.slice(0, 5000)) {
  const [a] = await Promise.all([e.ref.collection('audit').limit(1).get()]);
  if (!a.empty) audits++;
}
console.log(`Expedientes con historial de ediciones manuales (audit): ${audits}`);
