import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret, defineString } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getFirestore, type DocumentData } from "firebase-admin/firestore";
import { createHash } from "crypto";

// ── Sincronización con Mesa de Ayuda (ticket-board, Supabase) ───────────────
// Cada cambio en un expediente o en una de sus relaciones laborales se envía a
// la Edge Function `sincronizar-nelyoda`, que habilita, desactiva o reactiva
// el acceso de la persona en la Mesa de Ayuda. Un barrido nocturno reenvía
// todo para corregir cualquier aviso que se haya perdido.
//
// Solo salen datos corporativos: nombre, correo y teléfono corporativos y,
// por cada relación vigente, empresa, proyecto, área, cuenta analítica, cargo
// y jefe inmediato. Nunca datos personales, nómina, banco ni seguridad social.
// La cédula viaja como huella SHA-256 (`ref`), no en claro.

export const TICKET_BOARD_SYNC_KEY = defineSecret("TICKET_BOARD_SYNC_KEY");
const TICKET_BOARD_SYNC_URL = defineString("TICKET_BOARD_SYNC_URL");

export const EMPLOYEES = "human_resources/data/employees";
export const EMPLOYMENTS = "employments";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Debe coincidir con MAX_PERSONAS_POR_LLAMADO de la Edge Function. */
const BATCH_SIZE = 100;

export interface TicketBoardRelation {
  empresa: string | null;
  proyecto: string | null;
  area: string | null;
  cuentaAnalitica: string | null;
  cargo: string | null;
  jefe: string | null;
}

interface TicketBoardPerson {
  ref: string;
  email: string | null;
  nombre: string | null;
  telefono: string | null;
  activo: boolean;
  relaciones: TicketBoardRelation[];
}

export const clean = (value: unknown): string | null => {
  const text = String(value ?? "").trim();
  return text || null;
};

export const personRef = (employeeId: string) => createHash("sha256").update(employeeId).digest("hex");

export function validEmail(value: unknown): string | null {
  const email = clean(value)?.toLowerCase() ?? null;
  return email && EMAIL_PATTERN.test(email) ? email : null;
}

const corporateEmail = (employee: DocumentData | undefined) => validEmail(employee?.corporateEmail);

/**
 * Estado laboral de un expediente: vigente si tiene alguna relación activa.
 * `activo` es null cuando no hay forma de saberlo (sin relaciones laborales y
 * sin estado definido); en ese caso no se toca nada en la Mesa de Ayuda.
 */
export function employmentState(
  employee: DocumentData, employments: DocumentData[],
): { activo: boolean | null; relaciones: TicketBoardRelation[] } {
  const current = employments.filter(item => item.status === "active");
  let activo: boolean | null;
  if (current.length > 0) activo = true;
  else if (employments.length > 0 || ["retired", "inactive"].includes(employee.status)) activo = false;
  else if (employee.status === "active") activo = true;
  else activo = null;

  return {
    activo,
    relaciones: current.map(item => ({
      empresa: clean(item.companyName),
      proyecto: clean(item.projectName),
      area: clean(item.area),
      cuentaAnalitica: clean(item.analyticalAccount),
      cargo: clean(item.position),
      jefe: clean(item.supervisor),
    })),
  };
}

/**
 * Resume un expediente para la Mesa de Ayuda. Devuelve null si su estado es
 * desconocido. Sin correo corporativo `email` va en null: esa persona entra
 * por cédula (ticketBoardIdentity.ts) y ticket-board le asigna un correo
 * interno; se envía igual para poder desactivarla cuando se retire.
 */
function summarize(
  employeeId: string, employee: DocumentData, employments: DocumentData[],
): TicketBoardPerson | null {
  const email = corporateEmail(employee);
  const { activo, relaciones } = employmentState(employee, employments);
  if (activo === null) return null;

  return {
    ref: personRef(employeeId),
    email,
    nombre: clean(employee.fullName),
    telefono: clean(employee.corporatePhone),
    activo,
    relaciones,
  };
}

/** Lanza error ante fallas temporales (red o 5xx) para que Firebase reintente. */
async function send(people: TicketBoardPerson[]): Promise<void> {
  if (people.length === 0) return;
  const response = await fetch(TICKET_BOARD_SYNC_URL.value(), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-sync-key": TICKET_BOARD_SYNC_KEY.value() },
    body: JSON.stringify({ personas: people }),
  });
  const body = await response.text();
  if (response.status >= 500) throw new Error(`Mesa de Ayuda respondió ${response.status}: ${body}`);
  // Un 4xx no mejora reintentando (clave o datos inválidos): se registra.
  if (!response.ok) logger.error("Mesa de Ayuda rechazó la sincronización", { status: response.status, body });
  else logger.info("Sincronización con Mesa de Ayuda", { body });
}

async function syncEmployee(employeeId: string, previous?: DocumentData): Promise<void> {
  const db = getFirestore();
  const employeeRef = db.doc(`${EMPLOYEES}/${employeeId}`);
  const [employeeSnap, employmentsSnap] = await Promise.all([
    employeeRef.get(),
    employeeRef.collection(EMPLOYMENTS).get(),
  ]);

  if (!employeeSnap.exists) {
    // Expediente eliminado: se informa como retirado con el último correo conocido.
    await send([{
      ref: personRef(employeeId), email: corporateEmail(previous),
      nombre: clean(previous?.fullName), telefono: null, activo: false, relaciones: [],
    }]);
    return;
  }

  const person = summarize(employeeId, employeeSnap.data()!, employmentsSnap.docs.map(item => item.data()));
  if (person) await send([person]);
}

const triggerOptions = {
  region: "us-central1",
  secrets: [TICKET_BOARD_SYNC_KEY],
  // Reintenta ante fallas temporales; el envío es idempotente.
  retry: true,
};

export const onEmployeeWrittenTicketBoard = onDocumentWritten(
  { ...triggerOptions, document: `${EMPLOYEES}/{employeeId}` },
  async event => {
    await syncEmployee(event.params.employeeId, event.data?.before.data());
  },
);

export const onEmploymentWrittenTicketBoard = onDocumentWritten(
  { ...triggerOptions, document: `${EMPLOYEES}/{employeeId}/${EMPLOYMENTS}/{employmentId}` },
  async event => {
    await syncEmployee(event.params.employeeId);
  },
);

/** Reenvía todos los expedientes cada madrugada (y sirve para la carga inicial). */
export const scheduledTicketBoardSync = onSchedule(
  {
    schedule: "0 2 * * *",
    timeZone: "America/Bogota",
    region: "us-central1",
    timeoutSeconds: 540,
    secrets: [TICKET_BOARD_SYNC_KEY],
  },
  async () => {
    const db = getFirestore();
    const [employeesSnap, employmentsSnap] = await Promise.all([
      db.collection(EMPLOYEES).get(),
      db.collectionGroup(EMPLOYMENTS).get(),
    ]);

    const employmentsByEmployee = new Map<string, DocumentData[]>();
    employmentsSnap.docs.forEach(item => {
      const employeeId = item.ref.parent.parent?.id;
      if (!employeeId || item.ref.parent.parent?.parent.path !== EMPLOYEES) return;
      employmentsByEmployee.set(employeeId, [...(employmentsByEmployee.get(employeeId) ?? []), item.data()]);
    });

    const people = employeesSnap.docs
      .map(item => summarize(item.id, item.data(), employmentsByEmployee.get(item.id) ?? []))
      .filter((item): item is TicketBoardPerson => item !== null);

    let failedBatches = 0;
    for (let index = 0; index < people.length; index += BATCH_SIZE) {
      try {
        await send(people.slice(index, index + BATCH_SIZE));
      } catch (error) {
        failedBatches++;
        logger.error("Falló un lote de la sincronización con Mesa de Ayuda", { index, error: String(error) });
      }
    }
    logger.info("Barrido con Mesa de Ayuda terminado", {
      employees: employeesSnap.size, sent: people.length, failedBatches,
    });
  },
);
