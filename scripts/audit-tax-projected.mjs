import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(here, 'serviceAccount.json'), 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const normalize = (value = '') => String(value).toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[.\-,]/g, '').replace(/\s+/g, ' ').trim();
const cleanNit = (value = '') => String(value).replace(/[^0-9]/g, '');
const aliases = {
  reteica: 'reteica', 'retencion de ica': 'reteica', 'retencion ica': 'reteica',
  'iva bimestral': 'iva', 'iva cuatrimestral': 'iva', 'impuesto a las ventas': 'iva', iva: 'iva',
  'retencion en la fuente': 'retencion en la fuente', 'retencion fuente': 'retencion en la fuente',
  retefuente: 'retencion en la fuente', 'exogena nacional (pj/naturales)': 'exogena nacional',
  'informacion exogena nacional': 'exogena nacional', 'exogena nacional': 'exogena nacional',
};
const normTax = value => aliases[normalize(value)] ?? normalize(value);

const [obligationsSnap, companiesSnap, settingsSnap] = await Promise.all([
  db.collection('accounting/data/tax_obligations').get(),
  db.collection('organization/data/companies').get(),
  db.collection('accounting/data/company_tax_settings').get(),
]);
const companies = new Map(companiesSnap.docs.map(doc => [doc.id, doc.data()]));
const settings = new Map(settingsSnap.docs.map(doc => [doc.id, doc.data()]));
const obligations = obligationsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
const projected = obligations.filter(item => Number(item.projected) > 0);

const leti = obligations.filter(item =>
  item.companyId === '6V1n3lFLptgUB75rIkfO' ||
  String(item.company ?? '').toLowerCase().includes('leti') ||
  String(item.company ?? '').toLowerCase().includes('logistica empresarial') ||
  String(item.company ?? '').toLowerCase().includes('logística empresarial')
);

console.log('Identidades encontradas para LETI:');
for (const [key, count] of [...leti.reduce((map, item) => {
  const key = JSON.stringify({ companyId: item.companyId ?? '', company: item.company ?? '', nit: item.nit ?? '' });
  map.set(key, (map.get(key) ?? 0) + 1);
  return map;
}, new Map()).entries()]) {
  console.log(`${count}x ${key}`);
}
console.log('');

const identityKey = item => [
  cleanNit(item.nit) || normalize(item.company),
  normTax(item.taxType),
  normalize(item.period),
  item.year || String(item.dueDate || '').slice(0, 4),
].join('|');

const buckets = new Map();
for (const item of obligations) {
  const key = identityKey(item);
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(item);
}

console.log(`Obligaciones: ${obligations.length} | Con proyectado: ${projected.length}`);
for (const item of projected) {
  const company = item.companyId ? companies.get(item.companyId) : null;
  const companyIdIssue = item.companyId && !company
    ? 'companyId inexistente'
    : company && cleanNit(company.nit) && cleanNit(item.nit) !== cleanNit(company.nit)
      ? `companyId apunta a ${company.name}`
      : '';
  const duplicates = buckets.get(identityKey(item)) ?? [];
  const excludedTaxTypes = settings.get(item.companyId)?.excludedTaxTypes ?? [];
  console.log(JSON.stringify({
    id: item.id,
    company: item.company,
    companyId: item.companyId || '',
    taxType: item.taxType,
    period: item.period,
    dueDate: item.dueDate,
    projected: item.projected,
    status: item.status || '',
    hiddenByCompanySettings: excludedTaxTypes.includes(item.taxType),
    duplicateCount: duplicates.length,
    duplicateIds: duplicates.map(value => value.id),
    companyIdIssue,
  }));
}
