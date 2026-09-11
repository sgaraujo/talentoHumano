/**
 * diagnose-boletin-mayo.mjs
 * Diagnostica por qué un comunicado (boletín) muestra 0% de "envío exitoso".
 *
 * Uso: node scripts/diagnose-boletin-mayo.mjs "mundial de futbol"
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(readFileSync(join(__dirname, 'serviceAccount.json'), 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const norm = (s = '') => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const query = process.argv[2] || 'mundial de futbol';
const qNorm = norm(query);

async function main() {
  const commsSnap = await db.collection('communications/data/messages').get();
  const matches = commsSnap.docs.filter(d => norm(d.data().title ?? '').includes(qNorm));

  console.log(`\n=== Comunicados que coinciden con "${query}" (${matches.length}) ===`);
  for (const d of matches) {
    const c = d.data();
    console.log(`\n--- id=${d.id} ---`);
    console.log(`título: "${c.title}"`);
    console.log(`status: ${c.status} | senderKey: ${c.senderKey ?? 'default'} | totalSent: ${c.totalSent} | totalRead: ${c.totalRead}`);
    console.log(`sentAt: ${c.sentAt?.toDate?.() ?? c.sentAt}`);

    const recSnap = await db.collection('communications/data/recipients')
      .where('communicationId', '==', d.id).get();
    const recs = recSnap.docs.map(rd => rd.data());
    console.log(`destinatarios: ${recs.length}`);

    const byStatus = {};
    for (const r of recs) {
      const s = r.emailStatus || '(sin campo)';
      byStatus[s] = (byStatus[s] ?? 0) + 1;
    }
    console.log('desglose por emailStatus:', byStatus);

    const withError = recs.filter(r => r.emailError);
    if (withError.length > 0) {
      console.log(`\nErrores reportados (${withError.length}):`);
      const errCounts = {};
      for (const r of withError) {
        errCounts[r.emailError] = (errCounts[r.emailError] ?? 0) + 1;
      }
      for (const [err, count] of Object.entries(errCounts)) {
        console.log(`  [x${count}] ${err}`);
      }
      console.log('\nEjemplo de destinatario fallido:', JSON.stringify(withError[0], null, 2));
    }
  }
}

main().catch(console.error).finally(() => process.exit());
