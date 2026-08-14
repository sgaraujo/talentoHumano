/** Normaliza todos los periodos tributarios. Simulación por defecto; --apply escribe. */
import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { normalizePeriod } from '../src/domain/tax/taxIdentity';

const here = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(here, 'serviceAccount.json'), 'utf8'));
let app;
try { app = getApp(); } catch { app = initializeApp({ credential: cert(serviceAccount) }); }
const db = getFirestore(app);
const apply = process.argv.includes('--apply');
const ref = db.collection('accounting/data/tax_obligations');
const snap = await ref.get();
const changes = snap.docs.map(doc => {
  const oldPeriod = String(doc.data().period ?? '').trim();
  return { id: doc.id, oldPeriod, newPeriod: normalizePeriod(oldPeriod) };
}).filter(item => item.oldPeriod !== item.newPeriod);

console.log(`${apply ? '✏️ APLICAR' : '🔍 SIMULACIÓN'}: ${changes.length} periodos por normalizar.`);
const counts = new Map<string, number>();
for (const item of changes) {
  const key = `${item.oldPeriod} → ${item.newPeriod}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
[...counts].sort((a, b) => b[1] - a[1]).forEach(([change, count]) => console.log(`- ${count}x ${change}`));

if (!apply || changes.length === 0) process.exit(0);
for (let i = 0; i < changes.length; i += 400) {
  const batch = db.batch();
  for (const item of changes.slice(i, i + 400)) {
    batch.update(ref.doc(item.id), {
      period: item.newPeriod,
      periodNormalizedFrom: item.oldPeriod,
      periodNormalizedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}
console.log(`✅ ${changes.length} periodos normalizados.`);
