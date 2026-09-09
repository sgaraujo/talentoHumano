/**
 * standardize-employee-phones.mjs
 *
 * Estandariza corporatePhone/personalPhone en human_resources/data/employees
 * al formato único "+57XXXXXXXXXX" (indicativo colombiano + 10 dígitos).
 *
 * Hoy conviven varios formatos (visto con diagnose-phone-formats.mjs):
 *   - con "+" y sin "+" delante del mismo número de 12 dígitos (57...) — el
 *     caso más común, ~4400 campos.
 *   - "+57" duplicado por error de captura (ej. "+5757 310 782 94 85").
 *   - número local de 10 dígitos sin el indicativo 57.
 *   - varios números metidos en el mismo campo, separados por "-", "/", ","
 *     o "–" (ej. un celular alterno) — se conserva solo el PRIMER número
 *     que resuelva a 10 dígitos válidos y se descartan los demás (el campo
 *     es de un solo valor; ningún otro código del sistema lee más de un
 *     número por campo).
 *
 * Los espacios internos de un mismo número (ej. "318 354 0552") no se tratan
 * como separador de números distintos, solo se limpian como parte del mismo
 * número.
 *
 * Los campos que no resuelven a ningún grupo de 10 dígitos quedan intactos
 * y se listan aparte como "sin cambios (no se pudo interpretar)" para
 * revisión manual — no se adivina un número.
 *
 * Uso:
 *   node scripts/standardize-employee-phones.mjs            (dry-run)
 *   node scripts/standardize-employee-phones.mjs --apply     (aplica los cambios)
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(readFileSync(join(__dirname, 'serviceAccount.json'), 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const APPLY = process.argv.includes('--apply');

function standardize(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { value: '', status: 'vacio' };
  const chunks = s.split(/[\-\/,–]+/).map(c => c.trim()).filter(Boolean);
  for (const chunk of chunks) {
    let d = chunk.replace(/\D/g, '');
    if (!d) continue;
    while (d.length > 10 && d.startsWith('57')) d = d.slice(2);
    if (d.length === 10) return { value: `+57${d}`, status: 'ok' };
  }
  // Ningún fragmento por separado resolvió a 10 dígitos — puede ser que el
  // separador no marcara dos números distintos, sino que cayera en medio de
  // uno solo (ej. "+57322-2303799"). Se intenta una última vez con todos los
  // dígitos juntos antes de rendirse.
  let whole = s.replace(/\D/g, '');
  while (whole.length > 10 && whole.startsWith('57')) whole = whole.slice(2);
  if (whole.length === 10) return { value: `+57${whole}`, status: 'ok' };
  return { value: s, status: 'unparsed' };
}

async function main() {
  const snap = await db.collection('human_resources/data/employees').get();

  const changes = [];
  const unparsed = [];
  snap.docs.forEach(doc => {
    const e = doc.data();
    const updates = {};
    const before = {};
    for (const field of ['corporatePhone', 'personalPhone']) {
      const raw = e[field];
      const result = standardize(raw);
      if (result.status === 'unparsed') {
        unparsed.push({ id: doc.id, fullName: e.fullName, field, value: raw });
        continue;
      }
      if (result.status === 'ok' && result.value !== String(raw ?? '').trim()) {
        updates[field] = result.value;
        before[field] = raw ?? null;
      }
    }
    if (Object.keys(updates).length > 0) {
      changes.push({ id: doc.id, fullName: e.fullName, before, updates });
    }
  });

  console.log(`=== ${changes.length} registro(s) a estandarizar, ${unparsed.length} campo(s) sin poder interpretar ===\n`);
  changes.slice(0, 15).forEach(c => {
    console.log(`${c.fullName} (${c.id})`);
    Object.keys(c.updates).forEach(field => {
      console.log(`  ${field}: "${c.before[field]}" -> "${c.updates[field]}"`);
    });
  });
  if (changes.length > 15) console.log(`  ... y ${changes.length - 15} más (ver backup JSON).`);

  if (unparsed.length > 0) {
    console.log(`\n--- Sin poder interpretar (quedan intactos, revisar a mano) ---`);
    unparsed.forEach(u => console.log(`  ${u.fullName} (${u.id}) ${u.field}: "${u.value}"`));
  }

  const backupPath = join(__dirname, `phone-standardization-backup-${Date.now()}.json`);
  writeFileSync(backupPath, JSON.stringify({ changes, unparsed }, null, 2), 'utf8');
  console.log(`\nBackup de antes/después guardado en ${backupPath}`);

  if (!APPLY) {
    console.log(`\n(Dry-run — no se escribió nada. Vuelve a correr con --apply para aplicar los ${changes.length} cambio(s).)`);
    return;
  }

  const CHUNK = 400;
  for (let i = 0; i < changes.length; i += CHUNK) {
    const batch = db.batch();
    changes.slice(i, i + CHUNK).forEach(c => {
      batch.update(db.collection('human_resources/data/employees').doc(c.id), c.updates);
    });
    await batch.commit();
  }
  console.log(`\n✔ Aplicado: se estandarizaron ${changes.length} registro(s).`);
}

main().catch(console.error).finally(() => process.exit());
