const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccount.json");
const readline = require("readline");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

async function deleteCollection(colName, batchSize = 400) {
  const col = db.collection(colName);
  let deleted = 0;
  while (true) {
    const snap = await col.limit(batchSize).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.docs.length;
    process.stdout.write(`\r  Eliminados: ${deleted}`);
  }
  console.log(`\r  ✓ ${deleted} documentos eliminados de "${colName}"`);
  return deleted;
}

async function main() {
  console.log("\n════════════════════════════════════════");
  console.log("  ELIMINAR USUARIOS — Proyecto: nelyoda");
  console.log("════════════════════════════════════════\n");

  // Contar usuarios actuales
  const count = (await db.collection("users").count().get()).data().count;
  console.log(`  Usuarios en Firestore: ${count}`);
  console.log("\n  ⚠️  Esta acción eliminará:");
  console.log("      • Todos los usuarios");
  console.log("      • Todos los movimientos (ingresos/retiros/estadísticas)");
  console.log("      Las empresas, proyectos y comunicados NO se tocan.\n");

  const confirm1 = await ask("  ¿Continuar? Escribe SI para confirmar: ");
  if (confirm1.trim().toUpperCase() !== "SI") {
    console.log("\n  Cancelado.\n");
    rl.close();
    return;
  }

  const confirm2 = await ask("  Confirma de nuevo escribiendo ELIMINAR: ");
  if (confirm2.trim().toUpperCase() !== "ELIMINAR") {
    console.log("\n  Cancelado.\n");
    rl.close();
    return;
  }

  console.log("\n  Eliminando usuarios...");
  await deleteCollection("users");

  console.log("  Eliminando movimientos (ingresos/retiros)...");
  await deleteCollection("movements");

  console.log("\n  ✅ Listo. Ya puedes subir el Excel desde la plataforma.");
  console.log("════════════════════════════════════════\n");
  rl.close();
}

main().catch((e) => {
  console.error("\n  ❌ Error:", e.message);
  rl.close();
  process.exit(1);
});
