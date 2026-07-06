/**
 * cleanDuplicateCompanies.cjs
 * Para cada par (variante / canónico) con mismo taxType + period:
 *
 *  A) Variante CON datos  + canónico SIN datos → renombrar variante, borrar canónico
 *  B) Variante SIN datos  + canónico CON datos → borrar variante
 *  C) Variante SIN datos  + canónico SIN datos → borrar variante
 *  D) Ambos CON datos                          → CONFLICTO, no se toca
 *  E) No existe canónico                       → solo renombrar variante
 *
 * Uso:
 *   node scripts/cleanDuplicateCompanies.cjs        → simulación
 *   node scripts/cleanDuplicateCompanies.cjs --run  → ejecuta en Firestore
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const DRY_RUN = !process.argv.includes('--run');
const serviceAccount = require(path.join(__dirname, 'serviceAccount.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const VARIANT_TO_CANONICAL = {
  "INVERSIONES EON S.A.S":          "Inversiones EON SAS",
  "INTEEGRA S.A.S BIC":             "Inteegra SAS BIC",
  "INTEEGRA CONTRATISTA":           "Inteegra SAS BIC",
  "ITAC COLOMBIA S.A.S":            "ITAC Colombia SAS",
  "NETCOL INGENIERÍA S.A.S BIC":    "Netcol Ingeniería SAS BIC",
  "NEWFORCE SAS":                   "Newforce SAS",
  "UNIÓN TEMPORAL INTERNUQUI":      "Unión Temporal Internuqui",
  "TRIANGULUM BPO S.A.S":           "Triangulum BPO SAS",
  "CONSORCIO SCIA NETCOL":          "Consorcio SCIA Netcol",
  "NEWSTAR SAS":                    "Newstar SAS",
  "NETIA S.A.S":                    "Netia SAS",
  "PLEX DE COLOMBIA S.A.S":         "Plex de Colombia SAS",
  "UNIÓN TEMPORAL TECNOLOGÍA EIP":  "Unión Temporal Tecnología EIP",
  "UNIÓN TEMPORAL FOMENTO TIC":     "Unión Temporal Fomento TIC",
};

const USER_FIELDS = ['status', 'stepOwners', 'paidAt', 'proyectado', 'pagado'];

function hasUserData(data) {
  if (data.status && data.status !== 'No iniciado') return true;
  if (data.paidAt) return true;
  if (data.proyectado != null) return true;
  if (data.pagado != null) return true;
  if (data.stepOwners && Object.keys(data.stepOwners).length > 0) return true;
  return false;
}

function describe(data) {
  const parts = [];
  if (data.status) parts.push(`status: ${data.status}`);
  if (data.proyectado != null) parts.push(`proyectado: ${data.proyectado}`);
  if (data.pagado != null) parts.push(`pagado: ${data.pagado}`);
  if (data.paidAt) parts.push(`paidAt: ${data.paidAt}`);
  if (data.stepOwners) {
    const s = Object.keys(data.stepOwners);
    if (s.length) parts.push(`pasos: ${s.join(', ')}`);
  }
  return parts.join(' | ') || 'sin datos';
}

async function main() {
  console.log(`\n🔍 Modo: ${DRY_RUN ? 'SIMULACIÓN (sin cambios)' : '✅ EJECUCIÓN REAL'}\n`);

  const snap = await db.collection('tax_obligations').get();

  // Indexar todos los docs por company||taxType||period
  const byKey = new Map();
  for (const doc of snap.docs) {
    const d = doc.data();
    const key = `${d.company}||${d.taxType}||${d.period ?? ''}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ id: doc.id, ref: doc.ref, data: d });
  }

  // ops: { type: 'update'|'delete', ref, data? }
  const ops = [];
  const conflicts = [];

  for (const doc of snap.docs) {
    const vData = doc.data();
    const variantName = vData.company || '';
    const canonical = VARIANT_TO_CANONICAL[variantName];
    if (!canonical) continue;

    const canonKey = `${canonical}||${vData.taxType}||${vData.period ?? ''}`;
    const canonDocs = byKey.get(canonKey) || [];
    const vHasData = hasUserData(vData);

    if (canonDocs.length === 0) {
      // Caso E: no existe canónico → solo renombrar
      console.log(`✏️  [E] "${variantName}" → "${canonical}" | ${vData.taxType} / ${vData.period}`);
      ops.push({ type: 'update', ref: doc.ref, data: { company: canonical } });
      continue;
    }

    const cDoc = canonDocs[0];
    const cHasData = hasUserData(cDoc.data);

    if (vHasData && !cHasData) {
      // Caso A: variante tiene datos, canónico vacío → renombrar variante, borrar canónico
      console.log(`♻️  [A] Renombrar "${variantName}" → "${canonical}" + borrar canónico vacío | ${vData.taxType} / ${vData.period}`);
      console.log(`        Datos: ${describe(vData)}`);
      ops.push({ type: 'update', ref: doc.ref, data: { company: canonical } });
      ops.push({ type: 'delete', ref: cDoc.ref });
    } else if (!vHasData) {
      // Caso B/C: variante sin datos → borrar variante
      console.log(`🗑️  [B/C] Borrar variante sin datos "${variantName}" | ${vData.taxType} / ${vData.period}`);
      ops.push({ type: 'delete', ref: doc.ref });
    } else {
      // Caso D: ambos tienen datos → conflicto
      conflicts.push({ variantName, canonical, taxType: vData.taxType, period: vData.period, vData, cData: cDoc.data });
    }
  }

  if (conflicts.length) {
    console.log(`\n⛔  CONFLICTOS — ambos tienen datos (${conflicts.length}), no se tocan:`);
    for (const c of conflicts) {
      console.log(`  "${c.variantName}" | ${c.taxType} / ${c.period}`);
      console.log(`    Variante:  ${describe(c.vData)}`);
      console.log(`    Canónico:  ${describe(c.cData)}`);
    }
  }

  console.log(`\nOperaciones a ejecutar: ${ops.length} | Conflictos: ${conflicts.length}\n`);

  if (DRY_RUN) {
    console.log(`💡 Para ejecutar: node scripts/cleanDuplicateCompanies.cjs --run\n`);
    return;
  }

  // Backup de todos los docs afectados antes de cualquier cambio
  const backupData = ops
    .filter(op => op.type === 'update')
    .map(op => {
      const docRef = op.ref;
      const fullDoc = snap.docs.find(d => d.ref.path === docRef.path);
      return { id: fullDoc.id, path: docRef.path, ...fullDoc.data() };
    });
  const backupFile = path.join(__dirname, `backup_variants_${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
  console.log(`💾 Backup guardado en: ${backupFile}\n`);

  const chunks = [];
  for (let i = 0; i < ops.length; i += 400) chunks.push(ops.slice(i, i + 400));

  let done = 0;
  for (const chunk of chunks) {
    const batch = db.batch();
    for (const op of chunk) {
      if (op.type === 'update') batch.update(op.ref, op.data);
      else batch.delete(op.ref);
    }
    await batch.commit();
    done += chunk.length;
  }

  console.log(`✅ Operaciones ejecutadas: ${done}\n`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
