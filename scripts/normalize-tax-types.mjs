/**
 * normalize-tax-types.mjs
 *
 * Renombra taxType en tax_obligations usando un mapa de alias → nombre canónico.
 * Uso:
 *   node scripts/normalize-tax-types.mjs --dry-run   (solo muestra qué cambiaría)
 *   node scripts/normalize-tax-types.mjs              (aplica los cambios)
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

// ── Aliases simples (sin ambigüedad) ─────────────────────────────────────────
const SIMPLE_ALIASES = {
  'retefuente':                     'Retención en la Fuente',
  'retencion en la fuente':         'Retención en la Fuente',
  'retencion fuente':               'Retención en la Fuente',
  'retencion en la fuente mensual': 'Retención en la Fuente',
  'retencion de ica':               'ReteICA',
  'retencion ica':                  'ReteICA',
};

// ── Aliases ambiguos: se resuelven mirando el campo `period` ─────────────────
// Si el period contiene "Bim" → bimestral; "Cuatrim" → cuatrimestral
const AMBIGUOUS = {
  'impuesto de industria y comercio': { bim: 'ICA Bimestral', cuatrim: 'ICA Cuatrimestral' },
  'ica':                              { bim: 'ICA Bimestral', cuatrim: 'ICA Cuatrimestral' },
};

const normalize = (s = '') =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
   .replace(/[.,\-]/g, '').replace(/\s+/g, ' ').trim();

async function main() {
  console.log(DRY_RUN ? '🔍  DRY RUN — no se escribirá nada\n' : '✏️   Modo escritura activo\n');

  const snap = await db.collection('tax_obligations').get();
  console.log(`Total obligaciones en Firestore: ${snap.size}\n`);

  const updates = [];

  const unresolved = [];

  for (const doc of snap.docs) {
    const { taxType, period = '' } = doc.data();
    if (!taxType) continue;

    const key = normalize(taxType);
    let canonical = null;

    // 1. Alias simple
    if (SIMPLE_ALIASES[key]) {
      canonical = SIMPLE_ALIASES[key];

    // 2. Alias ambiguo — resolver por period
    } else if (AMBIGUOUS[key]) {
      const p = period.toLowerCase();
      if (p.includes('bim')) {
        canonical = AMBIGUOUS[key].bim;
      } else if (p.includes('cuatrim')) {
        canonical = AMBIGUOUS[key].cuatrim;
      } else {
        // Sin period claro → reportar para revisión manual
        unresolved.push({ id: doc.id, taxType, period });
        continue;
      }
    }

    if (!canonical || taxType === canonical) continue;
    updates.push({ id: doc.id, old: taxType, new: canonical });
  }

  if (unresolved.length > 0) {
    console.log(`⚠️   ${unresolved.length} registro(s) sin period claro — requieren revisión manual:\n`);
    for (const u of unresolved) {
      console.log(`  ID ${u.id}  taxType="${u.taxType}"  period="${u.period}"`);
    }
    console.log('');
  }

  if (updates.length === 0) {
    console.log('✅  No hay taxTypes que normalizar.');
    return;
  }

  // Agrupar por cambio para el resumen
  const byChange = {};
  for (const u of updates) {
    const key = `"${u.old}" → "${u.new}"`;
    byChange[key] = (byChange[key] ?? 0) + 1;
  }

  console.log(`Se ${DRY_RUN ? 'cambiarían' : 'cambiarán'} ${updates.length} obligación(es):\n`);
  for (const [change, count] of Object.entries(byChange).sort()) {
    console.log(`  ${count}x  ${change}`);
  }

  if (DRY_RUN) {
    console.log('\n🔍  DRY RUN — ejecuta sin --dry-run para aplicar.');
    return;
  }

  // Actualizar en batches de 499
  console.log('\nActualizando...');
  const BATCH_SIZE = 499;
  let updated = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = updates.slice(i, i + BATCH_SIZE);
    for (const u of chunk) {
      batch.update(db.collection('tax_obligations').doc(u.id), { taxType: u.new });
    }
    await batch.commit();
    updated += chunk.length;
    console.log(`  ${updated}/${updates.length} actualizadas...`);
  }

  console.log(`\n✅  Listo. ${updated} obligación(es) actualizadas.`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
