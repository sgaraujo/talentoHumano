/**
 * find-advanced-sterilization.mjs
 *
 * Busca todo lo relacionado con el proyecto "ADVANCED STERILIZATION PRODUCTS
 * COLOMBIA SAS" (gente que no trabaja con nosotros) para confirmar el alcance
 * antes de inactivarla/borrarla:
 *   - el/los documentos de proyecto en organization/data/projects
 *   - las relaciones laborales (employments) que apuntan a ese proyecto
 *   - los usuarios legacy (identity/data/users) con esa asignación
 *
 * Uso:
 *   node scripts/find-advanced-sterilization.mjs
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

const TARGET = normalize('ADVANCED STERILIZATION PRODUCTS COLOMBIA SAS');
const matchesTarget = (value) => {
  const n = normalize(value);
  return n && (n === TARGET || n.includes('advanced sterilization') || n.includes(' asp') || n === 'asp');
};

async function main() {
  // ── 1. Proyecto(s) ──────────────────────────────────────────────────────
  const projectsSnap = await db.collection('organization/data/projects').get();
  const matchingProjects = projectsSnap.docs.filter(d => matchesTarget(d.data().name));
  console.log(`\n=== PROYECTOS (${matchingProjects.length} coincidencia(s) de ${projectsSnap.size} totales) ===`);
  for (const p of matchingProjects) {
    const d = p.data();
    console.log(`- id: ${p.id}  name: "${d.name}"  companyId: ${d.companyId ?? '—'}  companyName: ${d.companyName ?? '—'}  status: ${d.status}`);
  }

  // ── 2. Relaciones laborales (employments, collectionGroup) ─────────────
  const employmentsSnap = await db.collectionGroup('employments').get();
  const matchingEmployments = employmentsSnap.docs.filter(d => matchesTarget(d.data().projectName) || matchesTarget(d.data().companyName));
  console.log(`\n=== EMPLOYMENTS (${matchingEmployments.length} coincidencia(s) de ${employmentsSnap.size} totales) ===`);

  const employeeIds = new Set();
  for (const e of matchingEmployments) {
    const d = e.data();
    const employeeId = d.employeeId || e.ref.parent.parent?.id;
    employeeIds.add(employeeId);
    console.log(`- employmentId: ${e.id}  employeeId: ${employeeId}`);
    console.log(`  companyName: ${d.companyName ?? '—'}  projectName: ${d.projectName ?? '—'}  status: ${d.status}  position: ${d.position ?? '—'}`);
  }

  // ── 3. Datos de esos empleados ───────────────────────────────────────────
  console.log(`\n=== EMPLEADOS AFECTADOS (${employeeIds.size}) ===`);
  for (const employeeId of employeeIds) {
    const empSnap = await db.collection('human_resources/data/employees').doc(employeeId).get();
    if (!empSnap.exists) { console.log(`- ${employeeId}: (sin documento de empleado)`); continue; }
    const d = empSnap.data();
    console.log(`- ${employeeId}: ${d.fullName ?? '—'}  corporateEmail: ${d.corporateEmail ?? '—'}  personalEmail: ${d.personalEmail ?? '—'}  status: ${d.status}`);
  }

  // ── 4. Usuarios legacy (identity/data/users) ────────────────────────────
  const usersSnap = await db.collection('identity/data/users').get();
  const matchingUsers = usersSnap.docs.filter(d => {
    const data = d.data();
    return matchesTarget(data.contractInfo?.assignment?.project) || matchesTarget(data.contractInfo?.assignment?.company);
  });
  console.log(`\n=== USUARIOS LEGACY (identity/data/users) (${matchingUsers.length} coincidencia(s) de ${usersSnap.size} totales) ===`);
  for (const u of matchingUsers) {
    const d = u.data();
    console.log(`- id: ${u.id}  fullName: ${d.fullName ?? '—'}  email: ${d.email ?? '—'}  role: ${d.role}  company: ${d.contractInfo?.assignment?.company ?? '—'}  project: ${d.contractInfo?.assignment?.project ?? '—'}`);
  }

  console.log('\nListo. Nada fue modificado — este script es solo de lectura.');
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
