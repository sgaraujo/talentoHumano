/**
 * sync-company-names.mjs
 *
 * Busca todas las tax_obligations que tengan NIT,
 * las cruza con la colección companies para obtener el nombre canónico,
 * y actualiza el campo `company` si hay diferencia.
 *
 * Uso: node scripts/sync-company-names.mjs [--dry-run]
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

const DRY_RUN = process.argv.includes('--dry-run');

const cleanNit  = (n = '') => n.replace(/[^0-9]/g, '');
const normalize = (s = '') =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
   .replace(/[.\-,]/g, '').replace(/\s+/g, ' ').trim();

async function main() {
  console.log(DRY_RUN ? '🔍  DRY RUN — no se escribirá nada\n' : '✏️   Modo escritura activo\n');

  // 1. Cargar companies: armar mapa NIT → nombre canónico
  console.log('Cargando companies...');
  const compSnap = await db.collection('companies').get();
  const nitToCompany = new Map(); // nitLimpio → empresa canónica
  const nameToCanonical = new Map(); // nombreNorm → { name, nit } canónico
  for (const doc of compSnap.docs) {
    const { name, nit } = doc.data();
    const nitC = cleanNit(nit ?? '');
    if (nitC && name?.trim()) {
      if (nitToCompany.has(nitC)) {
        throw new Error(`NIT duplicado en companies: ${nitC}`);
      }
      const canonical = { id: doc.id, name: name.trim(), nit: (nit ?? '').trim() };
      nitToCompany.set(nitC, canonical);
      nameToCanonical.set(normalize(name), canonical);
    }
  }
  console.log(`  ${nitToCompany.size} empresas con NIT cargadas\n`);

  // 2. Cargar tax_obligations
  console.log('Cargando tax_obligations...');
  const oblSnap = await db.collection('tax_obligations').get();
  console.log(`  ${oblSnap.size} obligaciones encontradas\n`);

  // 3. Cruzar y detectar diferencias (nombre Y NIT)
  const updates = []; // { id, fields }

  for (const doc of oblSnap.docs) {
    const data = doc.data();
    const oblNitC = cleanNit(data.nit ?? '');
    const oblNit  = (data.nit ?? '').trim();
    const oblName = (data.company ?? '').trim();

    // Buscar canónico por NIT limpio primero, luego por nombre
    let canonical = null;
    if (oblNitC && nitToCompany.has(oblNitC)) {
      canonical = nitToCompany.get(oblNitC);
    } else if (oblName && nameToCanonical.has(normalize(oblName))) {
      canonical = nameToCanonical.get(normalize(oblName));
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

  if (DRY_RUN) {
    console.log('\n🔍  DRY RUN — ejecuta sin --dry-run para aplicar los cambios.');
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
      batch.update(db.collection('tax_obligations').doc(u.id), u.fields);
    }
    await batch.commit();
    updated += chunk.length;
    console.log(`  ${updated}/${updates.length} actualizadas...`);
  }

  console.log(`\n✅  Listo. ${updated} obligación(es) sincronizadas.`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
