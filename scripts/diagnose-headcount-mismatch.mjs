/**
 * Compara el headcount de Rotación (283, cuenta employeeId desde `employments`)
 * contra el de Resumen/getEmployeeDirectoryUsers (276, solo status==='active').
 * Solo lee, no escribe nada.
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

const [companiesSnap, employeesSnap, employmentsSnap] = await Promise.all([
  db.collection('organization/data/companies').get(),
  db.collection('human_resources/data/employees').get(),
  db.collectionGroup('employments').get(),
]);
const companies = companiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const thCompanies = companies.filter(c => c.activeTH);
const employees = new Map(employeesSnap.docs.map(d => [d.id, d.data()]));

let relations = employmentsSnap.docs.map(d => ({
  id: d.id, employeeId: d.data().employeeId || d.ref.parent.parent?.id, ...d.data(),
}));
const relationsTH = relations.filter(r => thCompanies.some(c => {
  if (r.companyId && r.companyId === c.id) return true;
  const accepted = [c.name, ...(c.aliases ?? [])].map(normalize);
  return accepted.includes(normalize(r.companyName));
}));

const today = new Date();

// ── Rotación: relationsActiveAt(today) ──
const rotacionActive = relationsTH.filter(r => {
  if (r.status !== 'active' && r.status !== 'retired') return false;
  const start = toDate(r.startDate);
  if (!start || start > today) return false;
  if (r.status === 'retired') {
    const end = toDate(r.endDate);
    if (!end || end < today) return false;
  }
  return true;
});
const rotacionEmployeeIds = new Set(rotacionActive.map(r => r.employeeId));
console.log(`Rotación headcount (employeeId únicos): ${rotacionEmployeeIds.size}`);

// ── Dashboard: getEmployeeDirectoryUsers — status === 'active' únicamente ──
const employmentsByEmployee = new Map();
relations.forEach(r => {
  if (!r.employeeId) return;
  if (!employmentsByEmployee.has(r.employeeId)) employmentsByEmployee.set(r.employeeId, []);
  employmentsByEmployee.get(r.employeeId).push(r);
});
let dashboardActiveIds = new Set();
for (const [employeeId] of employees) {
  const activeRelationships = (employmentsByEmployee.get(employeeId) ?? []).filter(r => r.status === 'active');
  if (activeRelationships.length) dashboardActiveIds.add(employeeId);
}
console.log(`Dashboard headcount (employees con >=1 employment status active): ${dashboardActiveIds.size}`);

// ── Diffs ──
const onlyRotacion = [...rotacionEmployeeIds].filter(id => !dashboardActiveIds.has(id));
const onlyDashboard = [...dashboardActiveIds].filter(id => !rotacionEmployeeIds.has(id));
console.log(`\nEn Rotación pero NO en Dashboard: ${onlyRotacion.length}`);
console.log(`En Dashboard pero NO en Rotación: ${onlyDashboard.length}`);

console.log(`\n--- Detalle: en Rotación pero no en Dashboard ---`);
for (const id of onlyRotacion) {
  const emp = employees.get(id);
  const empRelations = employmentsByEmployee.get(id) ?? [];
  console.log(`employeeId:${id} | nombre:${emp?.fullName ?? '???'} | doc:${emp?.documentNumber ?? '?'} | relations:${empRelations.map(r => `[${r.status}|${r.companyName}|${r.startDate}→${r.endDate}]`).join(', ')}`);
}

console.log(`\n--- Detalle: en Dashboard pero no en Rotación ---`);
for (const id of onlyDashboard) {
  const emp = employees.get(id);
  const empRelations = employmentsByEmployee.get(id) ?? [];
  console.log(`employeeId:${id} | nombre:${emp?.fullName ?? '???'} | doc:${emp?.documentNumber ?? '?'} | relations:${empRelations.map(r => `[${r.status}|${r.companyName}|${r.startDate}→${r.endDate}]`).join(', ')}`);
}

// ── Buscar personas duplicadas (mismo documentNumber, distinto employeeId) entre las contadas en Rotación ──
console.log(`\n--- Buscando documentNumber duplicados entre los ${rotacionEmployeeIds.size} de Rotación ---`);
const byDoc = new Map();
for (const id of rotacionEmployeeIds) {
  const emp = employees.get(id);
  const doc = emp?.documentNumber;
  if (!doc) continue;
  if (!byDoc.has(doc)) byDoc.set(doc, []);
  byDoc.get(doc).push(id);
}
const dupDocs = [...byDoc.entries()].filter(([, ids]) => ids.length > 1);
console.log(`Documentos duplicados (misma persona, 2+ employeeId distintos) contados en Rotación: ${dupDocs.length}`);
for (const [doc, ids] of dupDocs) {
  console.log(`  doc:${doc} -> employeeIds: ${ids.join(', ')} | nombres: ${ids.map(id => employees.get(id)?.fullName).join(' / ')}`);
}
