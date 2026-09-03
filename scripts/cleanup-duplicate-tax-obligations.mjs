/**
 * Limpia documentos de `accounting/data/tax_obligations` duplicados (misma
 * empresa + tipo de impuesto + período/año) donde uno de los dos quedó
 * completamente vacío (sin estado avanzado, sin valores, sin fechas, sin
 * adjuntos) y el otro tiene el dato real. Conserva el que tiene contenido,
 * archiva y borra el vacío.
 *
 * Solo actúa sobre grupos de EXACTAMENTE 2 documentos donde uno es
 * inequívocamente vacío y el otro no. Cualquier grupo que no calce (3+ docs,
 * ambos vacíos, ambos con datos distintos, etc.) se deja intacto y se
 * reporta aparte para revisión manual — no se toca a ciegas.
 *
 * Uso:
 *   node scripts/cleanup-duplicate-tax-obligations.mjs
 *   node scripts/cleanup-duplicate-tax-obligations.mjs --apply
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
const COLLECTION = 'accounting/data/tax_obligations';
const ARCHIVE_COLLECTION = 'accounting/data/tax_obligations_archive';

const normalize = (v) =>
  String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[.\-,]/g, '').replace(/\s+/g, ' ').trim();
const cleanNit = (nit) => String(nit ?? '').replace(/[^0-9]/g, '');

const TAX_ALIASES = {
  reteica: 'reteica', 'retencion de ica': 'reteica', 'retencion ica': 'reteica',
  'iva bimestral': 'iva', 'iva cuatrimestral': 'iva', 'impuesto a las ventas': 'iva', iva: 'iva',
  'retencion en la fuente': 'retencion en la fuente', 'retencion fuente': 'retencion en la fuente', retefuente: 'retencion en la fuente',
  'exogena nacional (pj/naturales)': 'exogena nacional', 'informacion exogena nacional': 'exogena nacional',
  'exogena nacional': 'exogena nacional', 'informacion exogena': 'exogena nacional', 'exogena pj': 'exogena nacional',
};
const normTax = (t) => { const n = normalize(t); return TAX_ALIASES[n] ?? n; };

const MONTH_NAMES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function periodKey(period) {
  const value = normalize(period).replace(/[()]/g, ' ').trim();
  const monthIdx = MONTH_NAMES.indexOf(value);
  if (monthIdx !== -1) return `month:${monthIdx + 1}`;
  const bim = value.match(/\b(?:bim|bimestre)\s*(\d)\b/); if (bim) return `bimester:${bim[1]}`;
  const four = value.match(/\b(?:cuatri|cuatrim|cuatrimestre)\s*(\d)\b/); if (four) return `four-month:${four[1]}`;
  const quarter = value.match(/\btrimestre\s*(\d)\b/); if (quarter) return `quarter:${quarter[1]}`;
  const sem = value.match(/\b(?:sem|semestre)\s*([12])\b/); if (sem) return `semester:${sem[1]}`;
  const cuota = value.match(/\bcuota\s*(\d+)\b/); if (cuota) return `installment:${cuota[1]}`;
  if (value === 'anual') return 'annual';
  return value ? `text:${value}` : '';
}
const companyKey = (o) => {
  if (o.companyId) return `id:${o.companyId}`;
  const nit = cleanNit(o.nit);
  return nit ? `nit:${nit}` : `name:${normalize(o.company)}`;
};

/** Vacío = sin avance de estado, sin montos, sin fechas de gestión, sin adjuntos/historial. */
function isBlank(o) {
  const blankStatus = !o.status || o.status === 'No iniciado';
  const hasAmounts = o.projected != null || o.presented != null || o.paid != null;
  const hasDates = Boolean(o.presentedAt || o.paidAt);
  const hasAttachments = Array.isArray(o.attachments) && o.attachments.length > 0;
  const hasHistory = Array.isArray(o.statusHistory) && o.statusHistory.length > 0;
  const hasStepOwners = o.stepOwners && Object.keys(o.stepOwners).length > 0;
  const hasObservation = Boolean((o.observation ?? '').trim());
  return blankStatus && !hasAmounts && !hasDates && !hasAttachments && !hasHistory && !hasStepOwners && !hasObservation;
}

const snap = await db.collection(COLLECTION).get();
const obls = snap.docs.map(d => ({ ref: d.ref, path: d.ref.path, id: d.id, ...d.data() }));
console.log(`Total obligaciones: ${obls.length}`);

const groups = new Map();
for (const o of obls) {
  const key = `${companyKey(o)}|${normTax(o.taxType)}|${periodKey(o.period)}|${o.year || (o.dueDate || '').slice(0, 4)}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(o);
}
const dupGroups = [...groups.entries()].filter(([, docs]) => docs.length > 1);

let autoResolve = [];
let needsReview = [];
for (const [key, docs] of dupGroups) {
  if (docs.length !== 2) { needsReview.push({ key, docs, reason: `${docs.length} documentos (no 2)` }); continue; }
  const [d1, d2] = docs;
  const d1Blank = isBlank(d1);
  const d2Blank = isBlank(d2);
  if (d1Blank && !d2Blank) { autoResolve.push({ key, keep: d2, remove: d1 }); continue; }
  if (d2Blank && !d1Blank) { autoResolve.push({ key, keep: d1, remove: d2 }); continue; }
  needsReview.push({ key, docs, reason: d1Blank && d2Blank ? 'ambos vacíos' : 'ambos con datos (posible conflicto real)' });
}

console.log(`\nGrupos duplicados (misma empresa+impuesto+período+año): ${dupGroups.length}`);
console.log(`Auto-resolubles (1 vacío + 1 con datos): ${autoResolve.length}`);
console.log(`Necesitan revisión manual (no calzan el patrón): ${needsReview.length}`);

if (needsReview.length > 0) {
  console.log(`\n--- Grupos que necesitan revisión manual (NO se tocan) ---`);
  for (const { key, docs, reason } of needsReview) {
    console.log(`\n[${reason}] ${key}`);
    for (const d of docs) {
      console.log(`  ${d.path} | estado:"${d.status || ''}" | vencimiento:${d.dueDate} | proyectado:${d.projected ?? '—'} | presentado:${d.presented ?? '—'} | pagado:${d.paid ?? '—'}`);
    }
  }
}

console.log(`\n=== ${APPLY ? 'APLICANDO' : 'SIMULACIÓN'}: se archivarán y borrarán ${autoResolve.length} documentos duplicados ===`);

if (!APPLY) {
  console.log('\nAcciones planeadas:');
  for (const { keep, remove } of autoResolve) {
    console.log(`  CONSERVAR ${keep.path} (estado:"${keep.status || ''}")  |  BORRAR ${remove.path} (estado:"${remove.status || ''}")`);
  }
  console.log('\nEjecuta con --apply para aplicar los cambios.');
  process.exit(0);
}

const archive = db.collection(ARCHIVE_COLLECTION);
let done = 0;
for (let i = 0; i < autoResolve.length; i += 400) {
  const chunk = autoResolve.slice(i, i + 400);
  const batch = db.batch();
  for (const { remove, keep } of chunk) {
    const { ref, path, ...data } = remove;
    batch.set(archive.doc(remove.id), {
      ...data,
      originalPath: path,
      archivedAt: FieldValue.serverTimestamp(),
      archivedReason: 'duplicate-tax-obligation-blank',
      consolidatedInto: keep.path,
    });
    batch.delete(remove.ref);
  }
  await batch.commit();
  done += chunk.length;
  console.log(`Progreso: ${done}/${autoResolve.length}`);
}
console.log(`Listo. ${done} documentos duplicados archivados y eliminados.`);
