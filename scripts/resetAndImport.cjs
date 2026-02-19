const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const DELIMITER = ";";

// ---------- helpers ----------
function cleanText(v) {
  return String(v ?? "")
    .replace(/\uFEFF/g, "")
    .replace(/[\r\n\t]/g, " ")
    .trim();
}

function cleanEmail(v) {
  return cleanText(v)
    .replace(/^"+|"+$/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(DELIMITER).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(DELIMITER);
    const obj = {};
    headers.forEach((h, i) => (obj[h] = (cols[i] ?? "").trim()));
    return obj;
  });
}

// ---------- firebase admin ----------
const serviceAccount = require("./serviceAccount.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function deleteCollection(collectionName) {
  const snap = await db.collection(collectionName).get();
  if (snap.empty) {
    console.log(`📭 ${collectionName}: vacía, nada que borrar`);
    return 0;
  }

  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  console.log(`🗑️  ${collectionName}: ${snap.size} documentos eliminados`);
  return snap.size;
}

async function run() {
  // ====== PASO 1: Borrar colecciones ======
  console.log("\n========== BORRANDO COLECCIONES ==========\n");
  await deleteCollection("users");
  await deleteCollection("movements");

  // ====== PASO 2: Re-importar usuarios del CSV ======
  console.log("\n========== IMPORTANDO USUARIOS ==========\n");

  const csvPath = path.join(__dirname, "usuarios.csv");
  const csvText = fs.readFileSync(csvPath, "utf8");
  const rows = parseCsv(csvText);

  console.log("Headers detectados:", Object.keys(rows[0] || {}));
  console.log("Registros CSV:", rows.length);

  const invalidEmails = [];
  let created = 0;
  let skipped = 0;

  for (const r of rows) {
    const nombre = cleanText(r["Nombre"]);
    const identificacion = cleanText(r["Identificación"] || r["Identificacion"]);
    const emailRaw = r["Correo electronico corporativo"];
    const email = cleanEmail(emailRaw);

    if (!email) {
      skipped++;
      console.log("⚠️ Saltando (sin email):", nombre, identificacion);
      continue;
    }

    if (!isValidEmail(email)) {
      skipped++;
      console.log("⚠️ Saltando (email inválido):", nombre, "=>", emailRaw);
      invalidEmails.push({ nombre, identificacion, emailRaw });
      continue;
    }

    // Buscar uid en Auth (ya existe porque solo borramos Firestore)
    let uid;
    try {
      const userRecord = await admin.auth().getUserByEmail(email);
      uid = userRecord.uid;
    } catch {
      // Si por alguna razón no existe en Auth, crear
      const pass = "Temp@" + Math.random().toString(36).slice(2, 10) + "9!";
      const userRecord = await admin.auth().createUser({
        email,
        password: pass,
        displayName: nombre || email,
      });
      uid = userRecord.uid;
      console.log("🆕 Auth creado (no existía):", email);
    }

    await db.collection("users").doc(uid).set({
      id: uid,
      uid,
      role: "colaborador",
      email,
      fullName: nombre || "",
      profileCompleted: false,
      completedOnboardings: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),

      personalData: {
        documentNumber: identificacion || "",
        fullName: nombre || "",
        phone: cleanText(r["Celular personal"] || r["Celular persona"]),
      },

      location: {
        city: cleanText(r["Municipio o ciudad"]),
        neighborhood: cleanText(r["Barrio"]),
        address: cleanText(r["Dirección"] || r["Direccion"]),
        corporatePhone: cleanText(r["Celular corporativo"]),
      },

      extraPhones: {
        telefonoFijo: cleanText(r["Teléfono fijo"] || r["Telefono fijo"]),
      },
    });

    created++;
    console.log(`✅ [${created}] ${nombre} (${email})`);
  }

  // Reporte
  fs.writeFileSync(
    path.join(__dirname, "invalid_emails.json"),
    JSON.stringify(invalidEmails, null, 2),
    "utf8"
  );

  console.log("\n========== RESUMEN ==========");
  console.log(`Usuarios creados: ${created}`);
  console.log(`Saltados: ${skipped}`);
  console.log(`Emails inválidos: ${invalidEmails.length}`);
  console.log("✅ Reset e importación completados.");
}

run().catch(console.error);
