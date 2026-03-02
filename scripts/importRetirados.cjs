/**
 * Importa retirados a Firebase desde retirados_data.json
 *
 * Pasos:
 * 1. Primero ejecuta: python3 extractRetirados.py
 * 2. Luego ejecuta: node importRetirados.cjs
 *
 * Por cada persona:
 * - Crea/actualiza usuario en Firestore con role 'excolaborador'
 * - Crea movimiento de tipo 'retiro' con fecha y mes de retiro
 * - Crea movimiento de tipo 'ingreso' con fecha de ingreso (si existe)
 */
const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

// ---------- Firebase Admin ----------
const serviceAccount = require("./serviceAccount.json");
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// ---------- Helpers ----------
function parseNumber(v) {
  if (!v) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function parseDate(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr + "T12:00:00Z");
  return isNaN(d.getTime()) ? null : d;
}

function removeUndefined(obj) {
  if (obj === null || obj === undefined) return undefined;
  if (typeof obj !== "object" || obj instanceof Date) return obj;
  const cleaned = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== "") {
      const cleanedV = removeUndefined(v);
      if (cleanedV !== undefined) cleaned[k] = cleanedV;
    }
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

// ---------- Main ----------
async function run() {
  const jsonPath = path.join(__dirname, "retirados_data.json");

  if (!fs.existsSync(jsonPath)) {
    console.error("❌ No se encontró retirados_data.json");
    console.error("   Ejecuta primero: python3 extractRetirados.py");
    process.exit(1);
  }

  const people = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  console.log(`📊 Personas a importar: ${people.length}`);

  let createdUsers = 0;
  let createdRetiros = 0;
  let createdIngresos = 0;
  let skipped = 0;
  let errors = 0;

  for (const p of people) {
    try {
      if (!p.nombre) {
        skipped++;
        continue;
      }

      // Buscar si ya existe el usuario en Firestore por cédula o email
      let uid = null;

      // Intentar encontrar por email
      if (p.email) {
        try {
          const authUser = await admin.auth().getUserByEmail(p.email);
          uid = authUser.uid;
        } catch {
          // No existe en Auth
        }
      }

      // Si no, buscar en Firestore por cédula
      if (!uid && p.cedula) {
        const q = await db.collection("users")
          .where("personalData.documentNumber", "==", p.cedula)
          .limit(1).get();
        if (!q.empty) uid = q.docs[0].id;
      }

      // Si no existe, generar ID de Firestore
      if (!uid) {
        uid = db.collection("users").doc().id;
      }

      const fechaIngreso = parseDate(p.fechaIngreso);
      const fechaRetiro = parseDate(p.fechaRetiro);
      const fechaNacimiento = parseDate(p.fechaNacimiento);

      // Construir documento de usuario
      const userData = {
        id: uid,
        uid,
        role: "excolaborador",
        email: p.email || `sin-email-${p.cedula || uid}@retirado.local`,
        fullName: p.nombre,
        profileCompleted: true,
        completedOnboardings: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),

        personalData: {
          documentNumber: p.cedula || undefined,
          fullName: p.nombre || undefined,
          gender: p.genero || undefined,
          birthDate: fechaNacimiento || undefined,
          maritalStatus: p.estadoCivil || undefined,
          position: p.cargo || undefined,
          phone: p.telefonoPersonal || undefined,
        },

        location: {
          state: p.departamento || undefined,
          city: p.ciudad || undefined,
          corporateEmail: p.email || undefined,
        },

        professionalProfile: {
          academicLevel: p.nivelAcademico || undefined,
          degree: p.profesion || undefined,
        },

        contractInfo: {
          contract: {
            startDate: fechaIngreso || undefined,
            contractType: p.tipoContrato || undefined,
          },
          assignment: {
            company: p.empresa || undefined,
            project: p.proyecto || undefined,
            location: p.regional || undefined,
            area: p.area || undefined,
            position: p.cargo || undefined,
          },
        },

        salaryInfo: {
          baseSalary: parseNumber(p.sueldo) || undefined,
        },

        socialSecurity: {
          eps: p.eps || undefined,
          afp: p.afp || undefined,
        },

        bankingInfo: {
          bankName: p.entidadBancaria || undefined,
          accountType: p.tipoCuenta || undefined,
          accountNumber: p.numeroCuenta || undefined,
        },

        administrativeRecord: {
          terminationDate: fechaRetiro || undefined,
          terminationReason: p.motivo || undefined,
          terminationJustification: p.justificacionRetiro || undefined,
        },
      };

      const cleanedData = removeUndefined(userData) || {};
      cleanedData.id = uid;
      cleanedData.uid = uid;
      cleanedData.role = "excolaborador";
      cleanedData.completedOnboardings = [];
      cleanedData.createdAt = admin.firestore.FieldValue.serverTimestamp();
      cleanedData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      cleanedData.email = p.email || `sin-email-${p.cedula || uid}@retirado.local`;
      cleanedData.fullName = p.nombre;

      // Guardar usuario (merge para no sobrescribir si ya existe)
      await db.collection("users").doc(uid).set(cleanedData, { merge: true });
      createdUsers++;

      // Crear movimiento de INGRESO (si tiene fecha)
      if (fechaIngreso) {
        const ingresoExisting = await db.collection("movements")
          .where("userId", "==", uid)
          .where("type", "==", "ingreso")
          .limit(1).get();

        if (ingresoExisting.empty) {
          const ingresoDoc = {
            type: "ingreso",
            userId: uid,
            userName: p.nombre,
            userEmail: cleanedData.email,
            date: fechaIngreso,
            createdBy: "import-retirados",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          if (p.empresa) ingresoDoc.company = p.empresa;
          if (p.proyecto) ingresoDoc.project = p.proyecto;
          if (p.regional) ingresoDoc.sede = p.regional;
          if (p.area) ingresoDoc.area = p.area;

          await db.collection("movements").add(ingresoDoc);
          createdIngresos++;
        }
      }

      // Crear movimiento de RETIRO (si tiene fecha)
      if (fechaRetiro) {
        const retiroExisting = await db.collection("movements")
          .where("userId", "==", uid)
          .where("type", "==", "retiro")
          .limit(1).get();

        if (retiroExisting.empty) {
          const retiroDoc = {
            type: "retiro",
            userId: uid,
            userName: p.nombre,
            userEmail: cleanedData.email,
            date: fechaRetiro,
            createdBy: "import-retirados",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          if (p.motivoTipo) retiroDoc.reason = p.motivoTipo;
          if (p.empresa) retiroDoc.company = p.empresa;
          if (p.proyecto) retiroDoc.project = p.proyecto;
          if (p.regional) retiroDoc.sede = p.regional;
          if (p.area) retiroDoc.area = p.area;
          const sueldo = parseNumber(p.sueldo);
          if (sueldo > 0) retiroDoc.cost = sueldo;

          await db.collection("movements").add(retiroDoc);
          createdRetiros++;
        }
      } else {
        console.log(`  ⚠️  Sin fecha retiro: ${p.nombre}`);
      }

      if (createdUsers % 50 === 0) {
        console.log(`  ✅ ${createdUsers} usuarios procesados...`);
      }

    } catch (err) {
      errors++;
      console.error(`❌ Error con ${p.nombre}: ${err.message}`);
    }
  }

  console.log("\n========== RESUMEN ==========");
  console.log(`Usuarios creados/actualizados: ${createdUsers}`);
  console.log(`Movimientos ingreso creados:   ${createdIngresos}`);
  console.log(`Movimientos retiro creados:    ${createdRetiros}`);
  console.log(`Saltados (sin nombre):         ${skipped}`);
  console.log(`Errores:                       ${errors}`);
  console.log("✅ Importación completada.");
  process.exit(0);
}

run().catch(err => {
  console.error("Error fatal:", err);
  process.exit(1);
});
