const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccount.json");
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  // Buscar usuario con proyecto SENA
  const usersSnap = await db.collection("users").get();
  const senaUsers = [];
  const projects = new Set();

  usersSnap.docs.forEach((doc) => {
    const data = doc.data();
    const project = data.contractInfo?.assignment?.project;
    if (project) projects.add(project);
    if (project && project.toUpperCase().includes("SENA")) {
      senaUsers.push({
        id: doc.id,
        name: data.fullName,
        email: data.email,
        project,
        company: data.contractInfo?.assignment?.company,
        startDate: data.contractInfo?.contract?.startDate,
      });
    }
  });

  console.log("=== PROYECTOS UNICOS ===");
  [...projects].sort().forEach((p) => console.log(" ", p));

  console.log("\n=== USUARIOS EN PROYECTO SENA ===");
  senaUsers.forEach((u) => {
    const date = u.startDate?.toDate ? u.startDate.toDate() : u.startDate;
    console.log(`  ${u.name} | ${u.email} | ${u.project} | ${u.company} | ingreso: ${date}`);
  });

  // Buscar movements con proyecto SENA
  const movSnap = await db.collection("movements").get();
  const senaMov = [];
  movSnap.docs.forEach((doc) => {
    const data = doc.data();
    if (data.project && data.project.toUpperCase().includes("SENA")) {
      senaMov.push({
        id: doc.id,
        type: data.type,
        userName: data.userName,
        project: data.project,
        company: data.company,
        date: data.date?.toDate ? data.date.toDate() : data.date,
        userId: data.userId,
      });
    }
  });

  console.log("\n=== MOVEMENTS CON PROYECTO SENA ===");
  senaMov.forEach((m) => {
    console.log(`  ${m.type} | ${m.userName} | ${m.project} | ${m.company} | ${m.date} | userId: ${m.userId}`);
  });

  console.log("\nTotal movements:", movSnap.size);
}

run().catch(console.error);
