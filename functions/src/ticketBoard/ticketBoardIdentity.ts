import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getFirestore, type DocumentData, type DocumentSnapshot } from "firebase-admin/firestore";
import { createHash, randomInt, timingSafeEqual } from "crypto";
import {
  EMPLOYEES, EMPLOYMENTS, TICKET_BOARD_SYNC_KEY, clean, employmentState, personRef, validEmail,
} from "./ticketBoardSync";

// ── Ingreso por cédula a la Mesa de Ayuda ───────────────────────────────────
// Quien no tiene correo corporativo entra a la Mesa de Ayuda (ticket-board)
// con su cédula y un código de un solo uso. Solo lo llama la Edge Function
// `acceso-cedula` de ticket-board, con la misma clave compartida de la
// sincronización (header x-sync-key).
//
//   POST { accion: "solicitar", cedula }          → envía el código
//   POST { accion: "verificar", cedula, codigo }  → confirma quién es
//
// Los datos de contacto nunca salen de Nelyoda: aquí se envía el
// código y a ticket-board solo le llega el destino enmascarado y, al
// verificar, los datos corporativos de la persona.
//
// Por ahora el código va al correo corporativo (o al personal si no hay
// corporativo). Cuando la Mesa de Ayuda tenga su línea de WhatsApp, el envío
// cambia en `deliverCode` y nada más.

const TENANT_ID_2 = defineSecret("TENANT_ID_2");
const CLIENT_ID_2 = defineSecret("CLIENT_ID_2");
const CLIENT_SECRET_2 = defineSecret("CLIENT_SECRET_2");
const SENDER_EMAIL_2 = defineSecret("SENDER_EMAIL_2");

const CODES = "identity/data/ticket_board_codes";
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 3;
const HOUR_MS = 60 * 60 * 1000;

type Reply = Record<string, unknown>;

function keyMatches(received: unknown): boolean {
  if (typeof received !== "string" || !received) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(received), digest(TICKET_BOARD_SYNC_KEY.value()));
}

const normalizeCedula = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const hashCode = (employeeId: string, code: string) =>
  createHash("sha256").update(`${employeeId}:${code}`).digest("hex");

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}${"*".repeat(Math.max(user.length - 2, 3))}@${domain}`;
}

/** Busca el expediente por cédula: el id del documento es la cédula. */
async function findEmployee(cedula: string): Promise<DocumentSnapshot | null> {
  const db = getFirestore();
  const direct = await db.doc(`${EMPLOYEES}/${cedula}`).get();
  if (direct.exists) return direct;
  const byField = await db.collection(EMPLOYEES).where("documentNumber", "==", cedula).limit(1).get();
  return byField.empty ? null : byField.docs[0];
}

async function loadState(employee: DocumentSnapshot) {
  const employments = await employee.ref.collection(EMPLOYMENTS).get();
  return employmentState(employee.data() as DocumentData, employments.docs.map(item => item.data()));
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

function codeEmailHtml(firstName: string, code: string): string {
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;line-height:1.6;color:#374151">
    <div style="background:#006C2F;padding:24px;border-radius:12px 12px 0 0;text-align:center">
      <p style="color:#ffffff;margin:0;font-size:20px;font-weight:800;letter-spacing:2px">MESA DE AYUDA</p>
    </div>
    <div style="background:#ffffff;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
      <p style="margin-top:0">Hola <b>${firstName.replace(/[<>&"]/g, "")}</b>,</p>
      <p>Tu código para entrar a la Mesa de Ayuda es:</p>
      <p style="text-align:center;font-size:32px;font-weight:800;letter-spacing:8px;margin:20px 0;color:#006C2F">${code}</p>
      <p style="color:#6b7280;font-size:13px">Vence en 10 minutos. Si no lo pediste, ignora este mensaje: nadie puede entrar sin este código.</p>
    </div>
  </div>`;
}

/** Envía el código. Devuelve el destino enmascarado o null si no hay a dónde. */
async function deliverCode(employee: DocumentData, code: string): Promise<string | null> {
  // Primero el corporativo (buzón controlado por la empresa); el personal es
  // para quien no tiene corporativo.
  const to = validEmail(employee.corporateEmail) ?? validEmail(employee.personalEmail);
  if (!to) return null;
  const firstName = (clean(employee.fullName) ?? "").split(/\s+/)[0] || "";
  const sender = SENDER_EMAIL_2.value().trim();
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${await getGraphToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: `${code} es tu código de la Mesa de Ayuda`,
        body: { contentType: "HTML", content: codeEmailHtml(firstName, code) },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: false,
    }),
  });
  if (!res.ok) throw new Error(`GRAPH_SENDMAIL_FAILED ${res.status} ${(await res.text()).slice(0, 300)}`);
  return maskEmail(to);
}

async function requestCode(cedula: string): Promise<Reply> {
  const employee = await findEmployee(cedula);
  if (!employee) return { ok: false, motivo: "no_encontrado" };
  const state = await loadState(employee);
  if (state.activo !== true) return { ok: false, motivo: "no_encontrado" };

  const codeRef = getFirestore().doc(`${CODES}/${employee.id}`);
  const now = Date.now();
  const previous = (await codeRef.get()).data() ?? {};
  const recentSends = ((previous.sends ?? []) as number[]).filter(at => now - at < HOUR_MS);
  if (recentSends.length >= MAX_SENDS_PER_HOUR) {
    const waitMinutes = Math.ceil((HOUR_MS - (now - Math.min(...recentSends))) / 60000);
    return { ok: false, motivo: "limite", esperaMinutos: waitMinutes };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const destination = await deliverCode(employee.data() as DocumentData, code);
  if (!destination) return { ok: false, motivo: "sin_contacto" };

  await codeRef.set({
    codeHash: hashCode(employee.id, code),
    expiresAt: now + CODE_TTL_MS,
    attempts: 0,
    sends: [...recentSends, now],
  });
  return { ok: true, destino: destination };
}

async function verifyCode(cedula: string, code: string): Promise<Reply> {
  const employee = await findEmployee(cedula);
  if (!employee) return { ok: false, motivo: "codigo_invalido" };

  const codeRef = getFirestore().doc(`${CODES}/${employee.id}`);
  // En transacción para que dos intentos simultáneos no se salten el límite.
  const result = await getFirestore().runTransaction(async tx => {
    const data = (await tx.get(codeRef)).data();
    if (!data?.codeHash) return "codigo_invalido";
    if (Date.now() > data.expiresAt) {
      tx.update(codeRef, { codeHash: null });
      return "vencido";
    }
    if (data.codeHash !== hashCode(employee.id, code)) {
      const attempts = (data.attempts ?? 0) + 1;
      // Al agotar los intentos el código deja de servir: hay que pedir otro.
      tx.update(codeRef, attempts >= MAX_ATTEMPTS ? { codeHash: null, attempts } : { attempts });
      return attempts >= MAX_ATTEMPTS ? "bloqueado" : "codigo_invalido";
    }
    tx.update(codeRef, { codeHash: null, attempts: 0 });
    return "ok";
  });
  if (result !== "ok") return { ok: false, motivo: result };

  // Se revisa de nuevo: pudo retirarse entre el envío y la verificación.
  const state = await loadState(employee);
  if (state.activo !== true) return { ok: false, motivo: "no_encontrado" };
  const data = employee.data() as DocumentData;
  return {
    ok: true,
    persona: {
      ref: personRef(employee.id),
      nombre: clean(data.fullName),
      emailCorporativo: validEmail(data.corporateEmail),
      telefono: clean(data.corporatePhone),
      relaciones: state.relaciones,
    },
  };
}

export const ticketBoardIdentity = onRequest(
  {
    region: "us-central1",
    secrets: [TICKET_BOARD_SYNC_KEY, TENANT_ID_2, CLIENT_ID_2, CLIENT_SECRET_2, SENDER_EMAIL_2],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, motivo: "metodo" });
      return;
    }
    if (!keyMatches(req.get("x-sync-key"))) {
      res.status(401).json({ ok: false, motivo: "no_autorizado" });
      return;
    }

    const cedula = normalizeCedula(req.body?.cedula);
    if (cedula.length < 5 || cedula.length > 12) {
      res.status(400).json({ ok: false, motivo: "cedula_invalida" });
      return;
    }

    try {
      if (req.body?.accion === "solicitar") {
        res.json(await requestCode(cedula));
      } else if (req.body?.accion === "verificar") {
        const code = String(req.body?.codigo ?? "").replace(/\D/g, "");
        res.json(code.length === 6 ? await verifyCode(cedula, code) : { ok: false, motivo: "codigo_invalido" });
      } else {
        res.status(400).json({ ok: false, motivo: "accion_invalida" });
      }
    } catch (error) {
      logger.error("Ingreso por cédula a Mesa de Ayuda falló", { error: String(error) });
      res.status(500).json({ ok: false, motivo: "error" });
    }
  },
);
