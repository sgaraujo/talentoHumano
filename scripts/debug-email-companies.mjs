/**
 * debug-email-companies.mjs
 * Muestra qué empresas procesaría el correo y por qué Inteegra/Consorcio podrían faltar.
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

const OVERDUE_FROM = '2026-06-01';
const nitClean = n => (n ?? '').replace(/[^0-9]/g, '');
const cComp = s => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.\-,]/g, '').replace(/\s+/g, ' ').trim();

const COMPLETED = new Set(['Pagado', 'No aplica', 'Presentado', 'Informe Enviado']);

const ALL_BOGOTA_2026 = [
  { taxType: 'ICA Bimestral',  period: 'ICA Bim 2 (Mar-Abr)', dueDate: '2026-06-12' },
  { taxType: 'ReteICA',        period: 'Bim 2 (Mar-Abr)',      dueDate: '2026-06-12' },
  { taxType: 'ICA Bimestral',  period: 'ICA Bim 3 (May-Jun)',  dueDate: '2026-08-14' },
  { taxType: 'ReteICA',        period: 'Bim 3 (May-Jun)',      dueDate: '2026-08-14' },
];

const FOCUS = ['inteegra', 'consorcio scia', 'netcol'];

async function main() {
  const snap = await db.collection('companies')
    .where('active', '==', true)
    .where('activeContabilidad', '==', true)
    .get();

  console.log(`\n=== EMPRESAS CON active=true Y activeContabilidad=true: ${snap.size} ===\n`);

  const oblSnap = await db.collection('tax_obligations').get();
  const allDocs = oblSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const today = new Date('2026-07-08T00:00:00');

  for (const doc of snap.docs) {
    const comp = doc.data();
    const name = comp.name ?? '';
    const normName = cComp(name);
    const isFocus = FOCUS.some(f => normName.includes(f));
    if (!isFocus) continue;

    const nit = comp.nit ?? '';
    const nitC = nitClean(nit);
    const hidden = new Set(comp.hiddenTaxTypes ?? []);

    console.log(`\n>>> ${name} | NIT: ${nit} | hidden: [${[...hidden].join(', ')}]`);

    const bogotaObls = ALL_BOGOTA_2026.filter(o => !hidden.has(o.taxType));

    let hasVisible = false;
    for (const cal of bogotaObls) {
      const due = new Date(cal.dueDate + 'T00:00:00');
      const daysLeft = Math.round((due - today) / 86_400_000);
      const isOverdue = daysLeft < 0 && cal.dueDate >= OVERDUE_FROM;
      if (!isOverdue && daysLeft < 0) continue;
      if (daysLeft > 7 && daysLeft >= 0) continue; // upcoming window = 7

      const matched = allDocs.filter(o => {
        const oNitC = nitClean(o.nit ?? '');
        const nitMatch  = nitC && oNitC && nitC === oNitC;
        const nameMatch = cComp(o.company ?? '') === normName;
        return (nitMatch || nameMatch)
          && cComp(o.taxType) === cComp(cal.taxType)
          && Math.abs(new Date(o.dueDate + 'T00:00:00') - new Date(cal.dueDate + 'T00:00:00')) <= 3 * 86_400_000;
      });

      const anyCompleted = matched.some(o => COMPLETED.has(o.status ?? '') || o.status === 'No aplica');
      console.log(`  [CAL] ${cal.taxType} / ${cal.dueDate} | daysLeft=${daysLeft} | matches=${matched.length} | anyCompleted=${anyCompleted}`);
      matched.forEach(m => console.log(`        → Firestore id=${m.id} nit="${m.nit}" status="${m.status}" company="${m.company}"`));
      if (!anyCompleted) hasVisible = true;
    }

    console.log(`  hasVisibleCalendar = ${hasVisible}`);
  }

  // También mostrar si Inteegra/Consorcio existen pero sin activeContabilidad
  console.log('\n=== EMPRESAS DE INTERÉS SIN activeContabilidad=true ===');
  const allComp = await db.collection('companies').get();
  for (const doc of allComp.docs) {
    const d = doc.data();
    const n = cComp(d.name ?? '');
    if (!FOCUS.some(f => n.includes(f))) continue;
    if (d.active && d.activeContabilidad) continue; // ya están en la lista de arriba
    console.log(`  ${d.name} | active=${d.active} | activeContabilidad=${d.activeContabilidad} | NIT=${d.nit}`);
  }
}

main().catch(console.error).finally(() => process.exit());
