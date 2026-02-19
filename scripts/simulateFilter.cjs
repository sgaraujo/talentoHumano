const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccount.json");
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  // Simular exactamente lo que hace getRotationMetrics con filtros:
  // año: 2024, mes: undefined (todos), empresa: NETCOL..., proyecto: SENA

  const usersSnap = await db.collection("users").get();
  const allUsers = usersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const movSnap = await db.collection("movements").get();
  let movements = movSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      date: data.date?.toDate ? data.date.toDate() : new Date(data.date),
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
    };
  });

  console.log("Total movements antes de filtrar:", movements.length);

  // Filtro empresa
  const empresa = "NETCOL INGENIERÍA S.A.S BIC";
  const matchingUsersEmpresa = allUsers.filter(
    (u) => u.contractInfo?.assignment?.company === empresa
  );
  const matchingIdsEmpresa = new Set(matchingUsersEmpresa.map((u) => u.id));

  console.log("\nUsuarios con empresa exacta:", matchingUsersEmpresa.length);
  console.log("Movements con m.company === empresa:", movements.filter(m => m.company === empresa).length);
  console.log("Movements con userId en matchingIds:", movements.filter(m => matchingIdsEmpresa.has(m.userId)).length);

  // Verificar si hay diferencia sutil en el string
  const empresasEnMovements = [...new Set(movements.map(m => m.company))];
  const empresasEnUsers = [...new Set(allUsers.map(u => u.contractInfo?.assignment?.company).filter(Boolean))];
  console.log("\nEmpresas únicas en movements:");
  empresasEnMovements.forEach(e => console.log(`  [${e}] (length: ${e?.length})`));
  console.log("\nEmpresas únicas en users:");
  empresasEnUsers.forEach(e => console.log(`  [${e}] (length: ${e?.length})`));

  // Ahora filtrar
  movements = movements.filter(
    (m) => m.company === empresa || matchingIdsEmpresa.has(m.userId)
  );
  console.log("\nMovements después de filtro empresa:", movements.length);

  // Filtro proyecto
  const proyecto = "SENA";
  const matchingUsersProyecto = allUsers.filter(
    (u) => u.contractInfo?.assignment?.project === proyecto
  );
  const matchingIdsProyecto = new Set(matchingUsersProyecto.map((u) => u.id));

  console.log("Movements con m.project === proyecto:", movements.filter(m => m.project === proyecto).length);

  movements = movements.filter(
    (m) => m.project === proyecto || matchingIdsProyecto.has(m.userId)
  );
  console.log("Movements después de filtro proyecto:", movements.length);

  // Filtro año
  const currentYear = 2024;
  const ingresos = movements.filter((m) => {
    const moveDate = new Date(m.date);
    return m.type === "ingreso" && moveDate.getFullYear() === currentYear;
  });
  console.log("\nIngresos en 2024:", ingresos.length);
  ingresos.forEach((m) => {
    console.log(`  ${m.userName} | ${m.date} | ${m.company} | ${m.project}`);
  });

  // Colaboradores filtrados
  let colaboradores = allUsers.filter((u) => u.role === "colaborador");
  colaboradores = colaboradores.filter(
    (u) => u.contractInfo?.assignment?.company === empresa
  );
  colaboradores = colaboradores.filter(
    (u) => u.contractInfo?.assignment?.project === proyecto
  );
  console.log("\nHeadcount (colaboradores NETCOL + SENA):", colaboradores.length);
}

run().catch(console.error);
