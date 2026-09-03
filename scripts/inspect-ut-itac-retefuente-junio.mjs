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

const ids = ['aIj98hepgol60yOReUU0', 'oriAKHLRXE0VbRGvOeZR'];
for (const id of ids) {
  const snap = await db.collection('accounting/data/tax_obligations').doc(id).get();
  console.log(`--- ${id} ---`);
  console.log(JSON.stringify(snap.data(), null, 2));
}
