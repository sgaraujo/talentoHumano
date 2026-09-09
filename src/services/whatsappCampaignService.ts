import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import * as XLSX from "xlsx";
import { db, functions } from "@/config/firebase";
import { FIRESTORE_COLLECTIONS } from "@/config/firestoreCollections";
import { getEmployeeDirectoryUsers } from "@/services/employeeDirectoryService";
import type { Company } from "@/models/types/Company";
import type { Project } from "@/models/types/Project";
import type { User } from "@/models/types/User";
import type { WaCampaignDraft, WaCampaignRecipient } from "@/models/types/WhatsAppCampaign";

export function normalizeWhatsAppPhone(value: unknown): string | null {
  let phone = String(value ?? "").replace(/\D/g, "");
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (phone.length === 10) phone = `57${phone}`;
  if (phone.length < 11 || phone.length > 15) return null;
  // Los números que empiezan por 601 son fijos de Bogotá (línea de oficina),
  // no celulares — tienen formato válido pero no pueden recibir WhatsApp.
  const local = phone.startsWith("57") ? phone.slice(2) : phone;
  if (local.startsWith("601")) return null;
  return phone;
}

export async function getCampaignAudienceData(): Promise<{
  companies: Company[]; projects: Project[]; users: User[];
  contents: Array<{ id: string; type: "bulletin" | "questionnaire"; title: string; url: string }>;
}> {
  const [companiesSnap, projectsSnap, canonicalUsers, bulletinsSnap, questionnairesSnap] = await Promise.all([
    getDocs(collection(db, FIRESTORE_COLLECTIONS.companies)),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.projects)),
    getEmployeeDirectoryUsers(),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.bulletins)),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.questionnaires)),
  ]);
  const companies = companiesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Company)).filter(c => c.activeTH);
  const projects = projectsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Project));
  const baseUrl = (import.meta.env.VITE_APP_URL ?? window.location.origin).replace(/\/$/, "");
  const contents = [
    ...bulletinsSnap.docs
      .filter(d => d.data().status === "published")
      .map(d => ({ id: d.id, type: "bulletin" as const, title: d.data().title ?? "Boletín sin título", url: `${baseUrl}/boletin/${d.id}` })),
    ...questionnairesSnap.docs
      .filter(d => d.data().active && d.data().isPublic)
      .map(d => ({ id: d.id, type: "questionnaire" as const, title: d.data().title ?? "Cuestionario sin título", url: `${baseUrl}/f/${d.id}` })),
  ];
  return {
    companies: companies.sort((a, b) => a.name.localeCompare(b.name)),
    projects: projects.sort((a, b) => a.name.localeCompare(b.name)),
    users: canonicalUsers,
    contents,
  };
}

/**
 * Asignaciones de `user` cuya empresa Y cuenta analítica siguen activas (que
 * el contrato individual siga vigente no basta: si la empresa o el proyecto
 * se desactivaron, esa persona no debe seguir recibiendo campañas de WhatsApp
 * por esa vía), junto con la asignación que coincide con el filtro de
 * empresa/proyecto elegido (o `undefined` si no hay filtro). Los aprendices
 * SENA sí cuentan aquí (a diferencia de la analítica de RRHH): también deben
 * poder recibir comunicaciones por WhatsApp.
 *
 * Devuelve `null` cuando la persona no aplica en absoluto (rol excolaborador
 * o sin ninguna asignación vigente que calce con el filtro) — compartido por
 * `recipientsFromUsers` y `usersMissingCorporatePhone` para no duplicar la
 * regla de elegibilidad.
 */
function eligibleAssignments(
  user: User, companyId: string, projectId: string,
  activeCompanyIds: Set<string>, activeProjectIds: Set<string>,
): { assignments: any[]; matchingAssignment: any } | null {
  if (["excolaborador", "descartado"].includes(user.role)) return null;
  const assigned = user.contractInfo?.assignment;
  const allAssignments = ((user as any)._assignments ?? [assigned]).filter(Boolean);
  const assignments = allAssignments.filter((item: any) =>
    (!item.companyId || activeCompanyIds.has(item.companyId)) &&
    (!item.projectId || activeProjectIds.has(item.projectId)));
  const matchingAssignment = assignments.find((item: any) =>
    (!companyId || item.companyId === companyId) && (!projectId || item.projectId === projectId));
  const matchesCompany = companyId ? Boolean(matchingAssignment) : assignments.length > 0;
  const matchesProject = projectId ? Boolean(matchingAssignment) : assignments.length > 0;
  if (!matchesCompany || !matchesProject) return null;
  return { assignments, matchingAssignment };
}

export function recipientsFromUsers(
  users: User[], companyId: string, projectId: string,
  companies: Company[] = [], projects: Project[] = [],
): WaCampaignRecipient[] {
  const activeCompanyIds = new Set(companies.filter(c => c.activeTH).map(c => c.id));
  const activeProjectIds = new Set(projects.filter(p => p.status === "activo").map(p => p.id));
  const seen = new Set<string>();
  const recipients: WaCampaignRecipient[] = [];
  for (const user of users) {
    const eligible = eligibleAssignments(user, companyId, projectId, activeCompanyIds, activeProjectIds);
    if (!eligible) continue;
    const { assignments, matchingAssignment } = eligible;
    // Para comunicaciones laborales se prioriza siempre la línea corporativa.
    // El teléfono personal queda únicamente como respaldo si aquella no existe
    // o no tiene un formato válido para WhatsApp.
    const phone = normalizeWhatsAppPhone(user.location?.corporatePhone)
      || normalizeWhatsAppPhone(user.personalData?.phone);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    recipients.push({
      id: `user:${user.id}`, userId: user.id, source: "user", phone,
      name: user.fullName || user.personalData?.fullName || phone,
      companyId: matchingAssignment?.companyId || assignments[0]?.companyId,
      projectId: matchingAssignment?.projectId || assignments[0]?.projectId,
    });
  }
  return recipients;
}

export interface WaMissingPhoneUser {
  id: string;
  name: string;
  documentNumber?: string;
  company?: string;
  project?: string;
  hasPersonalPhone: boolean;
}

/**
 * Personas elegibles para la campaña (mismo filtro de rol/empresa/proyecto
 * que `recipientsFromUsers`) que NO tienen un teléfono corporativo válido —
 * para mostrarlas en un listado aparte y que se pueda pedir que completen el
 * dato. `hasPersonalPhone` indica si igual reciben el mensaje por el respaldo
 * de celular personal (no están totalmente fuera del envío).
 */
export function usersMissingCorporatePhone(
  users: User[], companyId: string, projectId: string,
  companies: Company[] = [], projects: Project[] = [],
): WaMissingPhoneUser[] {
  const activeCompanyIds = new Set(companies.filter(c => c.activeTH).map(c => c.id));
  const activeProjectIds = new Set(projects.filter(p => p.status === "activo").map(p => p.id));
  const result: WaMissingPhoneUser[] = [];
  for (const user of users) {
    const eligible = eligibleAssignments(user, companyId, projectId, activeCompanyIds, activeProjectIds);
    if (!eligible) continue;
    if (normalizeWhatsAppPhone(user.location?.corporatePhone)) continue;
    const { assignments, matchingAssignment } = eligible;
    const assignment = matchingAssignment ?? assignments[0];
    result.push({
      id: user.id,
      name: user.fullName || user.personalData?.fullName || user.id,
      documentNumber: user.personalData?.documentNumber,
      company: assignment?.company,
      project: assignment?.project,
      hasPersonalPhone: Boolean(normalizeWhatsAppPhone(user.personalData?.phone)),
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export async function parseExternalContacts(file: File): Promise<WaCampaignRecipient[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
  const seen = new Set<string>();
  const result: WaCampaignRecipient[] = [];
  rows.forEach((row, index) => {
    const lowered = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v]));
    const phone = normalizeWhatsAppPhone(lowered.telefono || lowered.teléfono || lowered.phone || lowered.celular);
    if (!phone || seen.has(phone)) return;
    seen.add(phone);
    result.push({
      id: `external:${index}:${phone}`, source: "external", phone,
      name: String(lowered.nombre || lowered.name || phone).trim(),
      group: String(lowered.grupo || lowered.group || "").trim() || undefined,
    });
  });
  return result;
}

export type WaCampaignResult = {
  id: string; name: string; status: string; total: number; sent: number; failed: number;
  skipped?: number; error?: string;
  delivered?: number; read?: number; deliveryFailed?: number;
  createdAt?: Date;
};

export type WaCampaignRecipientResult = WaCampaignRecipient & {
  status: string; deliveryStatus?: string; error?: string;
};

export async function getRecentCampaigns(): Promise<WaCampaignResult[]> {
  const snap = await getDocs(query(collection(db, FIRESTORE_COLLECTIONS.whatsappCampaigns), orderBy("createdAt", "desc"), limit(20)));
  return snap.docs.map(d => {
    const data = d.data();
    return { id: d.id, ...data, createdAt: data.createdAt?.toDate?.() } as WaCampaignResult;
  });
}

export async function getCampaignRecipients(campaignId: string): Promise<WaCampaignRecipientResult[]> {
  const snap = await getDocs(collection(db, FIRESTORE_COLLECTIONS.whatsappCampaigns, campaignId, "recipients"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as WaCampaignRecipientResult));
}

export async function sendCampaign(draft: WaCampaignDraft): Promise<{ campaignId: string; queued: number; sent: number; failed: number; skipped?: number; error?: string }> {
  const fn = httpsCallable<WaCampaignDraft, { campaignId: string; queued: number; sent: number; failed: number; skipped?: number; error?: string }>(functions, "sendWaCampaign");
  const result = await fn(draft);
  return result.data;
}
