const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccount.json");
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

const search = (process.argv[2] || "pinto").toLowerCase();

async function run() {
  const snap = await db.collection("users").get();
  snap.docs.forEach((doc) => {
    const d = doc.data();
    if (d.fullName && d.fullName.toLowerCase().includes(search)) {
      const start = d.contractInfo?.contract?.startDate;
      const dateStr = start?.toDate ? start.toDate() : start;
      console.log("USER:", d.fullName);
      console.log("  email:", d.email);
      console.log("  project:", d.contractInfo?.assignment?.project);
      console.log("  company:", d.contractInfo?.assignment?.company);
      console.log("  startDate:", dateStr);
      console.log("  role:", d.role);
      console.log("");
    }
  });

  const movSnap = await db.collection("movements").get();
  movSnap.docs.forEach((doc) => {
    const d = doc.data();
    if (d.userName && d.userName.toLowerCase().includes(search)) {
      const dateStr = d.date?.toDate ? d.date.toDate() : d.date;
      console.log("MOVEMENT:", d.userName);
      console.log("  type:", d.type);
      console.log("  project:", d.project);
      console.log("  company:", d.company);
      console.log("  date:", dateStr);
      console.log("");
    }
  });
}
run().catch(console.error);
