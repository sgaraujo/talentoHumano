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
const cleanDoc = value => String(value ?? '').replace(/\D/g, '');
const cleanEmail = value => String(value ?? '').trim().toLowerCase();
const normalize = value => String(value ?? '').trim().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const hasValue = value => value !== undefined && value !== null && String(value).trim() !== '';
const toDate = value => {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === 'function') { const date = value.toDate(); return isNaN(date.getTime()) ? null : date; }
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
};
const resolvesToAge = (birthDate, storedAge, storedRange) => {
  const birth = toDate(birthDate);
  const today = new Date();
  let age;
  if (birth) {
    age = today.getFullYear() - birth.getFullYear();
    if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  } else if (storedAge !== undefined && storedAge !== null && Number.isFinite(Number(storedAge))) age = Number(storedAge);
  if (age === undefined && hasValue(storedRange)) {
    const numbers = String(storedRange).replace(/años?/gi, '').match(/\d+/g)?.map(Number) ?? [];
    if (numbers[0] >= 15 && numbers[0] <= 100) age = numbers[0];
  }
  return age !== undefined && age >= 15 && age <= 100;
};

const [companiesSnap, employeesSnap, employmentsSnap, usersSnap] = await Promise.all([
  db.collection('organization/data/companies').get(),
  db.collection('human_resources/data/employees').get(),
  db.collectionGroup('employments').get(),
  db.collection('identity/data/users').get(),
]);
const companies = companiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const thCompanies = companies.filter(company => company.activeTH);
const acceptedCompanyKeys = new Set(thCompanies.flatMap(company =>
  [company.id, company.name, ...(company.aliases ?? [])].map(normalize)));
const activeEmployeeIds = new Set();
for (const snapshot of employmentsSnap.docs) {
  const relation = snapshot.data();
  if (relation.status !== 'active') continue;
  const companyMatches = acceptedCompanyKeys.has(normalize(relation.companyId))
    || acceptedCompanyKeys.has(normalize(relation.companyName));
  if (!companyMatches) continue;
  activeEmployeeIds.add(String(relation.employeeId || snapshot.ref.parent.parent?.id || ''));
}

const legacyUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const legacyById = new Map(legacyUsers.map(user => [user.id, user]));
const legacyByDocument = new Map(legacyUsers.map(user => [cleanDoc(user.personalData?.documentNumber), user]).filter(([key]) => key));
const legacyByEmail = new Map(legacyUsers.flatMap(user =>
  [user.email, user.location?.corporateEmail, user.location?.personalEmail]
    .map(email => [cleanEmail(email), user])).filter(([key]) => key));

const missing = [];
for (const snapshot of employeesSnap.docs) {
  if (!activeEmployeeIds.has(snapshot.id)) continue;
  const employee = snapshot.data();
  const legacy = legacyById.get(employee.identityUserId)
    ?? legacyByDocument.get(cleanDoc(employee.documentNumber || snapshot.id))
    ?? legacyByEmail.get(cleanEmail(employee.corporateEmail))
    ?? legacyByEmail.get(cleanEmail(employee.personalEmail));
  const birthDate = employee.birthDate ?? employee.fechaNacimiento
    ?? legacy?.personalData?.birthDate ?? legacy?.personalData?.fechaNacimiento;
  const age = employee.age ?? employee.edad ?? legacy?.personalData?.age ?? legacy?.personalData?.edad;
  const ageRange = employee.ageRange ?? employee.rangoEdad
    ?? legacy?.personalData?.ageRange ?? legacy?.personalData?.rangoEdad;
  if (!resolvesToAge(birthDate, age, ageRange)) {
    missing.push({
      nombre: employee.fullName || legacy?.fullName || 'Sin nombre',
      cedula: employee.documentNumber || snapshot.id,
      empresa: [...new Set(employmentsSnap.docs
        .filter(item => String(item.data().employeeId || item.ref.parent.parent?.id || '') === snapshot.id && item.data().status === 'active')
        .map(item => item.data().companyName).filter(Boolean))].join(', '),
      valorFecha: birthDate?.toDate?.().toISOString?.() ?? birthDate ?? '',
      valorEdad: age ?? '',
      valorRango: ageRange ?? '',
    });
  }
}
missing.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
console.log(JSON.stringify({ totalActivosTH: activeEmployeeIds.size, sinDatosEdad: missing.length, personas: missing }, null, 2));
