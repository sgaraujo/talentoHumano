/**
 * Corrige el campo "period" de los registros CRC de Julio 2026 (Inteegra, ITAC)
 * que quedaron con el texto del taxType en vez de "Trimestre 2" (como sí está
 * correctamente etiquetado el equivalente de Newforce). Solo cambia el label,
 * no toca fecha ni estado.
 *
 * Uso:
 *   node scripts/fix-crc-period-labels.mjs
 *   node scripts/fix-crc-period-labels.mjs --apply
 */

import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(scriptDir, 'serviceAccount.json'), 'utf8'));
let app;
try { app = getApp(); } catch { app = initializeApp({ credential: cert(serviceAccount) }); }
const db = getFirestore(app);

const APPLY = process.argv.includes('--apply');
const obligations = db.collection('accounting/data/tax_obligations');

const TARGETS = [
  { id: 'MZlKHeGDeTplH9ZzcU9t', company: 'INTEEGRA SAS BIC' },
  { id: 'N6b6DWPVBgNhD2pE4eLg', company: 'ITAC COLOMBIA S.A.S' },
];
const WRONG_PERIOD = 'Comisión de Regulación de Comunicaciones - CRC';
const CORRECT_PERIOD = 'Trimestre 2';

async function main() {
  const batch = db.batch();
  let planned = 0;
  for (const t of TARGETS) {
    const snap = await obligations.doc(t.id).get();
    if (!snap.exists) { console.log(`SKIP ${t.id}: no existe`); continue; }
    const d = snap.data();
    const expected = d.company === t.company &&
      d.taxType === 'Comisión de Regulación de Comunicaciones - CRC' &&
      d.dueDate === '2026-07-31' &&
      d.period === WRONG_PERIOD;
    if (!expected) { console.log(`SKIP ${t.id}: no coincide con lo esperado (period actual: "${d.period}")`); continue; }
    console.log(`${APPLY ? 'APLICAR' : 'SIMULACIÓN'}: ${t.company} (${t.id}) → period "${WRONG_PERIOD}" → "${CORRECT_PERIOD}"`);
    if (APPLY) { batch.update(obligations.doc(t.id), { period: CORRECT_PERIOD }); planned++; }
  }
  if (APPLY && planned > 0) {
    await batch.commit();
    console.log(`Listo. ${planned} registro(s) actualizado(s).`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
