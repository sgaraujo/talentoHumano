/**
 * Diagnostica por qué "Colaboradores activos por cuenta analítica" (headcountPorProyecto,
 * suma 289) no cuadra con el headcount total (283). Replica activeRelations de
 * getRotationMetrics para el período por defecto (año actual, sin mes). Solo lee.
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

const [companiesSnap, employmentsSnap] = await Promise.all([
  db.collection('organization/data/companies').get(),
  db.collectionGroup('employments').get(),
]);
const companies = companiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const thCompanies = companies.filter(c => c.activeTH);

let relations = employmentsSnap.docs.map(d => ({
  path: d.ref.path, employeeId: d.data().employeeId || d.ref.parent.parent?.id, ...d.data(),
}));
const relationsTH = relations.filter(r => thCompanies.some(c => {
  if (r.companyId && r.companyId === c.id) return true;
  const accepted = [c.name, ...(c.aliases ?? [])].map(normalize);
  return accepted.includes(normalize(r.companyName));
}));

const today = new Date();
const periodEnd = today;
const activeRelations = relationsTH.filter(r => {
  if (r.status !== 'active' && r.status !== 'retired') return false;
  const start = toDate(r.startDate);
  if (!start || start > periodEnd) return false;
  if (r.status === 'retired') {
    const end = toDate(r.endDate);
    if (!end || end < periodEnd) return false;
  }
  return true;
});
const headcount = new Set(activeRelations.map(r => r.employeeId)).size;
console.log(`headcount (único por employeeId): ${headcount}`);
console.log(`activeRelations (registros, sin deduplicar): ${activeRelations.length}`);

// headcountPorProyecto tal cual lo hace el código: cuenta RELATIONS, no employeeId único
const byProject = new Map();
for (const r of activeRelations) {
  const proj = r.projectName || 'Sin proyecto';
  if (!byProject.has(proj)) byProject.set(proj, []);
  byProject.get(proj).push(r);
}
const sumaChart = [...byProject.values()].reduce((s, arr) => s + arr.length, 0);
console.log(`suma de headcountPorProyecto (código actual, cuenta registros): ${sumaChart}`);

// Personas con >1 relación activa en total (multi-proyecto o multi-empresa legítimo, o duplicado)
const byEmployee = new Map();
for (const r of activeRelations) {
  if (!byEmployee.has(r.employeeId)) byEmployee.set(r.employeeId, []);
  byEmployee.get(r.employeeId).push(r);
}
const multi = [...byEmployee.entries()].filter(([, rs]) => rs.length > 1);
console.log(`\nPersonas con más de 1 "relación activa" contada ahora mismo: ${multi.length}`);
for (const [employeeId, rs] of multi) {
  const sameProjectDup = rs.length !== new Set(rs.map(r => `${normalize(r.companyName)}|${normalize(r.projectName)}`)).size;
  console.log(`employeeId:${employeeId} | ${sameProjectDup ? 'DUPLICADO (mismo proyecto)' : 'multi-proyecto/empresa legítimo'} | ${rs.map(r => `[${r.companyName} / ${r.projectName || 'Sin proyecto'} / ${r.status} / ${r.startDate}→${r.endDate ?? '-'}]`).join(' , ')}`);
}
