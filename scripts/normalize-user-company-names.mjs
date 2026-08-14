/**
 * normalize-user-company-names.mjs
 *
 * Sincroniza identity/data/users[].contractInfo.assignment.company contra el
 * nombre canónico en organization/data/companies (comparando de forma
 * normalizada: sin puntos, mayúsculas ni espacios extra). Corrige el caso de
 * "INTEEGRA S.A.S BIC" / "INTEEGRA SAS BIC " que no coincidían con el nombre
 * canónico "INTEEGRA SAS BIC", causando que no aparecieran destinatarios al
 * enviar comunicados masivos por empresa.
 *
 * Uso: node scripts/normalize-user-company-names.mjs [--dry-run] ["texto para filtrar empresa"]
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(readFileSync(join(__dirname, 'serviceAccount.json'), 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry-run');
const filterArg = process.argv.slice(2).find(a => !a.startsWith('--'));

const normalize = (s = '') =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
   .replace(/[.\-,]/g, '').replace(/\s+/g, ' ').trim();

async function main() {
  console.log(DRY_RUN ? '🔍  DRY RUN — no se escribirá nada\n' : '✏️   Modo escritura activo\n');

  const compSnap = await db.collection('organization/data/companies').get();
  const canonicalByNorm = new Map();
  compSnap.docs.forEach(d => {
    const name = (d.data().name ?? '').trim();
    if (name) canonicalByNorm.set(normalize(name), name);
  });
  console.log(`${canonicalByNorm.size} empresas canónicas cargadas.\n`);

  const usersSnap = await db.collection('identity/data/users').get();
  console.log(`${usersSnap.size} usuarios cargados.\n`);

  const updates = [];
  usersSnap.docs.forEach(d => {
    const u = d.data();
    const current = u.contractInfo?.assignment?.company;
    if (!current) return;
    const norm = normalize(current);
    const canonical = canonicalByNorm.get(norm);
    if (!canonical) return; // no hay empresa canónica que coincida ni normalizada
    if (canonical === current) return; // ya está sincronizado
    if (filterArg && !norm.includes(normalize(filterArg))) return;
    updates.push({ id: d.id, fullName: u.fullName, role: u.role, from: current, to: canonical });
  });

  if (updates.length === 0) {
    console.log('✅  No hay diferencias que corregir.');
    return;
  }

  console.log(`Encontradas ${updates.length} diferencia(s):\n`);
  const byPair = new Map();
  updates.forEach(u => {
    const key = `${u.from} → ${u.to}`;
    byPair.set(key, (byPair.get(key) ?? 0) + 1);
  });
  for (const [pair, count] of byPair) console.log(`  ${count}x  ${pair}`);

  if (DRY_RUN) {
    console.log('\n🔍  DRY RUN — ejecuta sin --dry-run para aplicar los cambios.');
    return;
  }

  console.log('\nActualizando...');
  const BATCH_SIZE = 400;
  let done = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const chunk = updates.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const u of chunk) {
      batch.update(db.collection('identity/data/users').doc(u.id), {
        'contractInfo.assignment.company': u.to,
      });
    }
    await batch.commit();
    done += chunk.length;
    console.log(`  ${done}/${updates.length} actualizados...`);
  }

  console.log(`\n✅  Listo. ${done} usuario(s) sincronizados.`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
