/**
 * Importa empresas desde los datos de usuarios en Firestore.
 * Extrae nombres únicos de empresa + NIT del archivo retirados_data.json
 * y crea documentos en la colección 'companies'.
 *
 * Uso: node importCompanies.cjs
 */
const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const serviceAccount = require("./serviceAccount.json");
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  // 1) Extraer mapeo empresa → NIT desde retirados_data.json
  const nitMap = {};
  const regionalMap = {};
  const jsonPath = path.join(__dirname, "retirados_data.json");
  if (fs.existsSync(jsonPath)) {
    const retirados = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    for (const p of retirados) {
      if (p.empresa && !nitMap[p.empresa]) {
        // Buscar NIT en los datos originales del Excel
        // Los NITs los tenemos en el shared strings del Excel:
        // INTEEGRA S.A.S BIC → 900550189-7
        // TRIANGULUM BPO S.A.S → 900265286-1
        // NETCOL INGENIERÍA S.A.S BIC → 901193667-8
        nitMap[p.empresa] = null; // se llenará abajo
        regionalMap[p.empresa] = p.regional || "";
      }
    }
    console.log(`📋 Empresas en retirados_data.json: ${Object.keys(nitMap).join(", ")}`);
  }

  // NITs conocidos (extraídos del Excel)
  const knownNits = {
    "INTEEGRA S.A.S BIC": "900550189-7",
    "TRIANGULUM BPO S.A.S": "900265286-1",
    "NETCOL INGENIERÍA S.A.S BIC": "901193667-8",
  };

  // 2) Leer usuarios de Firestore y extraer empresas únicas
  console.log("🔍 Leyendo usuarios de Firestore...");
  const usersSnap = await db.collection("users").get();
  console.log(`   Total usuarios: ${usersSnap.size}`);

  const companiesMap = {}; // name → { nit, regional, activeCount, retiredCount }

  for (const doc of usersSnap.docs) {
    const u = doc.data();
    const company = u.contractInfo?.assignment?.company;
    if (!company) continue;

    if (!companiesMap[company]) {
      companiesMap[company] = {
        name: company,
        nit: knownNits[company] || nitMap[company] || "",
        regional: u.contractInfo?.assignment?.location || regionalMap[company] || "",
        baseDeOperacion: "",
        activeCount: 0,
        retiredCount: 0,
      };
    }

    if (u.role === "colaborador") companiesMap[company].activeCount++;
    else if (u.role === "excolaborador") companiesMap[company].retiredCount++;
  }

  const companyList = Object.values(companiesMap);
  console.log(`\n📊 Empresas encontradas (${companyList.length}):`);
  for (const c of companyList) {
    console.log(`   ${c.name} | NIT: ${c.nit || "—"} | Activos: ${c.activeCount} | Retirados: ${c.retiredCount}`);
  }

  // 3) Verificar cuáles ya existen en Firestore
  const existingSnap = await db.collection("companies").get();
  const existingNames = new Set(existingSnap.docs.map(d => d.data().name));
  console.log(`\n🏢 Ya existen en 'companies': ${existingNames.size}`);

  // 4) Crear las que no existen
  let created = 0;
  let skipped = 0;

  for (const c of companyList) {
    if (existingNames.has(c.name)) {
      skipped++;
      continue;
    }

    await db.collection("companies").add({
      name: c.name,
      nit: c.nit || "",
      regional: c.regional || "",
      baseDeOperacion: c.baseDeOperacion || "",
      address: "",
      phone: "",
      email: "",
      logo: "",
      active: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    created++;
    console.log(`   ✅ Creada: ${c.name}`);
  }

  console.log("\n========== RESUMEN ==========");
  console.log(`Empresas creadas:  ${created}`);
  console.log(`Ya existían:       ${skipped}`);
  console.log("✅ Importación completada.");
  process.exit(0);
}

run().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
