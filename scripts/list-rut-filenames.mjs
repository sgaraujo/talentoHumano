/**
 * Lista las empresas registradas y propone un nombre uniforme para su RUT.
 * Solo lectura: no modifica Firestore.
 *
 * Uso: node scripts/list-rut-filenames.mjs
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

const cleanNit = (value = '') => String(value).replace(/\D/g, '');
const safeName = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

async function main() {
  const snapshot = await db.collection('organization/data/companies').get();
  const companies = snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'es'));

  console.log(`Empresas registradas: ${companies.length}\n`);
  for (const company of companies) {
    const nit = cleanNit(company.nit);
    const filename = nit && company.name
      ? `${nit}_${safeName(company.name)}_RUT.pdf`
      : 'REVISAR_DATOS_DE_EMPRESA';
    const accountingStatus = company.active === true && company.activeContabilidad === true
      ? 'contabilidad activa'
      : `revisar estado: active=${company.active ?? 'sin dato'}, activeContabilidad=${company.activeContabilidad ?? 'sin dato'}`;
    console.log(`${filename}\t${accountingStatus}\tid=${company.id}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
