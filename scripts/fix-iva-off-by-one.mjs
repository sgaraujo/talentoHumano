/**
 * fix-iva-off-by-one.mjs
 *
 * El calendario DIAN 2026 (src/data/dianCalendar2026.ts y su espejo en
 * functions/) tenía TODAS las fechas de IVA Bimestral e IVA Cuatrimestral
 * corridas un día de más — el vencimiento real es el mismo día que
 * Retención en la Fuente del último mes del período, no un día después
 * (verificado contra Actualícese). Ya se corrigió la tabla fuente, pero las
 * obligaciones que ya estaban creadas en accounting/data/tax_obligations
 * antes de ese arreglo quedaron con la fecha vieja (con el error) guardada.
 *
 * Este script SOLO corrige registros cuyo dueDate coincide EXACTO con lo que
 * habría generado la tabla vieja (con el bug) para el dígito de NIT de esa
 * empresa — así no toca fechas que un contador haya ajustado a mano por otra
 * razón (ej. una prórroga real de la DIAN).
 *
 * Uso:
 *   node scripts/fix-iva-off-by-one.mjs            (vista previa, no escribe nada)
 *   node scripts/fix-iva-off-by-one.mjs --apply     (aplica las correcciones)
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(readFileSync(join(__dirname, 'serviceAccount.json'), 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const APPLY = process.argv.includes('--apply');

// dígito -> { "Bimestre N" | "Cuatrimestre N": fecha }
const OLD_BIMESTRAL = {
  1: { 1: '2026-03-11', 2: '2026-05-13', 3: '2026-07-10', 4: '2026-09-10', 5: '2026-11-12', 6: '2027-01-14' },
  2: { 1: '2026-03-12', 2: '2026-05-14', 3: '2026-07-11', 4: '2026-09-11', 5: '2026-11-13', 6: '2027-01-15' },
  3: { 1: '2026-03-13', 2: '2026-05-15', 3: '2026-07-14', 4: '2026-09-12', 5: '2026-11-14', 6: '2027-01-16' },
  4: { 1: '2026-03-14', 2: '2026-05-16', 3: '2026-07-15', 4: '2026-09-15', 5: '2026-11-18', 6: '2027-01-19' },
  5: { 1: '2026-03-17', 2: '2026-05-20', 3: '2026-07-16', 4: '2026-09-16', 5: '2026-11-19', 6: '2027-01-20' },
  6: { 1: '2026-03-18', 2: '2026-05-21', 3: '2026-07-17', 4: '2026-09-17', 5: '2026-11-20', 6: '2027-01-21' },
  7: { 1: '2026-03-19', 2: '2026-05-22', 3: '2026-07-18', 4: '2026-09-18', 5: '2026-11-21', 6: '2027-01-22' },
  8: { 1: '2026-03-20', 2: '2026-05-23', 3: '2026-07-22', 4: '2026-09-19', 5: '2026-11-24', 6: '2027-01-23' },
  9: { 1: '2026-03-21', 2: '2026-05-25', 3: '2026-07-23', 4: '2026-09-22', 5: '2026-11-25', 6: '2027-01-26' },
  0: { 1: '2026-03-25', 2: '2026-05-26', 3: '2026-07-24', 4: '2026-09-23', 5: '2026-11-26', 6: '2027-01-27' },
};
const NEW_BIMESTRAL = {
  1: { 1: '2026-03-10', 2: '2026-05-12', 3: '2026-07-09', 4: '2026-09-09', 5: '2026-11-11', 6: '2027-01-13' },
  2: { 1: '2026-03-11', 2: '2026-05-13', 3: '2026-07-10', 4: '2026-09-10', 5: '2026-11-12', 6: '2027-01-14' },
  3: { 1: '2026-03-12', 2: '2026-05-14', 3: '2026-07-13', 4: '2026-09-11', 5: '2026-11-13', 6: '2027-01-15' },
  4: { 1: '2026-03-13', 2: '2026-05-15', 3: '2026-07-14', 4: '2026-09-14', 5: '2026-11-17', 6: '2027-01-18' },
  5: { 1: '2026-03-16', 2: '2026-05-19', 3: '2026-07-15', 4: '2026-09-15', 5: '2026-11-18', 6: '2027-01-19' },
  6: { 1: '2026-03-17', 2: '2026-05-20', 3: '2026-07-16', 4: '2026-09-16', 5: '2026-11-19', 6: '2027-01-20' },
  7: { 1: '2026-03-18', 2: '2026-05-21', 3: '2026-07-17', 4: '2026-09-17', 5: '2026-11-20', 6: '2027-01-21' },
  8: { 1: '2026-03-19', 2: '2026-05-22', 3: '2026-07-21', 4: '2026-09-18', 5: '2026-11-23', 6: '2027-01-22' },
  9: { 1: '2026-03-20', 2: '2026-05-25', 3: '2026-07-22', 4: '2026-09-21', 5: '2026-11-24', 6: '2027-01-25' },
  0: { 1: '2026-03-24', 2: '2026-05-26', 3: '2026-07-23', 4: '2026-09-22', 5: '2026-11-25', 6: '2027-01-26' },
};
const OLD_CUATRIMESTRAL = {
  1: { 1: '2026-05-13', 2: '2026-09-10', 3: '2027-01-14' },
  2: { 1: '2026-05-14', 2: '2026-09-11', 3: '2027-01-15' },
  3: { 1: '2026-05-15', 2: '2026-09-12', 3: '2027-01-16' },
  4: { 1: '2026-05-16', 2: '2026-09-15', 3: '2027-01-19' },
  5: { 1: '2026-05-20', 2: '2026-09-16', 3: '2027-01-20' },
  6: { 1: '2026-05-21', 2: '2026-09-17', 3: '2027-01-21' },
  7: { 1: '2026-05-22', 2: '2026-09-18', 3: '2027-01-22' },
  8: { 1: '2026-05-23', 2: '2026-09-19', 3: '2027-01-23' },
  9: { 1: '2026-05-25', 2: '2026-09-22', 3: '2027-01-26' },
  0: { 1: '2026-05-26', 2: '2026-09-23', 3: '2027-01-27' },
};
const NEW_CUATRIMESTRAL = {
  1: { 1: '2026-05-12', 2: '2026-09-09', 3: '2027-01-13' },
  2: { 1: '2026-05-13', 2: '2026-09-10', 3: '2027-01-14' },
  3: { 1: '2026-05-14', 2: '2026-09-11', 3: '2027-01-15' },
  4: { 1: '2026-05-15', 2: '2026-09-14', 3: '2027-01-18' },
  5: { 1: '2026-05-19', 2: '2026-09-15', 3: '2027-01-19' },
  6: { 1: '2026-05-20', 2: '2026-09-16', 3: '2027-01-20' },
  7: { 1: '2026-05-21', 2: '2026-09-17', 3: '2027-01-21' },
  8: { 1: '2026-05-22', 2: '2026-09-18', 3: '2027-01-22' },
  9: { 1: '2026-05-25', 2: '2026-09-21', 3: '2027-01-25' },
  0: { 1: '2026-05-26', 2: '2026-09-22', 3: '2027-01-26' },
};

function extractDigit(nit) {
  if (!nit) return null;
  const trimmed = String(nit).trim();
  const hasDash = trimmed.includes('-');
  const digitsOnly = trimmed.replace(/\D/g, '');
  const base = hasDash ? trimmed.split('-')[0].replace(/\D/g, '') : (digitsOnly.length > 9 ? digitsOnly.slice(0, -1) : digitsOnly);
  if (!base) return null;
  return Number(base[base.length - 1]);
}

const normalize = (v) => String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.\-,]/g, '').replace(/\s+/g, ' ').trim();
const cleanNit = (v) => String(v ?? '').replace(/\D/g, '');

function classify(taxType, period) {
  const t = normalize(taxType);
  const p = normalize(period);
  if (!t.includes('iva')) return null;
  const bim = p.match(/\bbim\w*\s*(\d)\b/);
  if (bim) return { kind: 'bimestral', n: Number(bim[1]) };
  const cuatri = p.match(/\bcuatri\w*\s*(\d)\b/);
  if (cuatri) return { kind: 'cuatrimestral', n: Number(cuatri[1]) };
  return null;
}

async function main() {
  const [companiesSnap, oblSnap] = await Promise.all([
    db.collection('organization/data/companies').get(),
    db.collection('accounting/data/tax_obligations').get(),
  ]);
  const companies = companiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const obligations = oblSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const toFix = [];
  const ambiguous = [];
  for (const o of obligations) {
    const cls = classify(o.taxType, o.period);
    if (!cls) continue;
    const company = companies.find(c => c.id === o.companyId || cleanNit(c.nit) === cleanNit(o.nit) || normalize(c.name) === normalize(o.company));
    const nit = o.nit || company?.nit;
    const digit = extractDigit(nit);
    if (digit === null) { ambiguous.push({ ...o, reason: 'sin NIT resoluble' }); continue; }
    const oldTable = cls.kind === 'bimestral' ? OLD_BIMESTRAL : OLD_CUATRIMESTRAL;
    const newTable = cls.kind === 'bimestral' ? NEW_BIMESTRAL : NEW_CUATRIMESTRAL;
    const oldExpected = oldTable[digit]?.[cls.n];
    const newExpected = newTable[digit]?.[cls.n];
    if (!oldExpected || !newExpected) continue;
    if (o.dueDate === oldExpected) {
      toFix.push({ id: o.id, company: o.company || company?.name, nit, taxType: o.taxType, period: o.period, from: o.dueDate, to: newExpected });
    } else if (o.dueDate !== newExpected) {
      ambiguous.push({ ...o, reason: `dueDate no coincide con el patrón del bug (esperado viejo ${oldExpected} o ya correcto ${newExpected})` });
    }
  }

  console.log(`=== ${toFix.length} obligación(es) de IVA a corregir (coinciden exacto con el patrón del bug) ===\n`);
  toFix.forEach(t => console.log(`  ${t.company} (NIT ${t.nit}) · ${t.taxType} · ${t.period}: ${t.from} -> ${t.to}  [id:${t.id}]`));

  if (ambiguous.length) {
    console.log(`\n--- ${ambiguous.length} registro(s) de IVA que NO coinciden ni con el patrón viejo ni con el nuevo (revisar a mano, no se tocan) ---`);
    ambiguous.forEach(a => console.log(`  ${a.company} (NIT ${a.nit}) · ${a.taxType} · ${a.period}: ${a.dueDate} — ${a.reason} [id:${a.id}]`));
  }

  const backupPath = join(__dirname, `iva-off-by-one-backup-${Date.now()}.json`);
  writeFileSync(backupPath, JSON.stringify({ toFix, ambiguous }, null, 2), 'utf8');
  console.log(`\nBackup guardado en ${backupPath}`);

  if (!APPLY) {
    console.log(`\n(Vista previa — no se escribió nada. Vuelve a correr con --apply para aplicar las ${toFix.length} correcciones.)`);
    return;
  }

  const batch = db.batch();
  toFix.forEach(t => batch.update(db.doc(`accounting/data/tax_obligations/${t.id}`), { dueDate: t.to, year: t.to.slice(0, 4) }));
  await batch.commit();
  console.log(`\n✔ Aplicado: se corrigieron ${toFix.length} obligación(es).`);
}

main().catch(err => { console.error(err); process.exit(1); });
