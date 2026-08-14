/**
 * find-multi-company-employees.mjs
 *
 * El dashboard suma los "colaboradores activos" por tarjeta de empresa
 * (una persona puede sumar en varias tarjetas si tiene más de una relación
 * laboral activa en empresas distintas), pero el KPI "Colaboradores activos"
 * cuenta personas únicas. Si la suma de tarjetas no coincide con el KPI
 * total, la diferencia son personas con relaciones activas en 2+ empresas.
 *
 * Este script (solo lectura) lista quiénes son esas personas para confirmar
 * si es una asignación real (multi-empresa legítima) o un dato duplicado que
 * haya que corregir.
 *
 * Uso:
 *   node scripts/find-multi-company-employees.mjs
 */

import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(__dirname, 'serviceAccount.json'), 'utf8'));

let app;
try { app = getApp(); } catch { app = initializeApp({ credential: cert(serviceAccount) }); }

const db = getFirestore(app);

const normalize = (s) => (s ?? '').toString().toLowerCase().normalize('NFD')
  .replace(/\p{Diacritic}/gu, '').replace(/[.\-,]/g, '').replace(/\s+/g, ' ').trim();

async function main() {
  const [employeesSnap, employmentsSnap] = await Promise.all([
    db.collection('human_resources/data/employees').get(),
    db.collectionGroup('employments').get(),
  ]);

  const employees = new Map(employeesSnap.docs.map(d => [d.id, d.data()]));

  const byEmployee = new Map();
  employmentsSnap.docs.forEach(doc => {
    const d = doc.data();
    if (d.status !== 'active') return;
    const employeeId = d.employeeId || doc.ref.parent.parent?.id;
    if (!employeeId) return;
    if (!byEmployee.has(employeeId)) byEmployee.set(employeeId, []);
    byEmployee.get(employeeId).push({ id: doc.id, companyName: d.companyName, projectName: d.projectName });
  });

  const multiCompany = [];
  for (const [employeeId, rels] of byEmployee.entries()) {
    const companies = new Map();
    rels.forEach(r => companies.set(normalize(r.companyName), r.companyName));
    if (companies.size > 1) multiCompany.push({ employeeId, rels, companies: [...companies.values()] });
  }

  console.log(`Empleados con relaciones activas: ${byEmployee.size}`);
  console.log(`Empleados con MAS DE UNA empresa activa simultanea: ${multiCompany.length}\n`);

  for (const m of multiCompany) {
    const emp = employees.get(m.employeeId) ?? {};
    console.log(`- ${emp.fullName ?? '(sin nombre)'}  (employeeId: ${m.employeeId})`);
    console.log(`  corporateEmail: ${emp.corporateEmail ?? '—'}  personalEmail: ${emp.personalEmail ?? '—'}`);
    m.rels.forEach(r => console.log(`  · empresa: ${r.companyName ?? '—'}  proyecto: ${r.projectName ?? '—'}  (employmentId: ${r.id})`));
    console.log('');
  }
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
