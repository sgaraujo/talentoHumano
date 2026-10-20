// Solo lectura: ¿cambia algún rango de edad del dashboard si dejamos de leer la
// colección legacy `users`? Usa el código real de la app (toDate + ageGroup).
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformSync } from 'esbuild';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const src = p => readFileSync(join(scriptDir, '..', p), 'utf8');

// toDate: desde su declaración hasta el primer "};" al inicio de línea.
const analytics = src('src/services/analyticsService.ts');
const start = analytics.indexOf('export const toDate');
const end = analytics.indexOf('\n};', start) + 3;
const demographics = src('src/domain/humanResources/demographics.ts').replace(/^import .*$/m, '');
const code = transformSync(analytics.slice(start, end) + '\n' + demographics, { loader: 'ts', format: 'esm' }).code;
const modPath = join(mkdtempSync(join(tmpdir(), 'agecheck-')), 'demographics.mjs');
writeFileSync(modPath, code);
const { ageGroup } = await import(pathToFileURL(modPath).href);

initializeApp({ credential: cert(JSON.parse(readFileSync(join(scriptDir, 'serviceAccount.json'), 'utf8'))) });
const db = getFirestore();
const [employeesSnap, usersSnap] = await Promise.all([
  db.collection('human_resources/data/employees').get(),
  db.collection('identity/data/users').get(),
]);
const cleanDocument = v => String(v ?? '').replace(/\D/g, '');
const cleanEmail = v => String(v ?? '').trim().toLocaleLowerCase('es');
const legacy = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const byId = new Map(legacy.map(u => [u.id, u]));
const byDoc = new Map(legacy.map(u => [cleanDocument(u.personalData?.documentNumber), u]).filter(([k]) => k));
const byEmail = new Map(legacy.flatMap(u => [u.email, u.location?.corporateEmail, u.location?.personalEmail]
  .map(e => [cleanEmail(e), u])).filter(([k]) => k));

let changed = 0;
const transitions = new Map();
for (const d of employeesSnap.docs) {
  const e = d.data();
  const u = byId.get(e.identityUserId) ?? byDoc.get(cleanDocument(e.documentNumber))
    ?? byEmail.get(cleanEmail(e.corporateEmail)) ?? byEmail.get(cleanEmail(e.personalEmail));
  const birth = e.birthDate ?? e.fechaNacimiento;
  const withLegacy = ageGroup(birth, e.age ?? e.edad ?? u?.personalData?.age ?? u?.personalData?.edad,
    e.ageRange ?? e.rangoEdad ?? u?.personalData?.ageRange ?? u?.personalData?.rangoEdad);
  const without = ageGroup(birth, e.age ?? e.edad, e.ageRange ?? e.rangoEdad);
  if (withLegacy !== without) {
    changed++;
    const key = `${withLegacy} -> ${without}`;
    transitions.set(key, (transitions.get(key) ?? 0) + 1);
  }
}
console.log(`Expedientes: ${employeesSnap.size}. Rango de edad distinto sin legacy: ${changed}`);
for (const [k, v] of transitions) console.log(`  ${k}: ${v}`);
