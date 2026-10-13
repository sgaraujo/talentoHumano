/**
 * Reinicio de la base de Talento Humano (human_resources/data/employees y
 * todas sus subcolecciones: employments, private, payroll, audit…) para
 * volver a cargarla desde cero con el Excel oficial.
 *
 *   node scripts/reset-hr-employees.mjs                 → SIMULA: cuenta lo que se borraría
 *   node scripts/reset-hr-employees.mjs --apply         → respaldo JSON completo y luego BORRA
 *   node scripts/reset-hr-employees.mjs --restore <archivo.json>  → restaura un respaldo
 *
 * No toca: usuarios de plataforma (identity), historial de importaciones
 * (import_runs), empresas, proyectos ni encuestas de offboarding.
 * El respaldo contiene datos personales: queda en scripts/ (ignorado por git), no compartir.
 */
import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(scriptDir, 'serviceAccount.json'), 'utf8'));
let app;
try { app = getApp(); } catch { app = initializeApp({ credential: cert(serviceAccount) }); }
const db = getFirestore(app);

const ROOT = 'human_resources/data/employees';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const restoreFile = args.includes('--restore') ? args[args.indexOf('--restore') + 1] : null;

// Timestamps ↔ JSON sin perder precisión.
const serialize = value => {
  if (value instanceof Timestamp) return { __timestamp: [value.seconds, value.nanoseconds] };
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object' && value.constructor === Object) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]));
  }
  return value;
};
const deserialize = value => {
  if (Array.isArray(value)) return value.map(deserialize);
  if (value && typeof value === 'object') {
    if (Array.isArray(value.__timestamp)) return new Timestamp(value.__timestamp[0], value.__timestamp[1]);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deserialize(v)]));
  }
  return value;
};

// Lee recursivamente todos los documentos bajo la colección raíz.
async function readTree() {
  const docs = [];
  const counts = new Map();
  const walk = async collectionRef => {
    const snap = await collectionRef.get();
    const name = collectionRef.path.replace(ROOT, 'employees').replace(/\/[^/]+\//g, '/*/');
    counts.set(name, (counts.get(name) ?? 0) + snap.size);
    for (let i = 0; i < snap.docs.length; i += 25) {
      await Promise.all(snap.docs.slice(i, i + 25).map(async doc => {
        docs.push({ path: doc.ref.path, data: serialize(doc.data()) });
        const subcollections = await doc.ref.listCollections();
        for (const sub of subcollections) await walk(sub);
      }));
    }
  };
  await walk(db.collection(ROOT));
  return { docs, counts };
}

if (restoreFile) {
  const backup = JSON.parse(readFileSync(restoreFile, 'utf8'));
  console.log(`Restaurando ${backup.docs.length} documentos de ${restoreFile}…`);
  for (let i = 0; i < backup.docs.length; i += 400) {
    const batch = db.batch();
    backup.docs.slice(i, i + 400).forEach(item => batch.set(db.doc(item.path), deserialize(item.data)));
    await batch.commit();
    console.log(`  ${Math.min(i + 400, backup.docs.length)} de ${backup.docs.length}`);
  }
  console.log('Restauración completa.');
  process.exit(0);
}

console.log('Leyendo la base de Talento Humano…');
const { docs, counts } = await readTree();
console.log(`\nDocumentos encontrados: ${docs.length}`);
[...counts.entries()].forEach(([name, n]) => console.log(String(n).padStart(7), name));

if (!APPLY) {
  console.log('\nSIMULACIÓN: no se borró nada. Ejecuta con --apply para respaldar y borrar.');
  process.exit(0);
}

const backupPath = join(scriptDir, `hr-employees-backup-${Date.now()}.json`);
writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), root: ROOT, docs }));
console.log(`\nRespaldo completo: ${backupPath}`);
// Verificación del respaldo antes de borrar.
const reread = JSON.parse(readFileSync(backupPath, 'utf8'));
if (reread.docs.length !== docs.length) throw new Error('El respaldo no coincide con lo leído; no se borró nada.');

console.log('Borrando…');
await db.recursiveDelete(db.collection(ROOT));
const left = await db.collection(ROOT).limit(1).get();
console.log(left.empty ? 'Base de Talento Humano vacía. Ya puedes cargar el Excel desde la plataforma.' : 'Atención: aún quedan documentos.');
console.log(`Para deshacer: node scripts/reset-hr-employees.mjs --restore "${backupPath}"`);
