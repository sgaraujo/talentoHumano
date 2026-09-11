/**
 * fix-pending-but-read-comms.mjs
 * Corrige destinatarios de comunicados que quedaron en emailStatus "pending"
 * (o sin el campo) pero tienen evidencia real de que el correo llegó: abrieron
 * el enlace (readAt), hicieron clic en el CTA (ctaClickedAt) o confirmaron
 * lectura (ackAt). Si alguna de esas tres marcas de tiempo existe, el correo
 * necesariamente se entregó, así que se corrige emailStatus a "sent".
 *
 * No toca destinatarios en "pending" sin ninguna prueba de lectura — esos
 * siguen sin evidencia de si el envío ocurrió o no.
 *
 * Uso:
 *   node scripts/fix-pending-but-read-comms.mjs            → dry-run (solo reporta)
 *   node scripts/fix-pending-but-read-comms.mjs --apply    → aplica los cambios
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

const APPLY = process.argv.includes('--apply');

async function main() {
  const [commsSnap, recsSnap] = await Promise.all([
    db.collection('communications/data/messages').get(),
    db.collection('communications/data/recipients').get(),
  ]);
  const titleById = new Map(commsSnap.docs.map(d => [d.id, d.data().title]));

  const toFix = recsSnap.docs.filter(d => {
    const r = d.data();
    const status = r.emailStatus || 'pending';
    if (status !== 'pending') return false;
    return !!(r.readAt || r.ctaClickedAt || r.ackAt);
  });

  console.log(`Total destinatarios: ${recsSnap.size}`);
  console.log(`Destinatarios en "pending" con evidencia de lectura/clic/confirmación: ${toFix.length}\n`);

  const byComm = new Map();
  for (const d of toFix) {
    const r = d.data();
    const key = r.communicationId ?? '(sin comunicado)';
    if (!byComm.has(key)) byComm.set(key, []);
    byComm.get(key).push(r);
  }

  console.log('=== Desglose por comunicado ===');
  for (const [commId, recs] of byComm.entries()) {
    console.log(`- "${titleById.get(commId) ?? '(eliminado)'}" (${commId}): ${recs.length} destinatario(s) a corregir`);
  }

  if (!APPLY) {
    console.log('\n(dry-run — no se modificó nada. Ejecuta con --apply para aplicar los cambios)');
    return;
  }

  console.log('\nAplicando correcciones...');
  const BATCH_SIZE = 400;
  let updated = 0;
  for (let i = 0; i < toFix.length; i += BATCH_SIZE) {
    const chunk = toFix.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const d of chunk) {
      batch.update(d.ref, { emailStatus: 'sent', emailStatusFixedAt: new Date(), emailStatusFixReason: 'pending-with-read-proof' });
    }
    await batch.commit();
    updated += chunk.length;
    console.log(`  ${updated}/${toFix.length} actualizados...`);
  }

  console.log(`\nListo. ${updated} destinatario(s) corregidos a emailStatus: "sent" en ${byComm.size} comunicado(s).`);
}

main().catch(console.error).finally(() => process.exit());
