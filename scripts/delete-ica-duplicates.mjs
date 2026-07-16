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

// Registros "No iniciado" que son duplicados — ya existe un "Pagado" para el mismo vencimiento
const TO_DELETE = [
  { id: '0i4wER0Ma5WB5erLZRiG', label: 'Inteegra SAS BIC / ICA Bimestral / 2026-06-12 / No iniciado' },
  { id: '1VcYJECbPOBKI2ANuwzO', label: 'Netcol Ingeniería SAS BIC / ICA Bimestral / 2026-06-12 / No iniciado' },
];

console.log(`\n${DRY_RUN ? '🔍 DRY RUN — ' : ''}Eliminando duplicados "No iniciado" (ya existe un "Pagado"):\n`);

for (const { id, label } of TO_DELETE) {
  const doc = await db.collection('tax_obligations').doc(id).get();
  if (!doc.exists) { console.log(`  ⚠️  No encontrado: ${id}`); continue; }
  const d = doc.data();
  console.log(`  🗑️  ${label}`);
  console.log(`      status actual: "${d.status}" | id: ${id}`);
  if (!DRY_RUN) {
    await doc.ref.delete();
    console.log(`      ✅ Eliminado`);
  }
}

if (DRY_RUN) console.log('\n🔍  Sin --dry-run para aplicar.');
else console.log('\n✅  Listo.');
process.exit();
