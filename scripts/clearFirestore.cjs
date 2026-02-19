const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccount.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function deleteCollection(name) {
  let total = 0;
  let snap = await db.collection(name).limit(500).get();

  while (!snap.empty) {
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    total += snap.size;
    console.log(`  ...${total} eliminados de ${name}`);
    snap = await db.collection(name).limit(500).get();
  }

  console.log(`🗑️  ${name}: ${total} documentos eliminados en total`);
  return total;
}

async function run() {
  console.log("========== BORRANDO FIRESTORE ==========\n");
  await deleteCollection("users");
  await deleteCollection("movements");
  console.log("\n✅ Firestore limpio.");
}

run().catch(console.error);
