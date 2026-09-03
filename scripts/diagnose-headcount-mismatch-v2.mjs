/**
 * Comparación precisa Rotación (283, employments TH) vs Dashboard/Resumen (276,
 * getEmployeeDirectoryUsers -> activeUsers), replicando EXACTAMENTE ambas lógicas
 * tal como están en el código, con los datos ya limpios (sin duplicados). Solo lee.
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
const employees = new Map(employeesSnap.docs.map(d => [d.id, d.data()]));
const thCompanies = companies.filter(c => c.activeTH);
const thNamesExact = new Set(thCompanies.map(c => c.name)); // como lo usa Dashboard (trim, sin normalizar)

let relations = employmentsSnap.docs.map(d => ({
  employeeId: d.data().employeeId || d.ref.parent.parent?.id, ...d.data(),
}));

// ── Rotación: relationsTH (por companyId o alias normalizado) -> headcountAt(hoy) ──
const relationsTH = relations.filter(r => thCompanies.some(c => {
  if (r.companyId && r.companyId === c.id) return true;
  const accepted = [c.name, ...(c.aliases ?? [])].map(normalize);
  return accepted.includes(normalize(r.companyName));
}));
const today = new Date();
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
const rotacionIds = new Set(rotacionActive.map(r => r.employeeId));
console.log(`Rotación headcount: ${rotacionIds.size}`);

// ── Dashboard: getEmployeeDirectoryUsers -> activeUsers (role colaborador + assignment.company en thNames) ──
const employmentsByEmployee = new Map();
for (const r of relations) {
  if (!r.employeeId) continue;
  if (!employmentsByEmployee.has(r.employeeId)) employmentsByEmployee.set(r.employeeId, []);
  employmentsByEmployee.get(r.employeeId).push(r);
}
const companyIdByNameNorm = new Map();
companies.forEach(c => [c.name, ...(c.aliases ?? [])].forEach(n => companyIdByNameNorm.set(normalize(n), c.id)));
const companyNameById = new Map(companies.map(c => [c.id, c.name]));

let dashboardIds = new Set();
for (const [employeeId] of employees) {
  const activeRelationships = (employmentsByEmployee.get(employeeId) ?? []).filter(r => r.status === 'active');
  if (!activeRelationships.length) continue; // role would be 'excolaborador'
  const assignments = activeRelationships.map(r => {
    const companyId = companyIdByNameNorm.get(normalize(r.companyName));
    const company = companyId ? companyNameById.get(companyId) : r.companyName;
    return { company };
  });
  const inTH = assignments.some(a => a.company?.trim() && thNamesExact.has(a.company.trim()));
  if (inTH) dashboardIds.add(employeeId);
}
console.log(`Dashboard headcount: ${dashboardIds.size}`);

const onlyRotacion = [...rotacionIds].filter(id => !dashboardIds.has(id));
const onlyDashboard = [...dashboardIds].filter(id => !rotacionIds.has(id));
console.log(`\nEn Rotación pero no en Dashboard: ${onlyRotacion.length}`);
console.log(`En Dashboard pero no en Rotación: ${onlyDashboard.length}`);

console.log(`\n--- En Rotación pero no en Dashboard ---`);
for (const id of onlyRotacion) {
  const emp = employees.get(id);
  const rs = employmentsByEmployee.get(id) ?? [];
  console.log(`${id} | ${emp?.fullName} | ${rs.map(r => `[${r.status}|${r.companyName}|${r.startDate}→${r.endDate ?? '-'}]`).join(', ')}`);
}
console.log(`\n--- En Dashboard pero no en Rotación ---`);
for (const id of onlyDashboard) {
  const emp = employees.get(id);
  const rs = employmentsByEmployee.get(id) ?? [];
  console.log(`${id} | ${emp?.fullName} | ${rs.map(r => `[${r.status}|${r.companyName}|${r.startDate}→${r.endDate ?? '-'}]`).join(', ')}`);
}
