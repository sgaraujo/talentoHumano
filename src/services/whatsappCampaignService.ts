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
  const companies = companiesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Company)).filter(c => c.active);
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
