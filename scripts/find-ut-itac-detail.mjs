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
const matchesItacUT = (s) => normalize(s).includes('temporal itac');

async function main() {
  const taxSnap = await db.collection('accounting').doc('data').collection('tax_obligations').get();
  const matches = taxSnap.docs.filter(doc => matchesItacUT(doc.data().company));
  for (const doc of matches) {
    const d = doc.data();
    console.log(`id:${doc.id} | company:"${d.company}" | nit:${d.nit} | taxType:"${d.taxType}" | period:"${d.period}" | dueDate:${d.dueDate} | status:${d.status} | proyectado:${d.proyectado} | pagado:${d.pagado} | paidAt:${d.paidAt} | stepOwners:${JSON.stringify(d.stepOwners||{})}`);
  }
}
main().catch(err => { console.error('Error:', err); process.exit(1); });
