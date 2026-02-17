import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";

admin.initializeApp();

const TENANT_ID = defineSecret("TENANT_ID");
const CLIENT_ID = defineSecret("CLIENT_ID");
const CLIENT_SECRET = defineSecret("CLIENT_SECRET");
const SENDER_EMAIL = defineSecret("SENDER_EMAIL");

async function getGraphToken(): Promise<string> {
  const tenantId = TENANT_ID.value();
  const clientId = CLIENT_ID.value();
  const clientSecret = CLIENT_SECRET.value();

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    scope: "https://graph.microsoft.com/.default",
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data.access_token as string;
}

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

async function isAllowedEmail(email: string): Promise<boolean> {
  const e = normalizeEmail(email);
  const snap = await admin.firestore().collection("allowed_emails").doc(e).get();
  if (!snap.exists) return false;
  const data = snap.data() || {};
  // si no tiene "active", asumimos true
  return data.active !== false;
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * 1) Envía código solo si el email está en allowlist
 * Guarda el código en Firestore: email_verifications/{email}
 */
export const sendVerificationCode = onCall(
  { region: "us-central1", secrets: [TENANT_ID, CLIENT_ID, CLIENT_SECRET, SENDER_EMAIL] },
  async (request) => {
    const email = normalizeEmail(request.data?.email);
    if (!email) throw new HttpsError("invalid-argument", "email requerido");

    const allowed = await isAllowedEmail(email);
    if (!allowed) {
      throw new HttpsError("permission-denied", "Este correo no está autorizado");
    }

    const code = generateCode();
    const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60 * 1000);

    await admin.firestore().collection("email_verifications").doc(email).set({
      email,
      code,
      expiresAt,
      used: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      attempts: 0,
    });

    const token = await getGraphToken();
    const sender = SENDER_EMAIL.value();

    const subject = "Tu código de acceso";
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5">
        <p>Tu código de acceso es:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:2px">${code}</p>
        <p>Vence en 10 minutos.</p>
      </div>
    `;

    const sendUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`;

    const graphRes = await fetch(sendUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: html },
          toRecipients: [{ emailAddress: { address: email } }],
        },
        saveToSentItems: true,
      }),
    });

    if (!graphRes.ok) {
      const errText = await graphRes.text();
      throw new HttpsError("internal", `Graph sendMail error: ${errText}`);
    }

    return { ok: true };
  }
);

/**
 * 2) Verifica código y devuelve customToken para iniciar sesión
 * - valida allowlist
 * - valida código/expiración/uso
 * - crea usuario Auth si no existe
 */
export const verifyEmailCodeAndLogin = onCall(
  { region: "us-central1" },
  async (request) => {
    const email = normalizeEmail(request.data?.email);
    const code = String(request.data?.code || "").trim();

    if (!email || !code) {
      throw new HttpsError("invalid-argument", "email y code requeridos");
    }

    const allowed = await isAllowedEmail(email);
    if (!allowed) {
      throw new HttpsError("permission-denied", "Este correo no está autorizado");
    }

    const ref = admin.firestore().collection("email_verifications").doc(email);
    const snap = await ref.get();

    if (!snap.exists) throw new HttpsError("not-found", "No hay código para este email");

    const data = snap.data()!;
    const now = admin.firestore.Timestamp.now();

    if (data.used) throw new HttpsError("failed-precondition", "Código ya usado");
    if (now.toMillis() > data.expiresAt.toMillis()) throw new HttpsError("deadline-exceeded", "Código expirado");

    // límite básico de intentos
    const attempts = Number(data.attempts || 0);
    if (attempts >= 8) throw new HttpsError("resource-exhausted", "Demasiados intentos");

    if (String(data.code) !== code) {
      await ref.update({ attempts: attempts + 1 });
      throw new HttpsError("permission-denied", "Código incorrecto");
    }

    // marcar como usado
    await ref.update({
      used: true,
      usedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // crear/obtener usuario Auth
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
    } catch {
      userRecord = await admin.auth().createUser({ email, emailVerified: true });
    }

    // opcional: claims (rol)
    // await admin.auth().setCustomUserClaims(userRecord.uid, { role: "colaborador" });

    const customToken = await admin.auth().createCustomToken(userRecord.uid, {
      email,
      role: "colaborador",
    });

    const usersRef = admin.firestore().collection("users").doc(userRecord.uid);
    const userSnap = await usersRef.get();

    if (!userSnap.exists) {
      await usersRef.set(
        {
          email,
          fullName: "",               // si no lo tienes, vacío
          role: "colaborador",
          profileCompleted: false,
          completedOnboardings: [],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      await usersRef.set(
        {
          email,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }


    return { ok: true, customToken };
  }
);


export const sendAssignmentEmail = onCall(
  {
    region: "us-central1",
    // ✅ aquí van los defineSecret, no strings
    secrets: [TENANT_ID, CLIENT_ID, CLIENT_SECRET, SENDER_EMAIL],
  },
  async (request) => {
    const to = normalizeEmail(request.data?.to);
    const userName = String(request.data?.userName || "").trim();
    const questionnaireTitle = String(request.data?.questionnaireTitle || "").trim();
    const link = String(request.data?.link || "").trim();

    if (!to || !link) {
      throw new HttpsError("invalid-argument", "Faltan campos: to/link");
    }

    const token = await getGraphToken();
    const sender = SENDER_EMAIL.value();

    const subject = `Nuevo cuestionario: ${questionnaireTitle || "Asignación"}`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5">
        <p>Hola ${userName || ""},</p>
        <p>Tienes un nuevo cuestionario asignado: <b>${questionnaireTitle || ""}</b></p>
        <p>Responde aquí:</p>
        <p><a href="${link}">${link}</a></p>
        <p style="color:#666;font-size:12px">Este es un mensaje informativo. No responder.</p>
      </div>
    `;

    const sendUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`;

    const graphRes = await fetch(sendUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: html },
          toRecipients: [{ emailAddress: { address: to } }],
        },
        saveToSentItems: true,
      }),
    });

    if (!graphRes.ok) {
      const errText = await graphRes.text();
      throw new HttpsError("internal", `Graph sendMail error: ${errText}`);
    }

    return { ok: true };
  }
);

/**
 * Envía respuesta pública sin autenticación — el token identifica al usuario
 */
export const submitPublicResponse = onCall(
  { region: "us-central1" },
  async (request) => {
    const token = String(request.data?.token || "").trim();
    const answers = request.data?.answers;

    if (!token) throw new HttpsError("invalid-argument", "token requerido");
    if (!answers || typeof answers !== "object") {
      throw new HttpsError("invalid-argument", "answers requeridas");
    }

    const firestore = admin.firestore();

    // 1) Buscar asignación por token
    const assSnap = await firestore
      .collection("questionnaire_assignments")
      .where("token", "==", token)
      .limit(1)
      .get();

    if (assSnap.empty) {
      throw new HttpsError("not-found", "Token inválido");
    }

    const assDoc = assSnap.docs[0];
    const assignment = assDoc.data();

    if (assignment.status === "completed") {
      throw new HttpsError("failed-precondition", "Este cuestionario ya fue respondido");
    }

    const userId = assignment.userId;
    if (!userId) {
      throw new HttpsError("failed-precondition", "Asignación sin usuario asociado");
    }

    const questionnaireId = assignment.questionnaireId;
    if (!questionnaireId) {
      throw new HttpsError("failed-precondition", "Asignación sin cuestionario");
    }

    // 2) Traer cuestionario
    const qDoc = await firestore.collection("questionnaires").doc(questionnaireId).get();
    if (!qDoc.exists) {
      throw new HttpsError("not-found", "Cuestionario no existe");
    }
    const questionnaire = qDoc.data()!;

    // 3) Guardar respuesta
    const responseRef = await firestore.collection("questionnaire_responses").add({
      questionnaireId,
      userId,
      answers,
      status: "completed",
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      exported: false,
      exportedAt: null,
      exportError: null,
    });

    // 4) Marcar asignación como completada
    await assDoc.ref.update({
      status: "completed",
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      responseId: responseRef.id,
    });

    // 5) Export onboarding si aplica
    if (questionnaire.isOnboarding && questionnaire.fieldMappings?.length) {
      try {
        const userRef = firestore.collection("users").doc(userId);
        const userSnap = await userRef.get();
        const userData = userSnap.exists ? (userSnap.data() || {}) : {};

        const patch: Record<string, any> = {
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          completedOnboardings: admin.firestore.FieldValue.arrayUnion(questionnaireId),
        };

        if (questionnaire.isRequired) {
          patch.profileCompleted = true;
        }

        for (const m of questionnaire.fieldMappings) {
          const raw = answers[m.questionId];
          if (raw === undefined || raw === null || raw === "") continue;

          const currentValue = m.fieldPath
            .split(".")
            .reduce((obj: any, key: string) => obj?.[key], userData);

          if (m.overwrite === true || currentValue === undefined || currentValue === null || currentValue === "") {
            patch[m.fieldPath] = raw;
          }
        }

        // Marcar onboarding completado en user
        patch["onboarding.completed"] = true;
        patch["onboarding.completedAt"] = admin.firestore.FieldValue.serverTimestamp();
        patch["onboarding.questionnaireId"] = questionnaireId;

        if (!userSnap.exists) {
          await userRef.set({
            email: assignment.userEmail || "",
            fullName: assignment.userName || "",
            role: "colaborador",
            profileCompleted: false,
            completedOnboardings: [],
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            ...patch,
          });
        } else {
          await userRef.update(patch);
        }

        await responseRef.update({
          exported: true,
          exportedAt: admin.firestore.FieldValue.serverTimestamp(),
          exportError: null,
        });
      } catch (err: any) {
        await responseRef.update({
          exported: false,
          exportError: err?.message || "Export failed",
        });
        // No lanzar — la respuesta ya se guardó, el export se puede reintentar
      }
    }

    return { ok: true, responseId: responseRef.id };
  }
);

export const getPublicAssignment = onCall(
  { region: "us-central1" },
  async (request) => {
    const token = String(request.data?.token || "").trim();
    if (!token) throw new HttpsError("invalid-argument", "token requerido");

    // 1) Buscar asignación por token (query)
    const assSnap = await admin
      .firestore()
      .collection("questionnaire_assignments")
      .where("token", "==", token)
      .limit(1)
      .get();

    if (assSnap.empty) {
      throw new HttpsError("not-found", "Token inválido o no existe asignación");
    }

    const assDoc = assSnap.docs[0];
    const assignment = assDoc.data();

    // Si ya fue completado, devolver assignment con status para que el frontend muestre "Ya respondiste"
    if (assignment.status === "completed") {
      return {
        assignment: { id: assDoc.id, ...assignment },
        questionnaire: null,
      };
    }

    const questionnaireId = assignment.questionnaireId;
    if (!questionnaireId) {
      throw new HttpsError("failed-precondition", "Asignación sin questionnaireId");
    }

    // 2) Traer cuestionario
    const qDoc = await admin.firestore().collection("questionnaires").doc(questionnaireId).get();
    if (!qDoc.exists) {
      throw new HttpsError("not-found", "Cuestionario no existe");
    }

    const questionnaire = qDoc.data();

    // (Opcional) si manejas estado activo
    // if (questionnaire?.active === false) throw new HttpsError("failed-precondition", "Cuestionario inactivo");

    return {
      assignment: { id: assDoc.id, ...assignment },
      questionnaire: { id: qDoc.id, ...questionnaire },
    };
  }
);