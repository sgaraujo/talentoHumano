/**
 * Consolida los tres pares ICA Bim 3 detectados el 2026-08-11.
 * Simulación por defecto; usar --apply para escribir.
 * Archiva ambos documentos antes de actualizar/eliminar en un batch atómico.
 */
import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(here, 'serviceAccount.json'), 'utf8'));
let app;
try { app = getApp(); } catch { app = initializeApp({ credential: cert(serviceAccount) }); }
const db = getFirestore(app);
const APPLY = process.argv.includes('--apply');
const obligations = db.collection('accounting/data/tax_obligations');
const archive = db.collection('accounting/data/tax_obligation_archive');
const canonicalPeriod = 'ICA Bim 3 (May-Jun)';

const pairs = [
  { keep: '9XWYTe05J72qnVt1sbyb', remove: 'yEq9I16GBXud1lTFDNVm' },
  { keep: 'JJsGrsI3414ydB8r5FfB', remove: 'qtcNgFt4n96Snhz1qfxE' },
  { keep: 'exkQOEw1LOJc58VYYiw3', remove: 'qwBEymvxa5EHGhfub1sm' },
];

const empty = value => value === undefined || value === null || value === '' ||
  (Array.isArray(value) && value.length === 0);
const protectedFields = new Set([
  'companyId', 'company', 'nit', 'taxType', 'period', 'dueDate', 'year',
  'status', 'projected', 'advisor', 'createdAt', 'updatedAt',
]);

const plans = [];
for (const pair of pairs) {
  const [keepSnap, removeSnap] = await Promise.all([
    obligations.doc(pair.keep).get(), obligations.doc(pair.remove).get(),
  ]);
  if (!keepSnap.exists || !removeSnap.exists) throw new Error(`Par incompleto: ${pair.keep}/${pair.remove}`);
  const keep = keepSnap.data(), remove = removeSnap.data();
  if (keep.companyId !== remove.companyId || keep.taxType !== remove.taxType || keep.dueDate !== remove.dueDate) {
    throw new Error(`Identidad incompatible: ${pair.keep}/${pair.remove}`);
  }
  const mergedMissing = {};
  for (const [field, value] of Object.entries(remove)) {
    if (!protectedFields.has(field) && empty(keep[field]) && !empty(value)) mergedMissing[field] = value;
  }
  plans.push({ pair, keep, remove, mergedMissing });
}

console.log(APPLY ? '✏️ MODO APLICAR\n' : '🔍 SIMULACIÓN — sin escrituras\n');
for (const plan of plans) {
  console.log(`${plan.keep.company}`);
  console.log(`  conservar: ${plan.pair.keep} | periodo:${plan.keep.period} | proyectado:${plan.keep.projected ?? '—'} | asesor:${plan.keep.advisor ?? '—'}`);
  console.log(`  retirar:   ${plan.pair.remove} | periodo:${plan.remove.period} | proyectado:${plan.remove.projected ?? '—'} | asesor:${plan.remove.advisor ?? '—'}`);
  console.log(`  periodo final: ${canonicalPeriod}`);
  console.log(`  campos faltantes a copiar: ${Object.keys(plan.mergedMissing).join(', ') || 'ninguno'}\n`);
}

if (!APPLY) {
  console.log('Ejecuta con --apply para archivar y consolidar.');
  process.exit(0);
}

const batch = db.batch();
for (const plan of plans) {
  for (const [role, id, data] of [
    ['kept_before_merge', plan.pair.keep, plan.keep],
    ['removed_duplicate', plan.pair.remove, plan.remove],
  ]) {
    batch.set(archive.doc(`ica_bim3_20260811__${id}`), {
      ...data, originalId: id, consolidationRole: role,
      consolidatedInto: plan.pair.keep, archivedAt: FieldValue.serverTimestamp(),
    });
  }
  batch.update(obligations.doc(plan.pair.keep), {
    ...plan.mergedMissing,
    period: canonicalPeriod,
    consolidatedFromIds: FieldValue.arrayUnion(plan.pair.remove),
    consolidatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.delete(obligations.doc(plan.pair.remove));
}
await batch.commit();
console.log('✅ 3 pares consolidados; 6 snapshots archivados; 3 duplicados retirados.');
