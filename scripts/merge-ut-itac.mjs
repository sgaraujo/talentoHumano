/**
 * merge-ut-itac.mjs
 *
 * "Unión Temporal Itac Colombia" y "UNIÓN TEMPORAL ITAC" son la misma
 * empresa (confirmado: solo existe un doc en organization/data/companies,
 * "UNIÓN TEMPORAL ITAC", nit 901351139-9). En accounting/data/tax_obligations
 * hay 14 registros con el nombre variante "Unión Temporal Itac Colombia"
 * (nit sin dígito de verificación) que no se solapan en taxType/period con
 * los 4 registros ya canónicos, y ninguno tiene datos de usuario, así que
 * solo se renombran (sin borrar nada).
 *
 * Uso:
 *   node scripts/merge-ut-itac.mjs        → simulación
 *   node scripts/merge-ut-itac.mjs --run  → ejecuta en Firestore
 */
import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(__dirname, 'serviceAccount.json'), 'utf8'));

let app;
try { app = getApp(); } catch { app = initializeApp({ credential: cert(serviceAccount) }); }
const db = getFirestore(app);

const DRY_RUN = !process.argv.includes('--run');

const VARIANT_NAME = 'Unión Temporal Itac Colombia';
const CANONICAL_NAME = 'UNIÓN TEMPORAL ITAC';
const CANONICAL_NIT = '901351139-9';

async function main() {
  console.log(`\n🔍 Modo: ${DRY_RUN ? 'SIMULACIÓN (sin cambios)' : '✅ EJECUCIÓN REAL'}\n`);

  const taxSnap = await db.collection('accounting').doc('data').collection('tax_obligations').get();
  const variantDocs = taxSnap.docs.filter(doc => doc.data().company === VARIANT_NAME);
  const canonicalDocs = taxSnap.docs.filter(doc => doc.data().company === CANONICAL_NAME);

  console.log(`Variante "${VARIANT_NAME}": ${variantDocs.length} docs`);
  console.log(`Canónico "${CANONICAL_NAME}": ${canonicalDocs.length} docs\n`);

  const canonicalKeys = new Set(canonicalDocs.map(d => `${d.data().taxType}||${d.data().period ?? ''}`));

  const ops = [];
  const conflicts = [];
  for (const doc of variantDocs) {
    const d = doc.data();
    const key = `${d.taxType}||${d.period ?? ''}`;
    if (canonicalKeys.has(key)) {
      conflicts.push({ id: doc.id, taxType: d.taxType, period: d.period });
      continue;
    }
    console.log(`✏️  ${doc.id} | "${d.taxType}" / "${d.period}" | nit ${d.nit} → ${CANONICAL_NIT}`);
    ops.push({ ref: doc.ref, data: { company: CANONICAL_NAME, nit: CANONICAL_NIT } });
  }

  if (conflicts.length) {
    console.log(`\n⛔ CONFLICTOS (mismo taxType/period ya existe en canónico), no se tocan:`);
    for (const c of conflicts) console.log(`  ${c.id} | "${c.taxType}" / "${c.period}"`);
  }

  console.log(`\nOperaciones a ejecutar: ${ops.length} | Conflictos: ${conflicts.length}\n`);

  if (DRY_RUN) {
    console.log(`💡 Para ejecutar: node scripts/merge-ut-itac.mjs --run\n`);
    return;
  }

  const backupData = variantDocs.map(doc => ({ id: doc.id, path: doc.ref.path, ...doc.data() }));
  const backupFile = join(__dirname, `backup_ut_itac_${Date.now()}.json`);
  writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
  console.log(`💾 Backup guardado en: ${backupFile}\n`);

  const batch = db.batch();
  for (const op of ops) batch.update(op.ref, op.data);
  await batch.commit();

  console.log(`✅ Operaciones ejecutadas: ${ops.length}\n`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
