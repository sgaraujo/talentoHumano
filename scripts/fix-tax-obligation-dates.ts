/**
 * fix-tax-obligation-dates.ts
 *
 * Corrige, en accounting/data/tax_obligations, las obligaciones cuyo dueDate
 * se desvió de la fecha oficial del calendario DIAN para el NIT de esa
 * empresa (misma causa raíz del caso NETCOL / Retención en la Fuente /
 * Junio: se guardó la fecha del dígito de verificación equivocado).
 *
 * Usa la misma lógica que ya quedó conectada en taxIdentity.ts
 * (correctDueDateAgainstCalendar), para no duplicar reglas.
 *
 * Uso:
 *   npx tsx scripts/fix-tax-obligation-dates.ts           (vista previa, no escribe nada)
 *   npx tsx scripts/fix-tax-obligation-dates.ts --apply   (aplica las correcciones)
 */

import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { correctDueDateAgainstCalendar, cleanNit, normalize, displayTax } from '../src/domain/tax/taxIdentity';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(__dirname, 'serviceAccount.json'), 'utf8'));

let app;
try { app = getApp(); } catch { app = initializeApp({ credential: cert(serviceAccount) }); }
const db = getFirestore(app);
const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(APPLY ? 'Aplicando correcciones...\n' : 'Vista previa: no se escribirá nada en Firestore.\n');

  const [companiesSnap, oblSnap] = await Promise.all([
    db.collection('organization/data/companies').get(),
    db.collection('accounting/data/tax_obligations').get(),
  ]);
  const companies = companiesSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const obligations = oblSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  let toFix = 0;
  for (const company of companies) {
    if (!company.nit) continue;
    const companyObls = obligations.filter(o =>
      o.companyId === company.id || cleanNit(o.nit) === cleanNit(company.nit) || normalize(o.company) === normalize(company.name)
    );
    for (const o of companyObls) {
      const correction = correctDueDateAgainstCalendar(company.nit, o.taxType, o.period ?? '', o.dueDate);
      if (!correction.corrected) continue;
      toFix++;
      console.log(`- ${company.name} · ${displayTax(o.taxType)} · ${o.period}: ${o.dueDate} -> ${correction.dueDate}  (status:${o.status || '(sin estado)'}, id:${o.id})`);
      if (APPLY) {
        await db.doc(`accounting/data/tax_obligations/${o.id}`).update({
          dueDate: correction.dueDate,
          year: correction.dueDate.slice(0, 4),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
  }

  console.log(APPLY ? `\nListo. ${toFix} obligación(es) corregida(s).` : `\nEjecuta con --apply para aplicar las ${toFix} correcciones.`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
