const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccount.json");

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();
const APPLY = process.argv.includes("--apply");

const USERS = [
  ["Huertas Martin Stella", "shuertasmartin@gmail.com"],
  ["Gutierrez Gallego Jaime Andres", "jgutierrez@qualitrolcorp.com"],
  ["Acosta Restrepo Paula Andrea", "paula.acosta@asp.com"],
  ["Gomez Lopez Saidy Tatiana", "saidy.gomez@asp.com"],
  ["Perea Guzman Ricardo", "ricardo.perea@asp.com"],
  ["Narvaez Mendez Franky Esteban", "frank.narvaez@asp.com"],
  ["Amaya Roldan Marlon David", "marlon.amaya@asp.com"],
  ["Garnica De La Espriella Natalia", "natalia.garnica@asp.com"],
  ["Santamaria Romero Saul", "ssantamaria@qualitrolcorp.com"],
  ["Quiroz Fuentes Ricardo Orlando", "ricardo.quiroz@asp.com"],
  ["Varela Gutierrez Luis Armando", "armando.varela@fluke.com"],
  ["De Angulo Soriano Manuel", "manuel.deangulo@asp.com"],
  ["Valencia Quiceno Gerardo", "gerardo.valencia@asp.com"],
  ["Arguello Guerrero Carlos Alberto", "carlos.arguello@asp.com"],
  ["Hoyos Rodriguez Yuly Vanessa", "Rodriguezvane800@gmail.com"],
  ["Palacios Martinez Jenny Paola", "paola.palacios@asp.com"],
  ["Gutierrez Hurtado Maria Elizabeth", "elizabeth.gutierrez@asp.com"],
  ["Delgado Garcia Leidy Paola", "leidy.delgado@asp.com"],
  ["Aguirre Giraldo Isabel Cristina", "isabel.aguirre@asp.com"],
  ["Talero Rodriguez Michael Andres", "michael.talerorodriguez@asp.com"],
  ["Ossa Olmos Sara Marcela", "Sara.ossa@asp.com"],
  ["Campo Caceres Nohora Clariza", "nohora.campo@asp.com"],
  ["Barragan Leal Jenny Paola", "paola.barragan@asp.com"],
  ["Swann Velasco Maritza", "maritza.swann@asp.com"],
  ["Pinilla Molano Eduar Jessid", "kurtude1@gmail.com"],
  ["Herran Pulido Daniela", "dherran@inteegra.net.co"],
  ["Avellaneda Candia Carlos Andres", "c.avellaneda7@gmail.com"],
  ["Acosta Leon Edna Constanza", "edna.acosta@asp.com"],
  ["Arango Chavarriaga Rafael Eduardo", "rafael.arango@asp.com"],
  ["Guarin Medina Gisela Del Pilar", "gisela.guarin@asp.com"],
  ["Rodriguez Bonilla Sandra Patricia", "sandra.rodriguez@asp.com"],
  ["Bermudez Duarte Jessica Del Pilar", "jessica.bermudez@asp.com"],
  ["Beltran Urrego Lina Natalia", "lina.beltran@asp.com"],
  ["Ramirez Lopez David Mauricio", "david.ramirez@asp.com"],
  ["Cerquera Cajamarca Yineth Alejandra", "yineth.cerquera@asp.com"],
  ["Amado Amado Laura Marcela", "est.laura.amado@unimilitar.edu.co"],
  ["Quiroz Cuaran Isabella", "i.sabella.0605@hotmail.com"],
  ["Hernandez Avila Blanca Cecilia", "blanca.hernandez@asp.com"],
  ["Ocampo Jimenez Nicolas", "nicolas.ocampo@asp.com"],
  ["Revelo Llano Paola Andrea", "paola.revelo@asp.com"],
  ["Aragonez Mendez Johan Fabian", "johan.aragonez@asp.com"],
  ["Ruiz Escobar Maria", "maria.ruiz@fluke.com"],
  ["Criollo Alfonso Julieth Patricia", "julieth.criollo@asp.com"],
  ["Munoz Benavides Yaneth", "yaneth.munoz@asp.com"],
  ["Moreno Tellez Alejandro Aicardo", "alejandro.moreno@asp.com"],
  ["Castellon Pineda Luz Adriana", "luz.castellon@fluke.com"],
  ["Nino Mendivelso Pilar", "pilar.nino@asp.com"],
  ["Linares Trujillo Darwin Alexis", "darwin.linares@asp.com"],
  ["Sandoval Sandoval Argenis", "argenis.sandoval@asp.com"],
];

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  const allSnap = await db.collection("users").get();
  return allSnap.docs.filter((doc) => {
    const data = doc.data();
    return [
      data.email,
      data.location?.corporateEmail,
      data.location?.personalEmail,
    ].some((candidate) => normalizeEmail(candidate) === normalized);
  });
}

async function run() {
  console.log(APPLY ? "Aplicando desactivacion..." : "Vista previa: no se actualizara Firestore.");

  const seen = new Set();
  const notFound = [];
  const duplicates = [];
  const alreadyInactive = [];
  const changed = [];

  for (const [name, email] of USERS) {
    const key = normalizeEmail(email);
    if (seen.has(key)) continue;
    seen.add(key);

    const docs = await findUserByEmail(email);
    if (docs.length === 0) {
      notFound.push({ name, email });
      continue;
    }

    if (docs.length > 1) {
      duplicates.push({ name, email, count: docs.length, ids: docs.map((doc) => doc.id) });
    }

    for (const doc of docs) {
      const data = doc.data();
      const previousRole = data.role || "colaborador";
      const row = {
        id: doc.id,
        name: data.fullName || name,
        email: data.email || email,
        previousRole,
      };

      if (previousRole === "excolaborador") {
        alreadyInactive.push(row);
        continue;
      }

      changed.push(row);
      if (APPLY) {
        await doc.ref.update({
          role: "excolaborador",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  }

  console.log("\n========== RESUMEN ==========");
  console.log(`Correos solicitados:       ${USERS.length}`);
  console.log(`Usuarios por desactivar:   ${changed.length}`);
  console.log(`Ya estaban inactivos:      ${alreadyInactive.length}`);
  console.log(`No encontrados:            ${notFound.length}`);
  console.log(`Correos con duplicados:    ${duplicates.length}`);

  if (changed.length) {
    console.log("\nUsuarios " + (APPLY ? "desactivados" : "que se desactivarian") + ":");
    changed.forEach((u) => console.log(`- ${u.name} <${u.email}> ${u.previousRole} -> excolaborador (${u.id})`));
  }

  if (alreadyInactive.length) {
    console.log("\nYa estaban como excolaborador:");
    alreadyInactive.forEach((u) => console.log(`- ${u.name} <${u.email}> (${u.id})`));
  }

  if (duplicates.length) {
    console.log("\nDuplicados encontrados:");
    duplicates.forEach((d) => console.log(`- ${d.name} <${d.email}>: ${d.count} docs [${d.ids.join(", ")}]`));
  }

  if (notFound.length) {
    console.log("\nNo encontrados:");
    notFound.forEach((u) => console.log(`- ${u.name} <${u.email}>`));
  }

  console.log(APPLY ? "\nListo." : "\nEjecuta con --apply para aplicar los cambios.");
}

run().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
