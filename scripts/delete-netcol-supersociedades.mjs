/**
 * delete-netcol-supersociedades.mjs
 *
 * Borra la obligación "Supersociedades 08 - Reporte de Sostenibilidad" de
 * NETCOL INGENIERÍA S.A.S BIC (id confirmado por find-netcol-supersociedades.mjs).
 * Uso:
 *   node scripts/delete-netcol-supersociedades.mjs
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

const ID = 'XvRgNPAmzHM49JU1dpWF';

async function main() {
  const ref = db.collection('accounting').doc('data').collection('tax_obligations').doc(ID);
  const snap = await ref.get();
  if (!snap.exists) { console.log(`No encontrado: ${ID}`); return; }
  const d = snap.data();
  console.log(`Eliminando: ${d.company} / ${d.taxType} / ${d.period} / ${d.dueDate} / ${d.status}`);
  await ref.delete();
  console.log('Eliminado.');
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
