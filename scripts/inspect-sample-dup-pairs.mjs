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

const pairs = [
  ['human_resources/data/employees/1000018799/employments/netcol-ingenieria-s-a-s--flm-movistar-ii-1fmn1yp',
   'human_resources/data/employees/1000018799/employments/netcol-ingenieria-s-a-s--sin-dato-1n1nkj8'],
  ['human_resources/data/employees/1007640331/employments/itac-colombia-s-a-s-somos-1wruvg7',
   'human_resources/data/employees/1007640331/employments/itac-colombia-s-a-s-sin-dato-1qghut5'],
];

for (const [keepPath, removePath] of pairs) {
  const [keepSnap, removeSnap] = await Promise.all([db.doc(keepPath).get(), db.doc(removePath).get()]);
  const keep = keepSnap.data();
  const remove = removeSnap.data();
  const allKeys = new Set([...Object.keys(keep), ...Object.keys(remove)]);
  console.log(`\n=== ${keepPath.split('/').pop()} vs ${removePath.split('/').pop()} ===`);
  for (const k of allKeys) {
    const kv = JSON.stringify(keep[k]);
    const rv = JSON.stringify(remove[k]);
    if (kv !== rv) console.log(`  DIFF ${k}: keep=${kv} | remove=${rv}`);
  }
}
