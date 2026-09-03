import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { getDianObligationsByNit } from "./dianCalendar2026";
import { ALL_BOGOTA_2026, getBogotaObligationsByNit } from "./bogotaCalendar2026";
import { compareAlertCuts, displayPeriod, shouldIncludeManualAlert, type PreviousAlertSnapshot } from "./taxAlertLogic";

admin.initializeApp();

const ACCOUNTING_COLLECTIONS = {
  obligations: "accounting/data/tax_obligations",
  dailyActivity: "accounting/data/tax_daily_activity",
  alerts: "accounting/data/tax_alerts",
  calendarEvents: "accounting/data/tax_calendar_events",
  companyTaxSettings: "accounting/data/company_tax_settings",
} as const;

const ORGANIZATION_COLLECTIONS = {
  companies: "organization/data/companies",
  projects: "organization/data/projects",
} as const;

const QUESTIONNAIRE_COLLECTIONS = {
  definitions: "questionnaires/data/definitions",
  assignments: "questionnaires/data/assignments",
  responses: "questionnaires/data/responses",
} as const;
const COMMUNICATION_COLLECTIONS = {
  messages: "communications/data/messages",
  recipients: "communications/data/recipients",
  accountingMessages: "communications/data/accounting_messages",
} as const;
const IDENTITY_COLLECTIONS = {
  platformRoles: "identity/data/platform_roles",
  allowedEmails: "identity/data/allowed_emails",
  emailVerifications: "identity/data/email_verifications",
  users: "identity/data/users",
} as const;

type PlatformRole = "admin" | "talento_humano" | "contabilidad" | "financiera";

/** Verifica autenticación y rol en callables administrativas. */
async function requirePlatformRole(
  request: { auth?: { token?: Record<string, unknown> } },
  allowedRoles: PlatformRole[],
): Promise<{ email: string; role: PlatformRole }> {
  const rawEmail = request.auth?.token?.email;
  if (typeof rawEmail !== "string" || !rawEmail.trim()) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const email = rawEmail.trim().toLowerCase();
  const firestore = admin.firestore();
  const canonicalRoles = firestore.collection(IDENTITY_COLLECTIONS.platformRoles);
  const directRoleSnap = await canonicalRoles.doc(email).get();
  let role = directRoleSnap.data()?.role as PlatformRole | undefined;

  // Compatibilidad durante la migración: algunos roles históricos quedaron con
  // ID automático o en la colección raíz, aunque su campo email sí es correcto.
  // Solo se toma el valor almacenado; esto no amplía los roles autorizados.
  if (!role) {
    const canonicalByEmail = await canonicalRoles.where("email", "==", email).limit(1).get();
    role = canonicalByEmail.docs[0]?.data()?.role as PlatformRole | undefined;
    if (!role) {
      const canonicalCandidates = await canonicalRoles.get();
      const match = canonicalCandidates.docs.find(doc =>
        String(doc.data()?.email ?? doc.id).trim().toLowerCase() === email,
      );
      role = match?.data()?.role as PlatformRole | undefined;
    }
  }
  if (!role) {
    const legacyRoles = firestore.collection("platform_roles");
    const legacyDirect = await legacyRoles.doc(email).get();
    role = legacyDirect.data()?.role as PlatformRole | undefined;
    if (!role) {
      const legacyByEmail = await legacyRoles.where("email", "==", email).limit(1).get();
      role = legacyByEmail.docs[0]?.data()?.role as PlatformRole | undefined;
      if (!role) {
        const legacyCandidates = await legacyRoles.get();
        const match = legacyCandidates.docs.find(doc =>
          String(doc.data()?.email ?? doc.id).trim().toLowerCase() === email,
        );
        role = match?.data()?.role as PlatformRole | undefined;
      }
    }
  }
  if (!role || !allowedRoles.includes(role)) {
    console.warn("Role authorization denied", { email, role: role ?? "missing", allowedRoles });
    throw new HttpsError(
      "permission-denied",
      role ? "Tu rol no permite ejecutar esta acción." : "Tu usuario no tiene un rol de plataforma registrado.",
    );
  }

  return { email, role };
}

// ── WhatsApp / Meta Business ─────────────────────────────────────────────
export { waWebhook } from "./whatsapp/webhookHandler";
export { sendWhatsAppMessage, sendWaTemplate } from "./whatsapp/sendMessageHandler";
export { sendWaCampaign } from "./whatsapp/campaignHandler";


const TENANT_ID      = defineSecret("TENANT_ID");
const CLIENT_ID      = defineSecret("CLIENT_ID");
const CLIENT_SECRET  = defineSecret("CLIENT_SECRET");
const SENDER_EMAIL   = defineSecret("SENDER_EMAIL");
const SENDER_EMAIL_2 = defineSecret("SENDER_EMAIL_2"); // inteegrados@inteegra.net.co

// Credenciales del tenant de inteegra.net.co
const TENANT_ID_2     = defineSecret("TENANT_ID_2");
const CLIENT_ID_2     = defineSecret("CLIENT_ID_2");
const CLIENT_SECRET_2 = defineSecret("CLIENT_SECRET_2");

// Credenciales del tenant de triangulum.net.co
const TENANT_ID_3     = defineSecret("TENANT_ID_3");
const CLIENT_ID_3     = defineSecret("CLIENT_ID_3");
const CLIENT_SECRET_3 = defineSecret("CLIENT_SECRET_3");
const SENDER_EMAIL_3  = defineSecret("SENDER_EMAIL_3"); // lguio@triangulum.net.co

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

async function getGraphTokenInteegra(): Promise<string> {
  const url = `https://login.microsoftonline.com/${TENANT_ID_2.value()}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: CLIENT_ID_2.value(),
    scope: "https://graph.microsoft.com/.default",
    client_secret: CLIENT_SECRET_2.value(),
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

async function getGraphTokenTriangulum(): Promise<string> {
  const url = `https://login.microsoftonline.com/${TENANT_ID_3.value()}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: CLIENT_ID_3.value(),
    scope: "https://graph.microsoft.com/.default",
    client_secret: CLIENT_SECRET_3.value(),
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
  const snap = await admin.firestore().collection(IDENTITY_COLLECTIONS.allowedEmails).doc(e).get();
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
  { region: "us-central1", cors: true, secrets: [TENANT_ID_2, CLIENT_ID_2, CLIENT_SECRET_2, SENDER_EMAIL_2] },
  async (request) => {
    const email = normalizeEmail(request.data?.email);
    if (!email) throw new HttpsError("invalid-argument", "email requerido");

    const allowed = await isAllowedEmail(email);
    if (!allowed) {
      throw new HttpsError("permission-denied", "Este correo no está autorizado");
    }

    const code = generateCode();
    const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60 * 1000);

    await admin.firestore().collection(IDENTITY_COLLECTIONS.emailVerifications).doc(email).set({
      email,
      code,
      expiresAt,
      used: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      attempts: 0,
    });

    const token = await getGraphTokenInteegra();
    const sender = SENDER_EMAIL_2.value().trim();

    const subject = "🔐 Tu código de acceso — Inteegrados";
    const codeDigits = code.split("").join(" ");
    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light" />
  <title>${subject}</title>
  <style>
    :root { color-scheme: light only; supported-color-schemes: light; }
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif" bgcolor="#f3f4f6">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px" bgcolor="#f3f4f6">
    <tr>
      <td align="center" bgcolor="#f3f4f6">
        <table width="100%" style="max-width:480px" cellpadding="0" cellspacing="0">

          <!-- HEADER -->
          <tr>
            <td bgcolor="#004d22" style="background:#004d22;padding:32px 32px 26px;border-radius:16px 16px 0 0;text-align:center">
              <h1 style="color:#ffffff;margin:0 0 4px;font-size:26px;letter-spacing:4px;font-weight:800">
                INTE<span style="color:#7BCB6A">E</span>GRADOS
              </h1>
              <p style="color:#a7f3d0;margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase">
                Transformación Digital
              </p>
              <div style="width:40px;height:3px;background:#7BCB6A;border-radius:2px;margin:18px auto 0"></div>
            </td>
          </tr>

          <!-- CUERPO -->
          <tr>
            <td bgcolor="#ffffff" style="background:#ffffff;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;padding:36px 32px;text-align:center">
              <p style="margin:0 0 4px;font-size:14px;color:#374151">🔐 Tu código de acceso es:</p>
              <p style="margin:0 0 20px;font-size:12px;color:#9ca3af">Úsalo para iniciar sesión en Inteegrados</p>

              <table cellpadding="0" cellspacing="0" style="margin:0 auto 20px">
                <tr>
                  <td bgcolor="#f0fdf4" style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:12px;padding:18px 28px">
                    <span style="font-size:34px;font-weight:800;letter-spacing:10px;color:#008C3C;font-family:'Courier New',monospace">${codeDigits}</span>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:12px;color:#9ca3af">⏳ Este código vence en <strong style="color:#6b7280">10 minutos</strong>.</p>
              <p style="margin:16px 0 0;font-size:11px;color:#d1d5db;line-height:1.6">
                Si tú no solicitaste este código, puedes ignorar este correo con tranquilidad.
              </p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td bgcolor="#1f2937" style="background:#1f2937;border-radius:0 0 16px 16px;padding:22px 32px;text-align:center">
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#ffffff">
                INTE<span style="color:#7BCB6A">E</span>GRADOS
              </p>
              <p style="margin:0;font-size:10px;color:#6b7280;line-height:1.6">
                Correo automático de seguridad — no respondas a este mensaje.<br/>
                By Santiago García &middot; Transformación Digital
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
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

    const ref = admin.firestore().collection(IDENTITY_COLLECTIONS.emailVerifications).doc(email);
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

    const usersRef = admin.firestore().collection(IDENTITY_COLLECTIONS.users).doc(userRecord.uid);
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


/**
 * Envía correo de cuestionario(s).
 * - Modo single (compatibilidad): { to, userName, questionnaireTitle, link }
 * - Modo batch (creación de usuario): { to, userName, questionnaires: [{title, link}] }
 */
export const sendAssignmentEmail = onCall(
  {
    region: "us-central1",
    cors: true,
    secrets: [TENANT_ID, CLIENT_ID, CLIENT_SECRET, SENDER_EMAIL],
  },
  async (request) => {
    const to       = normalizeEmail(request.data?.to);
    const userName = String(request.data?.userName || "").trim();

    // Batch mode
    const batch: Array<{ title: string; link: string }> = request.data?.questionnaires || [];

    // Single mode (legacy)
    const singleTitle = String(request.data?.questionnaireTitle || "").trim();
    const singleLink  = String(request.data?.link || "").trim();

    const items = batch.length > 0
      ? batch
      : singleLink ? [{ title: singleTitle, link: singleLink }] : [];

    if (!to || items.length === 0) {
      throw new HttpsError("invalid-argument", "Faltan campos requeridos");
    }

    const graphToken = await getGraphToken();
    const sender     = SENDER_EMAIL.value().trim();
    const year       = new Date().getFullYear();
    const count      = items.length;

    const cards = items.map(q => `
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;margin:10px 0;overflow:hidden">
        <tr>
          <td style="padding:14px 18px;font-weight:600;color:#1f2937;font-size:14px">
            ${q.title}
          </td>
          <td style="padding:14px 18px;text-align:right;white-space:nowrap">
            <a href="${q.link}"
               style="background:#008C3C;color:#ffffff;text-decoration:none;padding:9px 20px;
                      border-radius:6px;font-weight:700;font-size:13px;display:inline-block">
              Responder &rarr;
            </a>
          </td>
        </tr>
      </table>
    `).join("");

    const subject = count === 1
      ? `Tienes 1 cuestionario pendiente en Inteegrados`
      : `Tienes ${count} cuestionarios pendientes en Inteegrados`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;line-height:1.6;color:#374151">
        <!-- Header -->
        <div style="background:linear-gradient(135deg,#005528,#008C3C);padding:32px 24px;
                    border-radius:12px 12px 0 0;text-align:center">
          <h1 style="color:#ffffff;margin:0;font-size:26px;letter-spacing:3px;font-weight:800">
            INTE<span style="color:#7BCB6A">E</span>GRADOS
          </h1>
          <p style="color:#7BCB6A;margin:6px 0 0;font-size:12px;letter-spacing:1px">
            GESTIÓN DE TALENTO HUMANO
          </p>
        </div>

        <!-- Body -->
        <div style="background:#ffffff;padding:32px 24px;border:1px solid #e5e7eb;
                    border-top:none;border-radius:0 0 12px 12px">
          <p style="font-size:16px;margin-top:0">Hola <b>${userName}</b>,</p>
          <p style="color:#6b7280;margin-bottom:4px">
            ${count === 1
              ? "Tienes <b>1 cuestionario</b> pendiente por completar."
              : `Tienes <b>${count} cuestionarios</b> pendientes por completar.`}
          </p>
          <p style="color:#6b7280;margin-top:4px">
            Tu información es importante para nosotros y nos ayuda a brindarte
            una experiencia personalizada. ¡Tómate tu tiempo!
          </p>

          <div style="background:#f9fafb;border-radius:10px;padding:16px 18px;margin:20px 0">
            <p style="margin:0 0 10px;font-size:11px;color:#6b7280;text-transform:uppercase;
                      font-weight:700;letter-spacing:1px">
              Cuestionarios asignados
            </p>
            ${cards}
          </div>

          <p style="color:#9ca3af;font-size:13px">
            Cada enlace es personal e intransferible. Puedes completarlos en el orden que prefieras.
            Si tienes alguna duda, responde este correo.
          </p>

          <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:24px;
                    border-top:1px solid #f3f4f6;padding-top:16px">
            &copy; ${year} Inteegrados &middot; Todos los derechos reservados
          </p>
        </div>
      </div>
    `;

    const sendUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`;
    const graphRes = await fetch(sendUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${graphToken}`, "Content-Type": "application/json" },
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
      .collection(QUESTIONNAIRE_COLLECTIONS.assignments)
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

    // Verificar por email: bloquear si el mismo correo ya completó antes (IDs cambiaron por recarga de BD)
    if (assignment.userEmail) {
      const prevSnap = await firestore
        .collection(QUESTIONNAIRE_COLLECTIONS.assignments)
        .where("userEmail", "==", assignment.userEmail)
        .where("questionnaireId", "==", questionnaireId)
        .where("status", "==", "completed")
        .limit(1)
        .get();

      if (!prevSnap.empty) {
        // Find the existing response for this email so we can link the assignment
        // without creating a duplicate response record.
        const existingResp = await firestore
          .collection(QUESTIONNAIRE_COLLECTIONS.responses)
          .where("userEmail", "==", assignment.userEmail)
          .where("questionnaireId", "==", questionnaireId)
          .limit(1)
          .get();
        const existingResponseId = existingResp.empty ? null : existingResp.docs[0].id;
        await assDoc.ref.update({
          status: "completed",
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          ...(existingResponseId ? { responseId: existingResponseId } : {}),
        });
        throw new HttpsError("failed-precondition", "Este cuestionario ya fue respondido");
      }
    }

    // 2) Traer cuestionario
    const qDoc = await firestore.collection(QUESTIONNAIRE_COLLECTIONS.definitions).doc(questionnaireId).get();
    if (!qDoc.exists) {
      throw new HttpsError("not-found", "Cuestionario no existe");
    }
    const questionnaire = qDoc.data()!;

    // 3) Guardar respuesta — incluir userName y userEmail para que sobrevivan recargas de BD
    const responseRef = await firestore.collection(QUESTIONNAIRE_COLLECTIONS.responses).add({
      questionnaireId,
      userId,
      userName:  assignment.userName  || "",
      userEmail: assignment.userEmail || "",
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

    // 5) Si vino de un comunicado, marcar quizSubmittedAt en el recipient doc
    if (assignment.communicationId && assignment.recipientId) {
      try {
        await firestore
          .collection(COMMUNICATION_COLLECTIONS.recipients)
          .doc(assignment.recipientId)
          .update({ quizSubmittedAt: admin.firestore.FieldValue.serverTimestamp() });
      } catch { /* silently ignore */ }
    }

    // 5) Export onboarding si aplica
    if (questionnaire.isOnboarding && questionnaire.fieldMappings?.length) {
      try {
        const userRef = firestore.collection(IDENTITY_COLLECTIONS.users).doc(userId);
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
    const appUrl        = String(request.data?.appUrl        || "https://people-analitics.inteegra.net.co").trim();

    if (!to) throw new HttpsError("invalid-argument", "Falta el correo de destino");

    const token  = await getGraphToken();
    const sender = SENDER_EMAIL.value().trim();
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

/**
 * Envía comunicado oficial a uno o varios destinatarios.
 * Payload: { communicationId, title, body, recipients: [{email, name, link}], attachments?: [{name, url}] }
 */
export const sendCommunicationEmail = onCall(
  {
    region: "us-central1",
    cors: true,
    secrets: [TENANT_ID, CLIENT_ID, CLIENT_SECRET, SENDER_EMAIL, SENDER_EMAIL_2, TENANT_ID_2, CLIENT_ID_2, CLIENT_SECRET_2, TENANT_ID_3, CLIENT_ID_3, CLIENT_SECRET_3, SENDER_EMAIL_3],
  },
  async (request) => {
    const { communicationId, title, body, recipients, attachments = [], ctaButton = null, questionnaireName = null, senderKey = 'default' } = request.data || {};

    if (!title || !body || !Array.isArray(recipients) || recipients.length === 0) {
      throw new HttpsError("invalid-argument", "Faltan campos requeridos");
    }

    const graphToken = senderKey === 'inteegra'
      ? await getGraphTokenInteegra()
      : senderKey === 'triangulum'
        ? await getGraphTokenTriangulum()
        : await getGraphToken();
    const sender = senderKey === 'inteegra'
      ? SENDER_EMAIL_2.value().trim()
      : senderKey === 'triangulum'
        ? SENDER_EMAIL_3.value().trim()
        : SENDER_EMAIL.value().trim();
    const year       = new Date().getFullYear();
    const dateStr    = new Date().toLocaleDateString("es-CO", {
      day: "2-digit", month: "long", year: "numeric",
    });

    // Construir bloque de adjuntos
    const isImage = (name: string) => /\.(jpe?g|png|gif|webp|svg)$/i.test(name);

    const attList = attachments as Array<{ name: string; url: string; link?: string }>;

    const attachmentRows = attList.map(att => isImage(att.name) ? `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;text-align:center">
            <a href="${att.link || att.url}" target="_blank" style="display:block">
              <img src="${att.url}" alt="${att.name}"
                   width="480" height="auto"
                   style="max-width:100%;height:auto;border-radius:8px;
                          border:1px solid #e5e7eb;display:block;margin:0 auto"
                   border="0" />
            </a>
          </td>
        </tr>` : `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="padding:0">
                <span style="font-size:14px;margin-right:8px">📎</span>
                <span style="font-size:13px;color:#374151">${att.name}</span>
              </td>
              <td style="text-align:right">
                <a href="${att.url}" target="_blank"
                   style="background:#f9fafb;border:1px solid #e5e7eb;color:#374151;
                          text-decoration:none;padding:6px 14px;border-radius:6px;
                          font-size:12px;font-weight:600;display:inline-block">Descargar</a>
              </td>
            </tr></table>
          </td>
        </tr>`
    ).join("");

    const attachmentsSection = attList.length > 0 ? `
      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;
                    padding:4px 16px;margin:24px 0">
        <tr>
          <td style="padding:12px 0 4px">
            <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;
                      font-weight:700;letter-spacing:1px">Archivos adjuntos</p>
          </td>
        </tr>
        ${attachmentRows}
      </table>
    ` : "";

    // Formatear el body (saltos de línea → párrafos)
    const bodyHtml = String(body)
      .split("\n")
      .filter(l => l.trim())
      .map(l => `<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.7">${l}</p>`)
      .join("");

    const errors: Array<{ email: string; error: string }> = [];
    let sent = 0;

    for (const recipient of recipients as Array<{ email: string; name: string; link: string; quizLink?: string; ctaTrackingUrl?: string }>) {
      try {
        const quizLink: string | null = recipient.quizLink || null;
        const ctaUrl: string | null = recipient.ctaTrackingUrl || (ctaButton ? ctaButton.url : null);

        const html = `
<!DOCTYPE html>
<html lang="es" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light" />
  <title>${title}</title>
  <style>
    :root { color-scheme: light only; supported-color-schemes: light; }
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    @media (prefers-color-scheme: dark) {
      body, .body-wrap { background-color: #f3f4f6 !important; }
      .header-bg { background: #004d22 !important; background-color: #004d22 !important; }
      .card-bg { background-color: #ffffff !important; }
      .greeting-bg { background-color: #f0fdf4 !important; }
      .footer-bg { background-color: #1f2937 !important; }
      h1, h2, p, span, td { color: inherit !important; }
    }
  </style>
</head>
<body class="body-wrap" style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif" bgcolor="#f3f4f6">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px" bgcolor="#f3f4f6">
    <tr>
      <td align="center" bgcolor="#f3f4f6">
        <table width="100%" style="max-width:580px" cellpadding="0" cellspacing="0">

          <!-- HEADER -->
          <tr>
            <td class="header-bg" bgcolor="#004d22"
                style="background:#004d22;padding:36px 32px 28px;border-radius:16px 16px 0 0;text-align:center">
              <h1 style="color:#ffffff !important;margin:0 0 4px;font-size:28px;letter-spacing:4px;font-weight:800">
                INTE<span style="color:#7BCB6A !important">E</span>GRADOS
              </h1>
              <p style="color:#a7f3d0 !important;margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase">
                Gestión de Talento Humano
              </p>
              <div style="width:48px;height:3px;background:#7BCB6A;border-radius:2px;margin:20px auto 0"></div>
              <p style="margin:16px 0 0;font-size:11px;color:#a7f3d0;letter-spacing:2px;text-transform:uppercase;font-weight:600">
                📣 Comunicado Oficial
              </p>
              <h2 style="color:#ffffff !important;margin:8px 0 0;font-size:22px;font-weight:700;line-height:1.3">
                ${title}
              </h2>
              <p style="color:#a7f3d0 !important;margin:10px 0 0;font-size:12px">${dateStr}</p>
            </td>
          </tr>

          <!-- MAIN CARD -->
          <tr>
            <td class="card-bg" bgcolor="#ffffff"
                style="background:#ffffff;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;
                       padding:40px 32px;text-align:center">

              <!-- Saludo -->
              <p style="margin:0 0 6px;font-size:16px;color:#374151 !important;text-align:left">
                Hola <strong>${recipient.name}</strong>,
              </p>
              <div style="text-align:left;margin:0 0 24px">
                ${bodyHtml}
              </div>

              <!-- BOTÓN PRINCIPAL — Ver comunicado -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${recipient.link}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block;background:#008C3C;color:#ffffff !important;
                              text-decoration:none;padding:18px 48px;border-radius:12px;
                              font-weight:800;font-size:17px;letter-spacing:0.5px;
                              box-shadow:0 4px 14px rgba(0,140,60,0.35);
                              border:0;mso-padding-alt:0">
                      Ver comunicado &nbsp;&#8594;
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:14px">
                    <p style="margin:0;font-size:11px;color:#9ca3af !important">
                      Este enlace es personal. No lo compartas.
                    </p>
                  </td>
                </tr>
              </table>

              ${ctaButton && ctaUrl ? `
              <!-- BOTÓN CTA ADICIONAL -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px">
                <tr>
                  <td align="center">
                    <a href="${ctaUrl}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block;background:#7c3aed;color:#ffffff !important;
                              text-decoration:none;padding:13px 32px;border-radius:10px;
                              font-weight:700;font-size:14px;letter-spacing:0.3px;border:0">
                      ${ctaButton.text} &#8594;
                    </a>
                  </td>
                </tr>
              </table>` : ""}

              ${quizLink ? `
              <!-- SEPARADOR -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 0">
                <tr>
                  <td style="border-top:1px solid #f3f4f6;padding-top:24px">

                    <!-- Etiqueta encuesta -->
                    <p style="margin:0 0 4px;font-size:11px;color:#92400e !important;
                               font-weight:700;letter-spacing:1px;text-transform:uppercase;text-align:center">
                      📋 Cuestionario adjunto
                    </p>
                    <p style="margin:0 0 16px;font-size:13px;color:#78350f !important;text-align:center">
                      <strong>${questionnaireName || "Encuesta"}</strong> — tu opinión es importante
                    </p>

                    <!-- BOTÓN ENCUESTA -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center">
                          <a href="${quizLink}" target="_blank" rel="noopener noreferrer"
                             style="display:inline-block;background:#d97706;color:#ffffff !important;
                                    text-decoration:none;padding:14px 36px;border-radius:10px;
                                    font-weight:700;font-size:15px;letter-spacing:0.3px;
                                    box-shadow:0 4px 12px rgba(217,119,6,0.30);border:0">
                            Responder encuesta &nbsp;&#8594;
                          </a>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="padding-top:10px">
                          <p style="margin:0;font-size:11px;color:#9ca3af !important">
                            Enlace personal e intransferible.
                          </p>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>` : ""}

              ${attachmentsSection}

            </td>
          </tr>

          <!-- INFO BAR -->
          <tr>
            <td bgcolor="#f0fdf4"
                style="background:#f0fdf4;border:1px solid #e5e7eb;border-top:none;padding:14px 32px">
              <table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td style="font-size:12px;color:#166534">
                  ✅ Mensaje oficial enviado por Inteegrados.
                </td>
                <td style="text-align:right;font-size:12px;color:#6b7280;white-space:nowrap">
                  ID: ${String(communicationId).slice(0, 8)}
                </td>
              </tr></table>
            </td>
          </tr>

          <!-- FIRMA -->
          <tr>
            <td bgcolor="#ffffff"
                style="background:#ffffff;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;
                       padding:16px 32px;text-align:center">
              <img src="https://nelyoda.web.app/firma-nelly.jpg"
                   alt="Nelly Pinto - Gerente de Talento Humano"
                   style="max-width:480px;width:100%;display:block;margin:0 auto" />
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td class="footer-bg" bgcolor="#1f2937"
                style="background:#1f2937;border-radius:0 0 16px 16px;padding:24px 32px;text-align:center">
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:2px;color:#ffffff !important">
                INTE<span style="color:#7BCB6A !important">E</span>GRADOS
              </p>
              <p style="margin:0 0 12px;font-size:11px;color:#9ca3af !important">
                Sistema de Gestión de Talento Humano
              </p>
              <p style="margin:0;font-size:10px;color:#6b7280 !important;line-height:1.6">
                Correo confidencial y exclusivo para ${recipient.name}.<br/>
                No compartas estos enlaces. &copy; ${year} Inteegrados &middot; Todos los derechos reservados.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;

        const sendUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`;
        const graphRes = await fetch(sendUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${graphToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              subject: `[Comunicado] ${title}`,
              body: { contentType: "HTML", content: html },
              toRecipients: [{ emailAddress: { address: recipient.email } }],
            },
            saveToSentItems: true,
          }),
        });

        if (!graphRes.ok) {
          const errText = await graphRes.text();
          errors.push({ email: recipient.email, error: errText });
        } else {
          sent++;
        }
      } catch (err: any) {
        errors.push({ email: recipient.email, error: err?.message || "unknown" });
      }
    }

    return { ok: true, sent, errors };
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
      .collection(QUESTIONNAIRE_COLLECTIONS.assignments)
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

    // Verificar por email: si el mismo correo ya completó este cuestionario en una asignación anterior
    // (ocurre cuando se recarga la base y cambian los IDs pero el correo es el mismo)
    if (assignment.userEmail) {
      const prevSnap = await admin
        .firestore()
        .collection(QUESTIONNAIRE_COLLECTIONS.assignments)
        .where("userEmail", "==", assignment.userEmail)
        .where("questionnaireId", "==", questionnaireId)
        .where("status", "==", "completed")
        .limit(1)
        .get();

      if (!prevSnap.empty) {
        // Marcar la asignación actual como completada para mantener consistencia
        await assDoc.ref.update({
          status: "completed",
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return {
          assignment: { id: assDoc.id, ...assignment, status: "completed" },
          questionnaire: null,
        };
      }
    }

    // 2) Traer cuestionario
    const qDoc = await admin.firestore().collection(QUESTIONNAIRE_COLLECTIONS.definitions).doc(questionnaireId).get();
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

// ─────────────────────────────────────────────────────────────────────────────
// TAX CALENDAR ALERTS
// ─────────────────────────────────────────────────────────────────────────────

const UPCOMING_WINDOW = 7;             // días hacia adelante que aparecen en el correo
const OVERDUE_FROM    = "2026-06-01";  // solo vencidos desde esta fecha (evita ruido histórico)
const COMPLETED_STATUSES = new Set(["Pagado", "No aplica", "Informe Enviado", "Presentado"]);

const _baseNorm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.\-,]/g, "").replace(/\s+/g, " ").trim();
const _DISPLAY_NAMES: Record<string, string> = {
  'impuesto a las ventas':            'IVA',
  'iva':                              'IVA',
  'impuesto de industria y comercio': 'ICA Bimestral',
  'retefuente':                       'Retención en la Fuente',
  'retencion fuente':                 'Retención en la Fuente',
  'retencion en la fuente':           'Retención en la Fuente',
  'retencion de ica':                 'ReteICA',
  'retencion ica':                    'ReteICA',
};
const displayTax = (t: string) => _DISPLAY_NAMES[_baseNorm(t ?? "")] ?? (t ?? "");

interface TaxObligation {
  id: string;
  companyId?: string;
  company: string;
  nit: string;
  taxType: string;
  obligationType: string;
  period: string;
  dueDate: string; // YYYY-MM-DD
  year: string;
  status: string;
  advisor: string;
  observation: string;
}

interface AlertRecipient {
  name: string;
  email: string;
  obligations: Array<TaxObligation & { daysLeft: number; threshold: number; isNew?: boolean }>;
}

// Normaliza nombres de tipos de impuesto para comparación — evita duplicados por nombre distinto
// Debe mantenerse sincronizado con TAX_ALIASES en src/domain/tax/taxIdentity.ts (frontend).
const TAX_TYPE_ALERT_ALIASES: Record<string, string> = {
  "retención en la fuente":  "retención en la fuente",
  "retencion en la fuente":  "retención en la fuente",
  "retención de ica":        "reteica",
  "retencion de ica":        "reteica",
  "reteica":                 "reteica",
  "impuesto a las ventas":   "iva",
  "iva bimestral":           "iva",
  "iva cuatrimestral":       "iva",
  "exogena nacional (pj/naturales)": "exogena nacional",
  "informacion exogena nacional":    "exogena nacional",
  "exogena nacional":                "exogena nacional",
  "informacion exogena":             "exogena nacional",
  "exogena pj":                      "exogena nacional",
};
function normalizeTaxTypeAlert(t: string): string {
  const k = (t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  // Buscar alias sin tildes también
  const noAccent = k.replace(/[áéíóú]/g, (c) => ({á:"a",é:"e",í:"i",ó:"o",ú:"u"}[c] ?? c));
  return TAX_TYPE_ALERT_ALIASES[k] ?? TAX_TYPE_ALERT_ALIASES[noAccent] ?? k;
}

async function runTaxAlerts(db: admin.firestore.Firestore, force = false): Promise<{ sent: number; skipped: number; failed: number }> {
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const today = new Date(todayStr + "T00:00:00"); // medianoche Colombia para calcular días

  // Única lectura de tax_obligations
  const snap = await db.collection(ACCOUNTING_COLLECTIONS.obligations).get();
  const allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() } as TaxObligation));

  // Helpers de normalización para dedup robusto
  const cNit  = (n: string) => (n ?? "").replace(/[^0-9]/g, "");
  const cComp = (s: string) =>
    (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.\-,]/g, "").replace(/\s+/g, " ").trim();
  // Genera claves por NIT (limpio) y por nombre de empresa como fallback
  const oblKeys = (nit: string, company: string, taxType: string, dueDate: string): string[] => {
    const suffix = `${normalizeTaxTypeAlert(taxType)}__${dueDate}`;
    const nitC = cNit(nit);
    const keys = [`name:${cComp(company)}__${suffix}`];
    if (nitC) keys.push(`nit:${nitC}__${suffix}`);
    return keys;
  };
  const _hasAny = (set: Set<string>, keys: string[]) => keys.some(k => set.has(k)); void _hasAny;

  const statusPriority = (s: string) => {
    if (s === "Pagado")          return 5;
    if (s === "Informe Enviado") return 4;
    if (s === "Presentado")      return 3;
    if (s === "Revisado")        return 2;
    if (s === "No iniciado")     return 1;
    return 0;
  };

  // Deduplicar — busca coincidencia por NIT limpio O nombre de empresa
  const dedupMap = new Map<string, TaxObligation>();
  for (const obl of allDocs.filter(o => !COMPLETED_STATUSES.has(o.status))) {
    const keys = oblKeys(obl.nit, obl.company, obl.taxType, obl.dueDate);
    const existingKey = keys.find(k => dedupMap.has(k));
    const existing = existingKey ? dedupMap.get(existingKey) : undefined;
    if (!existing || statusPriority(obl.status ?? "") > statusPriority(existing.status ?? "")) {
      keys.forEach(k => dedupMap.set(k, obl));
    }
  }
  void dedupMap; // unused after refactor — kept for completedKeys side-effect

  // Índice de TODAS las obligaciones Firestore — por NIT y por nombre de empresa
  const firestoreKeys = new Set<string>();
  const completedKeys = new Set<string>();
  for (const o of allDocs) {
    oblKeys(o.nit, o.company, o.taxType, o.dueDate).forEach(k => {
      firestoreKeys.add(k);
      if (COMPLETED_STATUSES.has(o.status)) completedKeys.add(k);
    });
  }

  // Load all contabilidad + admin users to always notify them
  const rolesSnap = await db.collection(IDENTITY_COLLECTIONS.platformRoles)
    .where("role", "in", ["contabilidad", "admin"])
    .get();
  const globalRecipients: { name: string; email: string }[] = rolesSnap.docs.map(d => ({
    name: d.data().name || d.id,
    email: d.data().email || d.id,
  }));

  // Check which alerts were already sent today to avoid duplicates
  const logRef = db.collection(ACCOUNTING_COLLECTIONS.alerts);
  const todayLogSnap = force ? { docs: [] } : await logRef.where("sentDate", "==", todayStr).get();
  const alreadySent = new Set((todayLogSnap as any).docs.map((d: any) => d.data().key as string));

  // Obtener el último corte anterior para identificar obligaciones nuevas. Los
  // logs históricos ya contienen obligationId, aunque no tengan aún el snapshot
  // detallado agregado en esta versión.
  const previousLogsSnap = await logRef
    .where("sentDate", "<", todayStr)
    .orderBy("sentDate", "desc")
    .limit(2000)
    .get();
  const previousSentDate = previousLogsSnap.docs.reduce((latest, doc) => {
    const sentDate = doc.data().sentDate as string | undefined;
    return sentDate && sentDate > latest ? sentDate : latest;
  }, "");
  const previousAlertSnapshots = previousLogsSnap.docs
    .filter(doc => doc.data().sentDate === previousSentDate)
    .map(doc => doc.data() as PreviousAlertSnapshot);

  // Group obligations by recipient
  const recipientMap = new Map<string, AlertRecipient>();

  // Helper: ensure recipient exists in map
  const ensureRecipient = (email: string, name: string) => {
    const key = email.toLowerCase();
    if (!recipientMap.has(key)) {
      recipientMap.set(key, { name, email: key, obligations: [] });
    }
    return recipientMap.get(key)!;
  };

  let skipped = 0;
  let currentBatch = db.batch();
  let batchCount = 0;
  const pendingAlertLogs = new Map<string, object>();
  const flushBatch = async () => { if (batchCount > 0) { await currentBatch.commit(); currentBatch = db.batch(); batchCount = 0; } };
  const addLog = async (data: object) => {
    const key = (data as { key?: string }).key;
    if (key) pendingAlertLogs.set(key, data);
  };

  // ── Helpers de matching — deben mantenerse idénticos a TAX_ALIASES en
  // src/domain/tax/taxIdentity.ts (frontend). "impuesto de industria y comercio"
  // (ICA) y "reteica" (retención de ICA) son obligaciones distintas y NO deben
  // conflacionarse aquí, o se suprimirían alertas de una de las dos.
  const TAX_ALIASES: Record<string, string> = {
    'reteica':                        'reteica',
    'retencion de ica':               'reteica',
    'retencion ica':                  'reteica',
    'iva bimestral':                  'iva',
    'iva cuatrimestral':              'iva',
    'impuesto a las ventas':          'iva',
    'iva':                            'iva',
    'retencion en la fuente':         'retencion en la fuente',
    'retencion fuente':               'retencion en la fuente',
    'retefuente':                     'retencion en la fuente',
    'exogena nacional (pj/naturales)': 'exogena nacional',
    'informacion exogena nacional':    'exogena nacional',
    'exogena nacional':                'exogena nacional',
    'informacion exogena':             'exogena nacional',
    'exogena pj':                      'exogena nacional',
  };
  const baseNorm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.\-,]/g, "").replace(/\s+/g, " ").trim();
  const normTax = (t: string) => { const n = baseNorm(t); return TAX_ALIASES[n] ?? n; };

  const sameDate = (a: string, b: string) => {
    if (a === b) return true;
    const [ay, am, ad] = a.split("-").map(Number);
    const [by, bm, bd] = b.split("-").map(Number);
    return Math.abs(Date.UTC(ay, am-1, ad) - Date.UTC(by, bm-1, bd)) <= 5 * 86_400_000;
  };
  const nitClean = (n: string) => (n ?? "").replace(/[^0-9]/g, "");

  // ── Orden y nombre canónico de empresa — definidos antes del recorrido para
  // poder anclar cada entrada de alerta a su companyId real desde el origen,
  // en vez de reconstruir la empresa por coincidencia difusa de nombre después.
  const COMPANY_ORDER = [
    "inteegra", "consorcio scia", "netcol", "inversiones eon", "itac colombia",
    "triangulum", "netia", "logistica empresarial", "leti", "newstar", "newforce",
    "union temporal tecnologia", "union temporal fomento", "union temporal internuqui",
    "union temporal itac", "plex de colombia", "red empresarial",
  ];
  const normalizeCompany = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const companyIdx = (name: string) => {
    const n = normalizeCompany(name);
    const idx = COMPANY_ORDER.findIndex(c => n.includes(c) || c.includes(n));
    return idx === -1 ? COMPANY_ORDER.length : idx;
  };

  // ── Cargar empresas activas ───────────────────────────────────────────────────
  const companiesSnap = await db.collection(ORGANIZATION_COLLECTIONS.companies)
    .where("active", "==", true)
    .where("activeContabilidad", "==", true)
    .get();
  const companyTaxSettingsSnap = await db.collection(ACCOUNTING_COLLECTIONS.companyTaxSettings).get();
  const excludedTaxTypesByCompany = new Map(companyTaxSettingsSnap.docs.map(doc => [
    doc.id,
    doc.data().excludedTaxTypes ?? [],
  ]));

  // companyId → nombre real y orden de prioridad, tomados directo del catálogo
  // (organization/data/companies). Reemplaza la necesidad de un diccionario de
  // nombres "canónicos" mantenido a mano — la fuente de verdad es la empresa misma.
  // COMPANY_CANONICAL queda solo como respaldo para obligaciones legacy sin companyId.
  const COMPANY_CANONICAL: Record<number, string> = {
    0: "Inteegra SAS BIC", 1: "Consorcio SCIA Netcol", 2: "Netcol Ingeniería SAS BIC",
    3: "Inversiones EON SAS", 4: "ITAC Colombia SAS", 5: "Triangulum BPO SAS",
    6: "Netia SAS", 7: "Logística Empresarial de Transporte", 8: "LETI SAS",
    9: "Newstar SAS", 10: "Newforce SAS", 11: "Unión Temporal Tecnología EIP",
    12: "Unión Temporal Fomento TIC", 13: "Unión Temporal Internuqui",
    14: "Unión Temporal Itac Colombia", 15: "Plex de Colombia SAS",
    16: "Red Empresarial Americana SAS",
  };
  const companyNameById  = new Map<string, string>();
  const companyOrderById = new Map<string, number>();
  for (const compDoc of companiesSnap.docs) {
    const name = compDoc.data().name || compDoc.id;
    companyNameById.set(compDoc.id, name);
    companyOrderById.set(compDoc.id, companyIdx(name));
  }
  const orderOf = (o: { companyId?: string; company: string }) =>
    o.companyId ? (companyOrderById.get(o.companyId) ?? COMPANY_ORDER.length) : companyIdx(o.company);
  const nameOf = (o: { companyId?: string; company: string }) =>
    (o.companyId && companyNameById.get(o.companyId)) || COMPANY_CANONICAL[companyIdx(o.company)] || o.company;

  // ── Recorrer calendario DIAN empresa por empresa (igual que el frontend) ──────
  for (const compDoc of companiesSnap.docs) {
    const comp = compDoc.data();
    const nit: string = comp.nit || "";
    if (!nit) continue;

    const hidden = new Set<string>(excludedTaxTypesByCompany.get(compDoc.id) ?? []);
    const nitC    = nitClean(nit);
    const compN   = cComp(comp.name ?? "");
    // Fallback legacy para obligaciones sin companyId — usar solo cuando o.companyId es undefined.
    const companyMatchesByNitOrName = (o: TaxObligation) => {
      const oNitC = nitClean(o.nit ?? "");
      const nitMatch  = nitC && oNitC && nitC === oNitC;
      const nameMatch = cComp(o.company ?? "") === compN;
      return nitMatch || nameMatch;
    };

    // Obtener todas las obligaciones del calendario para esta empresa
    const dianObls = getDianObligationsByNit(nit).filter(o => !hidden.has(o.taxType));
    const bogotaObls = [...ALL_BOGOTA_2026, ...getBogotaObligationsByNit(nit)].filter(o => !hidden.has(o.taxType));
    const allCalObls = [
      ...dianObls.map(o => ({ ...o, company: comp.name || nit, nit })),
      ...bogotaObls.map(o => ({ taxType: o.taxType, period: o.period, dueDate: o.dueDate, company: comp.name || nit, nit })),
    ];

    const pendingCalEntries: Array<{ calObl: any; matched: any; daysLeft: number }> = [];

    for (const calObl of allCalObls) {
      const due = new Date(calObl.dueDate + "T00:00:00");
      const daysLeft = Math.round((due.getTime() - today.getTime()) / 86_400_000);
      const isOverdue  = daysLeft < 0 && calObl.dueDate >= OVERDUE_FROM;
      const isUpcoming = daysLeft >= 0 && daysLeft <= UPCOMING_WINDOW;
      if (!isOverdue && !isUpcoming) continue;

      // Buscar TODOS los registros Firestore del mismo vencimiento (puede haber duplicados con NITs distintos)
      const allMatched = allDocs.filter(o => {
        const companyMatch = o.companyId ? o.companyId === compDoc.id : companyMatchesByNitOrName(o);
        return companyMatch
          && normTax(o.taxType) === normTax(calObl.taxType)
          && sameDate(o.dueDate, calObl.dueDate);
      });

      // Si CUALQUIER versión está completada o no aplica → omitir
      if (allMatched.some(o => COMPLETED_STATUSES.has(o.status ?? "") || o.status === "No aplica")) {
        skipped++; continue;
      }

      // Usar el registro con mayor prioridad de estado
      const matched = allMatched.sort((a, b) => statusPriority(b.status ?? "") - statusPriority(a.status ?? ""))[0];
      pendingCalEntries.push({ calObl, matched, daysLeft });
    }

    for (const { calObl, matched, daysLeft } of pendingCalEntries) {
      const oblId   = matched?.id ?? `cal__${nit}__${calObl.taxType}__${calObl.dueDate}`;
      const alertKey = `${oblId}__${daysLeft}__${todayStr}`;
      if (alreadySent.has(alertKey)) { skipped++; continue; }

      const entry = {
        id: oblId,
        companyId: compDoc.id,
        company: comp.name || nit,
        nit,
        taxType: calObl.taxType,
        obligationType: "Impuestos",
        period:  displayPeriod((calObl as any).period),
        dueDate: calObl.dueDate,
        year:    calObl.dueDate.slice(0, 4),
        status:  matched?.status ?? "",
        advisor: matched?.advisor ?? "",
        observation: "",
        daysLeft,
        threshold: daysLeft,
      };

      for (const gr of globalRecipients) {
        ensureRecipient(gr.email, gr.name).obligations.push(entry);
      }
      if (matched?.advisor && matched.advisor.includes("@")) {
        ensureRecipient(matched.advisor, matched.advisor).obligations.push(entry);
      }

      await addLog({
        key: alertKey, sentDate: todayStr, obligationId: oblId, source: "calendar",
        companyId: compDoc.id, company: comp.name || nit, nit, taxType: calObl.taxType,
        period: displayPeriod((calObl as any).period), dueDate: calObl.dueDate,
        status: matched?.status ?? "", daysLeft,
      });
    }

    // Obligaciones legales/manuales. Se evalúan de forma independiente al
    // calendario automático: una empresa con una obligación manual vencida debe
    // aparecer aunque no tenga vencimientos DIAN/Bogotá pendientes en el corte.
    const legalObls = allDocs.filter(o => {
      const match = o.companyId ? o.companyId === compDoc.id : companyMatchesByNitOrName(o);
      const representedByCalendar = allCalObls.some(cal =>
        normTax(cal.taxType) === normTax(o.taxType) && sameDate(cal.dueDate, o.dueDate)
      );
      const hasCompletedDuplicate = allDocs.some(other =>
        other.id !== o.id &&
        (other.companyId ? other.companyId === compDoc.id : companyMatchesByNitOrName(other)) &&
        normTax(other.taxType) === normTax(o.taxType) &&
        sameDate(other.dueDate, o.dueDate) &&
        (COMPLETED_STATUSES.has(other.status ?? "") || other.status === "No aplica")
      );
      return shouldIncludeManualAlert({
        companyMatches: Boolean(match),
        resolved: COMPLETED_STATUSES.has(o.status ?? "") || o.status === "No aplica",
        representedByCalendar,
        hasCompletedDuplicate,
        excludedByCompany: hidden.has(o.taxType),
        dueDate: o.dueDate,
        today: todayStr,
        overdueFrom: OVERDUE_FROM,
        upcomingWindow: UPCOMING_WINDOW,
      });
    });

    for (const obl of legalObls) {
      const due = new Date(obl.dueDate + "T00:00:00");
      const daysLeft = Math.round((due.getTime() - today.getTime()) / 86_400_000);

      const alertKey = `${obl.id}__legal__${daysLeft}__${todayStr}`;
      if (alreadySent.has(alertKey)) { skipped++; continue; }

      const entry = {
        ...obl, companyId: compDoc.id, period: displayPeriod(obl.period), daysLeft, threshold: daysLeft,
      };
      for (const gr of globalRecipients) ensureRecipient(gr.email, gr.name).obligations.push(entry);
      if (obl.advisor?.includes("@")) ensureRecipient(obl.advisor, obl.advisor).obligations.push(entry);
      await addLog({
        key: alertKey, sentDate: todayStr, obligationId: obl.id, source: "manual",
        companyId: compDoc.id, company: comp.name || nit, nit,
        taxType: obl.taxType, period: displayPeriod(obl.period), dueDate: obl.dueDate,
        status: obl.status ?? "", daysLeft,
      });
    }
  }

  // Si no hay ningún vencimiento que reportar, igual se envía el correo diario
  // a contabilidad/admin (con las tablas vacías) para confirmar que la alerta
  // corrió correctamente — un día sin novedades no debe leerse como que el
  // sistema dejó de enviar el reporte.
  if (recipientMap.size === 0) {
    for (const gr of globalRecipients) ensureRecipient(gr.email, gr.name);
  }

  // Mapa: índice canónico → NIT limpio (para rellenar NITs vacíos en entradas manuales)
  const canonicalNitMap = new Map<number, string>();
  for (const d of companiesSnap.docs) {
    const data = d.data();
    const nitClean = cNit(data.nit ?? "");
    if (!nitClean) continue;
    const idx = companyIdx(data.name ?? "");
    if (!canonicalNitMap.has(idx)) canonicalNitMap.set(idx, nitClean);
  }

  type CompanyStatus = { idx: number; name: string; overdue: number; urgent: number };
  const makeCompanyStatusGrid = (obligations: AlertRecipient["obligations"]) => {
    const statuses = new Map<string, CompanyStatus>();
    for (const obl of obligations) {
      const idx = orderOf(obl);
      const key = obl.companyId ?? (idx < COMPANY_ORDER.length ? `idx_${idx}` : normalizeCompany(obl.company));
      if (!statuses.has(key)) statuses.set(key, { idx, name: nameOf(obl), overdue: 0, urgent: 0 });
      const status = statuses.get(key)!;
      if (obl.daysLeft < 0) status.overdue++;
      else status.urgent++;
    }

    const sorted = [...statuses.values()].sort((a, b) => a.idx - b.idx || a.name.localeCompare(b.name));
    const rows: string[] = [];
    for (let i = 0; i < sorted.length; i += 3) {
      const triple = sorted.slice(i, i + 3);
      while (triple.length < 3) triple.push({ idx: 99, name: "", overdue: 0, urgent: 0 });
      const cells = triple.map(cs => {
        if (!cs.name) return `<td width="33%" style="padding:4px">&nbsp;</td>`;
        const overdue = cs.overdue > 0;
        const emoji = overdue ? "🔴" : "🟡";
        const bg = overdue ? "#fff0f0" : "#fffbeb";
        const fg = overdue ? "#b91c1c" : "#b45309";
        const border = overdue ? "#fca5a5" : "#fcd34d";
        const count = overdue ? cs.overdue : cs.urgent;
        const statusTxt = overdue
          ? `${count} vencida${count !== 1 ? "s" : ""} sin gestionar`
          : `${count} pr&#xF3;xima${count !== 1 ? "s" : ""} en 7 d&#xED;as`;
        return `<td width="33%" style="padding:4px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            <tr><td bgcolor="${bg}" style="background-color:${bg};padding:9px 11px;border:1px solid ${border}">
              <p style="margin:0 0 2px;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;color:#374151;white-space:nowrap;overflow:hidden">${cs.name}</p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;color:${fg}">${emoji} ${statusTxt}</p>
            </td></tr>
          </table>
        </td>`;
      });
      rows.push(`<tr>${cells.join("")}</tr>`);
    }
    if (rows.length === 0) {
      return `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b7280;text-align:center">&#x2705; Todas las empresas est&#xE1;n al d&#xED;a. No hay vencimientos pendientes ni pr&#xF3;ximos.</p>`;
    }
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table>`;
  };

  // ── Normalizar nombres canónicos y dedup final ────────────────────────────
  // Evita que "NETCOL INGENIERÍA S.A.S BIC" y "Netcol Ingeniería SAS BIC"
  // aparezcan como dos empresas distintas en el correo.
  for (const rec of recipientMap.values()) {
    // Convertir al nombre real (por companyId cuando existe) y rellenar NIT vacío
    rec.obligations = rec.obligations.map(o => {
      const idx = companyIdx(o.company);
      return {
        ...o,
        company: nameOf(o),
        nit: cNit(o.nit) || canonicalNitMap.get(idx) || o.nit,
      };
    });
    // Dedup: quedarse con el de mayor prioridad de estado por empresa+taxType+fecha.
    // Agrupar por companyId cuando está disponible es más confiable que por nombre.
    const bestMap = new Map<string, typeof rec.obligations[0]>();
    for (const o of rec.obligations) {
      const key = `${(o as any).companyId ?? o.company}__${normalizeTaxTypeAlert(o.taxType)}__${o.dueDate}`;
      const existing = bestMap.get(key);
      if (!existing || statusPriority(o.status ?? "") > statusPriority(existing.status ?? "")) {
        bestMap.set(key, o);
      }
    }
    rec.obligations = [...bestMap.values()];
  }

  // Trazabilidad por destinatario: permite comparar cada correo con su propio
  // corte anterior en lugar de mezclar obligaciones de administradores y asesores.
  const recipientEmailsByObligation = new Map<string, Set<string>>();
  const changesByRecipient = new Map<string, ReturnType<typeof compareAlertCuts>>();
  for (const recipient of recipientMap.values()) {
    const changes = previousSentDate
      ? compareAlertCuts(recipient.obligations.map(o => o.id), previousAlertSnapshots, recipient.email)
      : { newIds: new Set<string>(), noLongerAlerted: [] };
    changesByRecipient.set(recipient.email, changes);
    for (const obligation of recipient.obligations) {
      obligation.isNew = changes.newIds.has(obligation.id);
      if (!recipientEmailsByObligation.has(obligation.id)) {
        recipientEmailsByObligation.set(obligation.id, new Set());
      }
      recipientEmailsByObligation.get(obligation.id)!.add(recipient.email);
    }
  }

  // Send emails
  const graphToken = await getGraphTokenInteegra();
  const sender = SENDER_EMAIL_2.value().trim();
  let sent = 0;
  let failed = 0;

  for (const recipient of recipientMap.values()) {
    // Un destinatario solo llega aquí con 0 obligaciones en el caso "sin
    // novedades" (ver arriba) — se envía igual, con las secciones vacías.

    // Agrupar primero por empresa (orden de prioridad del negocio) y solo dentro
    // de cada empresa ordenar por urgencia — así todas las obligaciones de una
    // misma empresa quedan juntas en la tabla en vez de esparcidas por fecha.
    const overdueObls  = recipient.obligations.filter(o => o.daysLeft < 0)
      .sort((a, b) => orderOf(a) - orderOf(b) || b.daysLeft - a.daysLeft);
    const upcomingObls = recipient.obligations.filter(o => o.daysLeft >= 0)
      .sort((a, b) => orderOf(a) - orderOf(b) || a.daysLeft - b.daysLeft);
    const companyStatusGrid = makeCompanyStatusGrid(recipient.obligations);
    const newCount = recipient.obligations.filter(o => o.isNew).length;
    const resolvedSincePrevious = changesByRecipient.get(recipient.email)?.noLongerAlerted ?? [];

    const makeRow = (o: any, isOverdue: boolean) => {
      const statusColor = o.status === "No iniciado" ? "#6b7280" : o.status === "Revisado" ? "#3b82f6" : "#16a34a";
      const daysColor   = isOverdue ? "#dc2626" : o.daysLeft <= 3 ? "#ea580c" : o.daysLeft <= 7 ? "#d97706" : "#1d4ed8";
      const daysBg      = isOverdue ? "#fef2f2" : o.daysLeft <= 3 ? "#fff7ed" : o.daysLeft <= 7 ? "#fffbeb" : "#eff6ff";
      const daysLabel   = isOverdue
        ? `Vencido hace ${Math.abs(o.daysLeft)}d`
        : o.daysLeft === 0 ? "HOY" : o.daysLeft === 1 ? "Ma&#xF1;ana" : `${o.daysLeft} d&#xED;as`;
      return `
        <tr>
          <td style="padding:9px 12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1f2937;font-weight:600;border-bottom:1px solid #f3f4f6">${o.company}${o.isNew ? `<br/><span style="display:inline-block;margin-top:3px;padding:2px 5px;background:#eff6ff;color:#1d4ed8;font-size:9px;font-weight:700">NUEVA DESDE EL ÚLTIMO CORREO</span>` : ""}${cNit(o.nit) ? `<br/><span style="font-size:10px;font-weight:400;color:#9ca3af">NIT: ${cNit(o.nit)}</span>` : ""}</td>
          <td style="padding:9px 12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#374151;border-bottom:1px solid #f3f4f6">${displayTax(o.taxType)}</td>
          <td style="padding:9px 12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6b7280;border-bottom:1px solid #f3f4f6">${o.period ?? ""}</td>
          <td style="padding:9px 12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6b7280;border-bottom:1px solid #f3f4f6;white-space:nowrap">${o.dueDate.split("-").reverse().join("/")}</td>
          <td align="center" style="padding:9px 12px;border-bottom:1px solid #f3f4f6">
            <span style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;color:${statusColor}">${o.status || "Sin gestionar"}</span>
          </td>
          <td align="center" bgcolor="${daysBg}" style="padding:9px 12px;background-color:${daysBg};border-bottom:1px solid #f3f4f6;white-space:nowrap">
            <span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:${daysColor}">${daysLabel}</span>
          </td>
        </tr>`;
    };

    const TABLE_HEADER = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb">
      <tr bgcolor="#f9fafb" style="background-color:#f9fafb">
        <th align="left" style="padding:8px 12px;font-family:Arial,Helvetica,sans-serif;font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #e5e7eb">Empresa</th>
        <th align="left" style="padding:8px 12px;font-family:Arial,Helvetica,sans-serif;font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #e5e7eb">Obligaci&#xF3;n</th>
        <th align="left" style="padding:8px 12px;font-family:Arial,Helvetica,sans-serif;font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #e5e7eb">Per&#xED;odo</th>
        <th align="left" style="padding:8px 12px;font-family:Arial,Helvetica,sans-serif;font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #e5e7eb">Vence</th>
        <th align="center" style="padding:8px 12px;font-family:Arial,Helvetica,sans-serif;font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #e5e7eb">Estado</th>
        <th align="center" style="padding:8px 12px;font-family:Arial,Helvetica,sans-serif;font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #e5e7eb">D&#xED;as</th>
      </tr>`;

    const overdueSection = overdueObls.length === 0 ? "" : `
  <!-- VENCIDOS -->
  <tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:24px 32px 8px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;border-top:1px solid #f3f4f6">
    <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:1.5px">&#128308; Vencimientos sin gestionar (${overdueObls.length})</p>
    ${TABLE_HEADER}${overdueObls.map(o => makeRow(o, true)).join("")}</table>
  </td></tr>`;

    const upcomingSection = upcomingObls.length === 0 ? "" : `
  <!-- PROXIMOS -->
  <tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:24px 32px 8px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;border-top:1px solid #f3f4f6">
    <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:#006C2F;text-transform:uppercase;letter-spacing:1.5px">&#128197; Pr&#xF3;ximos 7 d&#xED;as (${upcomingObls.length})</p>
    ${TABLE_HEADER}${upcomingObls.map(o => makeRow(o, false)).join("")}</table>
  </td></tr>`;

    const resolvedSection = resolvedSincePrevious.length === 0 ? "" : `
  <!-- YA NO REQUIEREN ALERTA -->
  <tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:24px 32px 8px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;border-top:1px solid #f3f4f6">
    <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:1.5px">✅ Ya no requieren alerta (${resolvedSincePrevious.length})</p>
    <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#6b7280">Estaban en el correo del ${previousSentDate.split("-").reverse().join("/")} y ya no aparecen en el corte actual.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #dcfce7">
      ${resolvedSincePrevious.map(o => `<tr>
        <td style="padding:8px 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#166534;border-bottom:1px solid #dcfce7"><strong>${o.company ?? "Empresa"}</strong>${o.nit ? `<br/><span style="font-size:9px;color:#6b7280">NIT: ${cNit(o.nit)}</span>` : ""}</td>
        <td style="padding:8px 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#374151;border-bottom:1px solid #dcfce7">${displayTax(o.taxType ?? "")}</td>
        <td style="padding:8px 10px;font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#6b7280;border-bottom:1px solid #dcfce7">${o.period ?? ""}</td>
      </tr>`).join("")}
    </table>
  </td></tr>`;

    const year = new Date().getFullYear();
    const dateStr = new Date().toLocaleDateString("es-CO", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    const html = `<!DOCTYPE html>
<html lang="es" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f3f4f6">
<tr><td align="center" style="padding:24px 16px">
<!--[if mso]><table role="presentation" width="640" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" style="max-width:640px" cellpadding="0" cellspacing="0">

  <!-- HEADER -->
  <tr><td bgcolor="#006C2F" style="background-color:#006C2F;padding:28px 32px;text-align:center">
    <p style="margin:0 0 2px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#7BCB6A;letter-spacing:3px;text-transform:uppercase">CALENDARIO TRIBUTARIO</p>
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:3px">INTEEGRADOS</p>
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:10px auto 0">
      <tr><td bgcolor="#7BCB6A" style="background-color:#7BCB6A;height:3px;width:40px;font-size:0;line-height:0">&nbsp;</td></tr>
    </table>
    <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;color:#ffffff">Alertas de Vencimiento</p>
    <p style="margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#a7f3d0">${dateStr}</p>
  </td></tr>

  <!-- GREETING -->
  <tr><td bgcolor="#f0fdf4" style="background-color:#f0fdf4;padding:14px 32px;border-left:1px solid #d1fae5;border-right:1px solid #d1fae5">
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#166534">
      Hola <strong>${recipient.name}</strong> &mdash;
      ${overdueObls.length > 0 ? `<strong style="color:#dc2626">${overdueObls.length} vencimiento${overdueObls.length !== 1 ? "s" : ""} sin gestionar.</strong> ` : ""}
      ${upcomingObls.length > 0 ? `<strong>${upcomingObls.length} obligaci&#xF3;n${upcomingObls.length !== 1 ? "es" : ""}</strong> vence${upcomingObls.length !== 1 ? "n" : ""} en los pr&#xF3;ximos 7 d&#xED;as.` : "No hay vencimientos pr&#xF3;ximos en 7 d&#xED;as."}
      ${newCount > 0 ? `<br/><span style="font-size:11px;color:#1d4ed8"><strong>${newCount}</strong> ${newCount === 1 ? "es nueva" : "son nuevas"} desde el correo del ${previousSentDate.split("-").reverse().join("/")}.</span>` : ""}
    </p>
  </td></tr>

  ${overdueSection}
  ${upcomingSection}
  ${resolvedSection}

  <!-- ══ ESTADO POR EMPRESA ══ -->
  <tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:24px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;border-top:1px solid #f3f4f6">
    <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:#006C2F;text-transform:uppercase;letter-spacing:1.5px">&#127970; Estado por empresa</p>
    ${companyStatusGrid}
    <p style="margin:18px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9ca3af;text-align:center">
      Ingresa a la plataforma para actualizar el estado de cada obligaci&#xF3;n.
    </p>
  </td></tr>

  <!-- FOOTER -->
  <tr><td bgcolor="#1f2937" style="background-color:#1f2937;padding:18px 32px;text-align:center">
    <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:2px;color:#ffffff">INTEEGRADOS</p>
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#6b7280">
      Alerta autom&#xE1;tica &middot; Calendario Tributario &middot; &copy; ${year}
    </p>
  </td></tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body></html>`;

    try {
      const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
        method: "POST",
        headers: { Authorization: `Bearer ${graphToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            subject: (() => {
              const parts: string[] = [];
              if (overdueObls.length > 0) parts.push(`🔴 ${overdueObls.length} vencido${overdueObls.length !== 1 ? "s" : ""} sin gestionar`);
              if (upcomingObls.length > 0) parts.push(`📅 ${upcomingObls.length} próximo${upcomingObls.length !== 1 ? "s" : ""} (≤7d)`);
              return parts.length > 0 ? parts.join(" · ") : "Calendario Tributario — Sin novedades";
            })(),
            body: { contentType: "HTML", content: html },
            toRecipients: [{ emailAddress: { address: recipient.email } }],
          },
          saveToSentItems: true,
        }),
      });
      if (res.ok) {
        sent++;
      } else {
        failed++;
        console.error(`Tax alert email failed for ${recipient.email}: HTTP ${res.status}`);
      }
    } catch (error) {
      failed++;
      console.error(`Tax alert email failed for ${recipient.email}:`, error);
    }
  }

  // Marcar las alertas como enviadas solo cuando todos los destinatarios
  // recibieron correctamente el correo. Ante un fallo parcial se permite el
  // reintento del siguiente ciclo, evitando perder obligaciones silenciosamente.
  if (failed === 0 && sent > 0) {
    for (const data of pendingAlertLogs.values()) {
      const obligationId = (data as { obligationId?: string }).obligationId;
      const recipientEmails = obligationId
        ? [...(recipientEmailsByObligation.get(obligationId) ?? [])]
        : [];
      currentBatch.set(logRef.doc(), {
        ...data, recipientEmails,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      batchCount++;
      if (batchCount >= 400) await flushBatch();
    }
    await flushBatch();
  }

  return { sent, skipped, failed };
}


/**
 * Scheduled: runs every day at 8:00 AM Colombia time (UTC-5 = 13:00 UTC)
 */
export const scheduledTaxAlerts = onSchedule(
  {
    schedule: "0 9 * * *",
    timeZone: "America/Bogota",
    region: "us-central1",
    secrets: [TENANT_ID_2, CLIENT_ID_2, CLIENT_SECRET_2, SENDER_EMAIL_2],
  },
  async () => {
    const result = await runTaxAlerts(admin.firestore());
    console.log(`Tax alerts sent: ${result.sent}, failed: ${result.failed}, skipped (already sent): ${result.skipped}`);
  }
);

/**
 * Callable: manually trigger alerts from the admin UI
 */
export const triggerTaxAlerts = onCall(
  {
    region: "us-central1",
    cors: true,
    secrets: [TENANT_ID_2, CLIENT_ID_2, CLIENT_SECRET_2, SENDER_EMAIL_2],
  },
  async (request) => {
    await requirePlatformRole(request, ["admin"]);
    const force = request.data?.force === true;
    const result = await runTaxAlerts(admin.firestore(), force);
    return result;
  }
);

/**
 * Callable: find obligations duplicated between Firestore and auto-calendar
 */
export const findDuplicateAlerts = onCall(
  { region: "us-central1", cors: true },
  async (request) => {
    await requirePlatformRole(request, ["admin"]);
    const db = admin.firestore();
    const snap = await db.collection(ACCOUNTING_COLLECTIONS.obligations).get();
    const allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() } as TaxObligation));

    // Índice de todas las obligaciones Firestore
    const firestoreIndex = new Map<string, TaxObligation>();
    for (const o of allDocs) {
      const key = `${o.nit}__${o.taxType.toLowerCase().trim()}__${o.dueDate}`;
      firestoreIndex.set(key, o);
    }

    // Generar obligaciones del calendario auto
    const companiesSnap = await db.collection(ORGANIZATION_COLLECTIONS.companies)
      .where("active", "==", true)
      .where("activeContabilidad", "==", true)
      .get();
    const companyTaxSettingsSnap = await db.collection(ACCOUNTING_COLLECTIONS.companyTaxSettings).get();
    const excludedTaxTypesByCompany = new Map(companyTaxSettingsSnap.docs.map(doc => [
      doc.id,
      doc.data().excludedTaxTypes ?? [],
    ]));

    const duplicates: Array<{
      key: string; company: string; nit: string;
      taxType: string; dueDate: string;
      firestoreStatus: string; firestoreId: string;
    }> = [];

    for (const compDoc of companiesSnap.docs) {
      const comp = compDoc.data();
      const nit: string = comp.nit || "";
      if (!nit) continue;
      const hidden = new Set<string>(excludedTaxTypesByCompany.get(compDoc.id) ?? []);
      const dianObls = getDianObligationsByNit(nit).filter((o: any) => !hidden.has(o.taxType));
      const bogotaObls = [...ALL_BOGOTA_2026, ...getBogotaObligationsByNit(nit)].filter((o: any) => !hidden.has(o.taxType));

      for (const calObl of [...dianObls, ...bogotaObls]) {
        const key = `${nit}__${(calObl.taxType as string).toLowerCase().trim()}__${calObl.dueDate}`;
        if (firestoreIndex.has(key)) {
          const fs = firestoreIndex.get(key)!;
          duplicates.push({
            key,
            company: comp.name || nit,
            nit,
            taxType: calObl.taxType as string,
            dueDate: calObl.dueDate as string,
            firestoreStatus: fs.status,
            firestoreId: fs.id,
          });
        }
      }
    }

    return { total: duplicates.length, duplicates };
  }
);


/**
 * Creates calendar events (Teams/Outlook) for all non-completed tax obligations.
 * Each obligation becomes an all-day event on its due date with attendees = contabilidad users.
 * Tracks created events in tax_calendar_events to avoid duplicates.
 * Payload: { daysAhead?: number }  — only schedule obligations due within N days (default 90)
 */
export const scheduleTaxInCalendar = onCall(
  {
    region: "us-central1",
    cors: true,
    secrets: [TENANT_ID_2, CLIENT_ID_2, CLIENT_SECRET_2, SENDER_EMAIL_2],
  },
  async (request) => {
    await requirePlatformRole(request, ["admin"]);
    const db = admin.firestore();
    const daysAhead: number = Number(request.data?.daysAhead ?? 90);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + daysAhead);

    // Load non-completed obligations within window
    const snap = await db.collection(ACCOUNTING_COLLECTIONS.obligations).get();
    const obligations: TaxObligation[] = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as TaxObligation))
      .filter(o => {
        if (COMPLETED_STATUSES.has(o.status)) return false;
        if (!o.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(o.dueDate)) return false;
        const due = new Date(o.dueDate + "T00:00:00");
        return due >= today && due <= cutoff;
      });

    if (obligations.length === 0) return { scheduled: 0, skipped: 0 };

    // Load contabilidad + admin attendees
    const rolesSnap = await db.collection(IDENTITY_COLLECTIONS.platformRoles)
      .where("role", "in", ["contabilidad", "admin"])
      .get();
    const attendees = rolesSnap.docs.map(d => ({
      emailAddress: { address: d.data().email || d.id, name: d.data().name || d.id },
      type: "required",
    }));

    if (attendees.length === 0) return { scheduled: 0, skipped: 0, error: "No hay usuarios de contabilidad registrados" };

    // Check already-scheduled events
    const eventsRef = db.collection(ACCOUNTING_COLLECTIONS.calendarEvents);
    const existingSnap = await eventsRef.get();
    const alreadyScheduled = new Set(existingSnap.docs.map(d => d.data().obligationId as string));

    const graphToken = await getGraphTokenInteegra();
    const sender = SENDER_EMAIL_2.value().trim();
    let scheduled = 0;
    let skipped = 0;

    for (const obl of obligations) {
      if (alreadyScheduled.has(obl.id)) { skipped++; continue; }

      const startDT = `${obl.dueDate}T09:00:00`;
      const endDT   = `${obl.dueDate}T10:00:00`;

      const bodyHtml = `
        <p><b>Empresa:</b> ${obl.company} &nbsp;|&nbsp; <b>NIT:</b> ${obl.nit}</p>
        <p><b>Obligación:</b> ${displayTax(obl.taxType)} — ${obl.obligationType}</p>
        <p><b>Periodo:</b> ${obl.period} &nbsp;|&nbsp; <b>Año:</b> ${obl.year}</p>
        ${obl.advisor ? `<p><b>Asesor:</b> ${obl.advisor}</p>` : ""}
        <p><b>Estado actual:</b> ${obl.status || "Pendiente"}</p>
        ${obl.observation ? `<p><b>Observación:</b> ${obl.observation}</p>` : ""}
        <hr/>
        <p style="color:#6b7280;font-size:12px">Evento generado automáticamente por Inteegrados · Calendario Tributario</p>
      `;

      const event = {
        subject: `📋 Vencimiento: ${obl.taxType} · ${obl.company} (${obl.period})`,
        body: { contentType: "HTML", content: bodyHtml },
        start: { dateTime: startDT, timeZone: "America/Bogota" },
        end:   { dateTime: endDT,   timeZone: "America/Bogota" },
        attendees,
        isReminderOn: true,
        reminderMinutesBeforeStart: 1440, // 1 day before
        showAs: "free",
      };

      try {
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/events`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${graphToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(event),
          }
        );
        if (res.ok) {
          const created = await res.json();
          await eventsRef.add({
            obligationId: obl.id,
            eventId: created.id || "",
            dueDate: obl.dueDate,
            company: obl.company,
            taxType: obl.taxType,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          scheduled++;
        } else {
          console.error("Graph event error:", await res.text());
        }
      } catch (e) {
        console.error("Calendar event error:", e);
      }
    }

    return { scheduled, skipped };
  }
);
// ── Fetch public questionnaire (no auth required) ────────────────────────────
export const getPublicQuestionnaire = onCall(
  { region: "us-central1", cors: true },
  async (request) => {
    const questionnaireId = String(request.data?.questionnaireId || "").trim();
    if (!questionnaireId) throw new HttpsError("invalid-argument", "questionnaireId requerido");

    const firestore = admin.firestore();
    const qDoc = await firestore.collection(QUESTIONNAIRE_COLLECTIONS.definitions).doc(questionnaireId).get();

    if (!qDoc.exists) throw new HttpsError("not-found", "Formulario no encontrado");

    const q = qDoc.data()!;
    if (!q.active)   throw new HttpsError("failed-precondition", "Este formulario ya no está activo");
    if (!q.isPublic) throw new HttpsError("permission-denied", "Este formulario no es público");

    return {
      id: qDoc.id,
      title:       q.title       ?? "",
      description: q.description ?? "",
      questions:   q.questions   ?? [],
    };
  }
);

// ── Public form submission (no token/assignment required) ────────────────────
export const submitPublicFormResponse = onCall(
  { region: "us-central1", cors: true },
  async (request) => {
    const { questionnaireId, name, email, answers } = request.data ?? {};

    if (!questionnaireId || typeof questionnaireId !== "string") {
      throw new HttpsError("invalid-argument", "questionnaireId requerido");
    }
    if (!name || typeof name !== "string" || name.trim() === "") {
      throw new HttpsError("invalid-argument", "nombre requerido");
    }
    if (!email || typeof email !== "string" || !email.includes("@")) {
      throw new HttpsError("invalid-argument", "correo inválido");
    }
    if (!answers || typeof answers !== "object") {
      throw new HttpsError("invalid-argument", "respuestas requeridas");
    }

    const firestore = admin.firestore();
    const cleanEmail = email.toLowerCase().trim();
    const cleanName  = name.trim();

    // 1) Verificar que el cuestionario existe, está activo y es público
    const qDoc = await firestore.collection(QUESTIONNAIRE_COLLECTIONS.definitions).doc(questionnaireId).get();
    if (!qDoc.exists) {
      throw new HttpsError("not-found", "Formulario no encontrado");
    }
    const q = qDoc.data()!;
    if (!q.active) {
      throw new HttpsError("failed-precondition", "Este formulario ya no está activo");
    }
    if (!q.isPublic) {
      throw new HttpsError("permission-denied", "Este formulario no es público");
    }

    // 2) Verificar que el correo no haya respondido antes (por cualquier canal)
    const prev = await firestore
      .collection(QUESTIONNAIRE_COLLECTIONS.responses)
      .where("questionnaireId", "==", questionnaireId)
      .where("userEmail", "==", cleanEmail)
      .limit(1)
      .get();

    if (!prev.empty) {
      throw new HttpsError(
        "already-exists",
        "Este correo ya respondió este formulario"
      );
    }

    // 3) Guardar respuesta
    await firestore.collection(QUESTIONNAIRE_COLLECTIONS.responses).add({
      questionnaireId,
      userId:    cleanEmail,
      userName:  cleanName,
      userEmail: cleanEmail,
      answers,
      status:      "completed",
      source:      "public",
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      exported:    false,
      exportedAt:  null,
      exportError: null,
    });

    return { ok: true };
  }
);

// Trigger: when a recipient is marked as read, sync totalRead on the communication doc
export const onRecipientRead = onDocumentUpdated(
  { document: "communications/data/recipients/{docId}", region: "us-central1" },
  async (event) => {
    const before = event.data?.before?.data();
    const after  = event.data?.after?.data();
    if (!before || !after) return;
    // Only act when status changes to "read"
    if (before.status === after.status) return;
    if (after.status !== "read") return;
    const communicationId = after.communicationId;
    if (!communicationId) return;
    const db = admin.firestore();
    const snap = await db.collection(COMMUNICATION_COLLECTIONS.recipients)
      .where("communicationId", "==", communicationId)
      .where("status", "==", "read")
      .get();
    await db.collection(COMMUNICATION_COLLECTIONS.messages).doc(communicationId).update({
      totalRead: snap.size,
    });
  }
);

/**
 * Notifica por correo en cada cambio de estado de una obligación tributaria.
 * - No iniciado → aviso de inicio de proceso
 * - Revisado / Informe Enviado / Presentado → aviso de avance
 * - Pagado → correo especial solicitando registro del comprobante
 */
export const notifyTaxStatusChange = onCall(
  {
    region: "us-central1",
    cors: true,
    secrets: [TENANT_ID_2, CLIENT_ID_2, CLIENT_SECRET_2, SENDER_EMAIL_2],
  },
  async (request) => {
    await requirePlatformRole(request, ["admin", "contabilidad", "financiera"]);
    const {
      companyName,
      nit,
      taxType,
      period,
      dueDate,
      newStatus,
      changedBy,
      recipients,       // [{ name, email }]
      projectedAmount,  // valor proyectado (opcional)
      forFinanciera,    // true cuando el correo va al equipo financiero
      obligationId,     // ID Firestore para deep link
    } = request.data || {};

    if (!companyName || !taxType || !newStatus || !recipients?.length) {
      throw new HttpsError("invalid-argument", "Faltan campos requeridos");
    }

    const year = new Date().getFullYear();
    const token  = await getGraphTokenInteegra();
    const sender = SENDER_EMAIL_2.value().trim();

    const fmtDate = (d: string) => {
      if (!d) return "—";
      const [y, m, dd] = d.split("-");
      const months = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
      return `${dd} ${months[parseInt(m)] ?? m} ${y}`;
    };

    const STATUS_LABELS: Record<string, string> = {
      "No iniciado":    "Proceso iniciado 🚀",
      "Revisado":       "Revisada ✔",
      "Informe Enviado":"Informe enviado al cliente ✔",
      "Presentado":     "Presentada ante la DIAN ✔",
      "Pagado":         "Pagada ✔",
      "No aplica":      "Marcada como No aplica",
    };

    const STATUS_COLORS: Record<string, string> = {
      "No iniciado":    "#6366f1",
      "Revisado":       "#3b82f6",
      "Informe Enviado":"#0d9488",
      "Presentado":     "#7c3aed",
      "Pagado":         "#16a34a",
      "No aplica":      "#9ca3af",
    };

    const badgeColor = STATUS_COLORS[newStatus] ?? "#008C3C";
    const badgeLabel = STATUS_LABELS[newStatus] ?? newStatus;
    const isPagado   = newStatus === "Pagado";

    const infoBlock = `
      <table width="100%" cellpadding="0" cellspacing="0"
             style="border:1px solid #e5e7eb;border-radius:10px;margin:20px 0;overflow:hidden">
        <tr style="background:#f9fafb">
          <td style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:700;
                     text-transform:uppercase;letter-spacing:.8px;border-bottom:1px solid #e5e7eb"
              colspan="2">Detalle de la obligación</td>
        </tr>
        ${[
          ["Empresa",   companyName],
          ["NIT",       nit ?? "—"],
          ["Impuesto",  taxType],
          ["Período",   period ?? "—"],
          ["Vence",     fmtDate(dueDate)],
          ["Registrado por", changedBy ?? "—"],
        ].map(([label, value]) => `
          <tr>
            <td style="padding:8px 16px;font-size:12px;color:#6b7280;width:38%;
                       border-bottom:1px solid #f3f4f6">${label}</td>
            <td style="padding:8px 16px;font-size:12px;color:#111827;font-weight:600;
                       border-bottom:1px solid #f3f4f6">${value}</td>
          </tr>
        `).join("")}
      </table>
    `;

    const fmtCurrency = (v: any) => {
      const n = parseFloat(v);
      if (isNaN(n)) return "—";
      return n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
    };

    const isPresentado   = newStatus === "Presentado";
    const isIniciado     = newStatus === "No iniciado";

    const pagadoCallout = isPagado ? `
      <div style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;
                  padding:16px 20px;margin:20px 0">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#92400e">
          ⚠️ Acción requerida — Equipo Financiero
        </p>
        <p style="margin:0;font-size:13px;color:#78350f;line-height:1.6">
          Esta obligación fue marcada como <b>Pagada</b>. Por favor registra el
          comprobante de pago y el <b>valor real pagado</b> en la plataforma para
          mantener el historial completo.
        </p>
      </div>
    ` : "";

    const financieraCallout = (isPresentado && forFinanciera) ? `
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;
                  padding:16px 20px;margin:20px 0">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#166534">
          💳 Acción requerida — Equipo Financiero
        </p>
        <p style="margin:0 0 10px;font-size:13px;color:#15803d;line-height:1.6">
          La obligación <b>${taxType}</b> de <b>${companyName}</b> ya fue
          <b>presentada</b>. Por favor ingresa a la plataforma y registra el
          <b>valor real pagado</b> en el campo "Valor pagado" para cerrar el ciclo.
        </p>
        ${projectedAmount ? `
        <p style="margin:0;font-size:12px;color:#166534;background:#dcfce7;
                  border-radius:6px;padding:8px 12px;display:inline-block">
          Valor proyectado por contabilidad: <b>${fmtCurrency(projectedAmount)}</b>
        </p>` : ""}
      </div>
    ` : "";

    const subject = isPagado
      ? `[Acción requerida] ${taxType} — ${companyName} marcado como Pagado`
      : (isPresentado && forFinanciera)
        ? `[Pago pendiente] ${taxType} — ${companyName}: registra el valor pagado`
        : isIniciado
          ? `[Proceso iniciado] ${taxType} — ${companyName}`
          : `[Calendario Tributario] ${taxType} — ${companyName}: ${newStatus}`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;
                  line-height:1.6;color:#374151">
        <div style="background:linear-gradient(135deg,#005528,#008C3C);padding:28px 24px;
                    border-radius:12px 12px 0 0;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:2px;font-weight:800">
            INTE<span style="color:#7BCB6A">E</span>GRADOS
          </h1>
          <p style="color:#7BCB6A;margin:4px 0 0;font-size:11px;letter-spacing:1px">
            CALENDARIO TRIBUTARIO
          </p>
        </div>

        <div style="background:#fff;padding:28px 24px;border:1px solid #e5e7eb;
                    border-top:none;border-radius:0 0 12px 12px">
          <p style="font-size:15px;margin-top:0">Hola equipo,</p>

          <p style="font-size:14px;color:#374151">
            La siguiente obligación tributaria cambió su estado a
            <span style="display:inline-block;background:${badgeColor};color:#fff;
                         font-weight:700;font-size:12px;padding:3px 10px;
                         border-radius:20px;vertical-align:middle">
              ${badgeLabel}
            </span>
          </p>

          ${infoBlock}
          ${financieraCallout}
          ${pagadoCallout}

          ${obligationId ? `
          <div style="text-align:center;margin:24px 0 8px">
            <a href="https://people-analitics.inteegra.net.co/contabilidad?obl=${obligationId}"
               target="_blank"
               style="display:inline-block;background:#008C3C;color:#ffffff;
                      text-decoration:none;font-weight:700;font-size:14px;
                      padding:14px 32px;border-radius:10px;letter-spacing:0.3px">
              📋 Ver obligación en el calendario
            </a>
          </div>
          ` : ""}

          <p style="font-size:11px;color:#9ca3af;text-align:center;
                    margin-top:24px;border-top:1px solid #f3f4f6;padding-top:16px">
            &copy; ${year} Inteegrados &middot; Todos los derechos reservados
          </p>
        </div>
      </div>
    `;

    const sendUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`;

    await Promise.all(
      (recipients as Array<{ name: string; email: string }>).map(r =>
        fetch(sendUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              subject,
              body: { contentType: "HTML", content: html },
              toRecipients: [{ emailAddress: { address: r.email } }],
            },
            saveToSentItems: false,
          }),
        }).then(async res => {
          if (!res.ok) {
            const txt = await res.text();
            console.error(`notifyTaxStatusChange: failed for ${r.email}:`, txt);
          }
        })
      )
    );

    return { ok: true };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// DIGEST DIARIO — Resumen 5 PM de cambios en obligaciones tributarias
// ─────────────────────────────────────────────────────────────────────────────

interface TaxDailyLogEntry {
  date: string;
  changedBy: string;
  changedAt?: admin.firestore.Timestamp;
  company: string;
  nit?: string;
  taxType: string;
  period?: string;
  dueDate?: string;
  newStatus: string;
  projected?: number | null;
  obligationId?: string;
}

async function sendDailyDigest(db: admin.firestore.Firestore): Promise<{ sent: number; entries: number }> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

  // Solo filtra por fecha — orderBy en campo distinto requeriría índice compuesto
  const logSnap = await db.collection(ACCOUNTING_COLLECTIONS.dailyActivity)
    .where("date", "==", today)
    .get();

  if (logSnap.empty) return { sent: 0, entries: 0 };

  // Ordenar en memoria por hora de cambio
  const entries: TaxDailyLogEntry[] = logSnap.docs
    .map(d => d.data() as TaxDailyLogEntry)
    .sort((a, b) => (a.changedAt?.toMillis() ?? 0) - (b.changedAt?.toMillis() ?? 0));

  // Agrupar por persona
  const byPerson = new Map<string, TaxDailyLogEntry[]>();
  for (const e of entries) {
    const key = e.changedBy || "Sistema";
    if (!byPerson.has(key)) byPerson.set(key, []);
    byPerson.get(key)!.push(e);
  }

  // Deduplicar por obligación — mantener solo el estado más reciente del día
  // Clave por company+taxType+period (no por ID) para colapsar documentos duplicados
  for (const [person, acts] of byPerson) {
    const seen = new Map<string, TaxDailyLogEntry>();
    for (const a of acts) {
      const key = `${a.company}__${a.taxType}__${a.period ?? ""}`;
      seen.set(key, a);
    }
    byPerson.set(person, Array.from(seen.values()));
  }

  // Destinatarios: contabilidad + financiera + admin
  const rolesSnap = await db.collection(IDENTITY_COLLECTIONS.platformRoles)
    .where("role", "in", ["contabilidad", "financiera", "admin"])
    .get();
  const recipients = rolesSnap.docs.map(d => ({
    name: d.data().name || d.id,
    email: (d.data().email || d.id) as string,
  }));

  if (recipients.length === 0) return { sent: 0, entries: entries.length };

  // Enriquecer con datos de la obligación: projected, paid, stepOwners
  const oblIds = [...new Set(entries.map(e => e.obligationId).filter(Boolean) as string[])];
  const oblMap = new Map<string, { projected?: number; paid?: number; paidAt?: string; stepOwners?: Record<string, string> }>();
  if (oblIds.length > 0) {
    // Firestore no soporta 'in' con más de 30 — partir en chunks
    for (let i = 0; i < oblIds.length; i += 30) {
      const chunk = oblIds.slice(i, i + 30);
      const snap = await db.collection(ACCOUNTING_COLLECTIONS.obligations).where(admin.firestore.FieldPath.documentId(), "in", chunk).get();
      snap.docs.forEach(d => oblMap.set(d.id, d.data() as any));
    }
  }

  const STATUS_COLORS: Record<string, string> = {
    "No iniciado":     "#6366f1",
    "Revisado":        "#3b82f6",
    "Informe Enviado": "#0d9488",
    "Presentado":      "#7c3aed",
    "Pagado":          "#16a34a",
    "No aplica":       "#9ca3af",
  };

  const STEP_ORDER = ["No iniciado", "Revisado", "Informe Enviado", "Presentado", "Pagado"];

  const fmtDate = (d?: string) => {
    if (!d) return "&#8212;";
    const [, m, dd] = d.split("-");
    const months = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    return `${parseInt(dd)} ${months[parseInt(m)] ?? m}`;
  };

  const fmtCOP = (v?: number | null) => {
    if (v == null) return "&#8212;";
    return "$" + v.toLocaleString("es-CO");
  };

  const shortName = (name: string) =>
    name.includes("@") ? name.split("@")[0] : name.split(" ")[0];


  // ── Detalle por persona ───────────────────────────────────────────────────
  const personSections = Array.from(byPerson.entries()).map(([person, acts]) => {
    const cards = acts.map(a => {
      const obl    = a.obligationId ? oblMap.get(a.obligationId) : undefined;
      const owners = obl?.stepOwners ?? {};
      const color  = STATUS_COLORS[a.newStatus] ?? "#008C3C";

      // Historial de pasos con quién hizo cada uno
      const stepBadges = STEP_ORDER.map(step => {
        const who   = owners[step];
        const done  = !!who;
        const isCur = step === a.newStatus;
        const bg    = done ? (STATUS_COLORS[step] ?? "#008C3C") : "#e5e7eb";
        const fg    = done ? "#ffffff" : "#9ca3af";
        const label = step === "Informe Enviado" ? "Inf. Enviado" : step;
        return `<span style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:${isCur ? "700" : "600"};color:${fg};background:${bg};padding:2px 8px;border-radius:20px;margin:2px 2px 2px 0;white-space:nowrap">${label}${done && who ? `&nbsp;(${shortName(who)})` : ""}</span>`;
      }).join(`<span style="color:#d1d5db;font-size:10px;margin:0 1px">&#8250;</span>`);

      const hasPaid = !!obl?.paid;
      return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;margin-bottom:10px">
          <!-- Info principal -->
          <tr>
            <td style="padding:11px 13px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#1f2937;width:35%;border-bottom:1px solid #f3f4f6">${a.company}</td>
            <td style="padding:11px 13px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#374151;width:25%;border-bottom:1px solid #f3f4f6">${displayTax(a.taxType)}</td>
            <td style="padding:11px 13px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6b7280;width:16%;border-bottom:1px solid #f3f4f6">
              ${a.period ?? "&#8212;"}<br/>
              <span style="font-size:10px;color:#9ca3af">Vence: ${fmtDate(a.dueDate)}</span>
            </td>
            <td align="right" style="padding:11px 13px;width:24%;border-bottom:1px solid #f3f4f6">
              <span style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;color:#fff;background:${color};padding:3px 9px;border-radius:20px;white-space:nowrap">${a.newStatus}</span>
            </td>
          </tr>
          <!-- Valores proyectado / pagado -->
          <tr bgcolor="#f9fafb" style="background-color:#f9fafb">
            <td colspan="2" style="padding:9px 13px;border-bottom:1px solid #f3f4f6">
              <span style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px">Proyectado</span><br/>
              <span style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#1f2937">${fmtCOP(obl?.projected)}</span>
            </td>
            <td colspan="2" style="padding:9px 13px;border-bottom:1px solid #f3f4f6">
              <span style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px">Pagado</span><br/>
              <span style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:${hasPaid ? "#16a34a" : "#6b7280"}">${fmtCOP(obl?.paid)}</span>
              ${obl?.paidAt ? `<br/><span style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#9ca3af">Pagado el ${fmtDate(obl.paidAt)}</span>` : ""}
            </td>
          </tr>
          <!-- Historial del proceso -->
          <tr>
            <td colspan="4" style="padding:9px 13px">
              <p style="margin:0 0 5px;font-family:Arial,Helvetica,sans-serif;font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Historial del proceso</p>
              ${stepBadges}
            </td>
          </tr>
        </table>`;
    }).join("");

    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:28px">
        <tr><td bgcolor="#f9fafb" style="background-color:#f9fafb;padding:10px 14px;border-left:3px solid #006C2F">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#1f2937">
            &#128100; ${person} &nbsp;<span style="font-weight:400;font-size:12px;color:#6b7280">${acts.length} cambio${acts.length !== 1 ? "s" : ""} hoy</span>
          </p>
        </td></tr>
        <tr><td style="padding:12px 0 0">
          ${cards}
        </td></tr>
      </table>`;
  }).join("");

  const year = new Date().getFullYear();
  const dateStr = new Date().toLocaleDateString("es-CO", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });

  const html = `<!DOCTYPE html>
<html lang="es" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f3f4f6">
<tr><td align="center" style="padding:24px 16px">
<!--[if mso]><table role="presentation" width="640" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" style="max-width:640px" cellpadding="0" cellspacing="0">

  <!-- HEADER -->
  <tr><td bgcolor="#006C2F" style="background-color:#006C2F;padding:28px 32px;text-align:center">
    <p style="margin:0 0 2px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#7BCB6A;letter-spacing:3px;text-transform:uppercase">CALENDARIO TRIBUTARIO</p>
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:3px">INTEEGRADOS</p>
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:10px auto 0">
      <tr><td bgcolor="#7BCB6A" style="background-color:#7BCB6A;height:3px;width:40px;font-size:0;line-height:0">&nbsp;</td></tr>
    </table>
    <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;color:#ffffff">Gesti&#xF3;n del D&#xED;a</p>
    <p style="margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#a7f3d0">${dateStr}</p>
  </td></tr>

  <!-- DETALLE POR PERSONA -->
  <tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:8px 32px 28px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;border-top:1px solid #f3f4f6">
    <p style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:#006C2F;text-transform:uppercase;letter-spacing:1.5px">&#128196; Detalle por persona</p>
    ${personSections}
    <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9ca3af;text-align:center">
      Ingresa a la plataforma para ver el detalle completo.
    </p>
  </td></tr>

  <!-- FOOTER -->
  <tr><td bgcolor="#1f2937" style="background-color:#1f2937;padding:18px 32px;text-align:center">
    <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:2px;color:#ffffff">INTEEGRADOS</p>
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#6b7280">
      Digest autom&#xE1;tico &middot; Calendario Tributario &middot; &copy; ${year}
    </p>
  </td></tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body></html>`;

  const graphToken = await getGraphTokenInteegra();
  const sender = SENDER_EMAIL_2.value().trim();
  let sent = 0;

  const seen = new Set<string>();
  for (const r of recipients) {
    const key = r.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${graphToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              subject: `[Resumen] Calendario tributario — ${entries.length} cambio${entries.length !== 1 ? "s" : ""} hoy`,
              body: { contentType: "HTML", content: html },
              toRecipients: [{ emailAddress: { address: r.email } }],
            },
            saveToSentItems: false,
          }),
        }
      );
      if (res.ok) sent++;
      else console.error("dailyTaxDigest: failed for", r.email, await res.text());
    } catch (e) {
      console.error("dailyTaxDigest send error:", e);
    }
  }

  return { sent, entries: entries.length };
}

export const dailyTaxDigest = onSchedule(
  {
    schedule: "0 17 * * *",
    timeZone: "America/Bogota",
    region: "us-central1",
    secrets: [TENANT_ID_2, CLIENT_ID_2, CLIENT_SECRET_2, SENDER_EMAIL_2],
  },
  async () => {
    try {
      const result = await sendDailyDigest(admin.firestore());
      console.log(`dailyTaxDigest: sent=${result.sent} entries=${result.entries}`);
    } catch (e) {
      console.error("dailyTaxDigest ERROR:", e);
      throw e;
    }
  }
);

export const triggerDailyTaxDigest = onCall(
  {
    region: "us-central1",
    cors: true,
    secrets: [TENANT_ID_2, CLIENT_ID_2, CLIENT_SECRET_2, SENDER_EMAIL_2],
  },
  async (request) => {
    await requirePlatformRole(request, ["admin"]);
    return sendDailyDigest(admin.firestore());
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PLANTILLA DE ACCESO A LA PLATAFORMA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Envía correo de bienvenida/actualización de acceso a un usuario de la plataforma.
 * Payload: { recipientEmail, recipientName, role, roleLabel, modules, isNewAccess }
 */
export const sendPlatformAccessEmail = onCall(
  { region: "us-central1", cors: true, secrets: [TENANT_ID_2, CLIENT_ID_2, CLIENT_SECRET_2, SENDER_EMAIL_2] },
  async (request) => {
    const {
      recipientEmail,
      recipientName,
      role,
      roleLabel,
      modules = [],
      isNewAccess = true,
    } = request.data || {};

    console.log("sendPlatformAccessEmail START — recipientEmail:", recipientEmail, "role:", role);

    if (!recipientEmail) throw new HttpsError("invalid-argument", "recipientEmail requerido");

    try {
    const token  = await getGraphTokenInteegra();
    const sender = SENDER_EMAIL_2.value().trim();
    console.log("sendPlatformAccessEmail: token ok, sender:", sender, "to:", recipientEmail);
    const year   = new Date().getFullYear();

    const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
      admin:          { bg: "#f3e8ff", text: "#7e22ce", border: "#d8b4fe" },
      talento_humano: { bg: "#f0fdf4", text: "#15803d", border: "#86efac" },
      contabilidad:   { bg: "#eff6ff", text: "#1d4ed8", border: "#93c5fd" },
      financiera:     { bg: "#ecfdf5", text: "#065f46", border: "#6ee7b7" },
    };
    const roleColor = ROLE_COLORS[role] ?? { bg: "#f9fafb", text: "#374151", border: "#e5e7eb" };

    const moduleItems = (modules as string[]).map(m =>
      `<li style="padding:3px 0;color:#374151;font-size:13px">✓ ${m}</li>`
    ).join("");

    const subject = isNewAccess
      ? `¡Bienvenido/a a la plataforma Inteegrados!`
      : `Tu acceso a Inteegrados ha sido actualizado`;

    const headline = isNewAccess
      ? `¡Hola <b>${recipientName || recipientEmail}</b>, te damos la bienvenida!`
      : `Hola <b>${recipientName || recipientEmail}</b>, tu acceso ha sido actualizado.`;

    const intro = isNewAccess
      ? `Se te ha asignado acceso a la plataforma <b>Inteegrados</b> con el siguiente rol:`
      : `Tu rol en la plataforma <b>Inteegrados</b> ha cambiado:`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;line-height:1.6">

        <!-- Header -->
        <div style="background:linear-gradient(135deg,#005528,#008C3C);padding:32px 24px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:3px;font-weight:800">
            INTE<span style="color:#7BCB6A">E</span>GRADOS
          </h1>
          <p style="color:#7BCB6A;margin:4px 0 0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase">
            Plataforma de Gestión
          </p>
        </div>

        <!-- Body -->
        <div style="background:#fff;padding:32px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">

          <p style="font-size:16px;color:#374151;margin:0 0 6px">${headline}</p>
          <p style="color:#6b7280;margin:0 0 20px;font-size:14px">${intro}</p>

          <!-- Role badge -->
          <div style="display:inline-block;background:${roleColor.bg};color:${roleColor.text};
                      border:1px solid ${roleColor.border};border-radius:8px;
                      padding:10px 20px;margin-bottom:20px;font-weight:700;font-size:15px">
            ${roleLabel || role}
          </div>

          <!-- Login email -->
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin-bottom:20px">
            <p style="margin:0 0 4px;font-size:11px;color:#166534;text-transform:uppercase;font-weight:700;letter-spacing:1px">
              Tu correo de acceso
            </p>
            <p style="margin:0;font-size:17px;font-weight:700;color:#166534">${recipientEmail}</p>
            <p style="margin:6px 0 0;font-size:12px;color:#4ade80">Úsalo para ingresar a la plataforma</p>
          </div>

          ${modules.length > 0 ? `
          <!-- Modules -->
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-bottom:24px">
            <p style="margin:0 0 10px;font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:700;letter-spacing:1px">
              Módulos disponibles
            </p>
            <ul style="margin:0;padding-left:4px;list-style:none">
              ${moduleItems}
            </ul>
          </div>
          ` : ""}

          <!-- CTA -->
          <div style="text-align:center;margin:24px 0 8px">
            <a href="https://people-analitics.inteegra.net.co"
               target="_blank"
               style="display:inline-block;background:#008C3C;color:#ffffff;
                      text-decoration:none;font-weight:700;font-size:14px;
                      padding:14px 36px;border-radius:10px;letter-spacing:0.3px">
              Ingresar a la plataforma
            </a>
          </div>

          <p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:8px">
            Si tienes preguntas, responde este correo.
          </p>

          <p style="font-size:11px;color:#d1d5db;text-align:center;
                    margin-top:24px;border-top:1px solid #f3f4f6;padding-top:16px">
            &copy; ${year} Inteegrados &middot; Todos los derechos reservados
          </p>
        </div>
      </div>
    `;

    const sendUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`;
    const res = await fetch(sendUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: html },
          toRecipients: [{ emailAddress: { address: recipientEmail } }],
        },
        saveToSentItems: true,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("sendPlatformAccessEmail Graph error:", res.status, errText);
      throw new HttpsError("internal", `Graph sendMail error ${res.status}: ${errText}`);
    }

      console.log("sendPlatformAccessEmail: sent ok to", recipientEmail);
      return { ok: true };
    } catch (e: any) {
      if (e?.code) throw e; // re-throw HttpsError
      console.error("sendPlatformAccessEmail unhandled error:", e?.message, String(e));
      throw new HttpsError("internal", e?.message ?? String(e));
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT OBLIGACIONES LEGALES 2026 (one-shot seed)
// ─────────────────────────────────────────────────────────────────────────────

const LEGAL_OBLIGATIONS_2026 = [
  { company:"Netcol Ingeniería SAS BIC",nit:"901193667",city:"Bogotá",scope:"Nacional",taxType:"Supersociedades 1 - Estados Financieros Fin de Ejercicio",obligationType:"Reportes",period:"Supersociedades 1 - Estados Financieros Fin de Ejercicio",dueDate:"2026-04-30",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Netcol Ingeniería SAS BIC",nit:"901193667",city:"Bogotá",scope:"Nacional",taxType:"Supersociedades 08 - Reporte de Sostenibilidad",obligationType:"Reportes",period:"Supersociedades 08 - Reporte de Sostenibilidad",dueDate:"2026-07-09",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Inteegra SAS BIC",nit:"901193667",city:"Bogotá",scope:"Nacional",taxType:"Actualización RUB",obligationType:"Reportes",period:"Actualización RUB",dueDate:"2026-05-04",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Inteegra SAS BIC",nit:"901193667",city:"Bogotá",scope:"Nacional",taxType:"Matrícula Mercantil",obligationType:"Reportes",period:"Matrícula Mercantil",dueDate:"2026-03-31",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Inteegra SAS BIC",nit:"901193667",city:"Bogotá",scope:"Nacional",taxType:"Registro Único de Proponentes",obligationType:"Reportes",period:"Registro Único de Proponentes",dueDate:"2026-04-09",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Inteegra SAS BIC",nit:"901193667",city:"Bogotá",scope:"Nacional",taxType:"Contribución a la CRC",obligationType:"Reportes",period:"Contribución a la CRC",dueDate:"2026-01-31",year:"2026",status:"Pagado",advisor:"",observation:"",attachments:[] },
  { company:"Inteegra SAS BIC",nit:"901193667",city:"Bogotá",scope:"Nacional",taxType:"Contribución a la CRC",obligationType:"Reportes",period:"Contribución a la CRC",dueDate:"2026-07-31",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Inteegra SAS BIC",nit:"901193667",city:"Bogotá",scope:"Nacional",taxType:"Comisión de Regulación de Comunicaciones - CRC",obligationType:"Reportes",period:"Comisión de Regulación de Comunicaciones - CRC",dueDate:"2026-02-02",year:"2026",status:"Pagado",advisor:"",observation:"",attachments:[] },
  { company:"Inteegra SAS BIC",nit:"901193667",city:"Bogotá",scope:"Nacional",taxType:"Comisión de Regulación de Comunicaciones - CRC",obligationType:"Reportes",period:"Comisión de Regulación de Comunicaciones - CRC",dueDate:"2026-04-30",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Inteegra SAS BIC",nit:"901193667",city:"Bogotá",scope:"Nacional",taxType:"Comisión de Regulación de Comunicaciones - CRC",obligationType:"Reportes",period:"Comisión de Regulación de Comunicaciones - CRC",dueDate:"2026-07-31",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Inteegra SAS BIC",nit:"901193667",city:"Bogotá",scope:"Nacional",taxType:"Comisión de Regulación de Comunicaciones - CRC",obligationType:"Reportes",period:"Comisión de Regulación de Comunicaciones - CRC",dueDate:"2026-11-03",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Triangulum BPO SAS",nit:"900550189",city:"Bogotá",scope:"Nacional",taxType:"Actualización RUB",obligationType:"Reportes",period:"Actualización RUB",dueDate:"2026-05-04",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Triangulum BPO SAS",nit:"900550189",city:"Bogotá",scope:"Nacional",taxType:"Matrícula Mercantil",obligationType:"Reportes",period:"Matrícula Mercantil",dueDate:"2026-03-31",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Triangulum BPO SAS",nit:"900550189",city:"Bogotá",scope:"Nacional",taxType:"Registro Único de Proponentes",obligationType:"Reportes",period:"Registro Único de Proponentes",dueDate:"2026-04-09",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"ITAC Colombia SAS",nit:"900265286",city:"Bogotá",scope:"Nacional",taxType:"Actualización RUB",obligationType:"Reportes",period:"Actualización RUB",dueDate:"2026-05-04",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"ITAC Colombia SAS",nit:"900265286",city:"Bogotá",scope:"Nacional",taxType:"Matrícula Mercantil",obligationType:"Reportes",period:"Matrícula Mercantil",dueDate:"2026-03-31",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"ITAC Colombia SAS",nit:"900265286",city:"Bogotá",scope:"Nacional",taxType:"Registro Único de Proponentes",obligationType:"Reportes",period:"Registro Único de Proponentes",dueDate:"2026-04-09",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"ITAC Colombia SAS",nit:"900265286",city:"Bogotá",scope:"Nacional",taxType:"Contribución a la CRC",obligationType:"Reportes",period:"Contribución a la CRC",dueDate:"2026-01-31",year:"2026",status:"Pagado",advisor:"",observation:"",attachments:[] },
  { company:"ITAC Colombia SAS",nit:"900265286",city:"Bogotá",scope:"Nacional",taxType:"Contribución a la CRC",obligationType:"Reportes",period:"Contribución a la CRC",dueDate:"2026-07-31",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"ITAC Colombia SAS",nit:"900265286",city:"Bogotá",scope:"Nacional",taxType:"Comisión de Regulación de Comunicaciones - CRC",obligationType:"Reportes",period:"Comisión de Regulación de Comunicaciones - CRC",dueDate:"2026-02-02",year:"2026",status:"Pagado",advisor:"",observation:"",attachments:[] },
  { company:"ITAC Colombia SAS",nit:"900265286",city:"Bogotá",scope:"Nacional",taxType:"Comisión de Regulación de Comunicaciones - CRC",obligationType:"Reportes",period:"Comisión de Regulación de Comunicaciones - CRC",dueDate:"2026-04-30",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"ITAC Colombia SAS",nit:"900265286",city:"Bogotá",scope:"Nacional",taxType:"Comisión de Regulación de Comunicaciones - CRC",obligationType:"Reportes",period:"Comisión de Regulación de Comunicaciones - CRC",dueDate:"2026-07-31",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"ITAC Colombia SAS",nit:"900265286",city:"Bogotá",scope:"Nacional",taxType:"Comisión de Regulación de Comunicaciones - CRC",obligationType:"Reportes",period:"Comisión de Regulación de Comunicaciones - CRC",dueDate:"2026-11-03",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Inversiones EON SAS",nit:"901419833",city:"Bogotá",scope:"Nacional",taxType:"Actualización RUB",obligationType:"Reportes",period:"Actualización RUB",dueDate:"2026-05-04",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Newstar SAS",nit:"901271083",city:"Bogotá",scope:"Nacional",taxType:"Actualización RUB",obligationType:"Reportes",period:"Actualización RUB",dueDate:"2026-05-04",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Newstar SAS",nit:"901271083",city:"Bogotá",scope:"Nacional",taxType:"Matrícula Mercantil",obligationType:"Reportes",period:"Matrícula Mercantil",dueDate:"2026-03-31",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Newstar SAS",nit:"901271083",city:"Bogotá",scope:"Nacional",taxType:"Registro Único de Proponentes",obligationType:"Reportes",period:"Registro Único de Proponentes",dueDate:"2026-04-09",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"LOGISTICA EMPRESARIAL DE TRANSPORTE",nit:"901269033",city:"Bogotá",scope:"Nacional",taxType:"Matrícula Mercantil",obligationType:"Reportes",period:"Matrícula Mercantil",dueDate:"2026-03-31",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Netia SAS",nit:"901264922",city:"Bogotá",scope:"Nacional",taxType:"Actualización RUB",obligationType:"Reportes",period:"Actualización RUB",dueDate:"2026-05-04",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Netia SAS",nit:"901264922",city:"Bogotá",scope:"Nacional",taxType:"Matrícula Mercantil",obligationType:"Reportes",period:"Matrícula Mercantil",dueDate:"2026-03-31",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Netia SAS",nit:"901264922",city:"Bogotá",scope:"Nacional",taxType:"Registro Único de Proponentes",obligationType:"Reportes",period:"Registro Único de Proponentes",dueDate:"2026-04-09",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Newforce SAS",nit:"901259735",city:"Bogotá",scope:"Nacional",taxType:"Actualización RUB",obligationType:"Reportes",period:"Actualización RUB",dueDate:"2026-05-04",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Newforce SAS",nit:"901259735",city:"Bogotá",scope:"Nacional",taxType:"Matrícula Mercantil",obligationType:"Reportes",period:"Matrícula Mercantil",dueDate:"2026-03-31",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Newforce SAS",nit:"901259735",city:"Bogotá",scope:"Nacional",taxType:"Registro Único de Proponentes",obligationType:"Reportes",period:"Registro Único de Proponentes",dueDate:"2026-04-09",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Newforce SAS",nit:"901259735",city:"Bogotá",scope:"Nacional",taxType:"Contribución a la CRC",obligationType:"Reportes",period:"Contribución a la CRC",dueDate:"2026-01-31",year:"2026",status:"Pagado",advisor:"",observation:"",attachments:[] },
  { company:"Newforce SAS",nit:"901259735",city:"Bogotá",scope:"Nacional",taxType:"Contribución a la CRC",obligationType:"Reportes",period:"Contribución a la CRC",dueDate:"2026-07-31",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Newforce SAS",nit:"901259735",city:"Bogotá",scope:"Nacional",taxType:"Comisión de Regulación de Comunicaciones - CRC",obligationType:"Reportes",period:"Comisión de Regulación de Comunicaciones - CRC",dueDate:"2026-02-02",year:"2026",status:"Pagado",advisor:"",observation:"",attachments:[] },
  { company:"Newforce SAS",nit:"901259735",city:"Bogotá",scope:"Nacional",taxType:"Comisión de Regulación de Comunicaciones - CRC",obligationType:"Reportes",period:"Comisión de Regulación de Comunicaciones - CRC",dueDate:"2026-04-30",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Newforce SAS",nit:"901259735",city:"Bogotá",scope:"Nacional",taxType:"Comisión de Regulación de Comunicaciones - CRC",obligationType:"Reportes",period:"Comisión de Regulación de Comunicaciones - CRC",dueDate:"2026-07-31",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Newforce SAS",nit:"901259735",city:"Bogotá",scope:"Nacional",taxType:"Comisión de Regulación de Comunicaciones - CRC",obligationType:"Reportes",period:"Comisión de Regulación de Comunicaciones - CRC",dueDate:"2026-11-03",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Unión Temporal Fomento TIC",nit:"901311778",city:"Bogotá",scope:"Nacional",taxType:"Actualización RUB",obligationType:"Reportes",period:"Actualización RUB",dueDate:"2026-05-04",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Unión Temporal Fomento TIC",nit:"901311778",city:"Bogotá",scope:"Nacional",taxType:"Matrícula Mercantil",obligationType:"Reportes",period:"Matrícula Mercantil",dueDate:"2026-03-31",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Unión Temporal Fomento TIC",nit:"901311778",city:"Bogotá",scope:"Nacional",taxType:"Registro Único de Proponentes",obligationType:"Reportes",period:"Registro Único de Proponentes",dueDate:"2026-04-09",year:"2026",status:"No iniciado",advisor:"",observation:"",attachments:[] },
  { company:"Unión Temporal Tecnología EIP",nit:"901834909",city:"Bogotá",scope:"Nacional",taxType:"Actualización RUB",obligationType:"Reportes",period:"Actualización RUB",dueDate:"2026-05-04",year:"2026",status:"No iniciado",advisor:"",observation:"no hay cambio de beneficiarios finales",attachments:[] },
];

/**
 * Importa las 44 obligaciones legales 2026 a tax_obligations.
 * Es idempotente: verifica duplicados por company+taxType+dueDate antes de crear.
 */
export const importLegalObligations2026 = onCall(
  { region: "us-central1", cors: true },
  async (request) => {
    await requirePlatformRole(request, ["admin"]);
    const db = admin.firestore();
    const col = db.collection(ACCOUNTING_COLLECTIONS.obligations);
    const ts = admin.firestore.FieldValue.serverTimestamp();

    let created = 0;
    let skipped = 0;

    for (const obl of LEGAL_OBLIGATIONS_2026) {
      const existing = await col
        .where("company", "==", obl.company)
        .where("taxType",  "==", obl.taxType)
        .where("dueDate",  "==", obl.dueDate)
        .limit(1)
        .get();

      if (!existing.empty) { skipped++; continue; }

      await col.add({ ...obl, createdAt: ts, updatedAt: ts });
      created++;
    }

    return { created, skipped, total: LEGAL_OBLIGATIONS_2026.length };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// MIGRACIÓN: marcar emailStatus en asignaciones sin tracking
// ─────────────────────────────────────────────────────────────────────────────

export const migrateEmailStatuses = onCall(
  { region: "us-central1", cors: true },
  async () => {
    const snap = await admin.firestore().collection(QUESTIONNAIRE_COLLECTIONS.assignments).get();

    let markedSent    = 0;
    let markedLegacy  = 0;
    let alreadyTagged = 0;

    const BATCH_SIZE = 400;
    let batch = admin.firestore().batch();
    let ops   = 0;

    const flush = async () => {
      if (ops > 0) { await batch.commit(); batch = admin.firestore().batch(); ops = 0; }
    };

    for (const doc of snap.docs) {
      const data = doc.data();

      // Ya tiene emailStatus → saltar
      if (data.emailStatus && data.emailStatus !== "") { alreadyTagged++; continue; }

      const newStatus = data.status === "completed" ? "sent" : "legacy";
      batch.update(doc.ref, { emailStatus: newStatus });
      ops++;

      if (newStatus === "sent") markedSent++;
      else markedLegacy++;

      if (ops >= BATCH_SIZE) await flush();
    }
    await flush();

    return { markedSent, markedLegacy, alreadyTagged, total: snap.size };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// MENSAJE PERSONALIZADO — Contabilidad → usuarios internos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Directorio mínimo para componer mensajes de contabilidad.
 *
 * La colección de usuarios contiene datos sensibles de RR. HH. y por eso no se
 * expone directamente al rol contabilidad. Esta función devuelve únicamente
 * nombre, correos y asignaciones necesarias para seleccionar destinatarios.
 */
export const getAccountingMessageDirectory = onCall(
  { region: "us-central1", cors: true },
  async (request) => {
    await requirePlatformRole(request, ["admin", "contabilidad"]);

    const firestore = admin.firestore();
    const [usersSnap, companiesSnap, projectsSnap] = await Promise.all([
      firestore.collection(IDENTITY_COLLECTIONS.users).get(),
      firestore.collection(ORGANIZATION_COLLECTIONS.companies).get(),
      firestore.collection(ORGANIZATION_COLLECTIONS.projects).get(),
    ]);

    const users = usersSnap.docs.map((document) => {
      const data = document.data();
      const assignment = data.contractInfo?.assignment ?? {};
      return {
        id: document.id,
        fullName: String(data.fullName ?? data.personalData?.fullName ?? ""),
        role: String(data.role ?? "colaborador"),
        email: String(data.email ?? ""),
        companyIds: Array.isArray(data.companyIds) ? data.companyIds : [],
        projectIds: Array.isArray(data.projectIds) ? data.projectIds : [],
        location: {
          corporateEmail: String(data.location?.corporateEmail ?? ""),
          personalEmail: String(data.location?.personalEmail ?? ""),
        },
        contractInfo: {
          assignment: {
            company: String(assignment.company ?? ""),
            companyId: String(assignment.companyId ?? ""),
            project: String(assignment.project ?? ""),
            projectId: String(assignment.projectId ?? ""),
          },
        },
      };
    });

    const companies = companiesSnap.docs.map((document) => {
      const data = document.data();
      return {
        id: document.id,
        name: String(data.name ?? ""),
        active: data.active !== false,
        aliases: Array.isArray(data.aliases) ? data.aliases : [],
      };
    });

    const projects = projectsSnap.docs.map((document) => {
      const data = document.data();
      return {
        id: document.id,
        name: String(data.name ?? ""),
        companyId: String(data.companyId ?? ""),
        companyName: String(data.companyName ?? ""),
        status: String(data.status ?? ""),
      };
    });

    return { users, companies, projects };
  },
);

export const sendAccountingMessage = onCall(
  {
    region: "us-central1",
    cors: true,
    timeoutSeconds: 540,
    secrets: [TENANT_ID_3, CLIENT_ID_3, CLIENT_SECRET_3, SENDER_EMAIL_3],
  },
  async (request) => {
    await requirePlatformRole(request, ["admin", "contabilidad"]);
    const { subject, body, recipients, attachments: atts = [] } = request.data || {};

    if (!subject || !body || !Array.isArray(recipients) || recipients.length === 0)
      throw new HttpsError("invalid-argument", "subject, body y recipients son requeridos");

    const token  = await getGraphTokenTriangulum();
    const sender = SENDER_EMAIL_3.value().trim();
    const year   = new Date().getFullYear();
    const dateStr = new Date().toLocaleDateString("es-CO", {
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
    });

    const bodyHtml = body
      .split("\n")
      .filter((l: string) => l.trim())
      .map((l: string) => `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#374151;line-height:1.7">${l}</p>`)
      .join("");

    const isImage = (n: string) => /\.(jpe?g|png|gif|webp|svg)$/i.test(n);
    const attRows = (atts as Array<{name:string;url:string}>).map(a => isImage(a.name) ? `
      <tr><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;text-align:center">
        <img src="${a.url}" alt="${a.name}" style="max-width:100%;height:auto;border-radius:8px;border:1px solid #e5e7eb;display:block;margin:0 auto"/>
      </td></tr>` : `
      <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6">
        <span style="font-size:14px;margin-right:8px">&#x1F4CE;</span>
        <span style="font-size:13px;color:#374151">${a.name}</span>
      </td></tr>`).join("");
    const attSection = atts.length ? `
      <table width="100%" cellpadding="0" cellspacing="0"
        style="background:#f8faff;border:1px solid #dbeafe;border-radius:10px;padding:4px 16px;margin:24px 0">
        <tr><td style="padding:12px 0 4px">
          <p style="margin:0;font-size:11px;color:#3b82f6;text-transform:uppercase;font-weight:700;letter-spacing:1px">Archivos adjuntos</p>
        </td></tr>${attRows}
      </table>` : "";

    const firmaBlock = "";

    const html = `<!DOCTYPE html>
<html lang="es" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f1f5f9">
<tr><td align="center" style="padding:28px 16px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" style="max-width:600px" cellpadding="0" cellspacing="0">

  <!-- HEADER azul -->
  <tr><td bgcolor="#1e3a5f" style="background-color:#1e3a5f;padding:32px 32px 24px;text-align:center">
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 16px">
      <tr><td bgcolor="#2563eb" style="background-color:#2563eb;width:56px;height:56px;border-radius:14px;text-align:center;vertical-align:middle;font-size:28px;line-height:56px">&#x1F9FE;</td></tr>
    </table>
    <p style="margin:0 0 2px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#93c5fd;letter-spacing:3px;text-transform:uppercase">Comunicado Oficial</p>
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:1px">Equipo de Contabilidad</p>
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:14px auto 0">
      <tr><td bgcolor="#3b82f6" style="background-color:#3b82f6;height:2px;width:48px;font-size:0;line-height:0">&nbsp;</td></tr>
    </table>
    <p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#93c5fd">${dateStr}</p>
  </td></tr>

  <!-- SUBJECT BAR -->
  <tr><td bgcolor="#2563eb" style="background-color:#2563eb;padding:14px 32px">
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#ffffff">${subject}</p>
  </td></tr>

  <!-- BODY -->
  <tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:32px 32px 24px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0">
    <p style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#374151">
      Estimado/a <strong>colaborador/a</strong>,
    </p>
    ${bodyHtml}
    ${attSection}
  </td></tr>

  ${firmaBlock}

  <!-- FOOTER -->
  <tr><td bgcolor="#1e3a5f" style="background-color:#1e3a5f;padding:20px 32px;text-align:center">
    <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:1px;color:#ffffff">Equipo de Contabilidad</p>
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#64748b">
      Mensaje confidencial &middot; &copy; ${year} &middot; Todos los derechos reservados
    </p>
  </td></tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body></html>`;

    const sendUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`;

    const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
    const outcomes: Array<{ email: string; ok: boolean; error: string }> = [];

    // Microsoft Graph limita las operaciones simultáneas sobre un mismo buzón.
    // Enviar en paralelo provoca ApplicationThrottled/MailboxConcurrency. Esta
    // cola secuencial respeta el límite y reintenta únicamente errores transitorios.
    for (const recipient of recipients as Array<{ name: string; email: string }>) {
      const email = String(recipient.email ?? "").trim().toLowerCase();
      if (!email || !email.includes("@")) {
        outcomes.push({ email, ok: false, error: "Correo inválido" });
        continue;
      }

      let outcome = { email, ok: false, error: "No fue posible enviar" };
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const response = await fetch(sendUrl, {
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

          if (response.ok) {
            outcome = { email, ok: true, error: "" };
            break;
          }

          const graphError = await response.text();
          const transient = response.status === 429 ||
            response.status >= 500 ||
            graphError.includes("ApplicationThrottled") ||
            graphError.includes("MailboxConcurrency");

          if (transient && attempt < 4) {
            const retryAfterSeconds = Number(response.headers.get("retry-after"));
            const delay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
              ? retryAfterSeconds * 1000
              : 750 * (2 ** attempt);
            console.warn(`sendAccountingMessage: retry ${attempt + 1} for ${email} in ${delay}ms`);
            await wait(delay);
            continue;
          }

          console.error(`sendAccountingMessage: failed for ${email}:`, graphError);
          outcome = { email, ok: false, error: `Microsoft Graph ${response.status}` };
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (attempt < 4) {
            await wait(750 * (2 ** attempt));
            continue;
          }
          console.error(`sendAccountingMessage: request failed for ${email}:`, message);
          outcome = { email, ok: false, error: message };
        }
      }
      outcomes.push(outcome);
    }

    const delivered = outcomes.filter(result => result.ok);
    const failed = outcomes.filter(result => !result.ok);

    if (delivered.length === 0) {
      throw new HttpsError(
        "internal",
        `Microsoft no aceptó ningún correo. ${failed[0]?.error || "Revisa la configuración del remitente."}`,
      );
    }

    await admin.firestore().collection(COMMUNICATION_COLLECTIONS.accountingMessages).add({
      subject,
      body,
      recipientCount: delivered.length,
      recipients: delivered.map(result => result.email),
      requestedRecipientCount: outcomes.length,
      failedRecipients: failed.map(result => ({ email: result.email, error: result.error })),
      attachments: (atts as Array<{ name: string; url: string }>).map(a => a.name),
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      sentBy: request.auth?.token?.email ?? "unknown",
    });

    return {
      ok: failed.length === 0,
      sent: delivered.length,
      failed: failed.length,
      failedRecipients: failed.map(result => result.email),
    };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// MARCAR LÍDERES GLOBALES (one-shot)
// ─────────────────────────────────────────────────────────────────────────────

const GLOBAL_LEADER_NAMES = [
  "alvarez mendoza jhonattan eduardo",
  "bermudez arias diana caterine",
  "blanco lopez fredy",
  "castillo tafur lina maria",
  "cuellar rojas fabio andres",
  "deaza rodriguez daniel mauricio",
  "duque barahona julian francisco",
  "franco toca alexander giovanny",
  "garcia peña william fernando",
  "gomez harold mauricio",
  "gonzalez alayon oscar fernando",
  "guio rodriguez lina janneth",
  "gutierrez botero william roberto",
  "laverde rodriguez leidy alejandra",
  "linares trujillo darwin alexis",
  "mogollon olave jainer jose",
  "monroy ortiz diego edisson",
  "murcia rodriguez carlos angel",
  "oidor martinez diego fernando",
  "ospino vargas jose manuel",
  "otalvarez barbosa rodrigo alberto",
  "paez rojas miguel hernando",
  "pinto sandoval nelly mayreth",
  "ruiz chirivi john freddy",
  "sanchez moscoso fredy",
  "valbuena martinez andres arturo",
  "vargas tovar sonia fernanda",
  "zapata chaux manuel salvador",
];

function normalizeNameFn(s: string): string {
  return s.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ").trim();
}

export const setGlobalLeaders = onCall(
  { region: "us-central1", cors: true },
  async () => {
    const snap = await admin.firestore().collection(IDENTITY_COLLECTIONS.users).get();
    let marked = 0;
    let notFound: string[] = [...GLOBAL_LEADER_NAMES];
    const batch = admin.firestore().batch();

    for (const d of snap.docs) {
      const name = normalizeNameFn(d.data().fullName || "");
      const match = GLOBAL_LEADER_NAMES.includes(name);
      if (match) {
        batch.update(d.ref, { role: "lider", isGlobalLeader: true });
        marked++;
        notFound = notFound.filter(n => n !== name);
      }
    }

    await batch.commit();
    return { marked, notFound, total: snap.size };
  }
);
