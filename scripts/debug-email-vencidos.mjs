/**
 * debug-email-vencidos.mjs
 * Replica la lógica del correo de alertas y muestra por qué cada entrada aparece.
 * Uso:
 *   npm --prefix functions run build
 *   node scripts/debug-email-vencidos.mjs
 *
 * Es de solo lectura. Usa las colecciones canónicas y el calendario compilado
 * de Functions para evitar que el diagnóstico diverja del correo productivo.
 */
import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(readFileSync(join(__dirname, 'serviceAccount.json'), 'utf8'));
let app; try { app = getApp(); } catch { app = initializeApp({ credential: cert(sa) }); }
const db = getFirestore(app);

const TODAY     = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const today     = new Date(TODAY + 'T00:00:00');
const OVERDUE_FROM   = '2026-06-01';
const UPCOMING_WINDOW = 7;
const COMPLETED = new Set(['Pagado', 'No aplica', 'Informe Enviado', 'Presentado']);

const norm  = s => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.,\-]/g, '').replace(/\s+/g, ' ').trim();
const nitC  = n => (n ?? '').replace(/\D/g, '');
const cComp = s => norm(s);

const TAX_ALIASES = {
  'reteica': 'reteica', 'retencion de ica': 'reteica', 'retencion ica': 'reteica',
  'impuesto de industria y comercio': 'ica', 'ica': 'ica',
  'iva bimestral': 'iva', 'iva cuatrimestral': 'iva', 'impuesto a las ventas': 'iva', 'iva': 'iva',
  'retencion en la fuente': 'retencion en la fuente', 'retencion fuente': 'retencion en la fuente', 'retefuente': 'retencion en la fuente',
};
const normTax = t => { const n = norm(t); return TAX_ALIASES[n] ?? n; };
const sameDate = (a, b) => {
  if (a === b) return true;
  const [ay,am,ad] = a.split('-').map(Number), [by,bm,bd] = b.split('-').map(Number);
  return Math.abs(Date.UTC(ay,am-1,ad) - Date.UTC(by,bm-1,bd)) <= 5*86400000;
};
const daysLeft = d => Math.round((new Date(d+'T00:00:00').getTime() - today.getTime()) / 86400000);

async function main() {
  console.log(`\n📅 Hoy: ${TODAY}  |  Desde: ${OVERDUE_FROM}  |  Próximos: ${UPCOMING_WINDOW}d\n`);

  // Cargar datos
  const [oblSnap, compSnap, settingsSnap] = await Promise.all([
    db.collection('accounting/data/tax_obligations').get(),
    db.collection('organization/data/companies').where('active','==',true).where('activeContabilidad','==',true).get(),
    db.collection('accounting/data/company_tax_settings').get(),
  ]);

  const allDocs = oblSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Firestore: ${allDocs.length} obligaciones | ${compSnap.size} empresas activas\n`);
  console.log('─'.repeat(80));

  // Importar calendario dinámicamente
  const settings = new Map(settingsSnap.docs.map(d => [d.id, d.data()]));
  const { getDianObligationsByNit } = await import('../functions/lib/dianCalendar2026.js').catch(() => null) ?? {};
  const { ALL_BOGOTA_2026 } = await import('../functions/lib/bogotaCalendar2026.js').catch(() => null) ?? {};

  if (!getDianObligationsByNit) {
    console.log('⚠️  No se pudo importar el calendario. Mostrando solo análisis de Firestore.\n');
    showFirestoreOnly(allDocs);
    return;
  }

  const results = [];

  for (const doc of compSnap.docs) {
    const comp = doc.data();
    const nit = comp.nit ?? '';
    if (!nit) continue;

    const compNitC = nitC(nit);
    const compN    = cComp(comp.name ?? '');
    const hidden   = new Set(settings.get(doc.id)?.excludedTaxTypes ?? []);

    const dianObls   = getDianObligationsByNit(nit).filter(o => !hidden.has(o.taxType));
    const bogotaObls = (ALL_BOGOTA_2026 ?? []).filter(o => !hidden.has(o.taxType));
    const allCalObls = [
      ...dianObls.map(o => ({ ...o, company: comp.name, nit })),
      ...bogotaObls.map(o => ({ taxType: o.taxType, period: o.period, dueDate: o.dueDate, company: comp.name, nit })),
    ];

    let hasVisible = false;
    const pending = [];

    for (const cal of allCalObls) {
      const dl = daysLeft(cal.dueDate);
      const isOverdue  = dl < 0 && cal.dueDate >= OVERDUE_FROM;
      const isUpcoming = dl >= 0 && dl <= UPCOMING_WINDOW;
      if (!isOverdue && !isUpcoming) continue;

      const matched = allDocs.filter(o => {
        const oNitC = nitC(o.nit ?? '');
        const companyMatch = o.companyId
          ? o.companyId === doc.id
          : ((compNitC && oNitC && compNitC === oNitC) || cComp(o.company ?? '') === compN);
        return companyMatch
          && normTax(o.taxType) === normTax(cal.taxType)
          && sameDate(o.dueDate, cal.dueDate);
      });

      const completedMatch = matched.find(o => COMPLETED.has(o.status ?? ''));
      const noAplicaMatch  = matched.find(o => o.status === 'No aplica');

      if (completedMatch || noAplicaMatch) continue; // resuelta

      hasVisible = true;
      pending.push({
        taxType: cal.taxType, period: cal.period ?? '', dueDate: cal.dueDate, dl,
        fsStatus: matched[0]?.status ?? '(sin registro)',
        fsNit: matched[0]?.nit ?? '',
        fsId: matched[0]?.id ?? '',
        companyId: matched[0]?.companyId ?? '',
        matchCount: matched.length,
      });
    }

    const manual = allDocs.filter(o => {
      const oNitC = nitC(o.nit ?? '');
      const companyMatch = o.companyId
        ? o.companyId === doc.id
        : ((compNitC && oNitC && compNitC === oNitC) || cComp(o.company ?? '') === compN);
      if (!companyMatch || COMPLETED.has(o.status ?? '') || o.status === 'No aplica') return false;
      if (hidden.has(o.taxType)) return false;
      if (allCalObls.some(cal => normTax(cal.taxType) === normTax(o.taxType) && sameDate(cal.dueDate, o.dueDate))) return false;
      const dl = daysLeft(o.dueDate);
      return (dl < 0 && o.dueDate >= OVERDUE_FROM) || (dl >= 0 && dl <= UPCOMING_WINDOW);
    }).map(o => ({
      taxType: o.taxType, period: o.period ?? '', dueDate: o.dueDate,
      dl: daysLeft(o.dueDate), fsStatus: o.status ?? '(sin estado)',
      fsNit: o.nit ?? '', fsId: o.id, companyId: o.companyId ?? '',
      matchCount: 1, source: 'manual',
    }));

    if (hasVisible || manual.length > 0) results.push({ company: comp.name, nit, pending: [...pending, ...manual] });
  }

  if (results.length === 0) {
    console.log('✅  Ninguna empresa con vencimientos pendientes (email vacío).\n');
    return;
  }

  console.log(`\n🔴 EMPRESAS QUE APARECERÍAN EN EL CORREO (${results.length}):\n`);
  for (const r of results) {
    console.log(`📌 ${r.company}  NIT: ${r.nit}`);
    for (const p of r.pending) {
      const label = p.dl < 0 ? `Vencido hace ${Math.abs(p.dl)}d` : `En ${p.dl}d`;
      console.log(`   • ${p.taxType} / ${p.period} / ${p.dueDate}  →  Estado FS: "${p.fsStatus}"  [${label}]${p.source === 'manual' ? ' [manual]' : ''}`);
      if (p.fsId) console.log(`     id:${p.fsId}  companyId:${p.companyId || '—'}  nit:${p.fsNit || '—'}`);
      if (p.matchCount > 1) console.log(`     ⚠️  ${p.matchCount} registros Firestore encontrados para esta entrada`);
      if (p.matchCount === 0) console.log(`     ℹ️  Sin registro en Firestore (solo en calendario DIAN)`);
    }
    console.log('');
  }
}

function showFirestoreOnly(allDocs) {
  const pending = allDocs.filter(o => {
    if (!o.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(o.dueDate)) return false;
    if (COMPLETED.has(o.status ?? '') || o.status === 'No aplica') return false;
    const dl = daysLeft(o.dueDate);
    return (dl < 0 && o.dueDate >= OVERDUE_FROM) || (dl >= 0 && dl <= UPCOMING_WINDOW);
  });
  console.log(`\nObligaciones Firestore pendientes en rango (${pending.length}):\n`);
  for (const o of pending.sort((a,b) => a.dueDate.localeCompare(b.dueDate))) {
    console.log(`  ${o.company} | NIT: ${o.nit} | ${o.taxType} | ${o.dueDate} | "${o.status ?? ''}"`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
