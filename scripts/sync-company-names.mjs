/**
 * sync-company-names.mjs
 *
 * Completa companyId, nombre y NIT canónicos en obligaciones heredadas que no
 * tienen companyId, siempre que el NIT coincida con una única empresa.
 *
 * Uso: node scripts/sync-company-names.mjs          # simulación
 *      node scripts/sync-company-names.mjs --apply  # aplica cambios
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

const APPLY = process.argv.includes('--apply');

const cleanNit  = (n = '') => n.replace(/[^0-9]/g, '');
const normalize = (s = '') => s.toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[.\-,]/g, '')
  .replace(/\s+/g, ' ').trim();
const compatibleNames = (a = '', b = '') => {
  const left = normalize(a), right = normalize(b);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
};

async function main() {
  console.log(APPLY ? '✏️   Modo escritura activo\n' : '🔍  DRY RUN — no se escribirá nada\n');

  // 1. Cargar companies: armar mapa NIT → nombre canónico
  console.log('Cargando companies...');
  const compSnap = await db.collection('organization/data/companies').get();
  const nitToCompany = new Map(); // nitLimpio → empresa canónica
  const companies = [];
  for (const doc of compSnap.docs) {
    const { name, nit } = doc.data();
    const nitC = cleanNit(nit ?? '');
    if (nitC && name?.trim()) {
      if (nitToCompany.has(nitC)) {
        throw new Error(`NIT duplicado en companies: ${nitC}`);
      }
      const canonical = { id: doc.id, name: name.trim(), nit: (nit ?? '').trim() };
      nitToCompany.set(nitC, canonical);
      companies.push(canonical);
    }
  }
  console.log(`  ${nitToCompany.size} empresas con NIT cargadas\n`);

  // 2. Cargar tax_obligations
  console.log('Cargando tax_obligations...');
  const obligationsRef = db.collection('accounting/data/tax_obligations');
  const oblSnap = await obligationsRef.get();
  console.log(`  ${oblSnap.size} obligaciones encontradas\n`);

  // 3. Cruzar y detectar diferencias (nombre Y NIT)
  const updates = []; // { id, fields }

  for (const doc of oblSnap.docs) {
    const data = doc.data();
    if (data.companyId) continue;
    const oblNitC = cleanNit(data.nit ?? '');
    const oblNit  = (data.nit ?? '').trim();
    const oblName = (data.company ?? '').trim();

    // Primero NIT exacto. Para registros heredados sin dígito de verificación,
    // aceptar NIT base solo cuando existe un único candidato y el nombre coincide.
    let canonical = oblNitC ? nitToCompany.get(oblNitC) : null;
    if (!canonical && oblNitC.length === 9) {
      const candidates = companies.filter(company => {
        const companyNit = cleanNit(company.nit);
        return companyNit.length === 10 && companyNit.startsWith(oblNitC) &&
          compatibleNames(oblName, company.name);
      });
      if (candidates.length === 1) canonical = candidates[0];
    }
    if (!canonical) continue;

    const fields = {};
    if (oblName !== canonical.name) fields.company = canonical.name;
    if (oblNit !== canonical.nit) fields.nit = canonical.nit;
    if (data.companyId !== canonical.id) fields.companyId = canonical.id;
    if (Object.keys(fields).length === 0) continue;

    updates.push({ id: doc.id, oblName, oblNit, canonical, fields });
  }

  if (updates.length === 0) {
    console.log('✅  Todo sincronizado — nombre y NIT correctos en todas las obligaciones.');
    return;
  }

  // 4. Mostrar resumen
  console.log(`Encontradas ${updates.length} obligación(es) con diferencias:\n`);
  for (const u of updates) {
    console.log(`  ID: ${u.id}`);
    if (u.fields.company) console.log(`    Nombre: "${u.oblName}"  →  "${u.canonical.name}"`);
    if (u.fields.nit)     console.log(`    NIT:    "${u.oblNit}"  →  "${u.canonical.nit}"`);
    if (u.fields.companyId) console.log(`    companyId: → ${u.canonical.id}`);
  }

  if (!APPLY) {
    console.log('\n🔍  DRY RUN — ejecuta con --apply para aplicar los cambios.');
    return;
  }

  // 5. Actualizar en batches de 499
  console.log('\nActualizando...');
  const BATCH_SIZE = 499;
  let updated = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = updates.slice(i, i + BATCH_SIZE);
    for (const u of chunk) {
      batch.update(obligationsRef.doc(u.id), u.fields);
    }
    await batch.commit();
    updated += chunk.length;
    console.log(`  ${updated}/${updates.length} actualizadas...`);
  }

  console.log(`\n✅  Listo. ${updated} obligación(es) sincronizadas.`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
