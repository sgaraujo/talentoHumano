/**
 * Repara relaciones laborales usando el Excel oficial (hoja "BD - DIRECTOS"):
 *
 *  1. startDate / endDate guardados como TEXTO ("11/3/2023", ambiguo d/m vs m/d)
 *     → fecha real, tomada del serial de Excel de la fila que corresponde
 *     (misma cédula + empresa, y cuya fecha coincide con alguna lectura del texto).
 *     endDate "-" o vacío → null.
 *  2. terminationReason:
 *     - relación activa → null (antes quedaba "Renuncia voluntaria").
 *     - retiro marcado "Renuncia voluntaria" → se recalcula desde MOTIVO DE RETIRO
 *       del Excel con el normalizador corregido (null / catálogo / "Sin clasificar").
 *
 * Por defecto SOLO SIMULA. Para escribir: --apply (guarda antes un respaldo JSON).
 *
 *   node scripts/repair-hr-employments.mjs --excel "C:\ruta\BD.xlsx"
 *   node scripts/repair-hr-employments.mjs --excel "C:\ruta\BD.xlsx" --apply
 *
 * Genera scripts/hr-employment-repair-report-<ts>.xlsx con lo que no se pudo
 * resolver automáticamente (contiene cédulas: no compartir).
 */
process.env.TZ = 'America/Bogota';

import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import XLSX from 'xlsx';
import { parseExcelDate } from '../src/domain/humanResources/excelDate.ts';
import { normalizeRetiroReason } from '../src/domain/humanResources/terminationReasons.ts';

const args = process.argv.slice(2);
const excelPath = args[args.indexOf('--excel') + 1];
const APPLY = args.includes('--apply');
if (!args.includes('--excel') || !excelPath) throw new Error('Indica el Excel: --excel "ruta\\BD.xlsx"');

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(scriptDir, 'serviceAccount.json'), 'utf8'));
let app;
try { app = getApp(); } catch { app = initializeApp({ credential: cert(serviceAccount) }); }
const db = getFirestore(app);
const stamp = Date.now();

// ── Utilidades ──────────────────────────────────────────────────────────────
const text = value => String(value ?? '').trim();
const keyPart = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const dayKey = date => date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '';
const isBlankDate = value => value === null || value === undefined || text(value) === '' || text(value) === '-';
const retired = value => ['retirad', 'inactiv', 'terminad', 'finalizad', 'anulad'].some(token => keyPart(value).includes(token));
const isTimestamp = value => typeof value?.toDate === 'function';
// Todas las lecturas posibles de un texto de fecha: d/m y m/d (sin adivinar).
const textCandidates = value => {
  const s = text(value);
  const dayFirst = parseExcelDate(s, { dayFirstOnly: true });
  const any = parseExcelDate(s);
  const monthFirst = (() => {
    const parts = s.split(/[/\-.]/).map(Number);
    if (parts.length !== 3 || !parts.every(Number.isFinite) || parts[0] > 999) return undefined;
    return parseExcelDate(`${parts[1]}/${parts[0]}/${parts[2]}`, { dayFirstOnly: true });
  })();
  const map = new Map();
  [dayFirst, monthFirst, any].filter(Boolean).forEach(date => map.set(dayKey(date), date));
  return [...map.values()];
};

// ── Excel ───────────────────────────────────────────────────────────────────
const workbook = XLSX.readFile(excelPath);
const sheet = workbook.Sheets['BD - DIRECTOS'];
if (!sheet) throw new Error('El archivo no tiene la hoja "BD - DIRECTOS".');
const excelRows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true }).map((row, index) => {
  const start = isBlankDate(row['FECHA DE INGRESO']) ? undefined : parseExcelDate(row['FECHA DE INGRESO'], { dayFirstOnly: true });
  const endBlank = isBlankDate(row['FECHA RETIRO']);
  const end = endBlank ? null : parseExcelDate(row['FECHA RETIRO'], { dayFirstOnly: true });
  const active = !retired(row.ESTADO);
  return {
    sourceRow: index + 2,
    doc: text(row.CEDULA).replace(/\D/g, ''),
    company: keyPart(row.EMPRESA),
    start, startKey: dayKey(start),
    end, endBlank, endInvalid: !endBlank && !end,
    active,
    reason: normalizeRetiroReason(row['MOTIVO DE RETIRO'] || row['MOTIVO RETIRO'] || row.MOTIVO, { active }),
  };
}).filter(row => row.doc);
const excelByDocCompany = new Map();
const excelByDoc = new Map();
excelRows.forEach(row => {
  const key = `${row.doc}|${row.company}`;
  if (!excelByDocCompany.has(key)) excelByDocCompany.set(key, []);
  excelByDocCompany.get(key).push(row);
  if (!excelByDoc.has(row.doc)) excelByDoc.set(row.doc, []);
  excelByDoc.get(row.doc).push(row);
});
console.log(`Excel: ${excelRows.length} filas con cédula; ${excelRows.filter(r => r.start).length} con fecha de ingreso real.`);

// ── Relaciones ──────────────────────────────────────────────────────────────
const snap = await db.collectionGroup('employments').get();
console.log(`Firestore: ${snap.size} relaciones laborales.\n`);

const updates = [];     // { ref, patch, before }
const unresolved = [];  // filas del reporte
const stats = new Map();
const bump = key => stats.set(key, (stats.get(key) ?? 0) + 1);
const finalStartKeys = new Map(); // detección de colisiones tras reparar

for (const docSnap of snap.docs) {
  const r = docSnap.data();
  const employeeId = r.employeeId || docSnap.ref.parent.parent?.id;
  const company = keyPart(r.companyName);
  const byCompany = excelByDocCompany.get(`${employeeId}|${company}`) ?? [];
  const pool = byCompany.length ? byCompany : (excelByDoc.get(employeeId) ?? []);
  const patch = {};
  const report = (problem, detail = '') => unresolved.push({
    Cédula: employeeId, Empresa: r.companyName ?? '', Relación: docSnap.id, Estado: r.status ?? '',
    'startDate actual': isTimestamp(r.startDate) ? dayKey(r.startDate.toDate()) : text(r.startDate),
    'endDate actual': isTimestamp(r.endDate) ? dayKey(r.endDate.toDate()) : text(r.endDate),
    Problema: problem, Detalle: detail,
  });

  // 1) startDate
  let startDate = isTimestamp(r.startDate) ? r.startDate.toDate() : undefined;
  let matches = [];
  if (startDate) {
    matches = pool.filter(row => row.startKey === dayKey(startDate));
  } else if (typeof r.startDate === 'string' && text(r.startDate)) {
    const candidates = textCandidates(r.startDate);
    const matchedKeys = [...new Set(pool.filter(row => candidates.some(date => dayKey(date) === row.startKey)).map(row => row.startKey))];
    if (matchedKeys.length === 1) {
      matches = pool.filter(row => row.startKey === matchedKeys[0]);
      startDate = matches[0].start;
      patch.startDate = Timestamp.fromDate(startDate);
      bump('startDate texto → fecha (confirmada con Excel)');
    } else if (matchedKeys.length > 1) {
      bump('startDate texto ambiguo (ambas lecturas existen en Excel)');
      report('Fecha de ingreso ambigua', `"${r.startDate}" coincide con ${matchedKeys.join(' y ')} en el Excel`);
    } else {
      bump('startDate texto sin fila equivalente en Excel');
      report('Fecha de ingreso en texto sin fila equivalente en el Excel', `"${r.startDate}"; lecturas posibles: ${candidates.map(dayKey).join(' / ') || 'ninguna'}`);
    }
  } else {
    bump('startDate ausente');
    report('Sin fecha de ingreso', pool.length ? `${pool.length} filas del Excel para esa cédula/empresa` : 'Sin filas en el Excel');
  }
  const excelRow = matches.length === 1 ? matches[0] : undefined;
  if (matches.length > 1) bump('varias filas del Excel con la misma cédula+empresa+fecha');

  // 2) endDate
  if (typeof r.endDate === 'string') {
    if (isBlankDate(r.endDate)) {
      patch.endDate = null;
      bump('endDate "-"/vacío → null');
    } else {
      const candidates = textCandidates(r.endDate);
      const excelEnd = excelRow && !excelRow.endBlank && excelRow.end ? dayKey(excelRow.end) : '';
      const confirmed = excelEnd && candidates.find(date => dayKey(date) === excelEnd);
      if (confirmed) {
        patch.endDate = Timestamp.fromDate(excelRow.end);
        bump('endDate texto → fecha (confirmada con Excel)');
      } else if (candidates.length === 1 && !excelEnd) {
        patch.endDate = Timestamp.fromDate(candidates[0]);
        bump('endDate texto → fecha (única lectura posible)');
      } else {
        bump('endDate texto sin resolver');
        report('Fecha de retiro en texto sin resolver', `"${r.endDate}"; Excel: ${excelEnd || 'sin dato'}; lecturas: ${candidates.map(dayKey).join(' / ') || 'ninguna'}`);
      }
    }
  }

  // 3) terminationReason
  if (r.status === 'active') {
    if (r.terminationReason != null || r.terminationReasonRaw != null) {
      patch.terminationReason = null;
      patch.terminationReasonRaw = null;
      bump('motivo en relación activa → null');
    }
  } else if (r.terminationReason === 'Renuncia voluntaria') {
    if (!excelRow) {
      bump('"Renuncia voluntaria" sin fila del Excel para verificar');
      report('Motivo "Renuncia voluntaria" sin verificar', matches.length > 1 ? 'Varias filas del Excel coinciden' : 'No se encontró la fila del Excel');
    } else if (excelRow.active) {
      bump('"Renuncia voluntaria" pero la fila del Excel está activa');
      report('Relación retirada en plataforma pero activa en el Excel', `Fila ${excelRow.sourceRow}`);
    } else if (excelRow.reason.reason !== 'Renuncia voluntaria') {
      patch.terminationReason = excelRow.reason.reason;
      patch.terminationReasonRaw = excelRow.reason.raw ?? null;
      bump(`"Renuncia voluntaria" → ${excelRow.reason.reason ?? 'null (sin motivo en el Excel)'}`);
    } else bump('"Renuncia voluntaria" confirmada por el Excel');
  }

  if (Object.keys(patch).length) {
    updates.push({ ref: docSnap.ref, patch, before: {
      startDate: r.startDate ?? null, endDate: r.endDate ?? null,
      terminationReason: r.terminationReason ?? null, terminationReasonRaw: r.terminationReasonRaw ?? null,
    } });
  }
  const finalKey = startDate ? `${employeeId}|${company}|${dayKey(startDate)}` : null;
  if (finalKey) {
    if (!finalStartKeys.has(finalKey)) finalStartKeys.set(finalKey, []);
    finalStartKeys.get(finalKey).push({ id: docSnap.id, employeeId, companyName: r.companyName, startDate });
  }
}

// Colisiones: dos relaciones que tras la reparación comparten cédula+empresa+fecha
// serían tratadas como la misma en la próxima carga. No se fusionan: se reportan.
let collisions = 0;
finalStartKeys.forEach(group => {
  if (group.length < 2) return;
  collisions++;
  group.forEach(item => unresolved.push({
    Cédula: item.employeeId, Empresa: item.companyName ?? '', Relación: item.id, Estado: '',
    'startDate actual': dayKey(item.startDate), 'endDate actual': '',
    Problema: 'Relaciones duplicadas (misma cédula, empresa y fecha de ingreso)', Detalle: `${group.length} relaciones: ${group.map(g => g.id).join(', ')}`,
  }));
});

// ── Resumen ─────────────────────────────────────────────────────────────────
console.log('Resumen:');
[...stats.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(String(v).padStart(6), k));
console.log(`${String(collisions).padStart(6)} grupos de relaciones duplicadas (cédula+empresa+fecha) — solo se reportan`);
console.log(`\nRelaciones a modificar: ${updates.length}. Casos para revisión manual: ${unresolved.length}.`);

if (unresolved.length) {
  const reportPath = join(scriptDir, `hr-employment-repair-report-${stamp}.xlsx`);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unresolved), 'Revisar');
  XLSX.writeFile(wb, reportPath);
  console.log(`Reporte: ${reportPath}`);
}

if (!APPLY) {
  console.log('\nSIMULACIÓN: no se escribió nada. Ejecuta de nuevo con --apply para aplicar.');
  process.exit(0);
}

const backupPath = join(scriptDir, `hr-employment-repair-backup-${stamp}.json`);
writeFileSync(backupPath, JSON.stringify(updates.map(u => ({
  path: u.ref.path,
  before: Object.fromEntries(Object.entries(u.before).map(([k, v]) => [k, isTimestamp(v) ? { timestampSeconds: v.seconds } : v])),
  patch: Object.fromEntries(Object.entries(u.patch).map(([k, v]) => [k, v instanceof Timestamp ? { timestampSeconds: v.seconds } : v])),
})), null, 2));
console.log(`Respaldo: ${backupPath}`);

for (let offset = 0; offset < updates.length; offset += 400) {
  const batch = db.batch();
  updates.slice(offset, offset + 400).forEach(u => batch.set(u.ref, { ...u.patch, repairedAt: Timestamp.now(), repairRun: `repair-hr-employments-${stamp}` }, { merge: true }));
  await batch.commit();
  console.log(`Escritas ${Math.min(offset + 400, updates.length)} de ${updates.length}`);
}
console.log('Listo.');
