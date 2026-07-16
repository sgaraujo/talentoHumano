import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(readFileSync(join(__dirname, 'serviceAccount.json'), 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const cComp = s => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.\-,]/g, '').replace(/\s+/g, ' ').trim();
const nitClean = n => (n ?? '').replace(/[^0-9]/g, '');
const normTax = t => {
  const n = (t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.\-,]/g, '').replace(/\s+/g, ' ').trim();
  const A = { 'ica bimestral':'ica bimestral','impuesto de industria y comercio':'ica bimestral','ica':'ica bimestral' };
  return A[n] ?? n;
};

const snap = await db.collection('tax_obligations').get();
const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

const FOCUS = ['inteegra', 'netcol'];
const TARGET = 'ica bimestral';

console.log('\n=== ICA Bimestral de Inteegra y Netcol ===\n');
const found = all.filter(o => {
  const name = cComp(o.company ?? '');
  return FOCUS.some(f => name.includes(f)) && normTax(o.taxType ?? '') === TARGET && o.dueDate?.startsWith('2026-06');
});

found.sort((a, b) => a.company.localeCompare(b.company));
for (const o of found) {
  console.log(`  company: "${o.company}" | nit: "${o.nit}" | dueDate: ${o.dueDate} | status: "${o.status}" | id: ${o.id}`);
}
console.log(`\nTotal: ${found.length} registros`);
process.exit();
