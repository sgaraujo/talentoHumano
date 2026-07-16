/**
 * delete-old-obligations.mjs
 *
 * Elimina todas las tax_obligations con dueDate anterior a 2026-06-01.
 * Uso:
 *   node scripts/delete-old-obligations.mjs --dry-run   (solo muestra qué borraría)
 *   node scripts/delete-old-obligations.mjs              (borra de verdad)
 */

import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(__dirname, 'serviceAccount.json'), 'utf8'));

let app;
try { app = getApp(); } catch { app = initializeApp({ credential: cert(serviceAccount) }); }

const db = getFirestore(app);

const DRY_RUN = process.argv.includes('--dry-run');
const CUTOFF  = '2026-06-01'; // se borran las que tienen dueDate < esto

async function main() {
  console.log(DRY_RUN ? '🔍  DRY RUN — no se borrará nada\n' : '🗑️   Modo eliminación activo\n');
  console.log(`Corte: obligaciones con dueDate < ${CUTOFF}\n`);

  const snap = await db.collection('tax_obligations').get();
  console.log(`Total en Firestore: ${snap.size} obligaciones\n`);

  const toDelete = snap.docs.filter(doc => {
    const { dueDate } = doc.data();
    return typeof dueDate === 'string' && dueDate < CUTOFF;
  });

  if (toDelete.length === 0) {
    console.log('✅  No hay obligaciones anteriores a junio.');
    return;
  }

  // Agrupar por empresa para el resumen
  const byCompany = {};
  for (const doc of toDelete) {
    const { company, dueDate, taxType, period } = doc.data();
    const key = company || '(sin empresa)';
    if (!byCompany[key]) byCompany[key] = [];
    byCompany[key].push({ dueDate, taxType, period, id: doc.id });
  }

  console.log(`Se ${DRY_RUN ? 'borrarían' : 'borrarán'} ${toDelete.length} obligación(es):\n`);
  for (const [company, obls] of Object.entries(byCompany).sort()) {
    console.log(`  ${company} (${obls.length})`);
    for (const o of obls.sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
      console.log(`    ${o.dueDate}  ${o.taxType}  ${o.period ?? ''}`);
    }
  }

  if (DRY_RUN) {
    console.log('\n🔍  DRY RUN — ejecuta sin --dry-run para borrar.');
    return;
  }

  // Eliminar en batches de 499
  console.log('\nEliminando...');
  const BATCH_SIZE = 499;
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = toDelete.slice(i, i + BATCH_SIZE);
    for (const doc of chunk) batch.delete(doc.ref);
    await batch.commit();
    deleted += chunk.length;
    console.log(`  ${deleted}/${toDelete.length} eliminadas...`);
  }

  console.log(`\n✅  Listo. ${deleted} obligación(es) eliminadas.`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
