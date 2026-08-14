/**
 * find-ut-itac.mjs
 *
 * Inspecciona todas las colecciones relevantes en busca de referencias a
 * "Unión Temporal Itac Colombia" / "UNIÓN TEMPORAL ITAC" para confirmar
 * si son duplicados antes de fusionarlos.
 *
 * Uso: node scripts/find-ut-itac.mjs
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

const matchesItacUT = (s) => {
  const n = normalize(s);
  return n.includes('temporal itac') || n.includes('ut itac') || n === 'union temporal itac colombia' || n === 'union temporal itac';
};

async function main() {
  console.log('=== organization/data/companies ===');
  const compSnap = await db.collection('organization/data/companies').get();
  for (const doc of compSnap.docs) {
    const d = doc.data();
    if (matchesItacUT(d.name)) {
      console.log(`- id: ${doc.id}`);
      console.log(`  name: ${d.name}`);
      console.log(`  nit: ${d.nit}`);
      console.log(`  ${JSON.stringify(d)}`);
      console.log('');
    }
  }

  console.log('\n=== accounting/data/tax_obligations ===');
  const taxSnap = await db.collection('accounting').doc('data').collection('tax_obligations').get();
  const taxMatches = taxSnap.docs.filter(doc => matchesItacUT(doc.data().company));
  console.log(`Total: ${taxSnap.docs.length} | Coincidencias: ${taxMatches.length}`);
  const byCompanyNit = new Map();
  for (const doc of taxMatches) {
    const d = doc.data();
    const key = `${d.company} | nit:${d.nit}`;
    byCompanyNit.set(key, (byCompanyNit.get(key) ?? 0) + 1);
  }
  for (const [key, count] of byCompanyNit) console.log(`  ${count}x  ${key}`);

  console.log('\n=== identity/data/users (contractInfo.assignment.company) ===');
  const usersSnap = await db.collection('identity/data/users').get();
  const userMatches = usersSnap.docs.filter(doc => matchesItacUT(doc.data().contractInfo?.assignment?.company));
  console.log(`Total: ${usersSnap.docs.length} | Coincidencias: ${userMatches.length}`);
  for (const doc of userMatches) {
    const d = doc.data();
    console.log(`  - ${d.fullName} | company: "${d.contractInfo?.assignment?.company}"`);
  }
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
