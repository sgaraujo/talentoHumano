/** Inspección de solo lectura de los tres pares ICA pendientes detectados. */
import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(here, 'serviceAccount.json'), 'utf8'));
let app;
try { app = getApp(); } catch { app = initializeApp({ credential: cert(serviceAccount) }); }
const db = getFirestore(app);

const ids = [
  '9XWYTe05J72qnVt1sbyb', 'yEq9I16GBXud1lTFDNVm',
  'JJsGrsI3414ydB8r5FfB', 'qtcNgFt4n96Snhz1qfxE',
  'exkQOEw1LOJc58VYYiw3', 'qwBEymvxa5EHGhfub1sm',
];

for (const id of ids) {
  const snap = await db.doc(`accounting/data/tax_obligations/${id}`).get();
  const data = snap.data() ?? {};
  const meaningful = Object.fromEntries(Object.entries(data).filter(([, value]) =>
    value !== '' && value !== null && value !== undefined &&
    (!Array.isArray(value) || value.length > 0) &&
    (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 0)
  ));
  console.log(JSON.stringify({ id, exists: snap.exists, ...meaningful }, null, 2));
}
