/**
 * auditAndCleanTaxDb.cjs
 * Diagnóstico y limpieza completa de tax_obligations en Firestore.
 *
 * Modos:
 *   node scripts/auditAndCleanTaxDb.cjs           → solo auditoría (no borra nada)
 *   node scripts/auditAndCleanTaxDb.cjs --fix      → limpia duplicados y registros inválidos
 *   node scripts/auditAndCleanTaxDb.cjs --fix-old  → también borra fechas anteriores a CUTOFF
 *   node scripts/auditAndCleanTaxDb.cjs --fix --fix-old → todo junto
 *
 * Acciones de limpieza:
 *   1. Elimina documentos duplicados (mismo NIT + taxType + period + dueDate)
 *      Conserva el de mayor estado (Pagado > Presentado > Informe Enviado > Revisado > …)
 *   2. Elimina documentos con dueDate inválido o vacío
 *   3. [--fix-old] Elimina documentos con dueDate anterior a CUTOFF (mayo para atrás)
 */

const admin  = require('firebase-admin');
const path   = require('path');

const FIX     = process.argv.includes('--fix');
const FIX_OLD = process.argv.includes('--fix-old');
const CUTOFF  = '2026-06-01'; // Mayo para atrás

const serviceAccount = require(path.join(__dirname, 'serviceAccount.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── helpers ────────────────────────────────────────────────────────────────────

const STATUS_PRIORITY = {
  'Pagado': 6, 'No aplica': 5, 'Presentado': 4,
  'Informe Enviado': 3, 'Revisado': 2, 'No iniciado': 1,
};
const scorePriority = s => STATUS_PRIORITY[s] ?? 0;

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

function describeDoc(d) {
  const parts = [];
  if (d.status) parts.push(`[${d.status}]`);
  if (d.projected != null) parts.push(`proy:$${d.projected?.toLocaleString('es-CO')}`);
  if (d.paid      != null) parts.push(`pag:$${d.paid?.toLocaleString('es-CO')}`);
  if (d.paidAt)            parts.push(`pagado:${fmtDate(d.paidAt)}`);
  return parts.join(' ') || '(sin datos)';
}

const sep = () => console.log('─'.repeat(72));

// ── main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log('  AUDITORÍA DE TAX_OBLIGATIONS');
  console.log(`  Modo: ${FIX ? (FIX_OLD ? 'LIMPIEZA COMPLETA' : 'LIMPIAR DUPLICADOS/INVÁLIDOS') : 'SOLO DIAGNÓSTICO'}`);
  console.log('══════════════════════════════════════════════════════════════════════\n');

  const snap = await db.collection('tax_obligations').get();
  const allDocs = snap.docs.map(d => ({ id: d.id, ref: d.ref, data: d.data() }));

  console.log(`📦 Total documentos en Firestore: ${allDocs.length}\n`);

  const toDelete = new Set(); // IDs a eliminar

  // ── 1. Documentos con dueDate inválido ──────────────────────────────────────
  sep();
  console.log('① DOCUMENTOS CON FECHA INVÁLIDA O VACÍA');
  sep();
  const invalid = allDocs.filter(d => {
    const dd = d.data.dueDate;
    return !dd || !/^\d{4}-\d{2}-\d{2}$/.test(dd);
  });

  if (!invalid.length) {
    console.log('  ✅ Ninguno\n');
  } else {
    invalid.forEach(d => {
      console.log(`  🗑  [${d.id}] ${d.data.company} | ${d.data.taxType} | dueDate="${d.data.dueDate ?? ''}"`);
      toDelete.add(d.id);
    });
    console.log(`\n  → ${invalid.length} documentos con fecha inválida\n`);
  }

  // ── 2. Documentos con fechas viejas ─────────────────────────────────────────
  sep();
  console.log(`② FECHAS ANTERIORES AL CORTE (< ${fmtDate(CUTOFF)})`);
  sep();
  const old = allDocs.filter(d => {
    const dd = d.data.dueDate;
    return dd && /^\d{4}-\d{2}-\d{2}$/.test(dd) && dd < CUTOFF;
  });

  // Agrupar por empresa para display limpio
  const oldByCompany = new Map();
  old.forEach(d => {
    const co = d.data.company || '(sin empresa)';
    if (!oldByCompany.has(co)) oldByCompany.set(co, []);
    oldByCompany.get(co).push(d);
  });

  if (!old.length) {
    console.log('  ✅ Ninguno\n');
  } else {
    for (const [co, docs] of [...oldByCompany.entries()].sort()) {
      console.log(`\n  🏢 ${co}  (${docs.length})`);
      docs.sort((a,b) => a.data.dueDate.localeCompare(b.data.dueDate)).forEach(d => {
        const mark = FIX_OLD ? '🗑 ' : '📅 ';
        console.log(`    ${mark}${fmtDate(d.data.dueDate)}  ${d.data.taxType} · ${d.data.period ?? '—'}  ${describeDoc(d.data)}`);
        if (FIX_OLD) toDelete.add(d.id);
      });
    }
    console.log(`\n  → ${old.length} documentos con fecha anterior al corte`);
    if (!FIX_OLD) console.log('  ℹ️  Usa --fix-old para eliminarlos\n');
    else console.log('  ✓ Marcados para eliminar\n');
  }

  // ── 3. Duplicados ────────────────────────────────────────────────────────────
  sep();
  console.log('③ DUPLICADOS (mismo NIT + taxType + period + dueDate)');
  sep();

  // Solo los docs NO marcados ya para eliminar (para no contar inválidos como dupes)
  const validDocs = allDocs.filter(d => !toDelete.has(d.id));

  const groups = new Map();
  validDocs.forEach(d => {
    const nit = (d.data.nit ?? '').replace(/[^0-9]/g, '');
    // Si no hay NIT, agrupar por empresa normalizada
    const companyKey = nit || d.data.company?.toLowerCase().trim() || '??';
    const key = `${companyKey}||${(d.data.taxType ?? '').toLowerCase().trim()}||${d.data.period ?? ''}||${d.data.dueDate ?? ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  });

  let dupGroups = 0, dupDocs = 0;
  for (const [key, docs] of groups) {
    if (docs.length < 2) continue;
    dupGroups++;

    docs.sort((a, b) => scorePriority(b.data.status) - scorePriority(a.data.status));
    const keep   = docs[0];
    const remove = docs.slice(1);

    const [companyKey, taxType, period, dueDate] = key.split('||');
    console.log(`\n  📋 ${taxType} | ${period} | ${fmtDate(dueDate)}  (${docs.length} docs)`);
    console.log(`     ✅ CONSERVAR [${keep.id.slice(-6)}]: ${describeDoc(keep.data)}`);
    remove.forEach(r => {
      console.log(`     🗑  BORRAR   [${r.id.slice(-6)}]: ${describeDoc(r.data)}`);
      toDelete.add(r.id);
      dupDocs++;
    });
  }

  if (!dupGroups) {
    console.log('  ✅ Ninguno\n');
  } else {
    console.log(`\n  → ${dupGroups} grupos con duplicados, ${dupDocs} documentos a eliminar\n`);
  }

  // ── 4. Resumen por empresa ───────────────────────────────────────────────────
  sep();
  console.log('④ RESUMEN POR EMPRESA (documentos restantes tras limpieza)');
  sep();

  const surviving = allDocs.filter(d => !toDelete.has(d.id));
  const byCompany = new Map();
  surviving.forEach(d => {
    const co = d.data.company || '(sin empresa)';
    if (!byCompany.has(co)) byCompany.set(co, { total: 0, byStatus: {} });
    const entry = byCompany.get(co);
    entry.total++;
    const s = d.data.status || '(sin estado)';
    entry.byStatus[s] = (entry.byStatus[s] || 0) + 1;
  });

  for (const [co, info] of [...byCompany.entries()].sort()) {
    const statusStr = Object.entries(info.byStatus)
      .sort((a,b) => b[1] - a[1])
      .map(([s, n]) => `${s}:${n}`)
      .join(', ');
    console.log(`  🏢 ${co.padEnd(45)} ${String(info.total).padStart(3)} docs  [${statusStr}]`);
  }

  // ── 5. Acción ────────────────────────────────────────────────────────────────
  sep();
  const totalToDelete = toDelete.size;
  console.log(`\n📊 TOTALES:`);
  console.log(`   Documentos totales:      ${allDocs.length}`);
  console.log(`   A eliminar:              ${totalToDelete}`);
  console.log(`   Quedarán tras limpieza:  ${allDocs.length - totalToDelete}`);

  if (!totalToDelete) {
    console.log('\n✅ Base de datos limpia — nada que eliminar.\n');
    return;
  }

  if (!FIX && !FIX_OLD) {
    console.log('\n💡 Para limpiar duplicados e inválidos:  node scripts/auditAndCleanTaxDb.cjs --fix');
    console.log('   Para limpiar todo (incluye fechas viejas): node scripts/auditAndCleanTaxDb.cjs --fix --fix-old\n');
    return;
  }

  // Eliminar en lotes de 400
  console.log(`\n⚙️  Eliminando ${totalToDelete} documentos...`);
  const refs = allDocs.filter(d => toDelete.has(d.id)).map(d => d.ref);
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch();
    refs.slice(i, i + 400).forEach(ref => batch.delete(ref));
    await batch.commit();
    console.log(`   Lote ${Math.floor(i/400)+1}: ${Math.min(400, refs.length-i)} eliminados`);
  }
  console.log(`\n✅ Limpieza completada — ${totalToDelete} documentos eliminados.\n`);
}

main().catch(err => { console.error('\n❌ Error:', err.message || err); process.exit(1); });
