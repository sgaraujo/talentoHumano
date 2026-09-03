import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(scriptDir, 'serviceAccount.json'), 'utf8'));
let app;
try { app = getApp(); } catch { app = initializeApp({ credential: cert(serviceAccount) }); }
const db = getFirestore(app);

const snap = await db.collection('accounting/data/tax_obligations').get();
const crc = snap.docs
  .map(d => ({ id: d.id, ...d.data() }))
  .filter(o => (o.taxType || '').toLowerCase().includes('crc'))
  .sort((a, b) => (a.company || '').localeCompare(b.company) || (a.dueDate || '').localeCompare(b.dueDate));

for (const o of crc) {
  console.log(`id:${o.id} | company:"${o.company}" | nit:${o.nit} | companyId:${o.companyId} | taxType:"${o.taxType}" | period:"${o.period}" | dueDate:${o.dueDate} | status:${o.status} | year:${o.year}`);
}
console.log(`\nTotal CRC obligations: ${crc.length}`);
