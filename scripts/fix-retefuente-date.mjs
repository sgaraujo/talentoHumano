import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(readFileSync(join(__dirname, 'serviceAccount.json'), 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

// Netcol (dígito 7) ReteFuente Mayo: fecha correcta = 2026-06-18, estaba guardada como 2026-06-22
const DOC_ID = 'behtAA9UfH64rhLJW2XA';
const doc = await db.collection('tax_obligations').doc(DOC_ID).get();
if (!doc.exists) { console.error('Documento no encontrado'); process.exit(1); }

const d = doc.data();
console.log(`Antes: company="${d.company}" | dueDate=${d.dueDate} | status="${d.status}"`);
await doc.ref.update({ dueDate: '2026-06-18' });
console.log(`Después: dueDate=2026-06-18`);
console.log('✅ Listo');
process.exit();
