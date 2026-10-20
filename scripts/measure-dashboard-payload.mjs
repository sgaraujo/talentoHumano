// Solo lectura: mide cuántos documentos y cuántos KB descarga el dashboard.
// No imprime datos personales, solo conteos y tamaños.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
initializeApp({ credential: cert(JSON.parse(readFileSync(join(scriptDir, 'serviceAccount.json'), 'utf8'))) });
const db = getFirestore();

const sources = [
  ['employees', db.collection('human_resources/data/employees')],
  ['employments (collectionGroup)', db.collectionGroup('employments')],
  ['users (legacy)', db.collection('identity/data/users')],
  ['companies', db.collection('organization/data/companies')],
  ['projects', db.collection('organization/data/projects')],
];

let total = 0;
for (const [name, ref] of sources) {
  const snap = await ref.get();
  const bytes = snap.docs.reduce((sum, d) => sum + Buffer.byteLength(JSON.stringify(d.data())), 0);
  total += bytes;
  console.log(`${name.padEnd(32)} ${String(snap.size).padStart(6)} docs  ${(bytes / 1024).toFixed(0).padStart(6)} KB`);
}
console.log(`${'TOTAL'.padEnd(32)} ${''.padStart(6)}       ${(total / 1024).toFixed(0).padStart(6)} KB`);
