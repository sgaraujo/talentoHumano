/**
 * fixNits.cjs
 * Corrige NITs incorrectos en la colección tax_obligations de Firestore.
 * Solo modifica el campo `nit`, no toca ningún otro campo (status, paidAt, stepOwners, etc.)
 *
 * Uso:
 *   node scripts/fixNits.cjs          → modo simulación (muestra qué cambiaría)
 *   node scripts/fixNits.cjs --run    → ejecuta los cambios en Firestore
 */

const admin = require('firebase-admin');
const path = require('path');

const DRY_RUN = !process.argv.includes('--run');

const serviceAccount = require(path.join(__dirname, 'serviceAccount.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const COLLECTION = 'tax_obligations';

// Mapa de correcciones: { company, wrongNit } → correctNit
// Basado en CompaniesPage.tsx como fuente de verdad
const FIXES = [
  { company: 'Inteegra SAS BIC',                     wrongNit: '901193667', correctNit: '900550189' },
  { company: 'Triangulum BPO SAS',                   wrongNit: '900550189', correctNit: '900265286' },
  { company: 'ITAC Colombia SAS',                    wrongNit: '900265286', correctNit: '901432693' },
  { company: 'Consorcio SCIA Netcol',                wrongNit: '901432693', correctNit: '901419833' },
  { company: 'Inversiones EON SAS',                  wrongNit: '901419833', correctNit: '901271083' },
  { company: 'Newstar SAS',                          wrongNit: '901271083', correctNit: '901269033' },
  { company: 'LOGISTICA EMPRESARIAL DE TRANSPORTE',  wrongNit: '901269033', correctNit: '901264922' },
  { company: 'Netia SAS',                            wrongNit: '901264922', correctNit: '901259735' },
  { company: 'Newforce SAS',                         wrongNit: '901259735', correctNit: '901311778' },
  { company: 'Unión Temporal Fomento TIC',           wrongNit: '901311778', correctNit: '901834909' },
  { company: 'Unión Temporal Tecnología EIP',        wrongNit: '901834909', correctNit: '901817890' },
  { company: 'Unión Temporal Itac Colombia',         wrongNit: '901817890', correctNit: '901351139' },
  { company: 'Unión Temporal Itac Colombia',         wrongNit: '901943575', correctNit: '901351139' },
];

async function main() {
  console.log(`\n🔍 Modo: ${DRY_RUN ? 'SIMULACIÓN (sin cambios)' : '✅ EJECUCIÓN REAL'}\n`);

  let totalFound = 0;
  let totalUpdated = 0;

  for (const { company, wrongNit, correctNit } of FIXES) {
    const snap = await db.collection(COLLECTION)
      .where('company', '==', company)
      .where('nit', '==', wrongNit)
      .get();

    if (snap.empty) {
      console.log(`  ✓ ${company} NIT ${wrongNit} → sin documentos que corregir`);
      continue;
    }

    totalFound += snap.size;
    console.log(`  ⚠️  ${company}: ${snap.size} docs con NIT ${wrongNit} → se cambian a ${correctNit}`);

    if (!DRY_RUN) {
      // Escribir en batches de máximo 400 para no superar el límite de Firestore
      const chunks = [];
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 400) {
        chunks.push(docs.slice(i, i + 400));
      }

      for (const chunk of chunks) {
        const batch = db.batch();
        for (const docSnap of chunk) {
          batch.update(docSnap.ref, { nit: correctNit });
        }
        await batch.commit();
        totalUpdated += chunk.length;
      }
    }
  }

  console.log(`\n─────────────────────────────────────────`);
  console.log(`Documentos encontrados con NIT incorrecto: ${totalFound}`);
  if (DRY_RUN) {
    console.log(`Documentos que se actualizarían: ${totalFound}`);
    console.log(`\n💡 Para ejecutar los cambios: node scripts/fixNits.cjs --run\n`);
  } else {
    console.log(`Documentos actualizados: ${totalUpdated}`);
    console.log(`\n✅ Migración completada.\n`);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
