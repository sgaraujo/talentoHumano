const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccount.json");

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  const snap = await db.collection("users").get();
  console.log("Total usuarios:", snap.size);

  let ingresos = 0;
  let retiros = 0;
  let sinFecha = 0;

  for (const doc of snap.docs) {
    const user = doc.data();
    const uid = doc.id;
    const email = user.email || "";
    const name = user.fullName || "";
    const company = user.contractInfo?.assignment?.company || "";
    const project = user.contractInfo?.assignment?.project || "";
    const sede = user.contractInfo?.assignment?.location || "";
    const area = user.contractInfo?.assignment?.area || "";

    // Fecha de ingreso
    const startDate = user.contractInfo?.contract?.startDate;
    if (startDate) {
      const dateObj = startDate.toDate ? startDate.toDate() : new Date(startDate);
      if (!isNaN(dateObj.getTime())) {
        await db.collection("movements").add({
          type: "ingreso",
          userId: uid,
          userName: name,
          userEmail: email,
          date: dateObj,
          company: company || undefined,
          project: project || undefined,
          sede: sede || undefined,
          area: area || undefined,
          createdBy: "import-excel",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        ingresos++;
      } else {
        sinFecha++;
      }
    } else {
      sinFecha++;
    }

    // Fecha de retiro
    const endDate = user.administrativeRecord?.terminationDate;
    if (endDate) {
      const dateObj = endDate.toDate ? endDate.toDate() : new Date(endDate);
      if (!isNaN(dateObj.getTime())) {
        const reason = (user.administrativeRecord?.terminationReason || "").toLowerCase();
        let reasonType = "";
        if (reason.includes("voluntar")) {
          reasonType = "voluntario";
        } else if (reason) {
          reasonType = "involuntario";
        }

        const movement = {
          type: "retiro",
          userId: uid,
          userName: name,
          userEmail: email,
          date: dateObj,
          company: company || undefined,
          project: project || undefined,
          sede: sede || undefined,
          area: area || undefined,
          createdBy: "import-excel",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (reasonType) movement.reason = reasonType;

        const cost = user.salaryInfo?.baseSalary;
        if (cost) movement.cost = cost;

        await db.collection("movements").add(movement);
        retiros++;
      }
    }
  }

  console.log("\n========== RESUMEN ==========");
  console.log("Ingresos generados:", ingresos);
  console.log("Retiros generados:", retiros);
  console.log("Sin fecha de ingreso:", sinFecha);
  console.log("Total movements:", ingresos + retiros);
}

run().catch(console.error);
