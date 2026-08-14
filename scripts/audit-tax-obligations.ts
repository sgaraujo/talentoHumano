/**
 * audit-tax-obligations.ts
 *
 * Auditoría de solo lectura sobre accounting/data/tax_obligations, para
 * entender por qué aparecen vencimientos "fantasma" en los correos (como
 * NETCOL / Retención en la Fuente / Junio) y detectar duplicados o fechas
 * manuales que se desviaron del calendario oficial DIAN.
 *
 * Usa la MISMA lógica que la app (dianCalendar2026.ts / taxIdentity.ts) en
 * vez de reimplementarla, para evitar falsos positivos por divergencia.
 *
 * Uso:
 *   npx tsx scripts/audit-tax-obligations.ts
 */

import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getAllObligationsByNit, extractVerificationDigit } from '../src/data/dianCalendar2026';
import { normTax, cleanNit, displayTax, sameAutoDueDate, normalize, normalizePeriod, periodKey } from '../src/domain/tax/taxIdentity';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(__dirname, 'serviceAccount.json'), 'utf8'));

let app;
try { app = getApp(); } catch { app = initializeApp({ credential: cert(serviceAccount) }); }
const db = getFirestore(app);

const COMPLETED = new Set(['Pagado', 'No aplica', 'Informe Enviado', 'Presentado']);

async function main() {
  const [companiesSnap, oblSnap] = await Promise.all([
    db.collection('organization/data/companies').get(),
    db.collection('accounting/data/tax_obligations').get(),
  ]);
  const companies = companiesSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const obligations = oblSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  console.log(`Empresas: ${companies.length}  ·  Obligaciones (accounting/data/tax_obligations): ${obligations.length}\n`);

  // ── A) Caso puntual: NETCOL — Retención en la Fuente ────────────────────────
  const netcol = companies.find(c => cleanNit(c.nit).startsWith('901193667'));
  if (netcol) {
    console.log(`=== A) NETCOL (NIT ${netcol.nit}) — Retención en la Fuente ===`);
    const digit = extractVerificationDigit(netcol.nit);
    console.log(`Dígito de verificación calculado: ${digit}`);
    const calendar = getAllObligationsByNit(netcol.nit).filter(o => normTax(o.taxType) === normTax('Retención en la Fuente'));
    const manual = obligations.filter(o =>
      (o.companyId === netcol.id || cleanNit(o.nit) === cleanNit(netcol.nit) || normalize(o.company) === normalize(netcol.name)) &&
      normTax(o.taxType) === normTax('Retención en la Fuente')
    );
    console.log(`Calendario (calculado): ${calendar.length} periodos · Manual (Firestore): ${manual.length} documentos\n`);
    for (const cal of calendar) {
      const matches = manual.filter(m => sameAutoDueDate(m.dueDate, cal.dueDate) || m.period === cal.period);
      const status = matches.length ? matches.map(m => `${m.status || '(sin estado)'} [id:${m.id}, dueDate:${m.dueDate}]`).join(' · ') : '⚠️ SIN REGISTRO MANUAL — se reportará como vencido/sin gestionar';
      console.log(`- ${cal.period}: calendario=${cal.dueDate}  →  ${status}`);
    }
    console.log('');
  } else {
    console.log('No se encontró la empresa NETCOL por NIT 901193667*.\n');
  }

  // ── B) Duplicados: mismo company + tipo + periodo con más de un documento ──
  console.log('=== B) Duplicados (misma empresa + tipo + periodo, >1 documento) ===');
  const byKey = new Map<string, any[]>();
  for (const o of obligations) {
    const companyKey = o.companyId || `${cleanNit(o.nit)}|${normalize(o.company)}`;
    const key = `${companyKey}__${normTax(o.taxType)}__${periodKey(o.period)}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(o);
  }
  const duplicateGroups = [...byKey.entries()].filter(([, docs]) => docs.length > 1);
  console.log(`Grupos duplicados encontrados: ${duplicateGroups.length}\n`);
  for (const [key, docs] of duplicateGroups) {
    console.log(`- ${docs[0].company} · ${displayTax(docs[0].taxType)} · ${docs[0].period}`);
    docs.forEach(d => console.log(`    id:${d.id}  dueDate:${d.dueDate}  status:${d.status || '(sin estado)'}  nit:${d.nit ?? '—'}  companyId:${d.companyId ?? '—'}`));
  }
  console.log('');

  console.log('=== B2) Duplicados por identidad del correo (empresa + tipo + fecha) ===');
  const byAlertIdentity = new Map<string, any[]>();
  for (const o of obligations) {
    const companyKey = o.companyId || `${cleanNit(o.nit)}|${normalize(o.company)}`;
    const key = `${companyKey}__${normTax(o.taxType)}__${o.dueDate}`;
    if (!byAlertIdentity.has(key)) byAlertIdentity.set(key, []);
    byAlertIdentity.get(key)!.push(o);
  }
  const alertDuplicateGroups = [...byAlertIdentity.values()].filter(docs => docs.length > 1);
  console.log(`Grupos encontrados: ${alertDuplicateGroups.length}\n`);
  for (const docs of alertDuplicateGroups) {
    console.log(`- ${docs[0].company} · ${displayTax(docs[0].taxType)} · ${docs[0].dueDate}`);
    docs.forEach(d => console.log(`    id:${d.id}  periodo:${d.period}  estado:${d.status || '(sin estado)'}`));
  }
  console.log('');

  // ── C) Fechas manuales que se desviaron del calendario oficial (>5 días) ────
  console.log('=== C) Documentos manuales cuya fecha se desvió del calendario oficial (mismo periodo, dueDate distinto) ===');
  let driftCount = 0;
  for (const company of companies) {
    if (!company.nit) continue;
    const calendar = getAllObligationsByNit(company.nit);
    const companyObls = obligations.filter(o =>
      o.companyId === company.id || cleanNit(o.nit) === cleanNit(company.nit) || normalize(o.company) === normalize(company.name)
    );
    for (const o of companyObls) {
      if (COMPLETED.has(o.status ?? '') === false) continue; // solo interesa si alguien SÍ lo gestionó con una fecha distinta
      const calMatch = calendar.find(c => normTax(c.taxType) === normTax(o.taxType) && normalize(c.period) === normalize(o.period ?? ''));
      if (!calMatch) continue;
      if (!sameAutoDueDate(o.dueDate, calMatch.dueDate)) {
        driftCount++;
        const diffDays = Math.round((new Date(o.dueDate).getTime() - new Date(calMatch.dueDate).getTime()) / 86_400_000);
        console.log(`- ${company.name} · ${displayTax(o.taxType)} · ${o.period}: manual=${o.dueDate} (status:${o.status}) vs calendario=${calMatch.dueDate}  (Δ${diffDays}d)  id:${o.id}`);
      }
    }
  }
  if (driftCount === 0) console.log('Sin desviaciones encontradas.');
  console.log('');

  // ── D) Documentos sin companyId (dependen de match por NIT/nombre, más frágil) ──
  const withoutCompanyId = obligations.filter(o => !o.companyId);
  console.log(`=== D) Documentos sin companyId: ${withoutCompanyId.length} de ${obligations.length} (${Math.round(withoutCompanyId.length / obligations.length * 100)}%) ===`);
  console.log('Estos dependen de emparejar NIT/nombre normalizado y son más propensos a fallos de matching.\n');
  for (const o of withoutCompanyId) {
    const obligationName = normalize(o.company ?? '');
    const nameMatch = companies.find(c => {
      const companyName = normalize(c.name);
      return companyName === obligationName || companyName.includes(obligationName) || obligationName.includes(companyName);
    });
    console.log(`- id:${o.id}  empresa:${o.company ?? '—'}  nit:${o.nit ?? '—'}  tipo:${o.taxType ?? '—'}  periodo:${o.period ?? '—'}  vence:${o.dueDate ?? '—'}  estado:${o.status ?? '—'}${nameMatch ? `  candidato:${nameMatch.id}/${nameMatch.nit}` : ''}`);
  }
  if (withoutCompanyId.length) console.log('');

  const leti = companies.find(c => cleanNit(c.nit) === '9012649227');
  if (leti) {
    console.log(`Empresa LETI: active=${leti.active}  activeContabilidad=${leti.activeContabilidad}  id=${leti.id}\n`);
  }

  // ── E) Integridad de campos y referencias ─────────────────────────────────────────────────
  const validStatuses = new Set(['', 'No iniciado', 'En revisión', 'Revisado', 'Presentado',
    'Informe Enviado', 'Informe Enviado RF', 'Impuesto Enviado para pago', 'No aplica', 'Pagado']);
  const companiesById = new Map(companies.map(c => [c.id, c]));
  const integrityIssues: Array<{ id: string; issues: string[] }> = [];
  for (const o of obligations) {
    const issues: string[] = [];
    for (const field of ['company', 'nit', 'taxType', 'period', 'dueDate']) {
      if (!String(o[field] ?? '').trim()) issues.push(`${field} vacío`);
    }
    if (o.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(o.dueDate)) issues.push('dueDate inválido');
    if (!validStatuses.has(o.status ?? '')) issues.push(`estado inválido: ${o.status}`);
    const company = o.companyId ? companiesById.get(o.companyId) : undefined;
    if (o.companyId && !company) issues.push(`companyId inexistente: ${o.companyId}`);
    if (company && cleanNit(company.nit) !== cleanNit(o.nit)) {
      issues.push(`NIT no coincide con empresa (${o.nit} vs ${company.nit})`);
    }
    if (issues.length) integrityIssues.push({ id: o.id, issues });
  }
  console.log(`=== E) Problemas de integridad: ${integrityIssues.length} ===`);
  integrityIssues.forEach(item => console.log(`- id:${item.id}  ${item.issues.join(' | ')}`));
  if (!integrityIssues.length) console.log('Sin campos requeridos vacíos, estados inválidos ni referencias rotas.');
  console.log('');

  const nonCanonicalPeriods = obligations.filter(o => o.period !== normalizePeriod(o.period));
  console.log(`=== F) Periodos no canónicos: ${nonCanonicalPeriods.length} ===`);
  const variants = new Map<string, number>();
  for (const o of nonCanonicalPeriods) {
    const label = `${o.period} → ${normalizePeriod(o.period)}`;
    variants.set(label, (variants.get(label) ?? 0) + 1);
  }
  [...variants.entries()].sort((a, b) => b[1] - a[1])
    .forEach(([label, count]) => console.log(`- ${count}x ${label}`));
  if (!nonCanonicalPeriods.length) console.log('Todos los periodos usan formato canónico.');
  console.log('');

  console.log('Listo — auditoría de solo lectura, no se modificó nada.');
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
