/**
 * debug-comms-recipients.mjs
 * Diagnostica por qué una empresa no arroja destinatarios en Comunicaciones (correos masivos).
 *
 * Uso: node scripts/debug-comms-recipients.mjs "inteegra sas bic"
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

const norm = (s = '') => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.\-,]/g, '').replace(/\s+/g, ' ').trim();

const query = process.argv[2] || 'inteegra sas bic';
const qNorm = norm(query);

async function main() {
  // 1. Empresa(s) que coinciden en organization/data/companies
  const compSnap = await db.collection('organization/data/companies').get();
  const matches = compSnap.docs.filter(d => norm(d.data().name ?? '').includes(qNorm.split(' ')[0]));
  console.log(`\n=== Empresas en organization/data/companies que contienen "${qNorm.split(' ')[0]}" ===`);
  for (const d of matches) {
    const c = d.data();
    console.log(`  id=${d.id} | name="${c.name}" | activeTH=${c.activeTH} | aliases=${JSON.stringify(c.aliases ?? [])}`);
  }

  // 2. Todos los usuarios y sus roles/empresa asignada
  const usersSnap = await db.collection('identity/data/users').get();
  console.log(`\n=== Total usuarios: ${usersSnap.size} ===`);

  const roleCounts = {};
  const companyValues = new Set();
  const candidateUsers = [];
  usersSnap.docs.forEach(d => {
    const u = d.data();
    roleCounts[u.role] = (roleCounts[u.role] ?? 0) + 1;
    const assignedCompany = u.contractInfo?.assignment?.company;
    if (assignedCompany) companyValues.add(assignedCompany);
    if (assignedCompany && norm(assignedCompany).includes(qNorm.split(' ')[0])) {
      candidateUsers.push({ id: d.id, ...u });
    }
  });

  console.log('\n=== Conteo de roles (users) ===');
  console.log(roleCounts);

  console.log(`\n=== Usuarios cuya contractInfo.assignment.company contiene "${qNorm.split(' ')[0]}" ===`);
  for (const u of candidateUsers) {
    const email = u.location?.corporateEmail || u.location?.personalEmail || u.email;
    console.log(`  id=${u.id} | name="${u.fullName}" | role="${u.role}" | company="${u.contractInfo?.assignment?.company}" | email="${email ?? '(sin correo)'}"`);
  }

  console.log(`\n=== Todos los valores distintos de contractInfo.assignment.company (para comparar contra el nombre canónico) ===`);
  for (const v of [...companyValues].sort()) console.log(`  "${v}"`);
}

main().catch(console.error).finally(() => process.exit());
