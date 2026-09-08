/**
 * diagnose-comms-vs-whatsapp-recipients.mjs
 *
 * Cuantifica la diferencia entre el conteo de destinatarios de WhatsApp
 * (exige teléfono válido) y de Comunicaciones (exige correo no vacío),
 * ambos derivados de la misma fuente canónica (employees + employments),
 * replicando exactamente los filtros de:
 *   - src/services/whatsappCampaignService.ts (recipientsFromUsers)
 *   - src/views/Communications/CommunicationsPage.tsx (resolveRecipients)
 *
 * Uso: node scripts/diagnose-comms-vs-whatsapp-recipients.mjs
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(readFileSync(join(__dirname, 'serviceAccount.json'), 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

// ── Replica de normalizeWhatsAppPhone (whatsappCampaignService.ts) ──────────
function normalizeWhatsAppPhone(value) {
  let phone = String(value ?? '').replace(/\D/g, '');
  if (phone.startsWith('00')) phone = phone.slice(2);
  if (phone.length === 10) phone = `57${phone}`;
  if (phone.length < 11 || phone.length > 15) return null;
  return phone;
}

// ── Replica de isActiveToday (employeeDirectoryService.ts) ──────────────────
function toDate(raw) {
  if (!raw) return null;
  if (raw.toDate) return raw.toDate();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}
function isActiveToday(rel) {
  if (rel.status !== 'active') return false;
  const start = toDate(rel.startDate);
  return !!start && start <= new Date();
}

async function main() {
  const [employeesSnap, employmentsSnap] = await Promise.all([
    db.collection('human_resources/data/employees').get(),
    db.collectionGroup('employments').get(),
  ]);

  const employmentsByEmployee = new Map();
  employmentsSnap.docs.forEach(snap => {
    const rel = snap.data();
    const employeeId = rel.employeeId || snap.ref.parent.parent?.id;
    if (!employeeId) return;
    if (!employmentsByEmployee.has(employeeId)) employmentsByEmployee.set(employeeId, []);
    employmentsByEmployee.get(employeeId).push(rel);
  });

  // ── Construir el mismo "User" derivado que getEmployeeDirectoryUsers() ────
  const users = employeesSnap.docs.map(snap => {
    const employee = snap.data();
    const allRel = employmentsByEmployee.get(snap.id) ?? [];
    const activeRel = allRel.filter(isActiveToday);
    const role = activeRel.length ? 'colaborador' : 'excolaborador';
    const email = employee.corporateEmail || employee.personalEmail || '';
    const phone = employee.corporatePhone;
    const personalPhone = employee.personalPhone;
    return { id: snap.id, fullName: employee.fullName, role, email, phone, personalPhone };
  });

  const activeUsers = users.filter(u => u.role === 'colaborador');

  // ── Comunicaciones: exige correo (igual que resolveRecipients) ────────────
  const commsEligible = activeUsers.filter(u => !!u.email);

  // ── WhatsApp: exige teléfono válido + dedup por número (igual que recipientsFromUsers) ──
  const seenPhones = new Set();
  const waEligible = [];
  const waDuplicatePhoneDrops = [];
  for (const u of activeUsers) {
    const phone = normalizeWhatsAppPhone(u.phone) || normalizeWhatsAppPhone(u.personalPhone);
    if (!phone) continue;
    if (seenPhones.has(phone)) { waDuplicatePhoneDrops.push(u); continue; }
    seenPhones.add(phone);
    waEligible.push(u);
  }

  const phoneOnlyNoEmail = waEligible.filter(u => !u.email);
  const emailOnlyNoPhone = commsEligible.filter(u => !(normalizeWhatsAppPhone(u.phone) || normalizeWhatsAppPhone(u.personalPhone)));
  const both = activeUsers.filter(u => !!u.email && !!(normalizeWhatsAppPhone(u.phone) || normalizeWhatsAppPhone(u.personalPhone)));
  const neither = activeUsers.filter(u => !u.email && !(normalizeWhatsAppPhone(u.phone) || normalizeWhatsAppPhone(u.personalPhone)));

  console.log(`\n=== Total empleados activos (role=colaborador): ${activeUsers.length} ===`);
  console.log(`\n=== Comunicaciones (requiere correo): ${commsEligible.length} personas ===`);
  console.log(`=== WhatsApp (requiere teléfono válido, deduplicado por número): ${waEligible.length} personas ===`);
  console.log(`\n--- Desglose ---`);
  console.log(`Con correo Y teléfono válido (cuentan en ambos):        ${both.length}`);
  console.log(`Con teléfono válido pero SIN correo (solo en WhatsApp): ${phoneOnlyNoEmail.length}`);
  console.log(`Con correo pero SIN teléfono válido (solo en Comunic.): ${emailOnlyNoPhone.length}`);
  console.log(`Sin correo NI teléfono válido (no cuentan en ninguno):  ${neither.length}`);
  console.log(`Descartados en WhatsApp por número de teléfono duplicado: ${waDuplicatePhoneDrops.length}`);

  if (phoneOnlyNoEmail.length > 0) {
    console.log(`\n=== Muestra: tienen teléfono pero no correo (hasta 15) ===`);
    phoneOnlyNoEmail.slice(0, 15).forEach(u => console.log(`  ${u.fullName} | tel=${u.phone || u.personalPhone || '(vacío)'}`));
  }
  if (emailOnlyNoPhone.length > 0) {
    console.log(`\n=== Muestra: tienen correo pero no teléfono válido (hasta 15) ===`);
    emailOnlyNoPhone.slice(0, 15).forEach(u => console.log(`  ${u.fullName} | correo=${u.email} | tel_corp=${u.phone || '(vacío)'} | tel_pers=${u.personalPhone || '(vacío)'}`));
  }
  if (waDuplicatePhoneDrops.length > 0) {
    console.log(`\n=== Muestra: descartados por teléfono duplicado (hasta 15) ===`);
    waDuplicatePhoneDrops.slice(0, 15).forEach(u => console.log(`  ${u.fullName} | tel=${u.phone || u.personalPhone}`));
  }
}

main().catch(console.error).finally(() => process.exit());
