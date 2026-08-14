/**
 * delete-impuesto-ventas.mjs
 *
 * Borra las obligaciones con taxType "Impuesto a las Ventas" (duplicados
 * manuales de lo que el calendario DIAN ya genera como "IVA Cuatrimestral").
 * Uso:
 *   node scripts/delete-impuesto-ventas.mjs
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

const normalize = (s) => (s ?? '').toString().toLowerCase().normalize('NFD')
  .replace(/\p{Diacritic}/gu, '').replace(/[.\-,]/g, '').replace(/\s+/g, ' ').trim();

async function main() {
  const col = db.collection('accounting').doc('data').collection('tax_obligations');
  const snap = await col.get();
  const matches = snap.docs.filter(doc => normalize(doc.data().taxType).includes('impuesto a las ventas'));

  if (matches.length === 0) {
    console.log('No hay obligaciones con ese taxType. Nada que borrar.');
    return;
  }

  console.log(`Borrando ${matches.length} obligación(es):\n`);
  const batch = db.batch();
  for (const doc of matches) {
    const d = doc.data();
    console.log(`  - ${d.company}  ${d.dueDate}  ${d.taxType}  (${doc.id})`);
    batch.delete(doc.ref);
  }
  await batch.commit();
  console.log(`\n✅  ${matches.length} obligación(es) eliminada(s).`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
