/**
 * fix-advanced-sterilization-employments.mjs
 *
 * ADVANCED STERILIZATION PRODUCTS COLOMBIA SAS (proyecto "ASP") ya está
 * inactivo, y esas personas ya están marcadas como "excolaborador" en la
 * colección legacy identity/data/users. Pero en la fuente nueva
 * (subcolección "employments" bajo human_resources/data/employees — la que
 * ahora alimenta el headcount del dashboard vía getEmployeeDirectoryUsers)
 * muchas relaciones laborales seguían con status: 'active', inflando el
 * conteo de colaboradores activos con gente de un cliente externo que no
 * trabaja con nosotros.
 *
 * Este script corrige el status de esas relaciones a 'retired'. No borra
 * ningún documento — solo corrige el campo status para que quede consistente
 * con el resto del sistema (proyecto inactivo + usuario legacy excolaborador).
 *
 * Uso:
 *   node scripts/fix-advanced-sterilization-employments.mjs           (vista previa, no escribe nada)
 *   node scripts/fix-advanced-sterilization-employments.mjs --apply   (aplica los cambios)
 */

import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(__dirname, 'serviceAccount.json'), 'utf8'));

let app;
try { app = getApp(); } catch { app = initializeApp({ credential: cert(serviceAccount) }); }

const db = getFirestore(app);
const APPLY = process.argv.includes('--apply');

const normalize = (s) => (s ?? '').toString().toLowerCase().normalize('NFD')
  .replace(/\p{Diacritic}/gu, '').replace(/[.\-,]/g, '').replace(/\s+/g, ' ').trim();

const TARGET = normalize('ADVANCED STERILIZATION PRODUCTS COLOMBIA SAS');
const matchesTarget = (value) => {
  const n = normalize(value);
  return n && (n === TARGET || n.includes('advanced sterilization') || n === 'asp');
};

async function main() {
  console.log(APPLY ? 'Aplicando correccion...' : 'Vista previa: no se escribira nada en Firestore.\n');

  const employmentsSnap = await db.collectionGroup('employments').get();
  const matching = employmentsSnap.docs.filter(d => matchesTarget(d.data().projectName) || matchesTarget(d.data().companyName));

  const toFix = matching.filter(d => d.data().status === 'active');
  const alreadyOk = matching.filter(d => d.data().status !== 'active');

  console.log(`Relaciones laborales de ASP encontradas: ${matching.length}`);
  console.log(`  - ya correctas (no 'active'): ${alreadyOk.length}`);
  console.log(`  - a corregir (status 'active' -> 'retired'): ${toFix.length}\n`);

  for (const doc of toFix) {
    const d = doc.data();
    const employeeId = d.employeeId || doc.ref.parent.parent?.id;
    console.log(`- employeeId: ${employeeId}  employmentId: ${doc.id}  position: ${d.position ?? '—'}`);
    if (APPLY) {
      await doc.ref.update({
        status: 'retired',
        terminationReason: d.terminationReason || 'Cliente/empresa ya no trabaja con nosotros (ASP)',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  console.log(APPLY
    ? `\nListo. ${toFix.length} relacion(es) laboral(es) corregida(s) a 'retired'.`
    : `\nEjecuta con --apply para aplicar los ${toFix.length} cambios.`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
