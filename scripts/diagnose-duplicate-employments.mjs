/**
 * Busca documentos de `employments` duplicados (mismo employeeId + empresa +
 * fechas equivalentes, guardados 2 veces con formato de fecha distinto) y mide
 * cuánto inflan el conteo de "retiros" de Rotación. Solo lee.
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

const toDate = (raw) => {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (raw && typeof raw.toDate === 'function') { const d = raw.toDate(); return isNaN(d.getTime()) ? null : d; }
  if (raw && typeof raw.seconds === 'number') return new Date(raw.seconds * 1000);
  if (typeof raw === 'string' && raw.trim()) {
    const s = raw.trim();
    const parts = s.split(/[\/\-]/);
    if (parts.length === 3 && parts.every(p => /^\d+$/.test(p))) {
      const [a, b, c] = parts.map(Number);
      if (a > 31) { const d = new Date(a, b - 1, c); if (!isNaN(d.getTime())) return d; }
      else {
        const year = c < 100 ? (c < 50 ? 2000 + c : 1900 + c) : c;
        if (a > 12 && b <= 12) return new Date(year, b - 1, a);
        if (b > 12 && a <= 12) return new Date(year, a - 1, b);
        if (a >= 1 && a <= 12 && b >= 1 && b <= 31) return new Date(year, a - 1, b);
      }
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};
const normalize = (v) => String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const ymd = (d) => d ? d.toISOString().slice(0, 10) : 'null';

const [companiesSnap, employmentsSnap] = await Promise.all([
  db.collection('organization/data/companies').get(),
  db.collectionGroup('employments').get(),
]);
const companies = companiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const thCompanies = companies.filter(c => c.activeTH);

let relations = employmentsSnap.docs.map(d => ({
  path: d.ref.path, id: d.id, employeeId: d.data().employeeId || d.ref.parent.parent?.id, ...d.data(),
}));
const relationsTH = relations.filter(r => thCompanies.some(c => {
  if (r.companyId && r.companyId === c.id) return true;
  const accepted = [c.name, ...(c.aliases ?? [])].map(normalize);
  return accepted.includes(normalize(r.companyName));
}));

console.log(`Total employments (TH): ${relationsTH.length}`);

// Agrupar por: employeeId + companyName normalizado + status + fecha de inicio equivalente (día)
const groups = new Map();
for (const r of relationsTH) {
  const startN = ymd(toDate(r.startDate));
  const endN = ymd(toDate(r.endDate));
  const key = `${r.employeeId}|${normalize(r.companyName)}|${r.status}|${startN}|${endN}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}
const dupGroups = [...groups.entries()].filter(([, docs]) => docs.length > 1);
const totalDupExtraDocs = dupGroups.reduce((sum, [, docs]) => sum + (docs.length - 1), 0);
console.log(`\nGrupos con documentos duplicados exactos (mismo empleado+empresa+status+fechas): ${dupGroups.length}`);
console.log(`Documentos "de más" (deberían eliminarse, dejando 1 por grupo): ${totalDupExtraDocs}`);

// Cuántas personas distintas están afectadas
const affectedPeople = new Set(dupGroups.map(([key]) => key.split('|')[0]));
console.log(`Personas distintas con al menos un duplicado: ${affectedPeople.size}`);

// Impacto en "retiros del año actual" (como lo cuenta Rotación)
const today = new Date();
const currentYear = today.getFullYear();
const retiroDupGroups = dupGroups.filter(([key, docs]) => {
  const [, , status] = key.split('|');
  if (status !== 'retired') return false;
  const end = toDate(docs[0].endDate);
  return end && end.getFullYear() === currentYear;
});
const retirosInfladosPorDup = retiroDupGroups.reduce((sum, [, docs]) => sum + (docs.length - 1), 0);
console.log(`\nDe esos duplicados, grupos que son "retiro en ${currentYear}": ${retiroDupGroups.length}`);
console.log(`Retiros de más contados en ${currentYear} por culpa de duplicados: ${retirosInfladosPorDup}`);

console.log(`\n--- Detalle de grupos duplicados (status=retired, año ${currentYear}) ---`);
for (const [key, docs] of retiroDupGroups) {
  const [employeeId, , , start, end] = key.split('|');
  console.log(`employeeId:${employeeId} | ${docs[0].companyName} | ${start}→${end} | docs: ${docs.map(d => `${d.path} (endDate raw: "${d.endDate}")`).join(' | ')}`);
}

console.log(`\n--- Todos los grupos duplicados (cualquier status/año) ---`);
for (const [key, docs] of dupGroups) {
  console.log(`${key} -> ${docs.length} docs: ${docs.map(d => d.id).join(', ')}`);
}
