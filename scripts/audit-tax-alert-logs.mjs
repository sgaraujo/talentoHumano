/** Auditoría de solo lectura del último corte de alertas tributarias. */
import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(here, 'serviceAccount.json'), 'utf8'));
let app;
try { app = getApp(); } catch { app = initializeApp({ credential: cert(serviceAccount) }); }
const db = getFirestore(app);

const snap = await db.collection('accounting/data/tax_alerts').get();
const logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
const latestDate = logs.reduce((latest, item) => item.sentDate > latest ? item.sentDate : latest, '');
const latest = logs.filter(item => item.sentDate === latestDate);
const required = ['obligationId', 'companyId', 'company', 'nit', 'taxType', 'dueDate', 'source', 'recipientEmails'];
const incomplete = latest.filter(item => required.some(field => {
  const value = item[field];
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}));
const duplicateKeys = new Map();
for (const item of latest) {
  const key = item.key ?? `${item.obligationId}|${item.sentDate}`;
  duplicateKeys.set(key, (duplicateKeys.get(key) ?? 0) + 1);
}
const duplicates = [...duplicateKeys].filter(([, count]) => count > 1);
const sources = latest.reduce((counts, item) => {
  const source = item.source ?? '(legacy)';
  counts[source] = (counts[source] ?? 0) + 1;
  return counts;
}, {});

console.log(JSON.stringify({
  latestDate,
  total: latest.length,
  sources,
  incomplete: incomplete.map(item => ({ id: item.id, obligationId: item.obligationId, company: item.company })),
  duplicateKeys: duplicates,
  recipients: [...new Set(latest.flatMap(item => item.recipientEmails ?? []))].sort(),
}, null, 2));
