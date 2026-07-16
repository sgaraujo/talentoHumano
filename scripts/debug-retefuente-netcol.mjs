import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(readFileSync(join(__dirname, 'serviceAccount.json'), 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const cComp = s => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.\-,]/g, '').replace(/\s+/g, ' ').trim();
const nitClean = n => (n ?? '').replace(/[^0-9]/g, '');
const normTax = t => {
  const n = t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.\-,]/g, '').replace(/\s+/g, ' ').trim();
  const ALIASES = {
    'retefuente': 'retencion en la fuente',
    'retencion fuente': 'retencion en la fuente',
    'retencion en la fuente': 'retencion en la fuente',
  };
  return ALIASES[n] ?? n;
};

const snap = await db.collection('tax_obligations').get();
const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

const NETCOL_NIT = '9011936678';
const NETCOL_NAME = 'netcol ingenieria sas bic';
const TARGET_TYPE = 'retencion en la fuente';
const TARGET_DATE = '2026-06-18';

console.log('\n=== Todos los registros de ReteFuente relacionados con Netcol ===\n');

const found = all.filter(o => {
  const oNitC = nitClean(o.nit ?? '');
  const oName = cComp(o.company ?? '');
  const oType = normTax(o.taxType ?? '');
  const nitMatch  = oNitC && NETCOL_NIT && oNitC === NETCOL_NIT;
  const nameMatch = oName === NETCOL_NAME;
  const typeMatch = oType === TARGET_TYPE;
  return (nitMatch || nameMatch) && typeMatch;
});

if (found.length === 0) {
  console.log('No hay registros de ReteFuente para Netcol en Firestore.');
  console.log('→ Por eso el correo muestra "Sin gestionar": no existe registro que coincida.');
  console.log('→ Pero el front SIGUE sin mostrarlo. Revisando búsqueda amplia...\n');

  // Búsqueda amplia: cualquier netcol con cualquier fecha
  const amplia = all.filter(o => {
    const oName = cComp(o.company ?? '');
    return oName.includes('netcol') && normTax(o.taxType ?? '') === TARGET_TYPE;
  });
  console.log(`Búsqueda amplia (cualquier fecha) - ${amplia.length} registros:`);
  amplia.forEach(o => console.log(`  id=${o.id} | nit="${o.nit}" | company="${o.company}" | dueDate=${o.dueDate} | status="${o.status}"`));
} else {
  console.log(`Encontrados ${found.length} registros:\n`);
  found.forEach(o => {
    console.log(`  id: ${o.id}`);
    console.log(`    company: "${o.company}"`);
    console.log(`    nit: "${o.nit}" → cleaned: "${nitClean(o.nit ?? '')}"`);
    console.log(`    taxType: "${o.taxType}"`);
    console.log(`    dueDate: ${o.dueDate}`);
    console.log(`    status: "${o.status}"`);
    const nitOk = nitClean(o.nit ?? '') === NETCOL_NIT;
    const nameOk = cComp(o.company ?? '') === NETCOL_NAME;
    const dateOk = Math.abs(new Date(o.dueDate + 'T00:00:00') - new Date(TARGET_DATE + 'T00:00:00')) <= 3 * 86_400_000;
    console.log(`    email-match: NIT=${nitOk} | name=${nameOk} | date±3d=${dateOk}`);
  });
}

process.exit();
