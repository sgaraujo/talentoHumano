/**
 * Conciliación de SOLO LECTURA: arma la tabla mensual 2026 de Talento Humano
 * (HC inicial, ingresos, retiros, HC final, voluntarios/involuntarios) con los
 * datos de la plataforma y la compara con las cifras oficiales de TH.
 *   node scripts/reconcile-rotation-2026.mjs
 */
process.env.TZ = 'America/Bogota';
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

// Cifras oficiales de TH (tabla "Retiros y rotación mensual 2026").
const OFFICIAL = [
  { hci: 360, ing: 13, ret: 15, hcf: 358, vol: 8, inv: 7 },
  { hci: 358, ing: 14, ret: 18, hcf: 354, vol: 10, inv: 8 },
  { hci: 354, ing: 3, ret: 21, hcf: 336, vol: 5, inv: 16 },
  { hci: 336, ing: 6, ret: 31, hcf: 311, vol: 9, inv: 22 },
  { hci: 311, ing: 8, ret: 16, hcf: 303, vol: 6, inv: 10 },
  { hci: 303, ing: 6, ret: 94, hcf: 216, vol: 45, inv: 48 },
  { hci: 216, ing: 48, ret: 7, hcf: 256, vol: 2, inv: 5 },
  { hci: 256, ing: 30, ret: 17, hcf: 269, vol: 15, inv: 2 },
  { hci: 269, ing: 16, ret: 11, hcf: 274, vol: 6, inv: 5 },
];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep'];

const norm = v => String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const esVoluntario = r => { const l = String(r ?? '').toLowerCase(); return l.includes('renuncia') || l.includes('mutuo acuerdo') || l === 'voluntario'; };
const isApprentice = r => {
  const c = norm(r.contractType);
  if (c.includes('aprendizaje') || c.includes('aprendizsena') || c === 'aprendiz') return true;
  return ['sena', 'aprendices'].includes(norm(r.projectName)) || norm(r.analyticalAccount) === 'aprendices';
};

// Lectura de fechas IGUAL a la analítica actual (texto ambiguo → mes/día).
const platformDate = raw => {
  if (!raw) return null;
  if (typeof raw?.toDate === 'function') return raw.toDate();
  const s = String(raw).trim();
  const p = s.split(/[/-]/);
  if (p.length !== 3 || !p.every(x => /^\d+$/.test(x))) return null;
  const [a, b, c] = p.map(Number);
  const y = c < 100 ? (c < 50 ? 2000 + c : 1900 + c) : c;
  if (a > 12 && b <= 12) return new Date(y, b - 1, a);
  if (b > 12 && a <= 12) return new Date(y, a - 1, b);
  return new Date(y, a - 1, b);
};
// Variante: texto ambiguo → día/mes (formato colombiano).
const dayFirstDate = raw => {
  if (!raw) return null;
  if (typeof raw?.toDate === 'function') return raw.toDate();
  const p = String(raw).trim().split(/[/-]/);
  if (p.length !== 3 || !p.every(x => /^\d+$/.test(x))) return null;
  const [a, b, c] = p.map(Number);
  const y = c < 100 ? (c < 50 ? 2000 + c : 1900 + c) : c;
  if (b > 12 && a <= 12) return new Date(y, a - 1, b);
  return new Date(y, b - 1, a);
};

const [companiesSnap, employmentSnap] = await Promise.all([
  db.collection('organization/data/companies').get(),
  db.collectionGroup('employments').get(),
]);
const thCompanies = companiesSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.activeTH);
const isTH = r => thCompanies.some(c => (r.companyId && r.companyId === c.id)
  || [c.name, ...(c.aliases ?? [])].map(norm).includes(norm(r.companyName)));
const all = employmentSnap.docs.map(d => ({ id: d.id, ...d.data(), employeeId: d.data().employeeId || d.ref.parent.parent?.id }));
const today = new Date();

function table(relations, toDate, { countPeople = false } = {}) {
  const activeAt = (r, ref) => {
    const s = toDate(r.startDate);
    if (!s || s > ref) return false;
    if (r.status === 'retired') { const e = toDate(r.endDate); if (!e || e < ref) return false; }
    else if (r.status !== 'active') return false;
    return true;
  };
  const hc = ref => new Set(relations.filter(r => activeAt(r, ref)).map(r => r.employeeId)).size;
  return MONTHS.map((_, m) => {
    const inMonth = d => d && d <= today && d.getFullYear() === 2026 && d.getMonth() === m;
    const ing = relations.filter(r => inMonth(toDate(r.startDate)));
    const ret = relations.filter(r => r.status === 'retired' && inMonth(toDate(r.endDate)));
    const count = list => countPeople ? new Set(list.map(r => r.employeeId)).size : list.length;
    return {
      hci: hc(new Date(2026, m, 0)), ing: count(ing), ret: count(ret), hcf: hc(new Date(2026, m + 1, 0)),
      vol: count(ret.filter(r => esVoluntario(r.terminationReason))), inv: count(ret.filter(r => !esVoluntario(r.terminationReason))),
    };
  });
}

function print(title, rows) {
  const fmt = (v, o) => `${String(v).padStart(4)}${v === o ? ' ' : '*'}`;
  console.log(`\n== ${title}   (* = distinto a TH; entre paréntesis la cifra de TH)`);
  console.log('mes   HC ini       Ingr.      Retiros    HC fin      Volunt.    Involunt.');
  rows.forEach((r, i) => {
    const o = OFFICIAL[i];
    console.log(`${MONTHS[i]}  ${fmt(r.hci, o.hci)}(${String(o.hci).padStart(3)}) ${fmt(r.ing, o.ing)}(${String(o.ing).padStart(3)}) ${fmt(r.ret, o.ret)}(${String(o.ret).padStart(3)}) ${fmt(r.hcf, o.hcf)}(${String(o.hcf).padStart(3)}) ${fmt(r.vol, o.vol)}(${String(o.vol).padStart(3)}) ${fmt(r.inv, o.inv)}(${String(o.inv).padStart(3)})`);
  });
  const sum = k => rows.reduce((s, r) => s + r[k], 0);
  const osum = k => OFFICIAL.reduce((s, r) => s + r[k], 0);
  console.log(`total              ing ${sum('ing')} (${osum('ing')})  ret ${sum('ret')} (${osum('ret')})  vol ${sum('vol')} (${osum('vol')})  inv ${sum('inv')} (${osum('inv')})`);
}

const th = all.filter(isTH);
const thNoApp = th.filter(r => !isApprentice(r));
console.log(`Relaciones: ${all.length}; en empresas TH: ${th.length}; TH sin aprendices: ${thNoApp.length}`);
console.log(`Empresas TH: ${thCompanies.map(c => c.name).join(', ')}`);

print('A. Como la plataforma hoy (TH, sin aprendices, texto ambiguo = mes/día)', table(thNoApp, platformDate));
print('B. Igual que A pero texto ambiguo = día/mes', table(thNoApp, dayFirstDate));
print('C. Igual que A pero CON aprendices', table(th, platformDate));
print('D. Igual que A pero contando personas (no relaciones)', table(thNoApp, platformDate, { countPeople: true }));

// Diagnóstico de causas en 2026
const in2026 = (r, f) => { const d = platformDate(r[f]); return d && d.getFullYear() === 2026; };
const ret2026 = thNoApp.filter(r => r.status === 'retired' && in2026(r, 'endDate'));
const textDates = ret2026.filter(r => typeof r.endDate === 'string');
const flips = ret2026.filter(r => typeof r.endDate === 'string' && platformDate(r.endDate)?.getMonth() !== dayFirstDate(r.endDate)?.getMonth());
const dupKey = r => `${r.employeeId}|${norm(r.companyName)}|${platformDate(r.startDate)?.toDateString()}`;
const dupCount = new Map(); thNoApp.forEach(r => dupCount.set(dupKey(r), (dupCount.get(dupKey(r)) ?? 0) + 1));
const dupRet = ret2026.filter(r => dupCount.get(dupKey(r)) > 1);
const activeNow = thNoApp.filter(r => r.status === 'active');
const activeFutureStart = activeNow.filter(r => { const s = platformDate(r.startDate); return s && s > today; });
const retNoEnd = thNoApp.filter(r => r.status === 'retired' && !platformDate(r.endDate));
console.log('\n== Causas detectadas (TH, sin aprendices)');
console.log(`Retiros 2026 en plataforma: ${ret2026.length} relaciones de ${new Set(ret2026.map(r => r.employeeId)).size} personas`);
console.log(`  con endDate en texto: ${textDates.length}; de esos, cambian de mes según se lea d/m o m/d: ${flips.length}`);
console.log(`  que pertenecen a grupos duplicados (misma cédula+empresa+ingreso): ${dupRet.length}`);
console.log(`Relaciones activas hoy: ${activeNow.length} (${new Set(activeNow.map(r => r.employeeId)).size} personas); con ingreso futuro: ${activeFutureStart.length}`);
console.log(`Relaciones retiradas sin fecha de retiro legible: ${retNoEnd.length}`);
const byCompany = new Map();
ret2026.forEach(r => byCompany.set(r.companyName, (byCompany.get(r.companyName) ?? 0) + 1));
console.log('Retiros 2026 por empresa:', JSON.stringify(Object.fromEntries([...byCompany.entries()].sort((a, b) => b[1] - a[1]))));
const actByCompany = new Map();
activeNow.forEach(r => actByCompany.set(r.companyName, (actByCompany.get(r.companyName) ?? 0) + 1));
console.log('Activas hoy por empresa:', JSON.stringify(Object.fromEntries([...actByCompany.entries()].sort((a, b) => b[1] - a[1]))));
const reasons = new Map(); ret2026.forEach(r => reasons.set(r.terminationReason ?? '(sin)', (reasons.get(r.terminationReason ?? '(sin)') ?? 0) + 1));
console.log('Motivos retiros 2026:', JSON.stringify(Object.fromEntries([...reasons.entries()].sort((a, b) => b[1] - a[1]))));
