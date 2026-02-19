const admin = require("firebase-admin");
const XLSX = require("xlsx");
const path = require("path");

// ---------- Firebase Admin ----------
const serviceAccount = require("./serviceAccount.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ---------- Helpers ----------
function cleanText(v) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\uFEFF/g, "").replace(/[\r\n\t]/g, " ").trim();
}

function cleanEmail(v) {
  return cleanText(v).replace(/^"+|"+$/g, "").replace(/\s+/g, "").toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function excelDateToJS(serial) {
  if (!serial || typeof serial !== "number") return null;
  // Excel serial date to JS Date (local time)
  const utc_days = Math.floor(serial - 25569);
  const date = new Date(utc_days * 86400000);
  // Adjust to local date components to avoid timezone shift
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function parseNumber(v) {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function mapEstadoToRole(estado) {
  const s = cleanText(estado).toLowerCase();
  if (s.includes("retirado") || s.includes("terminado")) return "excolaborador";
  if (s.includes("vigente")) return "colaborador";
  if (s.includes("aspirante")) return "aspirante";
  if (s.includes("descartado")) return "descartado";
  return "colaborador";
}

function mapModalidad(mod) {
  const s = cleanText(mod).toLowerCase();
  if (s.includes("remoto")) return "remoto";
  if (s.includes("h") && s.includes("brid")) return "híbrido";
  if (s.includes("presencial")) return "presencial";
  return undefined;
}

function tempPassword() {
  return "Temp@" + Math.random().toString(36).slice(2, 10) + "9!";
}

// ---------- Main ----------
async function run() {
  const filePath = path.join(__dirname, "BD A FEB 16 2026.xlsx");
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]]; // BD - DIRECTOS
  const rows = XLSX.utils.sheet_to_json(ws);

  console.log(`📊 Total filas en Excel: ${rows.length}`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const r of rows) {
    try {
      // Buscar email
      const emailCorp = cleanEmail(r["CORREO CORPORATIVO"]);
      const emailPersonal = cleanEmail(r["CORREO ELECTRONICO PERSONAL"]);
      const email = isValidEmail(emailCorp) ? emailCorp : (isValidEmail(emailPersonal) ? emailPersonal : null);
      const nombre = cleanText(r["APELLIDOS Y NOMBRES"]);
      const cedula = cleanText(r["CEDULA"]);

      if (!email) {
        skipped++;
        console.log(`⚠️ Sin email válido: ${nombre} (${cedula})`);
        continue;
      }

      // Buscar en Auth si ya existe, si no usar ID auto-generado de Firestore
      let uid;
      try {
        const userRecord = await admin.auth().getUserByEmail(email);
        uid = userRecord.uid;
      } catch {
        // No existe en Auth, generar ID de Firestore
        uid = db.collection("users").doc().id;
      }

      const role = mapEstadoToRole(r["ESTADO"]);
      const fechaIngreso = excelDateToJS(r["FECHA DE INGRESO"]);
      const fechaNacimiento = excelDateToJS(r["FECHA DE NACIMIENTO"]);
      const fechaRetiro = excelDateToJS(r["FECHA RETIRO"]);
      const fechaExpedicion = excelDateToJS(r["FECHA EXPEDICION"]);
      const iniciaProductiva = excelDateToJS(r["INICIA PRODUCTIVA"]);
      const finProductiva = excelDateToJS(r["FIN PRODUCTIVA"]);

      const userData = {
        id: uid,
        uid,
        role,
        email,
        fullName: nombre || "",
        profileCompleted: true,
        completedOnboardings: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),

        personalData: {
          documentType: cleanText(r["TIPO DOCUMENTO"]) || undefined,
          documentNumber: cedula || undefined,
          fullName: nombre || undefined,
          gender: cleanText(r["GENERO"]) || undefined,
          birthDate: fechaNacimiento || undefined,
          age: r["EDAD"] ? Math.floor(parseNumber(r["EDAD"])) : undefined,
          ageRange: cleanText(r["RANGO DE EDAD"]) || undefined,
          bloodType: cleanText(r["RH"]) || undefined,
          maritalStatus: cleanText(r["ESTADO CIVIL"]) || undefined,
          nationality: cleanText(r["PAIS - NACIONALIDAD"]) || undefined,
          position: cleanText(r["CARGO"]) || undefined,
          phone: cleanText(r["TELEFONO PERSONAL"]) || undefined,
        },

        location: {
          country: cleanText(r["PAIS - NACIONALIDAD"]) || undefined,
          state: cleanText(r["DEPARTAMENTO DE RESIDENCIA"]) || undefined,
          city: cleanText(r["CIUDAD DE RESIDENCIA"]) || undefined,
          address: cleanText(r["DIRECCION VIVIENDA"]) || undefined,
          department: cleanText(r["DEPARTAMENTO"]) || undefined,
          personalEmail: isValidEmail(emailPersonal) ? emailPersonal : undefined,
          corporateEmail: isValidEmail(emailCorp) ? emailCorp : undefined,
          corporatePhone: cleanText(r["TELEFONO CORPORATIVO"]) || undefined,
        },

        professionalProfile: {
          academicLevel: cleanText(r["NIVEL ACADEMICA"]) || undefined,
          degree: cleanText(r["PROFESION"]) || undefined,
        },

        contractInfo: {
          contract: {
            startDate: fechaIngreso || undefined,
            contractType: cleanText(r["TIPO DE CONTRATO"]) || undefined,
            entryJustification: cleanText(r["JUSTIFICACIÓN DE INGRESO"]) || undefined,
          },
          workConditions: {
            workModality: mapModalidad(r["MODALIDAD"]) || undefined,
            workday: cleanText(r["JORNADA"]) || undefined,
            baseSalary: parseNumber(r["Sueldo"]) || undefined,
            productiveStartDate: iniciaProductiva || undefined,
            productiveEndDate: finProductiva || undefined,
          },
          assignment: {
            company: cleanText(r["EMPRESA"]) || undefined,
            location: cleanText(r["REGIONAL"]) || undefined,
            area: cleanText(r["CUENTA ANALITICA"]) || undefined,
            costCenter: undefined,
            directSupervisor: cleanText(r["JEFE INMEDIATO"]) || undefined,
            position: cleanText(r["CARGO"]) || undefined,
            project: cleanText(r["PROYECTO"]) || undefined,
            analyticalAccount: cleanText(r["CUENTA ANALITICA"]) || undefined,
            accountingProfile: cleanText(r["PERFIL CONTABLE"]) || undefined,
            profile: cleanText(r["PERFIL"]) || undefined,
            clientApplicationStatus: cleanText(r["ESTADO APLICATIVO CLIENTE"]) || undefined,
          },
        },

        salaryInfo: {
          salaryType: cleanText(r["TIPO DE SALARIO"]) || undefined,
          baseSalary: parseNumber(r["Sueldo"]) || undefined,
          transportAllowance: parseNumber(r["Aux. de transporte/Aux. de conectividad digital"]) || undefined,
          foodAllowance: parseNumber(r["Auxilio Alimentacion"] || r["Auxilio de Alimentación"]) || undefined,
          vehicleAllowance: parseNumber(r["Auxilio Rodamiento"]) || undefined,
          toolsAllowance: parseNumber(r["Auxilio Herramientas"]) || undefined,
          communicationAllowance: parseNumber(r["Auxilio Comunicacion"]) || undefined,
          salaryKpi: parseNumber(r["KPI Salarial"]) || undefined,
          discountRecord: cleanText(r["Acta de Descuento"]) || undefined,
        },

        socialSecurity: {
          eps: cleanText(r["EPS"]) || undefined,
          afp: cleanText(r["AFP"]) || undefined,
          ccf: cleanText(r["CCF"]) || undefined,
          severanceFund: cleanText(r["CESANTIAS"]) || undefined,
          arlRiskLevel: r["RIESGO ARL"] ? String(r["RIESGO ARL"]) : undefined,
        },

        bankingInfo: {
          bankName: cleanText(r["ENTIDAD BANCARIA"]) || undefined,
          accountType: cleanText(r["TIPO DE CUENTA"]) || undefined,
          accountNumber: cleanText(r["NUMERO DE CUENTA"]) || undefined,
        },

        administrativeRecord: {
          entryJustification: cleanText(r["JUSTIFICACIÓN DE INGRESO"]) || undefined,
          terminationDate: fechaRetiro || undefined,
          terminationReason: cleanText(r["MOTIVO"]) || undefined,
          terminationJustification: cleanText(r["JUSTIFICACIÓN RETIRO"]) || undefined,
          folderCompliance: cleanText(r["CUMPLIMIENTO DE CARPETA 100%"]) === "SI" ? true : (cleanText(r["CUMPLIMIENTO DE CARPETA 100%"]) === "NO" ? false : undefined),
          disciplinaryActions: r["LLAMADOS DE ATENCION"] ? parseNumber(r["LLAMADOS DE ATENCION"]) : undefined,
          isMother: cleanText(r["MADRE"]) === "SI" ? true : (cleanText(r["MADRE"]) === "NO" ? false : undefined),
          isPregnant: cleanText(r["EMBARAZO"]) === "SI" ? true : (cleanText(r["EMBARAZO"]) === "NO" ? false : undefined),
          lifeInsuranceStatus: cleanText(r["ESTADO SEGURO DE VIDA"]) || undefined,
        },
      };

      // Limpiar undefineds en objetos anidados
      function removeUndefined(obj) {
        if (obj === null || obj === undefined) return undefined;
        if (typeof obj !== "object" || obj instanceof Date) return obj;
        const cleaned = {};
        for (const [k, v] of Object.entries(obj)) {
          if (v !== undefined) {
            const cleanedV = removeUndefined(v);
            if (cleanedV !== undefined) {
              cleaned[k] = cleanedV;
            }
          }
        }
        return Object.keys(cleaned).length > 0 ? cleaned : undefined;
      }

      const cleanedData = removeUndefined(userData);
      // Restore server timestamps
      cleanedData.createdAt = admin.firestore.FieldValue.serverTimestamp();
      cleanedData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      cleanedData.id = uid;
      cleanedData.uid = uid;
      cleanedData.completedOnboardings = [];

      await db.collection("users").doc(uid).set(cleanedData, { merge: true });

      created++;
      if (created % 50 === 0) {
        console.log(`✅ ${created} usuarios importados...`);
      }
    } catch (err) {
      errors++;
      console.log(`❌ Error: ${cleanText(r["APELLIDOS Y NOMBRES"])}: ${err.message}`);
    }
  }

  console.log("\n========== RESUMEN ==========");
  console.log(`Importados: ${created}`);
  console.log(`Saltados: ${skipped}`);
  console.log(`Errores: ${errors}`);
  console.log("✅ Importación completada.");
}

run().catch(console.error);
