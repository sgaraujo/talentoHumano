const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccount.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function run() {
  const snap = await db.collection("users").get();
  console.log("Total docs en Firestore:", snap.size);

  const byEmail = {};
  snap.docs.forEach((doc) => {
    const email = doc.data().email || "sin-email";
    if (!byEmail[email]) byEmail[email] = [];
    byEmail[email].push(doc.id);
  });

  const dupes = Object.entries(byEmail).filter(([, ids]) => ids.length > 1);
  console.log("Emails duplicados:", dupes.length);
  dupes.slice(0, 10).forEach(([email, ids]) => {
    console.log("  ", email, "->", ids);
  });
}
run().catch(console.error);
