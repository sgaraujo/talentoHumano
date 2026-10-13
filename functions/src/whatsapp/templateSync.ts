import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, getFirestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { WHATSAPP_COLLECTIONS } from "./firestorePaths";

const META_BASE = "https://graph.facebook.com/v22.0";

type MetaTemplate = {
  id: string; name: string; language: string; status: string; category?: string;
  parameter_format?: string;
  components?: Array<{ type: string; format?: string; text?: string; buttons?: Array<{ type: string; text?: string; url?: string }> }>;
};

async function metaGet(path: string, token: string): Promise<any> {
  const response = await fetch(`${META_BASE}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new Error(body?.error?.message || `Meta respondió ${response.status}`);
  return body;
}

// Los documentos del número solo guardan phoneNumberId y el token; las
// plantillas viven en la cuenta de WhatsApp Business (WABA). Si el número no
// tiene `wabaId` guardado, se deduce de las cuentas a las que el token tiene
// acceso y se elige la que contiene este phoneNumberId.
async function resolveWabaId(phoneNumberId: string, token: string): Promise<string> {
  const debug = await metaGet(`debug_token?input_token=${encodeURIComponent(token)}`, token);
  const scopes = (debug?.data?.granular_scopes ?? []) as Array<{ scope: string; target_ids?: string[] }>;
  const candidates = new Set(scopes
    .filter(s => s.scope === "whatsapp_business_management" || s.scope === "whatsapp_business_messaging")
    .flatMap(s => s.target_ids ?? []));
  // Cuando el token tiene acceso a todos los activos del negocio, Meta omite
  // target_ids; en ese caso se recorren las cuentas de los negocios del token.
  if (candidates.size === 0) {
    try {
      const businesses = await metaGet("me/businesses?fields=id&limit=50", token);
      for (const business of businesses?.data ?? []) {
        for (const edge of ["owned_whatsapp_business_accounts", "client_whatsapp_business_accounts"]) {
          try {
            const accounts = await metaGet(`${business.id}/${edge}?fields=id&limit=100`, token);
            (accounts?.data ?? []).forEach((a: { id: string }) => candidates.add(a.id));
          } catch { /* sin permiso sobre ese listado — se intenta el siguiente */ }
        }
      }
    } catch (error: any) {
      logger.warn("No se pudieron listar los negocios del token", { error: error?.message });
    }
  }
  for (const wabaId of candidates) {
    try {
      const numbers = await metaGet(`${wabaId}/phone_numbers?fields=id&limit=100`, token);
      if ((numbers?.data ?? []).some((n: { id: string }) => n.id === phoneNumberId)) return wabaId;
    } catch { /* el token puede no tener permiso sobre esa cuenta — se prueba la siguiente */ }
  }
  throw new Error("No se pudo determinar la cuenta de WhatsApp Business del número. Guarda el campo `wabaId` en el documento del número.");
}

export const syncWaTemplates = onCall(
  { region: "us-central1", cors: true, timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    const numberId = String(request.data?.numberId ?? "");
    if (!numberId) throw new HttpsError("invalid-argument", "Falta numberId.");

    const db = getFirestore();
    const numberRef = db.doc(`${WHATSAPP_COLLECTIONS.numbers}/${numberId}`);
    const numberSnap = await numberRef.get();
    if (!numberSnap.exists) throw new HttpsError("not-found", "Número emisor no encontrado.");
    const { phoneNumberId, metaToken, wabaId: storedWabaId } = numberSnap.data() as { phoneNumberId?: string; metaToken?: string; wabaId?: string };
    if (!phoneNumberId || !metaToken) throw new HttpsError("failed-precondition", "El número no tiene phoneNumberId o token configurado.");

    const templates: MetaTemplate[] = [];
    let wabaId = storedWabaId ?? "";
    try {
      if (!wabaId) {
        wabaId = await resolveWabaId(phoneNumberId, metaToken);
        await numberRef.set({ wabaId }, { merge: true });
      }
      let next: string | null = `${wabaId}/message_templates?fields=id,name,language,status,category,parameter_format,components&limit=100`;
      while (next) {
        const page: any = await metaGet(next, metaToken);
        templates.push(...(page?.data ?? []));
        const nextUrl: string | undefined = page?.paging?.next;
        next = nextUrl ? nextUrl.replace(`${META_BASE}/`, "") : null;
      }
    } catch (error: any) {
      logger.error("Error sincronizando plantillas de Meta", { numberId, error: error?.message });
      throw new HttpsError("internal", `No se pudieron consultar las plantillas en Meta: ${error?.message ?? error}`);
    }

    const templatesCol = numberRef.collection("templates");
    const existing = await templatesCol.get();
    // Las plantillas registradas a mano antes de la sincronización no tienen
    // languageCode; se emparejan por nombre para actualizarlas en vez de duplicarlas.
    const existingByKey = new Map<string, QueryDocumentSnapshot>();
    existing.docs.forEach(doc => {
      const data = doc.data();
      if (!data.providerTemplateName) return;
      existingByKey.set(`${data.providerTemplateName}__${data.languageCode || "*"}`, doc);
    });

    const seenDocIds = new Set<string>();
    let added = 0;
    let updated = 0;
    const batch = db.batch();
    for (const tpl of templates) {
      const match = existingByKey.get(`${tpl.name}__${tpl.language}`) ?? existingByKey.get(`${tpl.name}__*`);
      const ref = match?.ref ?? templatesCol.doc(`${tpl.name}__${tpl.language}`);
      if (seenDocIds.has(ref.id)) continue;
      seenDocIds.add(ref.id);
      const body = tpl.components?.find(c => c.type === "BODY");
      const header = tpl.components?.find(c => c.type === "HEADER");
      const buttons = tpl.components?.find(c => c.type === "BUTTONS")?.buttons ?? [];
      batch.set(ref, {
        // Se conserva el nombre visible si alguien lo personalizó a mano.
        displayName: match?.data().displayName || tpl.name,
        providerTemplateName: tpl.name,
        languageCode: tpl.language,
        bodyText: body?.text ?? "",
        headerFormat: header?.format ?? null,
        headerText: header?.text ?? null,
        buttons: buttons.map(b => ({ type: b.type, text: b.text ?? "", url: b.url ?? null })),
        category: tpl.category ?? null,
        parameterFormat: tpl.parameter_format ?? "POSITIONAL",
        status: tpl.status,
        metaTemplateId: tpl.id,
        source: "meta",
        syncedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      match ? updated++ : added++;
    }

    // Plantillas sincronizadas antes que ya no existen en Meta: se marcan en
    // vez de borrarse para no romper el historial de campañas que las usaron.
    let removed = 0;
    existing.docs.forEach(doc => {
      if (seenDocIds.has(doc.id) || doc.data().source !== "meta" || doc.data().status === "DELETED") return;
      batch.set(doc.ref, { status: "DELETED", syncedAt: FieldValue.serverTimestamp() }, { merge: true });
      removed++;
    });
    await batch.commit();

    const approved = templates.filter(t => t.status === "APPROVED").length;
    return { total: templates.length, approved, added, updated, removed };
  }
);
