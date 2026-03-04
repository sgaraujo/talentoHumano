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
  { region: "us-central1", cors: true, secrets: [TENANT_ID, CLIENT_ID, CLIENT_SECRET, SENDER_EMAIL] },
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
  { region: "us-central1", cors: true },
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
    cors: true,
    secrets: [TENANT_ID, CLIENT_ID, CLIENT_SECRET, SENDER_EMAIL],
  },
  async (request) => {
    const to    = normalizeEmail(request.data?.to);
    const userName          = String(request.data?.userName          || "").trim();
    const questionnaireTitle = String(request.data?.questionnaireTitle || "").trim();
    const link  = String(request.data?.link || "").trim();

    if (!to || !link) throw new HttpsError("invalid-argument", "Faltan campos: to/link");

    const token  = await getGraphToken();
    const sender = SENDER_EMAIL.value();
    const year   = new Date().getFullYear();

    const subject = `Tienes un cuestionario pendiente en Inteegrados`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;line-height:1.6">
        <div style="background:linear-gradient(135deg,#005528,#008C3C);padding:32px 24px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:26px;letter-spacing:3px;font-weight:800">
            INTE<span style="color:#7BCB6A">E</span>GRADOS
          </h1>
          <p style="color:#7BCB6A;margin:6px 0 0;font-size:12px;letter-spacing:1px">GESTIÓN DE TALENTO HUMANO</p>
        </div>
        <div style="background:#fff;padding:32px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
          <p style="font-size:16px;color:#374151;margin-top:0">Hola <b>${userName}</b>,</p>
          <p style="color:#6b7280">
            Tienes un nuevo cuestionario pendiente por completar.<br>
            Tu información nos ayuda a brindarte una mejor experiencia.
          </p>
          <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin:20px 0;display:flex;align-items:center;justify-content:space-between">
            <p style="margin:0;font-weight:600;color:#1f2937;font-size:15px">${questionnaireTitle}</p>
            <a href="${link}"
               style="background:#008C3C;color:#fff;text-decoration:none;padding:10px 22px;
                      border-radius:6px;font-weight:700;font-size:13px;white-space:nowrap;margin-left:16px">
              Responder →
            </a>
          </div>
          <p style="color:#9ca3af;font-size:13px">
            Este enlace es personal e intransferible. Si tienes alguna duda, responde este correo.
          </p>
          <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:24px;border-top:1px solid #f3f4f6;padding-top:16px">
            © ${year} Inteegrados · Todos los derechos reservados
          </p>
        </div>
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

export const sendBatchAssignmentEmail = onCall(
  {
    region: "us-central1",
    cors: true,
    secrets: [TENANT_ID, CLIENT_ID, CLIENT_SECRET, SENDER_EMAIL],
  },
  async (request) => {
    const to    = normalizeEmail(request.data?.to);
    const userName      = String(request.data?.userName || "").trim();
    const questionnaires: Array<{ title: string; link: string }> = request.data?.questionnaires || [];

    if (!to || questionnaires.length === 0) {
      throw new HttpsError("invalid-argument", "Faltan campos requeridos");
    }

    const token  = await getGraphToken();
    const sender = SENDER_EMAIL.value();
    const year   = new Date().getFullYear();
    const count  = questionnaires.length;

    const cards = questionnaires.map(q => `
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px 18px;margin:10px 0;
                  display:flex;align-items:center;justify-content:space-between;gap:12px">
        <p style="margin:0;font-weight:600;color:#1f2937;font-size:14px;flex:1">${q.title}</p>
        <a href="${q.link}"
           style="background:#008C3C;color:#fff;text-decoration:none;padding:9px 20px;
                  border-radius:6px;font-weight:700;font-size:13px;white-space:nowrap">
          Responder →
        </a>
      </div>
    `).join("");

    const subject = count === 1
      ? `Tienes 1 cuestionario pendiente en Inteegrados`
      : `Tienes ${count} cuestionarios pendientes en Inteegrados`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;line-height:1.6">
        <div style="background:linear-gradient(135deg,#005528,#008C3C);padding:32px 24px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:26px;letter-spacing:3px;font-weight:800">
            INTE<span style="color:#7BCB6A">E</span>GRADOS
          </h1>
          <p style="color:#7BCB6A;margin:6px 0 0;font-size:12px;letter-spacing:1px">GESTIÓN DE TALENTO HUMANO</p>
        </div>

        <div style="background:#fff;padding:32px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
          <p style="font-size:16px;color:#374151;margin-top:0">Hola <b>${userName}</b>,</p>
          <p style="color:#6b7280;margin-bottom:4px">
            ${count === 1
              ? "Tienes <b>1 cuestionario</b> pendiente por completar."
              : `Tienes <b>${count} cuestionarios</b> pendientes por completar.`}
          </p>
          <p style="color:#6b7280;margin-top:4px">
            Tu información es muy importante para nosotros y nos ayuda a brindarte
            una experiencia personalizada. ¡Tómate tu tiempo!
          </p>

          <div style="background:#f9fafb;border-radius:10px;padding:16px 18px;margin:20px 0">
            <p style="margin:0 0 10px;font-size:11px;color:#6b7280;text-transform:uppercase;
                      font-weight:700;letter-spacing:1px">
              📋 Cuestionarios asignados
            </p>
            ${cards}
          </div>

          <p style="color:#9ca3af;font-size:13px">
            Cada enlace es personal e intransferible. Puedes completarlos en el orden que prefieras.
            Si tienes alguna duda, responde este correo.
          </p>

          <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:24px;
                    border-top:1px solid #f3f4f6;padding-top:16px">
            © ${year} Inteegrados · Todos los derechos reservados
          </p>
        </div>
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
  { region: "us-central1", cors: true },
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

export const sendWelcomeEmail = onCall(
  {
    region: "us-central1",
    cors: true,
    secrets: [TENANT_ID, CLIENT_ID, CLIENT_SECRET, SENDER_EMAIL],
  },
  async (request) => {
    const to            = normalizeEmail(request.data?.to);
    const userName      = String(request.data?.userName      || "").trim();
    const corporateEmail = String(request.data?.corporateEmail || "").trim();
    const appUrl        = String(request.data?.appUrl        || "https://nelyoda.web.app").trim();

    if (!to) throw new HttpsError("invalid-argument", "Falta el correo de destino");

    const token  = await getGraphToken();
    const sender = SENDER_EMAIL.value();
    const year   = new Date().getFullYear();

    const subject = "Bienvenido/a a Inteegrados";
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;line-height:1.6">
        <div style="background:linear-gradient(135deg,#005528,#008C3C);padding:32px 24px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:26px;letter-spacing:3px;font-weight:800">
            INTE<span style="color:#7BCB6A">E</span>GRADOS
          </h1>
          <p style="color:#7BCB6A;margin:4px 0 0;font-size:12px;letter-spacing:1px">
            GESTIÓN DE TALENTO HUMANO
          </p>
        </div>

        <div style="background:#fff;padding:32px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
          <p style="font-size:16px;color:#374151">Hola <b>${userName}</b>,</p>
          <p style="color:#6b7280;margin-top:0">
            Has sido registrado/a en la plataforma <b>Inteegrados</b>. Nos alegra tenerte en el equipo.
          </p>

          ${corporateEmail ? `
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:20px 0">
            <p style="margin:0 0 4px;font-size:11px;color:#166534;text-transform:uppercase;font-weight:700;letter-spacing:1px">
              Tu correo corporativo
            </p>
            <p style="margin:0;font-size:20px;font-weight:700;color:#166534">${corporateEmail}</p>
          </div>
          ` : ""}

          <p style="color:#6b7280;font-size:14px">
            En los próximos días recibirás cuestionarios para completar tu perfil.
            Si tienes alguna pregunta, responde este correo.
          </p>

          <div style="text-align:center;margin:28px 0 8px">
            <a href="${appUrl}"
               style="background:#008C3C;color:#fff;text-decoration:none;padding:13px 32px;
                      border-radius:8px;font-weight:700;font-size:14px;display:inline-block">
              Acceder a la plataforma
            </a>
          </div>

          <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:28px;border-top:1px solid #f3f4f6;padding-top:16px">
            © ${year} Inteegrados · Todos los derechos reservados
          </p>
        </div>
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

export const getPublicAssignment = onCall(
  { region: "us-central1", cors: true },
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