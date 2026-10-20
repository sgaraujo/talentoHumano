/**
 * Cuenta obligaciones de `accounting/data/tax_obligations` sin `companyId` o con
 * un `companyId` que no existe. Las reglas del revisor fiscal filtran por ese
 * campo, así que esas obligaciones le quedarían invisibles. Solo lee.
 */
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

const cleanNit = (nit) => String(nit ?? '').replace(/[^0-9]/g, '');

const [companiesSnap, obligationsSnap] = await Promise.all([
  db.collection('organization/data/companies').get(),
  db.collection('accounting/data/tax_obligations').get(),
]);
const companyIds = new Set(companiesSnap.docs.map(d => d.id));
const byCompany = new Map();
let missing = 0, unknown = 0;
const sampleMissing = [];

for (const d of obligationsSnap.docs) {
  const o = d.data();
  const label = `${o.company ?? '—'} (${cleanNit(o.nit) || 'sin NIT'})`;
  if (!o.companyId) {
    missing++;
    if (sampleMissing.length < 15) sampleMissing.push(`${d.id} · ${label} · ${o.taxType} · ${o.dueDate}`);
  } else if (!companyIds.has(o.companyId)) {
    unknown++;
  }
  const key = o.companyId || `SIN ID: ${label}`;
  byCompany.set(key, (byCompany.get(key) ?? 0) + 1);
}

console.log(`Obligaciones: ${obligationsSnap.size} · sin companyId: ${missing} · companyId inexistente: ${unknown}`);
console.log('\nEmpresas con "inteegra" en el nombre:');
companiesSnap.docs
  .filter(d => String(d.data().name ?? '').toLowerCase().includes('inteegra'))
  .forEach(d => console.log(`  ${d.id} · ${d.data().name} · NIT ${d.data().nit} · obligaciones: ${byCompany.get(d.id) ?? 0}`));
console.log('\nObligaciones sin companyId agrupadas:');
[...byCompany].filter(([k]) => k.startsWith('SIN ID')).forEach(([k, n]) => console.log(`  ${k}: ${n}`));
if (sampleMissing.length) console.log('\nEjemplos:\n  ' + sampleMissing.join('\n  '));
