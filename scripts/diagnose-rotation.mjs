/**
 * Replica getRotationMetrics (src/services/analyticsService.ts) contra datos reales
 * para diagnosticar por qué la rotación se ve mal. Solo lee, no escribe nada.
 *
 * Uso: node scripts/diagnose-rotation.mjs
 */
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

const toDate = (raw) => {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (raw && typeof raw.toDate === 'function') { const d = raw.toDate(); return isNaN(d.getTime()) ? null : d; }
  if (raw && typeof raw.seconds === 'number') return new Date(raw.seconds * 1000);
  if (typeof raw === 'string' && raw.trim()) {
    const s = raw.trim();
    const parts = s.split(/[\/\-]/);
    if (parts.length === 3 && parts.every(p => /^\d+$/.test(p))) {
      const [a, b, c] = parts.map(Number);
      if (a > 31) {
        const d = new Date(a, b - 1, c);
        if (!isNaN(d.getTime()) && d.getFullYear() === a && d.getMonth() === b - 1 && d.getDate() === c) return d;
      } else {
        const year = c < 100 ? (c < 50 ? 2000 + c : 1900 + c) : c;
        if (a > 12 && b <= 12) {
          const dmy = new Date(year, b - 1, a);
          if (!isNaN(dmy.getTime()) && dmy.getMonth() === b - 1 && dmy.getDate() === a) return dmy;
        } else if (b > 12 && a <= 12) {
          const mdy = new Date(year, a - 1, b);
          if (!isNaN(mdy.getTime()) && mdy.getMonth() === a - 1 && mdy.getDate() === b) return mdy;
        } else if (a >= 1 && a <= 12 && b >= 1 && b <= 31) {
          const mdy = new Date(year, a - 1, b);
          if (!isNaN(mdy.getTime()) && mdy.getMonth() === a - 1 && mdy.getDate() === b) return mdy;
        }
      }
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};
const round2 = (v) => Math.round(v * 100) / 100;
const normalize = (v) => String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const esVoluntario = (reason) => {
  const l = (reason || '').toLowerCase();
  return l.includes('renuncia') || l.includes('mutuo acuerdo') || l === 'voluntario';
};

const companiesSnap = await db.collection('organization/data/companies').get();
const companies = companiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const thCompanies = companies.filter(c => c.activeTH);

const employmentSnap = await db.collectionGroup('employments').get();
let relations = employmentSnap.docs.map(d => ({ id: d.id, employeeId: d.data().employeeId || d.ref.parent.parent?.id, ...d.data() }));
relations = relations.filter(r => thCompanies.some(c => {
  if (r.companyId && r.companyId === c.id) return true;
  const accepted = [c.name, ...(c.aliases ?? [])].map(normalize);
  return accepted.includes(normalize(r.companyName));
}));

const today = new Date();
const currentYear = today.getFullYear();
const periodEnd = today; // sin filtro de mes -> fin de año topado a hoy = hoy

console.log(`Hoy: ${today.toISOString().slice(0,10)} | Año: ${currentYear} | periodEnd (capado): ${periodEnd.toISOString().slice(0,10)}`);
console.log(`Relaciones TH totales: ${relations.length}`);

// Headcount actual (como lo calcula el código)
const activeRelations = relations.filter(r => {
  if (r.status !== 'active' && r.status !== 'retired') return false;
  const start = toDate(r.startDate);
  if (!start || start > periodEnd) return false;
  if (r.status === 'retired') {
    const end = toDate(r.endDate);
    if (!end || end < periodEnd) return false;
  }
  return true;
});
const headcount = new Set(activeRelations.map(r => r.employeeId)).size;

const inPeriod = (date) => date && date.getFullYear() === currentYear;
const retiros = relations.filter(r => r.status === 'retired' && inPeriod(toDate(r.endDate)));
const ingresos = relations.filter(r => inPeriod(toDate(r.startDate)));

const rotacionGeneral = headcount > 0 ? round2((retiros.length / headcount) * 100) : 0;

console.log(`\n=== Cálculo actual (código) ===`);
console.log(`headcount (snapshot a periodEnd): ${headcount}`);
console.log(`retiros en ${currentYear}: ${retiros.length}`);
console.log(`ingresos en ${currentYear}: ${ingresos.length}`);
console.log(`rotacionGeneral = ${retiros.length}/${headcount} * 100 = ${rotacionGeneral}%`);

// Comparación: headcount al INICIO del año (1 de enero)
const yearStart = new Date(currentYear, 0, 1);
const headcountAtStart = new Set(
  relations.filter(r => {
    if (r.status !== 'active' && r.status !== 'retired') return false;
    const start = toDate(r.startDate);
    if (!start || start > yearStart) return false;
    if (r.status === 'retired') {
      const end = toDate(r.endDate);
      if (!end || end < yearStart) return false;
    }
    return true;
  }).map(r => r.employeeId)
).size;
console.log(`\n=== Comparación: headcount al 1-ene-${currentYear} ===`);
console.log(`headcount inicio de año: ${headcountAtStart}`);
console.log(`rotación con headcount inicio = ${retiros.length}/${headcountAtStart} * 100 = ${headcountAtStart > 0 ? round2(retiros.length/headcountAtStart*100) : 'N/A'}%`);

const avgHc = round2((headcount + headcountAtStart) / 2);
console.log(`\nheadcount promedio (inicio+fin)/2 = ${avgHc}`);
console.log(`rotación con headcount promedio = ${retiros.length}/${avgHc} * 100 = ${avgHc > 0 ? round2(retiros.length/avgHc*100) : 'N/A'}%`);

// Cuántos de los retiros del año quedaron excluidos del headcount actual (por endDate < periodEnd)
const retiroIdsInHeadcount = new Set(activeRelations.map(r => r.employeeId));
const retirosNotInHeadcount = retiros.filter(r => !retiroIdsInHeadcount.has(r.employeeId));
console.log(`\nDe los ${retiros.length} retiros del año, ${retirosNotInHeadcount.length} NO están en el headcount snapshot (se fueron antes de "hoy" y no están en el conteo actual).`);

console.log(`\n=== Verificación fórmula nueva (promedio inicio/fin) ===`);
console.log(`rotacionGeneral nueva = ${retiros.length}/${avgHc} * 100 = ${avgHc > 0 ? round2(retiros.length/avgHc*100) : 'N/A'}%`);
