/**
 * find-impuesto-ventas.mjs
 *
 * Busca obligaciones en tax_obligations cuyo taxType sea "Impuesto a las Ventas"
 * (o variantes cercanas) para revisar antes de decidir si se borran.
 * Uso:
 *   node scripts/find-impuesto-ventas.mjs
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
  // Colección canónica según firestoreCollections.ts: accounting/data/tax_obligations
  const snap = await db.collection('accounting').doc('data').collection('tax_obligations').get();

  const matches = snap.docs.filter(doc => normalize(doc.data().taxType).includes('impuesto a las ventas'));

  console.log(`Total obligaciones revisadas: ${snap.docs.length}`);
  console.log(`Coincidencias con "Impuesto a las Ventas": ${matches.length}\n`);

  if (matches.length === 0) {
    console.log('No se encontraron obligaciones con ese taxType exacto.');
    return;
  }

  for (const doc of matches) {
    const d = doc.data();
    console.log(`- id: ${doc.id}`);
    console.log(`  empresa: ${d.company}  (companyId: ${d.companyId ?? 'sin companyId'}, nit: ${d.nit})`);
    console.log(`  taxType: ${d.taxType}`);
    console.log(`  period: ${d.period}  dueDate: ${d.dueDate}  year: ${d.year}`);
    console.log(`  status: ${d.status}`);
    console.log('');
  }
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
