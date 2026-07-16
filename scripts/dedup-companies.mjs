/**
 * dedup-companies.mjs
 *
 * Consolida empresas duplicadas en la colección `companies`.
 * Criterio: misma empresa si el nombre normalizado coincide.
 * Se queda con el registro que tiene el NIT más completo (con dígito verificador "XXXXXXXXX-D").
 * Los duplicados se eliminan.
 *
 * Uso:
 *   node scripts/dedup-companies.mjs --dry-run   (solo muestra qué haría)
 *   node scripts/dedup-companies.mjs              (aplica los cambios)
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

const norm = s => (s ?? '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();

// NIT con guión (ej. "900550189-7") es más completo que sin guión ("900550189")
const nitScore = nit => {
  const s = (nit ?? '').trim();
  if (s.includes('-')) return 2; // tiene dígito verificador separado con guión
  if (s.replace(/\D/g, '').length >= 10) return 1; // dígito verificador concatenado
  return 0; // sin dígito verificador
};

async function main() {
  console.log(DRY_RUN ? '🔍  DRY RUN\n' : '✏️   Modo escritura\n');

  const snap = await db.collection('companies').get();
  console.log(`Total empresas: ${snap.size}\n`);

  // Agrupar por nombre normalizado
  const groups = new Map(); // normName → [{id, data}]
  for (const doc of snap.docs) {
    const data = doc.data();
    const key = norm(data.name ?? '');
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id: doc.id, data });
  }

  const toDelete = [];
  const toUpdate = []; // {id, nit} — actualizar NIT del ganador si el perdedor tenía mejor NIT

  console.log('Grupos con duplicados:\n');
  let hasDups = false;

  for (const [name, docs] of groups) {
    if (docs.length === 1) continue;
    hasDups = true;

    // Elegir el "ganador": el que tenga mejor NIT (con guión preferido)
    docs.sort((a, b) => nitScore(b.data.nit) - nitScore(a.data.nit));
    const winner = docs[0];
    const losers = docs.slice(1);

    console.log(`📌 "${winner.data.name}" (${docs.length} registros)`);
    console.log(`   ✅ Conservar: ID=${winner.id}  NIT="${winner.data.nit}"`);
    for (const l of losers) {
      console.log(`   🗑️  Eliminar:  ID=${l.id}   NIT="${l.data.nit}"`);
      toDelete.push(l.id);
    }
    console.log('');
  }

  if (!hasDups) {
    console.log('✅  No hay empresas duplicadas.\n');
    return;
  }

  console.log(`Se ${DRY_RUN ? 'eliminarían' : 'eliminarán'} ${toDelete.length} registro(s) duplicados.\n`);

  if (DRY_RUN) {
    console.log('🔍  DRY RUN — ejecuta sin --dry-run para aplicar.');
    return;
  }

  // Eliminar duplicados en batch
  const batch = db.batch();
  for (const id of toDelete) {
    batch.delete(db.collection('companies').doc(id));
  }
  await batch.commit();

  console.log(`✅  Listo. ${toDelete.length} empresa(s) duplicada(s) eliminadas.`);
  console.log('\n⚠️  Recuerda también actualizar las tax_obligations con el sync-company-names.mjs para que los NITs queden uniformes.');
}

main().catch(e => { console.error(e); process.exit(1); });
