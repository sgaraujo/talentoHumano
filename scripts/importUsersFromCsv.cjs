const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

// ✅ Cambia este delimitador según tu CSV: "," o ";"
const DELIMITER = ";";

// ---------- helpers ----------
function cleanText(v) {
  return String(v ?? "")
    .replace(/\uFEFF/g, "") // BOM
    .replace(/[\r\n\t]/g, " ")
    .trim();
}

function cleanEmail(v) {
  return cleanText(v)
    .replace(/^"+|"+$/g, "") // quita comillas al inicio/fin
    .replace(/\s+/g, "") // quita espacios dentro
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

function tempPassword() {
  return "Temp@" + Math.random().toString(36).slice(2, 10) + "9!";
}

// ---------- firebase admin ----------
const serviceAccount = require("./serviceAccount.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function run() {
  const csvPath = path.join(__dirname, "usuarios.csv");
  const csvText = fs.readFileSync(csvPath, "utf8");
  const rows = parseCsv(csvText);

  console.log("Headers detectados:", Object.keys(rows[0] || {}));
  console.log("Registros CSV:", rows.length);

  const invalidEmails = [];
  let created = 0;
  let existed = 0;
  let skipped = 0;

  for (const r of rows) {
    const nombre = cleanText(r["Nombre"]);
    const identificacion = cleanText(r["Identificación"] || r["Identificacion"]);

    // ✅ OJO: según tus headers, aquí está el correo:
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

    let userRecord;

    // 1) Crear o recuperar en Auth
    try {
      userRecord = await admin.auth().getUserByEmail(email);
      existed++;
      console.log("✅ Auth ya existe:", email, "uid:", userRecord.uid);
    } catch {
      const pass = tempPassword();
      userRecord = await admin.auth().createUser({
        email,
        password: pass,
        displayName: nombre || email,
      });
      created++;
      console.log("🆕 Auth creado:", email, "uid:", userRecord.uid);
    }

    const uid = userRecord.uid;

    // 2) Guardar en Firestore con docId = uid
    await db.collection("users").doc(uid).set(
      {
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
      },
      { merge: true }
    );
  }

  // reporte
  fs.writeFileSync(
    path.join(__dirname, "invalid_emails.json"),
    JSON.stringify(invalidEmails, null, 2),
    "utf8"
  );

  console.log("✅ Importación completada.");
  console.log("Resumen:", { created, existed, skipped, invalidEmails: invalidEmails.length });
  console.log("📄 Reporte generado:", path.join(__dirname, "invalid_emails.json"));
}

run().catch(console.error);
