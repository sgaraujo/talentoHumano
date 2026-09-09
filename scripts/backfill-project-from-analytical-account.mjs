/**
 * backfill-project-from-analytical-account.mjs
 *
 * Completa `projectName` en relaciones laborales activas que solo tienen
 * `analyticalAccount` (columna CUENTA ANALITICA del Excel) pero no
 * `projectName` (columna PROYECTO, la que vincula a la entidad
 * Proyecto/Cuenta analítica maestra usada por mensajería, analítica y
 * "Calidad de datos"). Esto pasa cuando en el Excel de importación la
 * columna PROYECTO quedó vacía para esa fila aunque CUENTA ANALITICA sí se
 * llenó.
 *
 * El proyecto a asignar se resuelve así, en orden:
 *   1. Mapeo confiable: si TODAS las relaciones de esa empresa con esa misma
 *      cuenta analítica (que sí tienen projectName) apuntan siempre al mismo
 *      proyecto, se usa ese proyecto.
 *   2. Si no hay mapeo confiable, pero el nombre de la cuenta analítica
 *      coincide exactamente con el nombre de un proyecto existente, se usa
 *      ese.
 *   3. Si ninguna de las dos aplica, se deja intacto (revisión manual) —
 *      visto en el diagnóstico: "CLARO DATAFILL" no tiene un mapeo unánime,
 *      así que no se toca.
 *
 * Uso:
 *   node scripts/backfill-project-from-analytical-account.mjs            (dry-run)
 *   node scripts/backfill-project-from-analytical-account.mjs --apply     (aplica)
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(readFileSync(join(__dirname, 'serviceAccount.json'), 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const APPLY = process.argv.includes('--apply');

async function main() {
  const projectsSnap = await db.collection('organization/data/projects').get();
  const projectNames = new Set(projectsSnap.docs.map(d => (d.data().name || '').trim().toUpperCase()));

  const employmentsSnap = await db.collectionGroup('employments').get();
  const pairCounts = new Map(); // "empresa|cuentaAnalitica" -> Map<projectName, count>
  const gaps = [];
  employmentsSnap.docs.forEach(d => {
    const e = d.data();
    const proj = (e.projectName || '').trim();
    const acct = (e.analyticalAccount || '').trim();
    const company = (e.companyName || '').trim().toUpperCase();
    if (proj && acct) {
      const key = `${company}|${acct.toUpperCase()}`;
      if (!pairCounts.has(key)) pairCounts.set(key, new Map());
      const inner = pairCounts.get(key);
      inner.set(proj, (inner.get(proj) ?? 0) + 1);
    }
    if (e.status === 'active' && acct && !proj) gaps.push({ ref: d.ref, employeeId: e.employeeId, fullName: e.fullName, companyName: e.companyName, analyticalAccount: acct });
  });

  const toFix = [];
  const skipped = [];
  gaps.forEach(g => {
    const key = `${(g.companyName || '').trim().toUpperCase()}|${g.analyticalAccount.toUpperCase()}`;
    const inner = pairCounts.get(key);
    let bestProject = null, bestCount = 0, totalVotes = 0;
    if (inner) inner.forEach((count, proj) => { totalVotes += count; if (count > bestCount) { bestCount = count; bestProject = proj; } });
    const confidentMap = bestProject && bestCount === totalVotes ? bestProject : null;
    const exact = projectNames.has(g.analyticalAccount.toUpperCase()) ? g.analyticalAccount : null;
    const resolvedProject = confidentMap || exact;
    if (resolvedProject) toFix.push({ ...g, resolvedProject });
    else skipped.push(g);
  });

  console.log(`=== ${toFix.length} relación(es) a completar, ${skipped.length} sin match confiable (quedan intactas) ===\n`);
  toFix.forEach(t => console.log(`  ${t.fullName} (${t.employeeId}, ${t.companyName}): projectName vacío -> "${t.resolvedProject}" (cuenta analítica: "${t.analyticalAccount}")`));
  if (skipped.length) {
    console.log('\n--- Sin match confiable (revisar a mano) ---');
    skipped.forEach(s => console.log(`  ${s.fullName} (${s.employeeId}, ${s.companyName}) cuenta analítica: "${s.analyticalAccount}"`));
  }

  const backupPath = join(__dirname, `project-backfill-backup-${Date.now()}.json`);
  writeFileSync(backupPath, JSON.stringify({ toFix: toFix.map(t => ({ ...t, ref: t.ref.path })), skipped }, null, 2), 'utf8');
  console.log(`\nBackup guardado en ${backupPath}`);

  if (!APPLY) {
    console.log(`\n(Dry-run — no se escribió nada. Vuelve a correr con --apply para aplicar los ${toFix.length} cambio(s).)`);
    return;
  }

  const batch = db.batch();
  toFix.forEach(t => batch.update(t.ref, { projectName: t.resolvedProject }));
  await batch.commit();
  console.log(`\n✔ Aplicado: se completaron ${toFix.length} relación(es).`);
}

main().catch(console.error).finally(() => process.exit());
