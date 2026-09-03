/** Diagnóstico de solo lectura de relaciones laborales por nombre o cédula. */
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
const search = process.argv.slice(2).join(' ').trim().toLowerCase();
if (!search) throw new Error('Indica un nombre o una cédula.');
const dateDetail = value => {
  if (!value || value === '-') return String(value ?? '');
  if (typeof value?.toDate === 'function') return `${value.toDate().toISOString()} [Timestamp seconds=${value.seconds}]`;
  if (typeof value?.seconds === 'number') return `${new Date(value.seconds * 1000).toISOString()} [seconds=${value.seconds}]`;
  return String(value);
};

const employeesSnap = await db.collection('human_resources/data/employees').get();
const matches = employeesSnap.docs.filter(snapshot => {
  const data = snapshot.data();
  return snapshot.id.toLowerCase().includes(search)
    || String(data.fullName ?? '').toLowerCase().includes(search)
    || String(data.documentNumber ?? '').toLowerCase().includes(search);
});

for (const employee of matches) {
  const data = employee.data();
  console.log(`\n${data.fullName} | ${data.documentNumber || employee.id} | ${employee.ref.path}`);
  const relations = await employee.ref.collection('employments').get();
  for (const relation of relations.docs) {
    const r = relation.data();
    const source = r.source && typeof r.source === 'object' ? JSON.stringify(r.source) : String(r.source ?? '');
    console.log(JSON.stringify({
      id: relation.id,
      status: r.status,
      companyName: r.companyName,
      projectName: r.projectName,
      contractType: r.contractType,
      startDate: dateDetail(r.startDate),
      endDate: dateDetail(r.endDate),
      source,
      createdAt: String(r.createdAt ?? ''),
      updatedAt: String(r.updatedAt ?? ''),
    }));
  }
}

if (!matches.length) console.log('Sin coincidencias.');
