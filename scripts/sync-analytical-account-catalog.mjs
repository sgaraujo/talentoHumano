/**
 * Alinea el catálogo organization/data/projects ("Cuentas analíticas") con las
 * cuentas analíticas de las relaciones laborales. La cuenta de cada relación es
 * `projectName` o, si está vacío (caso actual de las cargas), `analyticalAccount`.
 *
 *  - Por cada empresa + cuenta con al menos una persona activa:
 *      existe en el catálogo (mismo nombre sin tildes/puntos) → queda "activo"
 *        y se renombra al nombre exacto que trae Expedientes
 *      no existe                             → se crea "activo"
 *  - Duplicados (ej. ADMINISTRACION / ADMINISTRACIÓN): se conserva uno (el de
 *    nombre exacto, luego el que tenga líder) y los demás quedan "inactivo".
 *  - Cuentas del catálogo sin personas activas → "inactivo" (no se borran:
 *    comunicaciones e historial pueden referenciarlas).
 *
 *   node scripts/sync-analytical-account-catalog.mjs           → SIMULA
 *   node scripts/sync-analytical-account-catalog.mjs --apply   → respaldo JSON y aplica
 */
import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(scriptDir, 'serviceAccount.json'), 'utf8'));
let app;
try { app = getApp(); } catch { app = initializeApp({ credential: cert(serviceAccount) }); }
const db = getFirestore(app);
const APPLY = process.argv.includes('--apply');
const stamp = Date.now();

const text = v => String(v ?? '').trim();
// Misma clave que usa el directorio de colaboradores para vincular proyecto.
const norm = v => text(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es').replace(/[^a-z0-9]/g, '');

const [companiesSnap, projectsSnap, employmentsSnap] = await Promise.all([
  db.collection('organization/data/companies').get(),
  db.collection('organization/data/projects').get(),
  db.collectionGroup('employments').get(),
]);
const companies = companiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const companyOf = name => companies.find(c => [c.name, ...(c.aliases ?? [])].map(norm).includes(norm(name)));
const projects = projectsSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));

// Cuentas con personas activas, por empresa del catálogo.
const accounts = new Map();
const unknownCompanies = new Map();
employmentsSnap.docs.forEach(doc => {
  const r = doc.data();
  const accountName = text(r.projectName) || text(r.analyticalAccount);
  if (r.status !== 'active' || !accountName) return;
  const company = companyOf(r.companyName);
  if (!company) { unknownCompanies.set(text(r.companyName), (unknownCompanies.get(text(r.companyName)) ?? 0) + 1); return; }
  const key = `${company.id}|${norm(accountName)}`;
  if (!accounts.has(key)) accounts.set(key, { company, name: accountName, active: 0 });
  accounts.get(key).active++;
});

// Cuentas antiguas del catálogo que son la misma cuenta con otro nombre. Se
// renombran (conservan id, miembros e historial de envíos). Validado con un
// comparativo: las personas activas de la cuenta antigua están hoy en la nueva.
//   [empresa, nombre antiguo, cuenta de Expedientes]
const RENAMES = [
  ['INTEEGRA SAS BIC', 'CLARO-NOC OTS Y DATAFILL', 'CLARO DATAFILL'],
  ['INTEEGRA SAS BIC', 'ZTE', 'ZTE MPW'],
  ['INTEEGRA SAS BIC', 'NOC ETB', 'UT EIP ETB'],
  ['ITAC COLOMBIA S.A.S', 'SOMOS', 'ADMINISTRACIÓN_SOMOS'],
  ['ITAC COLOMBIA S.A.S', 'FOMENTO TIC', 'ADMINISTRACIÓN_FOMETIC'],
];
const renameTarget = new Map(RENAMES.map(([company, from, to]) => {
  const c = companyOf(company);
  return [`${c?.id}|${norm(from)}`, `${c?.id}|${norm(to)}`];
}));
const keyOf = p => {
  const own = `${p.companyId}|${norm(p.name)}`;
  return renameTarget.get(own) ?? own;
};
// Claves por las que se reconoce una cuenta: su nombre y sus alias.
const keysOf = p => [keyOf(p), ...(p.aliases ?? []).map(alias => `${p.companyId}|${norm(alias)}`)];

const toCreate = [];
const toActivate = [];
const toRename = [];
const matched = new Set();
accounts.forEach((account, key) => {
  const candidates = projects.filter(p => keysOf(p).includes(key));
  const isAlias = p => keyOf(p) !== key;
  const existing = candidates.find(p => text(p.name) === account.name)
    ?? candidates.find(p => p.leaderId)
    ?? candidates[0];
  if (existing) {
    matched.add(existing.id);
    if (existing.status !== 'activo') toActivate.push({ project: existing, active: account.active });
    // Si la cuenta se reconoce por un alias, se conserva su nombre.
    if (!isAlias(existing) && text(existing.name) !== account.name) toRename.push({ project: existing, name: account.name, active: account.active });
  } else toCreate.push(account);
});
const toInactivate = projects.filter(p => !matched.has(p.id) && p.status === 'activo');

console.log(`Cuentas con personas activas: ${accounts.size}`);
console.log(`\nA crear (${toCreate.length}):`);
toCreate.sort((a, b) => a.company.name.localeCompare(b.company.name) || b.active - a.active)
  .forEach(a => console.log(`  + ${a.company.name} | ${a.name} — ${a.active} activos`));
console.log(`\nYa existen, se activan (${toActivate.length}):`);
toActivate.forEach(({ project, active }) => console.log(`  ↑ ${project.companyName ?? project.companyId} | ${project.name} — ${active} activos`));
console.log(`\nSe renombran al nombre de Expedientes (${toRename.length}):`);
toRename.forEach(({ project, name, active }) => console.log(`  ✎ ${project.companyName ?? project.companyId} | "${project.name}" → "${name}" — ${active} activos`));
console.log(`\nSin personas activas o duplicadas, se inactivan (${toInactivate.length}):`);
toInactivate.forEach(p => console.log(`  ↓ ${p.companyName ?? p.companyId} | ${p.name}`));
if (unknownCompanies.size) console.log(`\nAtención — empresas de las relaciones que no están en el catálogo de empresas: ${JSON.stringify(Object.fromEntries(unknownCompanies))}`);

if (!APPLY) {
  console.log('\nSIMULACIÓN: no se escribió nada. Ejecuta con --apply para aplicar.');
  process.exit(0);
}

const backupPath = join(scriptDir, `projects-backup-${stamp}.json`);
writeFileSync(backupPath, JSON.stringify(projects.map(({ ref, ...p }) => ({ path: ref.path, data: p })), null, 2));
console.log(`\nRespaldo del catálogo: ${backupPath}`);

const batch = db.batch();
toCreate.forEach(a => batch.set(db.collection('organization/data/projects').doc(), {
  name: a.name, companyId: a.company.id, companyName: a.company.name,
  status: 'activo', priority: 'media', headcount: 0, source: 'analytical_account',
  catalogSyncRun: `sync-analytical-account-catalog-${stamp}`,
  createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
}));
toActivate.forEach(({ project }) => batch.update(project.ref, {
  status: 'activo', catalogSyncRun: `sync-analytical-account-catalog-${stamp}`, updatedAt: FieldValue.serverTimestamp(),
}));
toRename.forEach(({ project, name }) => batch.update(project.ref, {
  name, catalogSyncRun: `sync-analytical-account-catalog-${stamp}`, updatedAt: FieldValue.serverTimestamp(),
}));
toInactivate.forEach(p => batch.update(p.ref, {
  status: 'inactivo', inactivatedReason: 'Sin personas activas en la cuenta analítica, o duplicada de otra',
  catalogSyncRun: `sync-analytical-account-catalog-${stamp}`, updatedAt: FieldValue.serverTimestamp(),
}));
await batch.commit();
console.log(`Listo: ${toCreate.length} creadas, ${toActivate.length} activadas, ${toRename.length} renombradas, ${toInactivate.length} inactivadas.`);
