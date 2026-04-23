import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
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
    const sender = SENDER_EMAIL.value().trim();

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

    // 5) Si vino de un comunicado, marcar quizSubmittedAt en el recipient doc
    if (assignment.communicationId && assignment.recipientId) {
      try {
        await firestore
          .collection("comunicado_recipients")
          .doc(assignment.recipientId)
          .update({ quizSubmittedAt: admin.firestore.FieldValue.serverTimestamp() });
      } catch { /* silently ignore */ }
    }

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
    secrets: [TENANT_ID, CLIENT_ID, CLIENT_SECRET, SENDER_EMAIL],
  },
  async (request) => {
    const { communicationId, title, body, recipients, attachments = [], ctaButton = null, questionnaireName = null } = request.data || {};

    if (!title || !body || !Array.isArray(recipients) || recipients.length === 0) {
      throw new HttpsError("invalid-argument", "Faltan campos requeridos");
    }

    const graphToken = await getGraphToken();
    const sender     = SENDER_EMAIL.value().trim();
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

    for (const recipient of recipients as Array<{ email: string; name: string; link: string; quizLink?: string }>) {
      try {
        const quizLink: string | null = recipient.quizLink || null;

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

              ${ctaButton ? `
              <!-- BOTÓN CTA ADICIONAL -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px">
                <tr>
                  <td align="center">
                    <a href="${ctaButton.url}" target="_blank" rel="noopener noreferrer"
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

// ─────────────────────────────────────────────────────────────────────────────
// TAX CALENDAR ALERTS
// ─────────────────────────────────────────────────────────────────────────────

const ALERT_THRESHOLDS = [1, 3, 7, 15]; // days before due date
const COMPLETED_STATUSES = new Set(["Pagado", "No aplica", "Informe Enviado"]);

interface TaxObligation {
  id: string;
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
  obligations: Array<TaxObligation & { daysLeft: number; threshold: number }>;
}

async function runTaxAlerts(db: admin.firestore.Firestore): Promise<{ sent: number; skipped: number }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  // Load all non-completed obligations
  const snap = await db.collection("tax_obligations").get();
  const obligations: TaxObligation[] = snap.docs
    .map(d => ({ id: d.id, ...d.data() } as TaxObligation))
    .filter(o => !COMPLETED_STATUSES.has(o.status));

  // Load all contabilidad + admin users to always notify them
  const rolesSnap = await db.collection("platform_roles")
    .where("role", "in", ["contabilidad", "admin"])
    .get();
  const globalRecipients: { name: string; email: string }[] = rolesSnap.docs.map(d => ({
    name: d.data().name || d.id,
    email: d.data().email || d.id,
  }));

  // Check which alerts were already sent today to avoid duplicates
  const logRef = db.collection("tax_alert_log");
  const todayLogSnap = await logRef.where("sentDate", "==", todayStr).get();
  const alreadySent = new Set(todayLogSnap.docs.map(d => d.data().key as string));

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

  for (const obl of obligations) {
    if (!obl.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(obl.dueDate)) continue;

    const due = new Date(obl.dueDate + "T00:00:00");
    const daysLeft = Math.round((due.getTime() - today.getTime()) / 86_400_000);

    // Check if this falls on an alert threshold
    if (!ALERT_THRESHOLDS.includes(daysLeft)) continue;

    const alertKey = `${obl.id}_${daysLeft}_${todayStr}`;
    if (alreadySent.has(alertKey)) { skipped++; continue; }

    // Add to advisor's list (if set and looks like an email)
    if (obl.advisor && obl.advisor.includes("@")) {
      ensureRecipient(obl.advisor, obl.advisor).obligations.push({ ...obl, daysLeft, threshold: daysLeft });
    }

    // Add to all global recipients
    for (const gr of globalRecipients) {
      ensureRecipient(gr.email, gr.name).obligations.push({ ...obl, daysLeft, threshold: daysLeft });
    }

    // Mark as sent
    await logRef.add({ key: alertKey, sentDate: todayStr, obligationId: obl.id, daysLeft, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  }

  if (recipientMap.size === 0) return { sent: 0, skipped };

  // Send emails
  const graphToken = await getGraphToken();
  const sender = SENDER_EMAIL.value().trim();
  let sent = 0;

  for (const recipient of recipientMap.values()) {
    if (recipient.obligations.length === 0) continue;

    // Sort by daysLeft asc
    recipient.obligations.sort((a, b) => a.daysLeft - b.daysLeft);

    const rows = recipient.obligations.map(o => {
      const urgencyColor = o.daysLeft <= 1 ? "#dc2626" : o.daysLeft <= 3 ? "#ea580c" : o.daysLeft <= 7 ? "#d97706" : "#2563eb";
      const urgencyBg    = o.daysLeft <= 1 ? "#fef2f2" : o.daysLeft <= 3 ? "#fff7ed" : o.daysLeft <= 7 ? "#fffbeb" : "#eff6ff";
      const daysLabel    = o.daysLeft === 0 ? "¡HOY!" : o.daysLeft === 1 ? "Mañana" : `${o.daysLeft} días`;
      return `
        <tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:12px 16px;font-size:13px;color:#1f2937;font-weight:600">${o.company}</td>
          <td style="padding:12px 16px;font-size:13px;color:#374151">${o.taxType}</td>
          <td style="padding:12px 16px;font-size:13px;color:#6b7280">${o.period}</td>
          <td style="padding:12px 16px;font-size:13px;color:#6b7280;white-space:nowrap">${o.dueDate.split("-").reverse().join("/")}</td>
          <td style="padding:12px 16px;text-align:center">
            <span style="background:${urgencyBg};color:${urgencyColor};font-weight:700;font-size:12px;padding:4px 10px;border-radius:20px;border:1px solid ${urgencyColor}40">
              ${daysLabel}
            </span>
          </td>
        </tr>`;
    }).join("");

    const year = new Date().getFullYear();
    const html = `
<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
<tr><td align="center">
<table width="100%" style="max-width:640px" cellpadding="0" cellspacing="0">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#004d22,#008C3C);padding:32px;border-radius:16px 16px 0 0;text-align:center">
    <h1 style="color:#fff;margin:0 0 4px;font-size:24px;letter-spacing:4px;font-weight:800">
      INTE<span style="color:#7BCB6A">E</span>GRADOS
    </h1>
    <p style="color:#a7f3d0;margin:0;font-size:11px;letter-spacing:2px">CALENDARIO TRIBUTARIO</p>
    <div style="width:40px;height:3px;background:#7BCB6A;border-radius:2px;margin:16px auto 0"></div>
    <p style="color:#fff;margin:14px 0 0;font-size:18px;font-weight:700">⚠️ Alertas de Vencimiento</p>
    <p style="color:#a7f3d0;margin:6px 0 0;font-size:12px">${new Date().toLocaleDateString("es-CO",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}</p>
  </td></tr>

  <!-- Greeting -->
  <tr><td style="background:#f0fdf4;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;padding:16px 32px">
    <p style="margin:0;font-size:15px;color:#166534">
      Hola <strong>${recipient.name}</strong>, tienes <strong>${recipient.obligations.length}</strong> obligación${recipient.obligations.length !== 1 ? "es" : ""} tributaria${recipient.obligations.length !== 1 ? "s" : ""} próxima${recipient.obligations.length !== 1 ? "s" : ""} a vencer:
    </p>
  </td></tr>

  <!-- Table -->
  <tr><td style="background:#fff;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;padding:24px 32px">
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:10px 16px;font-size:11px;color:#6b7280;text-align:left;font-weight:700;text-transform:uppercase;letter-spacing:1px">Empresa</th>
          <th style="padding:10px 16px;font-size:11px;color:#6b7280;text-align:left;font-weight:700;text-transform:uppercase;letter-spacing:1px">Obligación</th>
          <th style="padding:10px 16px;font-size:11px;color:#6b7280;text-align:left;font-weight:700;text-transform:uppercase;letter-spacing:1px">Periodo</th>
          <th style="padding:10px 16px;font-size:11px;color:#6b7280;text-align:left;font-weight:700;text-transform:uppercase;letter-spacing:1px">Vence</th>
          <th style="padding:10px 16px;font-size:11px;color:#6b7280;text-align:center;font-weight:700;text-transform:uppercase;letter-spacing:1px">Días</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center">
      Ingresa a la plataforma para actualizar el estado de cada obligación.
    </p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#1f2937;border-radius:0 0 16px 16px;padding:20px 32px;text-align:center">
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:2px;color:#fff">
      INTE<span style="color:#7BCB6A">E</span>GRADOS
    </p>
    <p style="margin:0;font-size:10px;color:#6b7280">
      Alerta automática del Calendario Tributario &middot; &copy; ${year} Inteegrados
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

    try {
      const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
        method: "POST",
        headers: { Authorization: `Bearer ${graphToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            subject: `⚠️ ${recipient.obligations.length} obligación${recipient.obligations.length !== 1 ? "es" : ""} tributaria${recipient.obligations.length !== 1 ? "s" : ""} próxima${recipient.obligations.length !== 1 ? "s" : ""} a vencer`,
            body: { contentType: "HTML", content: html },
            toRecipients: [{ emailAddress: { address: recipient.email } }],
          },
          saveToSentItems: true,
        }),
      });
      if (res.ok) sent++;
    } catch { /* log silently */ }
  }

  return { sent, skipped };
}

/**
 * Scheduled: runs every day at 8:00 AM Colombia time (UTC-5 = 13:00 UTC)
 */
export const scheduledTaxAlerts = onSchedule(
  {
    schedule: "0 13 * * *",
    timeZone: "America/Bogota",
    region: "us-central1",
    secrets: [TENANT_ID, CLIENT_ID, CLIENT_SECRET, SENDER_EMAIL],
  },
  async () => {
    const result = await runTaxAlerts(admin.firestore());
    console.log(`Tax alerts sent: ${result.sent}, skipped (already sent): ${result.skipped}`);
  }
);

/**
 * Callable: manually trigger alerts from the admin UI
 */
export const triggerTaxAlerts = onCall(
  {
    region: "us-central1",
    cors: true,
    secrets: [TENANT_ID, CLIENT_ID, CLIENT_SECRET, SENDER_EMAIL],
  },
  async () => {
    const result = await runTaxAlerts(admin.firestore());
    return result;
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
    secrets: [TENANT_ID, CLIENT_ID, CLIENT_SECRET, SENDER_EMAIL],
  },
  async (request) => {
    const db = admin.firestore();
    const daysAhead: number = Number(request.data?.daysAhead ?? 90);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + daysAhead);

    // Load non-completed obligations within window
    const snap = await db.collection("tax_obligations").get();
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
    const rolesSnap = await db.collection("platform_roles")
      .where("role", "in", ["contabilidad", "admin"])
      .get();
    const attendees = rolesSnap.docs.map(d => ({
      emailAddress: { address: d.data().email || d.id, name: d.data().name || d.id },
      type: "required",
    }));

    if (attendees.length === 0) return { scheduled: 0, skipped: 0, error: "No hay usuarios de contabilidad registrados" };

    // Check already-scheduled events
    const eventsRef = db.collection("tax_calendar_events");
    const existingSnap = await eventsRef.get();
    const alreadyScheduled = new Set(existingSnap.docs.map(d => d.data().obligationId as string));

    const graphToken = await getGraphToken();
    const sender = SENDER_EMAIL.value().trim();
    let scheduled = 0;
    let skipped = 0;

    for (const obl of obligations) {
      if (alreadyScheduled.has(obl.id)) { skipped++; continue; }

      const startDT = `${obl.dueDate}T09:00:00`;
      const endDT   = `${obl.dueDate}T10:00:00`;

      const bodyHtml = `
        <p><b>Empresa:</b> ${obl.company} &nbsp;|&nbsp; <b>NIT:</b> ${obl.nit}</p>
        <p><b>Obligación:</b> ${obl.taxType} — ${obl.obligationType}</p>
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
// Trigger: when a recipient is marked as read, sync totalRead on the communication doc
export const onRecipientRead = onDocumentUpdated(
  { document: "comunicado_recipients/{docId}", region: "us-central1" },
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
    const snap = await db.collection("comunicado_recipients")
      .where("communicationId", "==", communicationId)
      .where("status", "==", "read")
      .get();
    await db.collection("comunicados").doc(communicationId).update({
      totalRead: snap.size,
    });
  }
);
