/** Consolidación puntual y recuperable de los contratos verificados de Michael Romero. */
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
const employeeId = '1012351492';
const base = `human_resources/data/employees/${employeeId}/employments`;
const actions = [
  { keep: 'inteegra-s-a-s-bic-administracion-1e4ahqj', remove: 'inteegra-s-a-s-bic-196pchn', expectedCompany: 'INTEEGRA S.A.S BIC' },
  { keep: 'triangulum-bpo-s-a-s-operativo-19hoz5q', remove: 'triangulum-bpo-s-a-s-ljerny', expectedCompany: 'TRIANGULUM BPO S.A.S' },
  { keep: 'triangulum-bpo-s-a-s-operativo-19hoz5q', remove: 'triangulum-bpo-s-a-s-sin-dato-1v3heuo', expectedCompany: 'TRIANGULUM BPO S.A.S' },
];

const verified = [];
for (const action of actions) {
  const [keepSnap, removeSnap] = await Promise.all([
    db.doc(`${base}/${action.keep}`).get(),
    db.doc(`${base}/${action.remove}`).get(),
  ]);
  if (!keepSnap.exists || !removeSnap.exists) throw new Error(`Documento ausente: ${action.keep} / ${action.remove}`);
  const keep = keepSnap.data();
  const remove = removeSnap.data();
  if (keep.companyName !== action.expectedCompany || remove.companyName !== action.expectedCompany) {
    throw new Error(`La empresa no coincide para ${action.remove}; se cancela sin cambios.`);
  }
  if (!keep.projectName || remove.projectName) {
    throw new Error(`El patrón cuenta completa/cuenta vacía no coincide para ${action.remove}; se cancela sin cambios.`);
  }
  verified.push({ action, keepSnap, removeSnap, remove });
}

const batch = db.batch();
const archive = db.collection('human_resources/data/employment_archive');
for (const { action, keepSnap, removeSnap, remove } of verified) {
  const archiveId = `${employeeId}__${removeSnap.id}`;
  batch.set(archive.doc(archiveId), {
    ...remove,
    originalPath: removeSnap.ref.path,
    archivedAt: FieldValue.serverTimestamp(),
    archivedReason: 'duplicate-import-date-representation',
    consolidatedInto: keepSnap.ref.path,
  });
  batch.delete(removeSnap.ref);
}
await batch.commit();
console.log(`OK: ${verified.length} duplicados archivados y eliminados para ${employeeId}.`);
