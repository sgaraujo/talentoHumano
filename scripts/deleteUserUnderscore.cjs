const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccount.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function run() {
  const snap = await db.collection("users").get();
  let deleted = 0;

  for (const doc of snap.docs) {
    if (doc.id.startsWith("user_")) {
      await doc.ref.delete();
      deleted++;
      console.log("🗑️ Eliminado:", doc.id);
    }
  }

  console.log("✅ Total eliminados:", deleted);
}

run().catch(console.error);
