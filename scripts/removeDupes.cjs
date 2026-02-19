const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccount.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function run() {
  const snap = await db.collection("users").get();
  console.log("Total docs:", snap.size);

  // Agrupar por email
  const byEmail = {};
  snap.docs.forEach((doc) => {
    const email = doc.data().email || "sin-email";
    if (!byEmail[email]) byEmail[email] = [];
    byEmail[email].push(doc);
  });

  let deleted = 0;

  for (const [email, docs] of Object.entries(byEmail)) {
    if (docs.length <= 1) continue;

    // Verificar cuál tiene Auth UID
    let authDoc = null;
    let otherDocs = [];

    for (const doc of docs) {
      try {
        await admin.auth().getUser(doc.id);
        authDoc = doc;
      } catch {
        otherDocs.push(doc);
      }
    }

    if (authDoc) {
      // Mantener el de Auth, borrar los otros
      // Pero primero mergear la data del nuevo al de Auth (por si tiene data más completa del Excel)
      const newData = otherDocs[0] ? otherDocs[0].data() : null;
      if (newData) {
        // Mergear data del Excel al doc con Auth UID
        await db.collection("users").doc(authDoc.id).set(newData, { merge: true });
        // Asegurar que el id/uid sean correctos
        await db.collection("users").doc(authDoc.id).update({ id: authDoc.id, uid: authDoc.id });
      }
      // Borrar los duplicados sin Auth
      for (const doc of otherDocs) {
        await doc.ref.delete();
        deleted++;
      }
    } else {
      // Ninguno tiene Auth, mantener el primero y borrar el resto
      for (let i = 1; i < docs.length; i++) {
        await docs[i].ref.delete();
        deleted++;
      }
    }
  }

  const finalSnap = await db.collection("users").get();
  console.log("Duplicados eliminados:", deleted);
  console.log("Total docs final:", finalSnap.size);
}

run().catch(console.error);
