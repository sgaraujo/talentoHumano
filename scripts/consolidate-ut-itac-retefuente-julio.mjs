/**
 * Consolida el registro manual duplicado de Retención de julio de UT ITAC.
 * Conserva el vencimiento oficial 2026-08-19 y archiva 2026-08-25.
 *
 * Uso:
 *   node scripts/consolidate-ut-itac-retefuente-julio.mjs
 *   node scripts/consolidate-ut-itac-retefuente-julio.mjs --apply
 */

import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(scriptDir, 'serviceAccount.json'), 'utf8'));
let app;
try { app = getApp(); } catch { app = initializeApp({ credential: cert(serviceAccount) }); }
const db = getFirestore(app);

const APPLY = process.argv.includes('--apply');
const KEEP_ID = 'LTu2xolOwfgb2mxWClD5';
const REMOVE_ID = 'AX7rbBlJEQnGVOYmCg0S';
const obligations = db.collection('accounting/data/tax_obligations');
const archive = db.collection('accounting/data/tax_obligation_archive');

async function main() {
  const [keepSnap, removeSnap] = await Promise.all([
    obligations.doc(KEEP_ID).get(),
    obligations.doc(REMOVE_ID).get(),
  ]);
  if (!keepSnap.exists || !removeSnap.exists) throw new Error('No se encontraron ambos documentos esperados; no se hizo ningún cambio.');

  const keep = keepSnap.data();
  const remove = removeSnap.data();
  const expected = value =>
    value?.companyId === '9fygRs3BrhjrQVC60FDs' &&
    value?.taxType === 'Retención en la Fuente' &&
    value?.period === 'Julio';
  if (!expected(keep) || !expected(remove) || keep?.dueDate !== '2026-08-19' || remove?.dueDate !== '2026-08-25') {
    throw new Error('Los documentos cambiaron o no corresponden al caso esperado; no se hizo ningún cambio.');
  }

  console.log(`${APPLY ? 'APLICAR' : 'SIMULACIÓN'}: conservar ${KEEP_ID} (${keep.dueDate}, ${keep.status})`);
  console.log(`${APPLY ? 'APLICAR' : 'SIMULACIÓN'}: archivar y retirar ${REMOVE_ID} (${remove.dueDate}, ${remove.status})`);
  if (!APPLY) return;

  const batch = db.batch();
  batch.set(archive.doc(REMOVE_ID), {
    ...remove,
    originalId: REMOVE_ID,
    archivedAt: FieldValue.serverTimestamp(),
    archivedReason: 'duplicate-semantic-period-wrong-due-date',
    consolidatedInto: KEEP_ID,
  });
  batch.delete(obligations.doc(REMOVE_ID));
  await batch.commit();
  console.log('Consolidación completada. El documento retirado quedó respaldado en tax_obligation_archive.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
