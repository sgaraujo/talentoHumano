import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(readFileSync(join(__dirname, 'serviceAccount.json'), 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const snap = await db.collection('companies').get();
const docs = snap.docs.filter(d => {
  const n = (d.data().name ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  return n.includes('inteegra');
});

console.log(`Encontradas ${docs.length} empresa(s) con "inteegra":`);
for (const doc of docs) {
  const d = doc.data();
  console.log(`  ID: ${doc.id} | ${d.name} | active=${d.active} | activeContabilidad=${d.activeContabilidad}`);
  await doc.ref.update({ active: true, activeContabilidad: true });
  console.log(`  ✅ Activada`);
}
process.exit();
