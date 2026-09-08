/**
 * fix-corrupt-employee-phones.mjs
 *
 * Limpia los teléfonos de empleados que quedaron con valores basura tras una
 * importación (placeholders como "+57"/"+570" sin número, o números
 * corrompidos a notación científica por Excel, ej. "5.73106E+11").
 * Deja el campo vacío en vez de un dato falso — es mejor que "Calidad de
 * datos" lo marque como faltante a que quede un teléfono inválido pero
 * aparentemente presente.
 *
 * No toca los teléfonos duplicados (varias personas con el mismo fijo) —
 * eso puede ser intencional (ej. línea de oficina) y no es un dato dañado.
 *
 * Uso:
 *   node scripts/fix-corrupt-employee-phones.mjs            (dry-run, no escribe nada)
 *   node scripts/fix-corrupt-employee-phones.mjs --apply     (aplica los cambios)
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

const APPLY = process.argv.includes('--apply');

// Un valor de teléfono es "basura" cuando, tras quitarle todo lo que no sea
// dígito, le sobran menos de 10 dígitos (ej. "+57" -> "57", "+570" -> "570")
// — es decir, ni siquiera alcanza a ser un número colombiano completo.
// El caso de notación científica ("5.73106E+11") también cae aquí porque al
// limpiar los caracteres no numéricos quedan menos de 10 dígitos utilizables
// (el "E+11" se descarta, dejando solo "573106").
function isGarbagePhone(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return false; // ya vacío, nada que limpiar
  const digits = raw.replace(/\D/g, '');
  return digits.length > 0 && digits.length < 10;
}

async function main() {
  const employeesSnap = await db.collection('human_resources/data/employees').get();

  const toFix = [];
  employeesSnap.docs.forEach(doc => {
    const employee = doc.data();
    const updates = {};
    if (isGarbagePhone(employee.corporatePhone)) updates.corporatePhone = '';
    if (isGarbagePhone(employee.personalPhone)) updates.personalPhone = '';
    if (Object.keys(updates).length > 0) {
      toFix.push({
        id: doc.id, fullName: employee.fullName,
        before: { corporatePhone: employee.corporatePhone ?? null, personalPhone: employee.personalPhone ?? null },
        updates,
      });
    }
  });

  console.log(`\n=== ${toFix.length} empleado(s) con teléfono basura detectado ===\n`);
  toFix.forEach(item => {
    console.log(`${item.fullName} (${item.id})`);
    console.log(`  corporatePhone: "${item.before.corporatePhone}" -> ${'corporatePhone' in item.updates ? '(vacío)' : '(sin cambio)'}`);
    console.log(`  personalPhone:  "${item.before.personalPhone}" -> ${'personalPhone' in item.updates ? '(vacío)' : '(sin cambio)'}`);
  });

  if (!APPLY) {
    console.log(`\n(Dry-run — no se escribió nada. Vuelve a correr con --apply para aplicar los ${toFix.length} cambio(s).)`);
    return;
  }

  const batch = db.batch();
  toFix.forEach(item => {
    batch.update(db.collection('human_resources/data/employees').doc(item.id), item.updates);
  });
  await batch.commit();
  console.log(`\n✔ Aplicado: se limpiaron ${toFix.length} registro(s).`);
}

main().catch(console.error).finally(() => process.exit());
