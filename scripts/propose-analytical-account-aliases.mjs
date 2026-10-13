/**
 * SOLO LECTURA: propone alias para las cuentas analíticas del catálogo.
 *
 * En el histórico de Expedientes la misma cuenta aparece escrita de varias
 * formas ("ZTE - MPW", "[ZTE] ZTE MPW", "TH_ZTE_MPW", "ZTE MPW COSTO"). Sin
 * alias, las estadísticas por cuenta pierden los retiros de meses pasados.
 *
 * Para cada empresa + nombre de cuenta que aparece en las relaciones laborales
 * y no es el nombre de una cuenta del catálogo, propone a qué cuenta pertenece:
 *   Alta  → mismo nombre quitando prefijos [..], TH_, sufijos COSTO/OT/N1,
 *           signos y orden de palabras; o equivalencia ya validada.
 *   Media → el nombre está contenido en el de la cuenta (ej. DATAFILL).
 *   (vacía) → sin propuesta; TH escribe la cuenta correcta o la deja.
 * "Personas en común" = cuántas personas de ese nombre histórico tienen o
 * tuvieron también un contrato en la cuenta propuesta (evidencia de apoyo).
 *
 *   node scripts/propose-analytical-account-aliases.mjs
 * Genera scripts/propuesta-alias-cuentas-<fecha>.xlsx. TH revisa la columna
 * "Aprobar" (SI/NO) y, si la propuesta es otra, "Cuenta correcta". Luego:
 *   node scripts/apply-analytical-account-aliases.mjs <archivo.xlsx> [--apply]
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
const fold = v => text(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es');
const norm = v => fold(v).replace(/[^a-z0-9]/g, '');

// Equivalencias validadas con el comparativo de personas (renombres del catálogo).
const KNOWN = [
  ['INTEEGRA SAS BIC', 'CLARO-NOC OTS Y DATAFILL', 'CLARO DATAFILL'],
  ['INTEEGRA SAS BIC', 'ZTE', 'ZTE MPW'],
  ['INTEEGRA SAS BIC', 'NOC ETB', 'UT EIP ETB'],
  ['ITAC COLOMBIA S.A.S', 'SOMOS', 'ADMINISTRACIÓN_SOMOS'],
  ['ITAC COLOMBIA S.A.S', 'FOMENTO TIC', 'ADMINISTRACIÓN_FOMETIC'],
  ['NETCOL INGENIERÍA S.A.S BIC', 'SENA', 'APRENDICES'],
];
// Palabras que no cambian la cuenta: centro de costo, OT, nivel, prefijo TH.
const NOISE = new Set(['costo', 'ot', 'n1', 'th']);
const SYNONYMS = { admon: 'administracion' };
// Valores que no son una cuenta.
const NOT_ACCOUNT = new Set(['na', 'n/a', '']);

const [companiesSnap, projectsSnap, employmentsSnap] = await Promise.all([
  db.collection('organization/data/companies').get(),
  db.collection('organization/data/projects').get(),
  db.collectionGroup('employments').get(),
]);
const companies = companiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const companyOf = name => companies.find(c => [c.name, ...(c.aliases ?? [])].map(norm).includes(norm(name)));
const projects = projectsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const projectsOf = companyId => projects.filter(p => p.companyId === companyId);

// Palabras significativas de un nombre, sin ruido ni el nombre de la empresa.
const tokensOf = (value, company) => {
  const companyTokens = new Set(fold(company?.name).split(/[^a-z0-9]+/).filter(t => t.length > 3));
  return fold(value).split(/[^a-z0-9]+/)
    .map(t => SYNONYMS[t] ?? t)
    .filter(t => t && !NOISE.has(t) && !companyTokens.has(t));
};
const tokenKey = (value, company) => [...new Set(tokensOf(value, company))].sort().join(' ');
// "[ADMINISTRACIÓN INTEEGRA] ADMON" → se evalúan el texto entre corchetes y el resto.
const variantsOf = raw => {
  const match = text(raw).match(/^\[([^\]]+)\]\s*(.*)$/);
  return match ? [match[2], match[1]] : [text(raw)];
};

// Agrupa las relaciones por empresa + nombre de cuenta tal como viene escrito.
const groups = new Map();
const peopleByAccount = new Map(); // `${companyId}|${norm(cuenta)}` → Set(employeeId)
employmentsSnap.docs.forEach(doc => {
  const r = doc.data();
  const company = companyOf(r.companyName);
  if (!company) return;
  const raw = text(r.projectName) || text(r.analyticalAccount);
  if (NOT_ACCOUNT.has(fold(raw))) return;
  const employeeId = r.employeeId || doc.ref.parent.parent?.id;
  const accountKey = `${company.id}|${norm(raw)}`;
  if (!peopleByAccount.has(accountKey)) peopleByAccount.set(accountKey, new Set());
  peopleByAccount.get(accountKey).add(employeeId);
  const key = `${company.id}|${raw}`;
  if (!groups.has(key)) groups.set(key, { company, raw, total: 0, active: 0, years: new Set(), people: new Set() });
  const g = groups.get(key);
  g.total++;
  if (r.status === 'active') g.active++;
  g.people.add(employeeId);
  const end = r.endDate?.toDate?.() ?? null;
  const start = r.startDate?.toDate?.() ?? null;
  [start, end].forEach(d => { if (d && !isNaN(d)) g.years.add(d.getFullYear()); });
});

// Entre varias candidatas: si solo una está activa (ej. ADMINISTRACIÓN frente al
// duplicado inactivo ADMINISTRACION), esa; si no, ninguna (que decida TH).
const pickOne = candidates => {
  if (candidates.length === 1) return candidates[0];
  const active = candidates.filter(p => p.status === 'activo');
  return active.length === 1 ? active[0] : null;
};

const rows = [];
groups.forEach(g => {
  const catalog = projectsOf(g.company.id);
  // Ya es el nombre de una cuenta del catálogo (o de un alias existente): nada que proponer.
  if (catalog.some(p => [p.name, ...(p.aliases ?? [])].map(norm).includes(norm(g.raw)))) return;

  let target = null, confidence = '', reason = '';
  const known = KNOWN.find(([c, from]) => norm(c) === norm(g.company.name)
    && variantsOf(g.raw).some(variant => norm(from) === norm(variant)));
  if (known) {
    target = catalog.find(p => norm(p.name) === norm(known[2]));
    if (target) { confidence = 'Alta'; reason = 'Equivalencia validada con el comparativo de personas'; }
  }
  if (!target) {
    for (const variant of variantsOf(g.raw)) {
      const key = tokenKey(variant, g.company);
      if (!key) continue;
      const exact = pickOne(catalog.filter(p => tokenKey(p.name, g.company) === key));
      if (exact) { target = exact; confidence = 'Alta'; reason = `Mismo nombre sin prefijos/sufijos ("${variant}")`; break; }
    }
  }
  if (!target) {
    for (const variant of variantsOf(g.raw)) {
      const key = norm(tokensOf(variant, g.company).join(''));
      if (key.length < 4) continue;
      const contained = pickOne(catalog.filter(p => norm(tokensOf(p.name, g.company).join('')).includes(key)));
      if (contained) { target = contained; confidence = 'Media'; reason = `"${variant}" está contenido en el nombre de la cuenta`; break; }
    }
  }

  const shared = target
    ? [...g.people].filter(id => [target.name, ...(target.aliases ?? [])]
      .some(name => peopleByAccount.get(`${g.company.id}|${norm(name)}`)?.has(id))).length
    : 0;
  const years = [...g.years].sort();
  rows.push({
    Empresa: g.company.name,
    'Nombre en Expedientes': g.raw,
    Relaciones: g.total,
    Activas: g.active,
    Años: years.length ? (years[0] === years.at(-1) ? `${years[0]}` : `${years[0]}–${years.at(-1)}`) : '',
    'Cuenta propuesta': target?.name ?? '',
    'Estado de la cuenta': target?.status ?? '',
    Confianza: confidence,
    Motivo: reason,
    'Personas en común': target ? shared : '',
    Aprobar: confidence === 'Alta' ? 'SI' : '',
    'Cuenta correcta (si es otra)': '',
  });
});

const order = { Alta: 0, Media: 1, '': 2 };
rows.sort((a, b) => a.Empresa.localeCompare(b.Empresa, 'es') || order[a.Confianza] - order[b.Confianza] || b.Relaciones - a.Relaciones);

const count = level => rows.filter(r => r.Confianza === level).length;
console.log(`Nombres históricos sin cuenta del catálogo: ${rows.length}`);
console.log(`  Alta: ${count('Alta')} · Media: ${count('Media')} · Sin propuesta: ${count('')}\n`);
rows.forEach(r => console.log(`${(r.Confianza || '—').padEnd(5)} ${r.Empresa} | "${r['Nombre en Expedientes']}" (${r.Relaciones}) → ${r['Cuenta propuesta'] || '—'}${r['Personas en común'] !== '' ? ` · ${r['Personas en común']} en común` : ''}`));

const sheet = XLSX.utils.json_to_sheet(rows);
sheet['!cols'] = [30, 38, 10, 8, 11, 30, 12, 10, 50, 10, 9, 30].map(wch => ({ wch }));
const help = XLSX.utils.aoa_to_sheet([
  ['Cómo revisar esta propuesta'],
  ['Cada fila es un nombre de cuenta que aparece en Expedientes (sobre todo en contratos retirados) y no coincide con una cuenta del catálogo.'],
  ['Aprobar = SI: ese nombre queda como alias de la "Cuenta propuesta" y sus retiros cuentan en las estadísticas de esa cuenta.'],
  ['Si la cuenta correcta es otra, escribe su nombre exacto (como aparece en Cuentas analíticas) en "Cuenta correcta (si es otra)" y pon SI.'],
  ['Aprobar = NO o vacío: no se hace nada con ese nombre.'],
  ['Las filas de confianza Alta vienen marcadas con SI; revísalas igual.'],
]);
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, sheet, 'Propuesta');
XLSX.utils.book_append_sheet(book, help, 'Instrucciones');
const outPath = join(scriptDir, `propuesta-alias-cuentas-${new Date().toISOString().slice(0, 10)}.xlsx`);
XLSX.writeFile(book, outPath);
console.log(`\nExcel: ${outPath}`);
process.exit(0);
