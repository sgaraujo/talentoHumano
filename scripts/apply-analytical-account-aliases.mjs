/**
 * Aplica los alias aprobados por Talento Humano en el Excel generado por
 * propose-analytical-account-aliases.mjs.
 *
 * Por cada fila con Aprobar = SI agrega "Nombre en Expedientes" a `aliases` de
 * la cuenta indicada en "Cuenta correcta (si es otra)" o, si está vacía, en
 * "Cuenta propuesta" (misma empresa). No cambia nombres ni estados.
 *
 *   node scripts/apply-analytical-account-aliases.mjs <archivo.xlsx>           → SIMULA
 *   node scripts/apply-analytical-account-aliases.mjs <archivo.xlsx> --apply   → respaldo JSON y aplica
 */
import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import XLSX from 'xlsx';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const file = process.argv.slice(2).find(arg => !arg.startsWith('--'));
const APPLY = process.argv.includes('--apply');
if (!file || !existsSync(resolve(file))) {
  console.error('Uso: node scripts/apply-analytical-account-aliases.mjs <archivo.xlsx> [--apply]');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(join(scriptDir, 'serviceAccount.json'), 'utf8'));
let app;
try { app = getApp(); } catch { app = initializeApp({ credential: cert(serviceAccount) }); }
const db = getFirestore(app);

const text = v => String(v ?? '').trim();
const norm = v => text(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es').replace(/[^a-z0-9]/g, '');

const book = XLSX.readFile(resolve(file));
const rows = XLSX.utils.sheet_to_json(book.Sheets['Propuesta'] ?? book.Sheets[book.SheetNames[0]], { defval: '' });

const [companiesSnap, projectsSnap] = await Promise.all([
  db.collection('organization/data/companies').get(),
  db.collection('organization/data/projects').get(),
]);
const companies = companiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const companyOf = name => companies.find(c => [c.name, ...(c.aliases ?? [])].map(norm).includes(norm(name)));
const projects = projectsSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));

const additions = new Map(); // projectId → { project, aliases: Set }
const problems = [];
rows.forEach((row, index) => {
  if (norm(row['Aprobar']) !== 'si') return;
  const line = index + 2;
  const alias = text(row['Nombre en Expedientes']);
  const targetName = text(row['Cuenta correcta (si es otra)']) || text(row['Cuenta propuesta']);
  const company = companyOf(row['Empresa']);
  if (!alias || !targetName) return problems.push(`Fila ${line}: falta el nombre o la cuenta destino.`);
  if (!company) return problems.push(`Fila ${line}: la empresa "${row['Empresa']}" no está en el catálogo.`);
  const candidates = projects.filter(p => p.companyId === company.id && norm(p.name) === norm(targetName));
  const target = candidates.length === 1 ? candidates[0] : candidates.find(p => p.status === 'activo');
  if (!target) return problems.push(`Fila ${line}: no existe la cuenta "${targetName}" en ${company.name}.`);
  // El alias no puede ser ya el nombre o alias de OTRA cuenta de la empresa.
  const owner = projects.find(p => p.id !== target.id && p.companyId === company.id
    && [p.name, ...(p.aliases ?? [])].map(norm).includes(norm(alias)));
  if (owner) return problems.push(`Fila ${line}: "${alias}" ya pertenece a la cuenta "${owner.name}".`);
  const existing = new Set([target.name, ...(target.aliases ?? [])].map(norm));
  if (existing.has(norm(alias))) return;
  if (!additions.has(target.id)) additions.set(target.id, { project: target, aliases: new Map() });
  additions.get(target.id).aliases.set(norm(alias), alias);
});

console.log(`Cuentas que reciben alias: ${additions.size}`);
additions.forEach(({ project, aliases }) => {
  console.log(`  ${project.companyName} | ${project.name} (${project.status}) ← ${[...aliases.values()].map(a => `"${a}"`).join(', ')}`);
});
if (problems.length) {
  console.log(`\nFilas con problemas (${problems.length}), no se aplican:`);
  problems.forEach(p => console.log(`  ${p}`));
}

if (!APPLY) {
  console.log('\nSIMULACIÓN: no se escribió nada. Ejecuta con --apply para aplicar.');
  process.exit(0);
}

const stamp = Date.now();
const backupPath = join(scriptDir, `projects-aliases-backup-${stamp}.json`);
writeFileSync(backupPath, JSON.stringify([...additions.values()].map(({ project }) => ({
  path: project.ref.path, aliases: project.aliases ?? [],
})), null, 2));
console.log(`\nRespaldo: ${backupPath}`);

const batch = db.batch();
additions.forEach(({ project, aliases }) => batch.update(project.ref, {
  aliases: FieldValue.arrayUnion(...aliases.values()),
  aliasesRun: `apply-analytical-account-aliases-${stamp}`,
  updatedAt: FieldValue.serverTimestamp(),
}));
await batch.commit();
console.log(`Listo: alias agregados a ${additions.size} cuentas.`);
process.exit(0);
