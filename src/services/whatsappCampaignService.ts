import { collection, collectionGroup, getDocs, limit, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import * as XLSX from "xlsx";
import { db, functions } from "@/config/firebase";
import { FIRESTORE_COLLECTIONS } from "@/config/firestoreCollections";
import type { Company } from "@/models/types/Company";
import type { Project } from "@/models/types/Project";
import type { User } from "@/models/types/User";
import type { WaCampaignDraft, WaCampaignRecipient } from "@/models/types/WhatsAppCampaign";

export function normalizeWhatsAppPhone(value: unknown): string | null {
  let phone = String(value ?? "").replace(/\D/g, "");
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (phone.length === 10) phone = `57${phone}`;
  if (phone.length < 11 || phone.length > 15) return null;
  return phone;
}

function mapUser(d: any): User {
  return { id: d.id, ...d.data() } as User;
}

export async function getCampaignAudienceData(): Promise<{
  companies: Company[]; projects: Project[]; users: User[];
  contents: Array<{ id: string; type: "bulletin" | "questionnaire"; title: string; url: string }>;
}> {
  const [companiesSnap, projectsSnap, usersSnap, employeesSnap, employmentsSnap, bulletinsSnap, questionnairesSnap] = await Promise.all([
    getDocs(collection(db, FIRESTORE_COLLECTIONS.companies)),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.projects)),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.users)),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.employees)),
    getDocs(collectionGroup(db, "employments")),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.bulletins)),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.questionnaires)),
  ]);
  const companies = companiesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Company));
  const projects = projectsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Project));
  // Clave de comparación, no de presentación: hace equivalentes, por ejemplo,
  // "INTEEGRA S.A.S BIC" e "INTEEGRA SAS BIC".
  const normalize = (value: unknown) => String(value ?? "").trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/[^a-z0-9]/g, "");
  const companyIdByName = new Map(companies.map(company => [normalize(company.name), company.id]));
  const projectIdByCompanyAndName = new Map(projects.map(project => [
    `${project.companyId}|${normalize(project.name)}`, project.id,
  ]));
  const employmentsByEmployee = new Map<string, any[]>();
  employmentsSnap.docs.forEach(snapshot => {
    const relationship = snapshot.data() as any;
    const employeeId = relationship.employeeId || snapshot.ref.parent.parent?.id;
    if (!employeeId) return;
    if (!employmentsByEmployee.has(employeeId)) employmentsByEmployee.set(employeeId, []);
    employmentsByEmployee.get(employeeId)!.push(relationship);
  });
  const canonicalUsers = employeesSnap.docs.map(snapshot => {
    const employee = snapshot.data() as any;
    const activeRelationships = (employmentsByEmployee.get(snapshot.id) ?? []).filter(item => item.status === "active");
    const assignments = activeRelationships.map(relationship => {
      const companyId = companyIdByName.get(normalize(relationship.companyName));
      const projectId = companyId
        ? projectIdByCompanyAndName.get(`${companyId}|${normalize(relationship.projectName)}`)
        : undefined;
      return { companyId, projectId, company: relationship.companyName, project: relationship.projectName };
    });
    return {
      id: employee.identityUserId || `employee:${snapshot.id}`,
      fullName: employee.fullName,
      email: employee.corporateEmail || employee.personalEmail || "",
      role: activeRelationships.length ? "colaborador" : "excolaborador",
      profileCompleted: false, completedOnboardings: [],
      companyIds: [...new Set(assignments.map(item => item.companyId).filter(Boolean))],
      projectIds: [...new Set(assignments.map(item => item.projectId).filter(Boolean))],
      personalData: { documentNumber: employee.documentNumber, phone: employee.personalPhone },
      location: { corporatePhone: employee.corporatePhone },
      contractInfo: { assignment: assignments[0] ?? {} },
      _assignments: assignments,
    } as any as User;
  });
  const canonicalIdentityIds = new Set(canonicalUsers.map(user => user.id).filter(id => !id.startsWith("employee:")));
  const legacyFallback = usersSnap.docs.map(mapUser).filter(user => !canonicalIdentityIds.has(user.id));
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
    users: [...canonicalUsers, ...legacyFallback],
    contents,
  };
}

export function recipientsFromUsers(users: User[], companyId: string, projectId: string): WaCampaignRecipient[] {
  const seen = new Set<string>();
  const recipients: WaCampaignRecipient[] = [];
  for (const user of users) {
    const assigned = user.contractInfo?.assignment;
    const assignments = ((user as any)._assignments ?? [assigned]).filter(Boolean);
    const matchingAssignment = assignments.find((item: any) =>
      (!companyId || item.companyId === companyId) && (!projectId || item.projectId === projectId));
    const matchesCompany = !companyId || user.companyIds?.includes(companyId) || assigned?.companyId === companyId || Boolean(matchingAssignment);
    const matchesProject = !projectId || user.projectIds?.includes(projectId) || assigned?.projectId === projectId || Boolean(matchingAssignment);
    if (!matchesCompany || !matchesProject || ["excolaborador", "descartado"].includes(user.role)) continue;
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
      companyId: matchingAssignment?.companyId || assigned?.companyId || user.companyIds?.[0],
      projectId: matchingAssignment?.projectId || assigned?.projectId || user.projectIds?.[0],
    });
  }
  return recipients;
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

export async function sendCampaign(draft: WaCampaignDraft): Promise<{ campaignId: string; queued: number; sent: number; failed: number }> {
  const fn = httpsCallable<WaCampaignDraft, { campaignId: string; queued: number; sent: number; failed: number }>(functions, "sendWaCampaign");
  const result = await fn(draft);
  return result.data;
}
