/**
 * SOLO LECTURA. Genera el listado para cruzar con TH el HC inicial de 2026:
 *  - Hoja "Vigentes 31-12-2025": contratos que la plataforma cuenta como vigentes
 *    al cierre de 2025 (regla de TH: el retiro descuenta el mismo día).
 *  - Hoja "Retirados sin fecha": contratos retirados sin FECHA RETIRO (no se puede
 *    saber si seguían vigentes al iniciar 2026).
 *  - Hoja "Empresas sin TH": contratos activos en empresas sin módulo TH activo
 *    (la analítica no los cuenta).
 * Contiene datos personales: queda en scripts/ (ignorado por git).
 *   node scripts/export-hc-inicial-2026.mjs
 */
process.env.TZ = 'America/Bogota';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const XLSX = createRequire(import.meta.url)('xlsx');
initializeApp({ credential: cert(JSON.parse(readFileSync('scripts/serviceAccount.json', 'utf8'))) });
const db = getFirestore();
const norm = v => String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const d = v => v?.toDate ? v.toDate() : null;
const fmt = v => { const x = d(v); return x ? `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}` : ''; };
const [cs, es, ps] = await Promise.all([
  db.collection('organization/data/companies').get(),
  db.collectionGroup('employments').get(),
  db.collection('human_resources/data/employees').get(),
]);
const th = cs.docs.map(x => x.data()).filter(c => c.activeTH);
const isTH = r => th.some(c => [c.name, ...(c.aliases ?? [])].map(norm).includes(norm(r.companyName)));
const names = new Map(ps.docs.map(x => [x.id, x.data().fullName]));
const rel = es.docs.map(x => ({ ...x.data(), emp: x.data().employeeId || x.ref.parent.parent.id }));
const ref = new Date(2025, 11, 31);
const row = r => ({
  Cédula: r.emp, Nombre: names.get(r.emp) ?? '', Empresa: r.companyName ?? '', 'Cuenta analítica': r.projectName ?? '',
  Cargo: r.position ?? '', 'Tipo de contrato': r.contractType ?? '', Estado: r.status, 'Fecha ingreso': fmt(r.startDate),
  'Fecha retiro': fmt(r.endDate), 'Motivo retiro': r.terminationReason ?? '', 'Fila del Excel': r.sourceRow ?? '',
});
const vigentes = rel.filter(r => isTH(r) && d(r.startDate) && d(r.startDate) <= ref
  && (r.status === 'active' || (d(r.endDate) && d(r.endDate) > ref)));
const sinFecha = rel.filter(r => isTH(r) && r.status === 'retired' && !d(r.endDate));
const sinTH = rel.filter(r => !isTH(r) && r.status === 'active');
const wb = XLSX.utils.book_new();
for (const [name, list] of [['Vigentes 31-12-2025', vigentes], ['Retirados sin fecha', sinFecha], ['Empresas sin TH', sinTH]]) {
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(list.map(row).sort((a, b) => a.Nombre.localeCompare(b.Nombre, 'es'))), name);
}
const out = `scripts/cruce-hc-inicial-2026-${Date.now()}.xlsx`;
XLSX.writeFile(wb, out);
console.log(`Vigentes al 31/12/2025: ${vigentes.length} (TH: 360) | Retirados sin fecha: ${sinFecha.length} | Activos en empresas sin TH: ${sinTH.length}`);
console.log(`Archivo: ${out}`);
