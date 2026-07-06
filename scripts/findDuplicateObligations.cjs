/**
 * findDuplicateObligations.cjs
 * Muestra y opcionalmente elimina documentos duplicados en tax_obligations
 * (mismo company + taxType + period).
 * Conserva el doc con más datos de usuario; borra el más vacío.
 *
 * Uso:
 *   node scripts/findDuplicateObligations.cjs        → solo muestra
 *   node scripts/findDuplicateObligations.cjs --run  → elimina los vacíos
 */

const admin = require('firebase-admin');
const path  = require('path');

const DRY_RUN = !process.argv.includes('--run');
const serviceAccount = require(path.join(__dirname, 'serviceAccount.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function score(data) {
  let s = 0;
  if (data.status && data.status !== 'No iniciado') s += 10;
  if (data.paidAt)          s += 5;
  if (data.paid != null)    s += 3;
  if (data.projected != null) s += 2;
  if (data.stepOwners && Object.keys(data.stepOwners).length) s += Object.keys(data.stepOwners).length;
  return s;
}

function describe(data) {
  const p = [];
  if (data.status) p.push(`status: ${data.status}`);
  if (data.projected != null) p.push(`proy: ${data.projected}`);
  if (data.paid != null)      p.push(`pag: ${data.paid}`);
  if (data.paidAt)            p.push(`paidAt: ${data.paidAt}`);
  if (data.stepOwners) {
    const s = Object.keys(data.stepOwners);
    if (s.length) p.push(`pasos: ${s.join(', ')}`);
  }
  return p.join(' | ') || 'sin datos';
}

async function main() {
  console.log(`\n🔍 Modo: ${DRY_RUN ? 'SIMULACIÓN' : '✅ EJECUCIÓN REAL'}\n`);

  const snap = await db.collection('tax_obligations').get();

  // Agrupar por company + taxType + period + dueDate
  const groups = new Map();
  for (const doc of snap.docs) {
    const d = doc.data();
    const key = `${d.company}||${d.taxType}||${d.period ?? ''}||${d.dueDate ?? ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id: doc.id, ref: doc.ref, data: d });
  }

  const toDelete = [];

  for (const [key, docs] of groups) {
    if (docs.length < 2) continue;

    // Ordenar: el de mayor score primero (ese es el que conservamos)
    docs.sort((a, b) => score(b.data) - score(a.data));
    const keep   = docs[0];
    const remove = docs.slice(1);

    const [company, taxType, period, dueDate] = key.split('||');
    console.log(`\n📋 "${company}" | ${taxType} | ${period} | ${dueDate}  (${docs.length} docs)`);
    console.log(`   ✅ CONSERVAR [${keep.id}]: ${describe(keep.data)}`);
    for (const r of remove) {
      console.log(`   🗑️  BORRAR    [${r.id}]: ${describe(r.data)}`);
      toDelete.push(r.ref);
    }
  }

  console.log(`\nTotal duplicados a eliminar: ${toDelete.length}\n`);

  if (!toDelete.length) { console.log('✅ Sin duplicados.\n'); return; }
  if (DRY_RUN) { console.log('💡 Para ejecutar: node scripts/findDuplicateObligations.cjs --run\n'); return; }

  const chunks = [];
  for (let i = 0; i < toDelete.length; i += 400) chunks.push(toDelete.slice(i, i + 400));
  for (const chunk of chunks) {
    const batch = db.batch();
    chunk.forEach(ref => batch.delete(ref));
    await batch.commit();
  }
  console.log(`✅ Eliminados: ${toDelete.length} documentos\n`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
