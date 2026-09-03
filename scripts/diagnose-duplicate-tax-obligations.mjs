/**
 * Busca documentos de `accounting/data/tax_obligations` duplicados (misma
 * empresa + tipo de impuesto + período/vencimiento, guardados 2+ veces) que
 * inflan el Informe/Calendario Tributario con filas repetidas. Solo lee.
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

const normalize = (v) =>
  String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[.\-,]/g, '').replace(/\s+/g, ' ').trim();
const cleanNit = (nit) => String(nit ?? '').replace(/[^0-9]/g, '');

const TAX_ALIASES = {
  reteica: 'reteica',
  'retencion de ica': 'reteica',
  'retencion ica': 'reteica',
  'iva bimestral': 'iva',
  'iva cuatrimestral': 'iva',
  'impuesto a las ventas': 'iva',
  iva: 'iva',
  'retencion en la fuente': 'retencion en la fuente',
  'retencion fuente': 'retencion en la fuente',
  retefuente: 'retencion en la fuente',
  'exogena nacional (pj/naturales)': 'exogena nacional',
  'informacion exogena nacional': 'exogena nacional',
  'exogena nacional': 'exogena nacional',
  'informacion exogena': 'exogena nacional',
  'exogena pj': 'exogena nacional',
};
const normTax = (t) => { const n = normalize(t); return TAX_ALIASES[n] ?? n; };

const MONTH_NAMES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function periodKey(period) {
  const value = normalize(period).replace(/[()]/g, ' ').trim();
  const monthIdx = MONTH_NAMES.indexOf(value);
  if (monthIdx !== -1) return `month:${monthIdx + 1}`;
  const bim = value.match(/\b(?:bim|bimestre)\s*(\d)\b/);
  if (bim) return `bimester:${bim[1]}`;
  const four = value.match(/\b(?:cuatri|cuatrim|cuatrimestre)\s*(\d)\b/);
  if (four) return `four-month:${four[1]}`;
  const quarter = value.match(/\btrimestre\s*(\d)\b/);
  if (quarter) return `quarter:${quarter[1]}`;
  const sem = value.match(/\b(?:sem|semestre)\s*([12])\b/);
  if (sem) return `semester:${sem[1]}`;
  const cuota = value.match(/\bcuota\s*(\d+)\b/);
  if (cuota) return `installment:${cuota[1]}`;
  if (value === 'anual') return 'annual';
  return value ? `text:${value}` : '';
}

const companyKey = (o) => {
  if (o.companyId) return `id:${o.companyId}`;
  const nit = cleanNit(o.nit);
  return nit ? `nit:${nit}` : `name:${normalize(o.company)}`;
};

const snap = await db.collection('accounting/data/tax_obligations').get();
const obls = snap.docs.map(d => ({ id: d.id, path: d.ref.path, ...d.data() }));
console.log(`Total obligaciones: ${obls.length}`);

// Agrupar por: empresa + tipo de impuesto + período (semántico) + año
const groups = new Map();
for (const o of obls) {
  const key = `${companyKey(o)}|${normTax(o.taxType)}|${periodKey(o.period)}|${o.year || (o.dueDate || '').slice(0, 4)}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(o);
}
const dupGroups = [...groups.entries()].filter(([, docs]) => docs.length > 1);
const extraDocs = dupGroups.reduce((sum, [, docs]) => sum + (docs.length - 1), 0);

console.log(`\nGrupos duplicados (misma empresa+impuesto+período+año): ${dupGroups.length}`);
console.log(`Documentos "de más" (deberían eliminarse, dejando 1 por grupo): ${extraDocs}`);

console.log(`\n--- Detalle ---`);
for (const [key, docs] of dupGroups) {
  console.log(`\n${key}`);
  for (const d of docs) {
    console.log(
      `  ${d.path} | estado:"${d.status || ''}" | vencimiento:${d.dueDate} | proyectado:${d.projected ?? '—'} | presentado:${d.presented ?? '—'} | pagado:${d.paid ?? '—'} | actualizado:${d.updatedAt?.toDate?.() ?? d.updatedAt ?? '—'}`
    );
  }
}
