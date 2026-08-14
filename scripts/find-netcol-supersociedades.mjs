/**
 * find-netcol-supersociedades.mjs
 *
 * Busca la obligación "Supersociedades 08 - Reporte de Sostenibilidad" de
 * NETCOL INGENIERÍA S.A.S BIC (NIT 9011936678) para confirmar el id antes de borrarla.
 * Uso:
 *   node scripts/find-netcol-supersociedades.mjs
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

const cleanNit = (nit) => (nit ?? '').toString().replace(/[^0-9]/g, '');

async function main() {
  const snap = await db.collection('accounting').doc('data').collection('tax_obligations').get();

  const matches = snap.docs.filter(doc => {
    const d = doc.data();
    return cleanNit(d.nit).startsWith('901193667') && normalize(d.taxType).includes('supersociedades');
  });

  console.log(`Total obligaciones revisadas: ${snap.docs.length}`);
  console.log(`Coincidencias: ${matches.length}\n`);

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
