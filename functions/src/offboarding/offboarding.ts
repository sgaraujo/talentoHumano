import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { randomBytes } from "crypto";

// ── OFFBOARDING – Encuesta de salida ────────────────────────────────────────
// Cuando un expediente pasa de ACTIVO a RETIRADO (se cerró su último contrato
// activo) se crea UNA encuesta de salida con enlace único, se envía al correo
// personal y, al responder, submitPublicResponse la marca como respondida.

// Mismo remitente que los comunicados de Talento Humano (inteegrados@inteegra.net.co).
const TENANT_ID_2 = defineSecret("TENANT_ID_2");
const CLIENT_ID_2 = defineSecret("CLIENT_ID_2");
const CLIENT_SECRET_2 = defineSecret("CLIENT_SECRET_2");
const SENDER_EMAIL_2 = defineSecret("SENDER_EMAIL_2");
const APP_URL = defineString("APP_URL", { default: "https://people-analitics.inteegra.net.co" });

export const OFFBOARDING_PATHS = {
  surveys: "human_resources/data/offboarding_surveys",
  settings: "human_resources/data/settings",
  settingsDoc: "offboarding",
  employees: "human_resources/data/employees",
  assignments: "questionnaires/data/assignments",
  definitions: "questionnaires/data/definitions",
  platformRoles: "identity/data/platform_roles",
} as const;

export interface OffboardingSettings {
  enabled?: boolean;
  questionnaireId?: string;
  // Solo se envía si el retiro es reciente: evita que una carga histórica
  // desde Excel dispare correos a personas que se retiraron hace años.
  maxRetirementAgeDays?: number;
  // Motivos para los que no tiene sentido una encuesta de despedida.
  excludedReasons?: string[];
}

const DEFAULT_MAX_AGE_DAYS = 30;
const DEFAULT_EXCLUDED_REASONS = ["Fallecimiento", "Anulado"];

const normalizeEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const escapeHtml = (value: string) => value
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Convierte endDate a Date. Acepta las representaciones históricas de
 * Expedientes (misma lógica que src/domain/humanResources/firestoreDate.ts):
 * Timestamp, {seconds}, "Timestamp(seconds=…)", "aaaa-mm-dd" y "dd/mm/aaaa".
 */
function toDate(value: unknown): Date | null {
  if (!value) return null;
  const valid = (date: Date) => Number.isNaN(date.getTime()) ? null : date;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return valid(value);
  if (typeof value === "object") {
    const record = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof record.toDate === "function") return valid(record.toDate());
    const seconds = typeof record.seconds === "number" ? record.seconds : record._seconds;
    return typeof seconds === "number" ? valid(new Date(seconds * 1000)) : null;
  }
  const text = String(value).trim();
  const timestamp = text.match(/Timestamp\s*\(\s*seconds\s*=\s*(-?\d+)/i);
  if (timestamp) return valid(new Date(Number(timestamp[1]) * 1000));
  const ymd = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return valid(new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])));
  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return valid(new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
  return valid(new Date(text));
}

const isoDate = (value: unknown) => {
  const date = toDate(value);
  return date ?
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` :
    null;
};

async function getSettings(): Promise<OffboardingSettings> {
  const snap = await getFirestore().collection(OFFBOARDING_PATHS.settings).doc(OFFBOARDING_PATHS.settingsDoc).get();
  return (snap.data() ?? {}) as OffboardingSettings;
}

async function getGraphToken(): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID_2.value()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID_2.value(),
      scope: "https://graph.microsoft.com/.default",
      client_secret: CLIENT_SECRET_2.value(),
      grant_type: "client_credentials",
    }),
  });
  const data = await res.json() as { access_token?: string };
  if (!res.ok || !data.access_token) throw new Error(`GRAPH_TOKEN_FAILED ${JSON.stringify(data).slice(0, 300)}`);
  return data.access_token;
}

function buildEmailHtml(firstName: string, link: string) {
  const year = new Date().getFullYear();
  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;line-height:1.6;color:#374151">
    <div style="background:linear-gradient(135deg,#005528,#008C3C);padding:32px 24px;border-radius:12px 12px 0 0;text-align:center">
      <h1 style="color:#ffffff;margin:0;font-size:26px;letter-spacing:3px;font-weight:800">INTE<span style="color:#7BCB6A">E</span>GRADOS</h1>
      <p style="color:#7BCB6A;margin:6px 0 0;font-size:12px;letter-spacing:1px">GESTIÓN DE TALENTO HUMANO</p>
    </div>
    <div style="background:#ffffff;padding:32px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
      <p style="font-size:16px;margin-top:0">Hola <b>${escapeHtml(firstName)}</b>,</p>
      <p>Queremos agradecerte por el tiempo, el esfuerzo y todo lo que aportaste durante tu paso por <b>INTEEGRADOS</b>. Te deseamos muchos éxitos en esta nueva etapa.</p>
      <p>Tu opinión es muy valiosa para nosotros. Te invitamos a responder una breve <b>encuesta de salida</b>: nos ayudará a entender tu experiencia y a mejorar como lugar para trabajar. Toma pocos minutos y tus respuestas se tratan con confidencialidad.</p>
      <div style="text-align:center;margin:28px 0">
        <a href="${link}" style="background:#008C3C;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:15px;display:inline-block">Responder encuesta de salida</a>
      </div>
      <p style="color:#9ca3af;font-size:13px">No necesitas acceso a la plataforma corporativa: el enlace es personal e intransferible. Si el botón no funciona, copia esta dirección en tu navegador:<br><span style="color:#6b7280;word-break:break-all">${link}</span></p>
      <p style="margin-bottom:0">Con aprecio,<br><b>Equipo de Talento Humano</b></p>
      <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:24px;border-top:1px solid #f3f4f6;padding-top:16px">&copy; ${year} Inteegrados &middot; Todos los derechos reservados</p>
    </div>
  </div>`;
}

async function sendSurveyEmail(to: string, fullName: string, token: string) {
  const link = `${APP_URL.value().replace(/\/$/, "")}/responder/${token}`;
  const firstName = fullName.trim().split(/\s+/)[0] || fullName;
  const graphToken = await getGraphToken();
  const sender = SENDER_EMAIL_2.value().trim();
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${graphToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: "Gracias por tu paso por INTEEGRADOS – Encuesta de salida",
        body: { contentType: "HTML", content: buildEmailHtml(firstName, link) },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: true,
    }),
  });
  if (!res.ok) throw new Error(`GRAPH_SENDMAIL_FAILED ${res.status} ${(await res.text()).slice(0, 300)}`);
}

/** Envía (o reenvía) el correo y deja el resultado en la encuesta. */
async function deliver(surveyRef: FirebaseFirestore.DocumentReference, to: string, fullName: string, token: string) {
  if (!to || !isEmail(to)) {
    await surveyRef.update({
      status: "not_sent", notSentReason: "Sin correo personal registrado", updatedAt: FieldValue.serverTimestamp(),
    });
    return false;
  }
  try {
    await sendSurveyEmail(to, fullName, token);
    // "Fecha de envío" es la del primer envío; los reenvíos solo mueven lastSentAt.
    const alreadySent = !!(await surveyRef.get()).data()?.sentAt;
    await surveyRef.update({
      status: "sent", notSentReason: null, personalEmail: to,
      ...(alreadySent ? {} : { sentAt: FieldValue.serverTimestamp() }),
      lastSentAt: FieldValue.serverTimestamp(),
      sendCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (err) {
    logger.error("OFFBOARDING_SEND_ERROR", { survey: surveyRef.id, err: String(err) });
    await surveyRef.update({
      status: "not_sent", notSentReason: "Error al enviar el correo", updatedAt: FieldValue.serverTimestamp(),
    });
    return false;
  }
}

type CreateResult =
  | { outcome: "created"; surveyId: string; sent: boolean }
  | { outcome: "exists" | "excluded" | "old" | "no_retirement" | "still_active" | "not_found"; surveyId?: string; detail?: string };

/**
 * Crea la encuesta de salida del retiro más reciente de un excolaborador y
 * envía el correo. Idempotente: el ID de la encuesta es empleado + contrato y
 * se crea con create(), que falla si ya existe; así nunca hay dos encuestas ni
 * dos envíos para el mismo retiro, venga del disparador o del envío manual.
 */
async function createSurveyForEmployee(
  employeeId: string,
  settings: OffboardingSettings & { questionnaireId: string },
  questionnaireTitle: string,
  options: { enforceAgeLimit: boolean },
): Promise<CreateResult> {
  const db = getFirestore();
  const employeeRef = db.collection(OFFBOARDING_PATHS.employees).doc(employeeId);
  const [employeeSnap, employments] = await Promise.all([employeeRef.get(), employeeRef.collection("employments").get()]);
  const employee = employeeSnap.data();
  if (!employee) return { outcome: "not_found" };

  const relations = employments.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, any>));
  if (relations.some((item) => item.status === "active")) return { outcome: "still_active" };
  // El retiro que convierte a la persona en excolaborador es el más reciente.
  const retired = relations
    .filter((item) => item.status === "retired")
    .sort((a, b) => (toDate(b.endDate)?.getTime() ?? 0) - (toDate(a.endDate)?.getTime() ?? 0))[0];
  if (!retired) return { outcome: "no_retirement" };

  const excluded = settings.excludedReasons ?? DEFAULT_EXCLUDED_REASONS;
  if (retired.terminationReason && excluded.includes(retired.terminationReason)) {
    return { outcome: "excluded", detail: retired.terminationReason };
  }

  const endDate = toDate(retired.endDate);
  const maxAge = settings.maxRetirementAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  if (options.enforceAgeLimit && endDate && Date.now() - endDate.getTime() > maxAge * 86_400_000) {
    return { outcome: "old", detail: isoDate(endDate) ?? undefined };
  }

  const surveyRef = db.collection(OFFBOARDING_PATHS.surveys).doc(`${employeeId}_${retired.id}`);
  const token = randomBytes(24).toString("hex");
  const fullName = String(employee.fullName || "Excolaborador");
  const personalEmail = normalizeEmail(employee.personalEmail);
  const assignmentRef = db.collection(OFFBOARDING_PATHS.assignments).doc();

  try {
    await surveyRef.create({
      employeeId,
      employmentId: retired.id,
      fullName,
      documentNumber: String(employee.documentNumber || employeeId),
      personalEmail: personalEmail || null,
      companyName: retired.companyName ?? null,
      projectName: retired.projectName || retired.analyticalAccount || null,
      position: retired.position ?? null,
      supervisor: retired.supervisor ?? null,
      endDate: isoDate(retired.endDate),
      terminationReason: retired.terminationReason ?? null,
      questionnaireId: settings.questionnaireId,
      questionnaireTitle,
      assignmentId: assignmentRef.id,
      token,
      status: "pending_send",
      origin: options.enforceAgeLimit ? "automatic" : "manual",
      sendCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err: any) {
    // ALREADY_EXISTS (código 6): esta persona ya tiene encuesta para este retiro.
    if (err?.code === 6) return { outcome: "exists", surveyId: surveyRef.id };
    throw err;
  }

  // Asignación estándar de cuestionario: así el enlace /responder/:token
  // funciona sin sesión, igual que los demás cuestionarios públicos.
  await assignmentRef.set({
    questionnaireId: settings.questionnaireId,
    userId: employeeId,
    userEmail: personalEmail,
    userName: fullName,
    status: "pending",
    assignedAt: FieldValue.serverTimestamp(),
    token,
    offboardingSurveyId: surveyRef.id,
  });

  const sent = await deliver(surveyRef, personalEmail, fullName, token);
  return { outcome: "created", surveyId: surveyRef.id, sent };
}

async function loadQuestionnaireTitle(questionnaireId: string): Promise<string | null> {
  const snap = await getFirestore().collection(OFFBOARDING_PATHS.definitions).doc(questionnaireId).get();
  return snap.exists ? String(snap.data()?.title ?? "Encuesta de salida") : null;
}

async function assertHumanResources(email: string) {
  if (!email) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  const role = (await getFirestore().collection(OFFBOARDING_PATHS.platformRoles).doc(email).get()).data()?.role;
  if (role !== "admin" && role !== "talento_humano") {
    throw new HttpsError("permission-denied", "Solo Talento Humano puede enviar encuestas de salida.");
  }
}

/** Disparador: expediente ACTIVO → RETIRADO (excolaborador). */
export const onEmployeeOffboarded = onDocumentUpdated(
  {
    document: `${OFFBOARDING_PATHS.employees}/{employeeId}`,
    region: "us-central1",
    secrets: [TENANT_ID_2, CLIENT_ID_2, CLIENT_SECRET_2, SENDER_EMAIL_2],
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || before.status !== "active" || after.status !== "retired") return;

    const employeeId = event.params.employeeId;
    const settings = await getSettings();
    if (!settings.enabled || !settings.questionnaireId) {
      logger.info("OFFBOARDING_SKIPPED_DISABLED", { employeeId });
      return;
    }
    const title = await loadQuestionnaireTitle(settings.questionnaireId);
    if (!title) {
      logger.error("OFFBOARDING_QUESTIONNAIRE_MISSING", { questionnaireId: settings.questionnaireId });
      return;
    }
    const result = await createSurveyForEmployee(
      employeeId, settings as OffboardingSettings & { questionnaireId: string }, title, { enforceAgeLimit: true },
    );
    logger.info("OFFBOARDING_TRIGGER_RESULT", { employeeId, ...result });
  },
);

/**
 * Envío manual desde Offboarding a excolaboradores de Expedientes que no
 * recibieron la encuesta automática (retirados antes de activar el módulo o
 * fuera del límite de días). No aplica el límite de antigüedad porque TH los
 * elige uno a uno; sí respeta los motivos excluidos y la regla de no duplicar.
 */
export const sendOffboardingSurveys = onCall(
  { region: "us-central1", timeoutSeconds: 300, secrets: [TENANT_ID_2, CLIENT_ID_2, CLIENT_SECRET_2, SENDER_EMAIL_2] },
  async (request) => {
    await assertHumanResources(normalizeEmail(request.auth?.token.email));
    const ids = Array.isArray(request.data?.employeeIds) ?
      [...new Set((request.data.employeeIds as unknown[]).map(String))] : [];
    if (!ids.length) throw new HttpsError("invalid-argument", "Selecciona al menos un excolaborador.");
    if (ids.length > 100) throw new HttpsError("invalid-argument", "Máximo 100 excolaboradores por envío.");

    const settings = await getSettings();
    if (!settings.questionnaireId) {
      throw new HttpsError("failed-precondition", "Primero elige la encuesta de salida en Offboarding → Configuración.");
    }
    const title = await loadQuestionnaireTitle(settings.questionnaireId);
    if (!title) throw new HttpsError("failed-precondition", "La encuesta configurada ya no existe. Elige otra en Configuración.");

    const results: Array<{ employeeId: string } & CreateResult> = [];
    for (const employeeId of ids) {
      try {
        const result = await createSurveyForEmployee(
          employeeId, settings as OffboardingSettings & { questionnaireId: string }, title, { enforceAgeLimit: false },
        );
        results.push({ employeeId, ...result });
      } catch (err) {
        logger.error("OFFBOARDING_MANUAL_ERROR", { employeeId, err: String(err) });
        results.push({ employeeId, outcome: "not_found", detail: "Error inesperado" });
      }
    }
    return { results };
  },
);

/**
 * Reenvía la encuesta existente (mismo enlace, sin crear otra). Toma el
 * correo personal actual del expediente, por si TH lo corrigió.
 */
export const resendOffboardingSurvey = onCall(
  { region: "us-central1", secrets: [TENANT_ID_2, CLIENT_ID_2, CLIENT_SECRET_2, SENDER_EMAIL_2] },
  async (request) => {
    await assertHumanResources(normalizeEmail(request.auth?.token.email));
    const db = getFirestore();

    const surveyId = String(request.data?.surveyId || "");
    if (!surveyId) throw new HttpsError("invalid-argument", "surveyId es requerido");
    const surveyRef = db.collection(OFFBOARDING_PATHS.surveys).doc(surveyId);
    const survey = (await surveyRef.get()).data();
    if (!survey) throw new HttpsError("not-found", "La encuesta no existe.");
    if (survey.status === "responded") throw new HttpsError("failed-precondition", "La encuesta ya fue respondida.");

    const employee = (await db.collection(OFFBOARDING_PATHS.employees).doc(survey.employeeId).get()).data() ?? {};
    const to = normalizeEmail(employee.personalEmail) || normalizeEmail(survey.personalEmail);
    if (to && survey.assignmentId) {
      await db.collection(OFFBOARDING_PATHS.assignments).doc(survey.assignmentId).update({ userEmail: to });
    }
    const ok = await deliver(surveyRef, to, survey.fullName, survey.token);
    if (!ok) {
      throw new HttpsError("failed-precondition", to ? "No se pudo enviar el correo. Intenta más tarde." : "La persona no tiene correo personal registrado en su expediente.");
    }
    return { ok: true, sentTo: to };
  },
);
