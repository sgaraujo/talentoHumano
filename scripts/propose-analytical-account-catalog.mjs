/**
 * SOLO LECTURA: arma la propuesta del nuevo catálogo de "Cuentas analíticas"
 * (una por empresa + CUENTA ANALITICA de las relaciones laborales) para que
 * Talento Humano la revise antes de migrar. No contiene datos personales.
 *   node scripts/propose-analytical-account-catalog.mjs
 * Genera scripts/propuesta-catalogo-cuentas-analiticas-<ts>.xlsx
 */
process.env.TZ = 'America/Bogota';
import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import XLSX from 'xlsx';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(scriptDir, 'serviceAccount.json'), 'utf8'));
let app;
try { app = getApp(); } catch { app = initializeApp({ credential: cert(serviceAccount) }); }
const db = getFirestore(app);

const text = v => String(v ?? '').trim();
const norm = v => text(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const isApprentice = r => {
  const c = norm(r.contractType);
  return c.includes('aprendizaje') || c.includes('aprendizsena') || c === 'aprendiz';
};

const [projectsSnap, companiesSnap, employmentsSnap] = await Promise.all([
  db.collection('organization/data/projects').get(),
  db.collection('organization/data/companies').get(),
  db.collectionGroup('employments').get(),
]);
const companies = companiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const companyOf = name => companies.find(c => [c.name, ...(c.aliases ?? [])].map(norm).includes(norm(name)));
const projects = projectsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const projectByCompanyAndName = new Map(projects.map(p => [`${p.companyId}|${norm(p.name)}`, p]));

const groups = new Map();
employmentsSnap.docs.forEach(doc => {
  const r = doc.data();
  const company = companyOf(r.companyName);
  const account = text(r.analyticalAccount) || '(sin cuenta analítica)';
  const key = `${company?.id ?? norm(r.companyName)}|${norm(account)}`;
  if (!groups.has(key)) groups.set(key, {
    company, companyName: company?.name ?? text(r.companyName), account, variants: new Set(),
    active: 0, activeApprentices: 0, total: 0, projects: new Map(),
  });
  const g = groups.get(key);
  g.variants.add(text(r.analyticalAccount));
  g.total++;
  if (r.status === 'active') isApprentice(r) ? g.activeApprentices++ : g.active++;
  const p = text(r.projectName) || '(vacío)';
  g.projects.set(p, (g.projects.get(p) ?? 0) + 1);
});

const accountKeysByCompany = new Map();
groups.forEach(g => {
  const set = accountKeysByCompany.get(g.company?.id) ?? new Set();
  set.add(norm(g.account));
  accountKeysByCompany.set(g.company?.id, set);
});

const rows = [...groups.values()].map(g => {
  const sameName = g.company ? projectByCompanyAndName.get(`${g.company.id}|${norm(g.account)}`) : undefined;
  const topProjects = [...g.projects.entries()].sort((a, b) => b[1] - a[1]);
  const mainProject = topProjects.find(([name]) => name !== '(vacío)')?.[0];
  const inheritedMaster = g.company && mainProject ? projectByCompanyAndName.get(`${g.company.id}|${norm(mainProject)}`) : undefined;
  const base = g.account.replace(/\s+costo$/i, '');
  const costoOf = base !== g.account && accountKeysByCompany.get(g.company?.id)?.has(norm(base)) ? base : '';
  const people = g.active + g.activeApprentices;
  return {
    Empresa: g.companyName,
    'Empresa con TH activo': g.company?.activeTH ? 'Sí' : 'No',
    'Cuenta analítica': g.account,
    'Variantes de escritura': [...g.variants].filter(v => v && v !== g.account).join(' | '),
    'Activos (sin aprendices)': g.active,
    'Aprendices activos': g.activeApprentices,
    'Relaciones históricas': g.total,
    'Estado propuesto': people > 0 ? 'activo' : 'inactivo',
    'PROYECTO actual (relaciones)': topProjects.slice(0, 4).map(([n, c]) => `${n} (${c})`).join(' · '),
    'Ya existe en catálogo con este nombre': sameName ? `${sameName.name} [${sameName.status}]` : '',
    'Proyecto maestro actual (heredado)': inheritedMaster ? `${inheritedMaster.name} [${inheritedMaster.status}]${inheritedMaster.leaderName ? ` · líder: ${inheritedMaster.leaderName}` : ''}` : '',
    'Posible variante COSTO de': costoOf,
    'Decisión TH (mantener / agrupar con … / inactivar)': '',
  };
}).sort((a, b) => a.Empresa.localeCompare(b.Empresa, 'es') || b['Activos (sin aprendices)'] - a['Activos (sin aprendices)'] || a['Cuenta analítica'].localeCompare(b['Cuenta analítica'], 'es'));

const legacy = projects.map(p => ({
  Empresa: p.companyName || companies.find(c => c.id === p.companyId)?.name || p.companyId,
  'Proyecto actual': p.name, Estado: p.status, Líder: p.leaderName ?? '',
  'Relaciones que lo usan hoy': [...groups.values()].reduce((s, g) => s + (g.company?.id === p.companyId ? (g.projects.get(p.name) ?? 0) : 0), 0),
})).sort((a, b) => String(a.Empresa).localeCompare(String(b.Empresa), 'es'));

const wb = XLSX.utils.book_new();
const sheet = XLSX.utils.json_to_sheet(rows);
sheet['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.min(Math.max(k.length + 2, 14), 60) }));
XLSX.utils.book_append_sheet(wb, sheet, 'Propuesta cuentas');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(legacy), 'Proyectos actuales');
const out = join(scriptDir, `propuesta-catalogo-cuentas-analiticas-${Date.now()}.xlsx`);
XLSX.writeFile(wb, out);

const activeAccounts = rows.filter(r => r['Estado propuesto'] === 'activo');
console.log(`Cuentas analíticas distintas: ${rows.length} (con personas activas: ${activeAccounts.length}); proyectos actuales: ${projects.length}`);
console.log(`Posibles variantes COSTO: ${rows.filter(r => r['Posible variante COSTO de']).length}`);
console.log(`Cuentas con variantes de escritura: ${rows.filter(r => r['Variantes de escritura']).length}`);
console.log('\nCuentas activas:');
activeAccounts.forEach(r => console.log(`  ${r.Empresa} | ${r['Cuenta analítica']} — ${r['Activos (sin aprendices)']} activos, ${r['Aprendices activos']} aprendices${r['Posible variante COSTO de'] ? `  (¿variante COSTO de ${r['Posible variante COSTO de']}?)` : ''}`));
console.log(`\nArchivo: ${out}`);
