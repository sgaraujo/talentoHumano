/**
 * deleteOldObligations.cjs
 * Elimina de tax_obligations todos los documentos con dueDate anterior a CUTOFF.
 *
 * Uso:
 *   node scripts/deleteOldObligations.cjs        → solo muestra (simulación)
 *   node scripts/deleteOldObligations.cjs --run  → elimina de verdad
 */

const admin = require('firebase-admin');
const path  = require('path');

const DRY_RUN = !process.argv.includes('--run');
const CUTOFF  = '2026-06-01'; // Mayo para atrás

const serviceAccount = require(path.join(__dirname, 'serviceAccount.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

async function main() {
  console.log(`\n🗓  Corte: ${fmtDate(CUTOFF)}  (dueDate < ${CUTOFF})`);
  console.log(`🔧 Modo: ${DRY_RUN ? 'SIMULACIÓN — no se borra nada' : '⚠️  EJECUCIÓN REAL'}\n`);

  const snap = await db.collection('tax_obligations').get();
  const toDelete = [];

  // Agrupar por empresa para mostrar un resumen limpio
  const byCompany = new Map();

  for (const docSnap of snap.docs) {
    const d = docSnap.data();
    if (!d.dueDate || d.dueDate >= CUTOFF) continue;

    toDelete.push(docSnap.ref);

    const co = d.company || '(sin empresa)';
    if (!byCompany.has(co)) byCompany.set(co, []);
    byCompany.get(co).push({
      taxType: d.taxType || '—',
      period:  d.period  || '—',
      dueDate: d.dueDate || '—',
      status:  d.status  || '(sin estado)',
    });
  }

  if (toDelete.length === 0) {
    console.log('✅ No hay obligaciones anteriores a ' + fmtDate(CUTOFF) + '\n');
    return;
  }

  // Mostrar resumen por empresa
  for (const [company, obls] of [...byCompany.entries()].sort()) {
    console.log(`\n🏢 ${company}  (${obls.length} docs)`);
    for (const o of obls.sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
      const statusTag = o.status !== '(sin estado)' ? `  [${o.status}]` : '';
      console.log(`   🗑  ${fmtDate(o.dueDate)}  ${o.taxType} · ${o.period}${statusTag}`);
    }
  }

  console.log(`\n━━━ Total a eliminar: ${toDelete.length} documentos ━━━\n`);

  if (DRY_RUN) {
    console.log('💡 Para eliminarlos de verdad: node scripts/deleteOldObligations.cjs --run\n');
    return;
  }

  // Confirmar e eliminar en lotes de 400
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
