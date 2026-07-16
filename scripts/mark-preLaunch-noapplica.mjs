/**
 * mark-preLaunch-noapplica.mjs
 *
 * Marca como "No aplica" las obligaciones con estado "No iniciado" o vacío
 * con dueDate < 2026-07-01, EXCEPTO las empresas en KEEP.
 *
 * Uso:
 *   node scripts/mark-preLaunch-noapplica.mjs --dry-run
 *   node scripts/mark-preLaunch-noapplica.mjs
 */

import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(readFileSync(join(__dirname, 'serviceAccount.json'), 'utf8'));
let app; try { app = getApp(); } catch { app = initializeApp({ credential: cert(sa) }); }
const db = getFirestore(app);

const DRY_RUN = process.argv.includes('--dry-run');

// ── Empresas que SÍ tienen pendientes reales — NO tocar ──────────────────────
const KEEP = [
  'inteegra sas bic',
  'netcol ingenieria sas bic',
  'netcol ingenieria s a s bic',
  'consorcio scia netcol',
];

const norm = s => (s ?? '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

const CUTOFF = '2026-07-01'; // solo obligaciones de junio para abajo
const PENDING = new Set(['No iniciado', '', 'Sin gestionar']);

async function main() {
  console.log(DRY_RUN ? '🔍  DRY RUN\n' : '✏️   Modo escritura\n');

  const snap = await db.collection('tax_obligations').get();
  console.log(`Total obligaciones: ${snap.size}\n`);

  const toUpdate = [];

  for (const doc of snap.docs) {
    const d = doc.data();
    if (!d.dueDate || d.dueDate >= CUTOFF) continue;         // solo < julio
    if (!PENDING.has(d.status ?? '')) continue;              // solo pendientes
    if (KEEP.some(k => norm(d.company ?? '').includes(k))) continue; // conservar

    toUpdate.push({ id: doc.id, company: d.company, taxType: d.taxType, dueDate: d.dueDate, status: d.status ?? '' });
  }

  if (toUpdate.length === 0) {
    console.log('✅  No hay registros que actualizar.');
    return;
  }

  // Agrupar por empresa para mostrar resumen
  const byComp = {};
  for (const u of toUpdate) {
    if (!byComp[u.company]) byComp[u.company] = [];
    byComp[u.company].push(`${u.dueDate}  ${u.taxType}`);
  }

  console.log(`Se ${DRY_RUN ? 'marcarían' : 'marcarán'} ${toUpdate.length} obligación(es) como "No aplica":\n`);
  for (const [comp, items] of Object.entries(byComp).sort()) {
    console.log(`  📌 ${comp} (${items.length})`);
    for (const i of items) console.log(`     ${i}`);
  }

  if (DRY_RUN) {
    console.log('\n🔍  DRY RUN — ejecuta sin --dry-run para aplicar.');
    return;
  }

  const BATCH_SIZE = 499;
  let updated = 0;
  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const u of toUpdate.slice(i, i + BATCH_SIZE)) {
      batch.update(db.collection('tax_obligations').doc(u.id), {
        status: 'No aplica',
        observation: 'Gestionado antes del inicio del sistema',
      });
    }
    await batch.commit();
    updated += Math.min(BATCH_SIZE, toUpdate.length - i);
    console.log(`  ${updated}/${toUpdate.length} actualizadas...`);
  }

  console.log(`\n✅  Listo. ${updated} obligación(es) marcadas como "No aplica".`);
}

main().catch(e => { console.error(e); process.exit(1); });
