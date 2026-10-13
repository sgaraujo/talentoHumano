import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, Building2, CheckCircle2, ChevronDown, ChevronUp, Download, Eye, FileSpreadsheet, Info, Loader2, Megaphone, RefreshCw, Search, Send, Upload, Users, X } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { getTemplates, headerMediaAccept, saveTemplateDefaultHeader, syncTemplates, uploadTemplateHeaderMedia } from "@/services/whatsappService";
import {
  getCampaignAudienceData, getCampaignRecipients, getRecentCampaigns, parseExternalContacts, recipientsFromUsers, sendCampaign,
  usersMissingCorporatePhone,
  type WaCampaignRecipientResult, type WaCampaignResult, type WaMissingPhoneUser,
} from "@/services/whatsappCampaignService";
import type { Company } from "@/models/types/Company";
import type { Project } from "@/models/types/Project";
import type { User } from "@/models/types/User";
import type { WaTemplate } from "@/models/types/WhatsApp";
import type { WaCampaignRecipient } from "@/models/types/WhatsAppCampaign";

/** Debe coincidir con RECIPIENT_NAME_VALUE en functions/src/whatsapp/campaignHandler.ts. */
const RECIPIENT_NAME_VALUE = "__recipient_name__";

const searchKey = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es");

// Cada palabra de la búsqueda debe aparecer en el nombre, en cualquier orden y
// sin importar tildes: "Nelly Pinto" encuentra a "Pinto Sandoval Nelly Mayreth".
function nameMatches(name: string, query: string): boolean {
  const target = searchKey(name);
  return searchKey(query).split(/\s+/).filter(Boolean).every(word => target.includes(word));
}

function variablesIn(text: string, isNamed: boolean): string[] {
  const pattern = isNamed ? /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g : /\{\{\s*(\d+)\s*\}\}/g;
  const found = [...new Set([...text.matchAll(pattern)].map(m => m[1]))];
  return isNamed ? found : found.sort((a, b) => Number(a) - Number(b));
}

/**
 * Campos que hay que completar para enviar la plantilla. Las claves siguen el
 * contrato de sendWaCampaign: el cuerpo usa el nombre de la variable tal cual,
 * el encabezado "header:<var>" y los botones URL "button:<índice>".
 */
type TemplateSlot = { key: string; variable: string; label: string; hint?: string };
function variablesOf(template?: WaTemplate): TemplateSlot[] {
  if (!template) return [];
  const isNamed = template.parameterFormat === "NAMED";
  const header = template.headerFormat === "TEXT"
    ? variablesIn(template.headerText ?? "", isNamed).map(variable => ({ key: `header:${variable}`, variable, label: `Encabezado {{${variable}}}` }))
    : [];
  const body = variablesIn(template.bodyText, isNamed).map(variable => ({ key: variable, variable, label: `{{${variable}}}` }));
  const buttons = (template.buttons ?? [])
    .map((button, index) => ({ button, index }))
    .filter(({ button }) => button.type === "URL" && /\{\{.+?\}\}/.test(button.url ?? ""))
    .map(({ button, index }) => ({
      key: `button:${index}`, variable: `button${index}`, label: `Botón «${button.text}»`,
      hint: `Solo la parte variable: reemplaza {{1}} en ${button.url}`,
    }));
  return [...header, ...body, ...buttons];
}

// Valores con que arranca el formulario de una plantilla: las variables de
// nombre ya resueltas y el archivo de encabezado guardado, si lo hay.
function initialParameterValues(template: WaTemplate | undefined, modes: Record<string, VariableMode>): Record<string, string> {
  return {
    ...Object.fromEntries(Object.entries(modes).filter(([, mode]) => mode === "name").map(([key]) => [key, RECIPIENT_NAME_VALUE])),
    ...(template?.defaultHeaderMediaUrl ? { header_media: template.defaultHeaderMediaUrl } : {}),
  };
}

const MEDIA_HEADER_LABELS: Record<string, string> = { IMAGE: "imagen", VIDEO: "video", DOCUMENT: "documento" };

type VariableMode = "name" | "content" | "text";

// El modo inicial sale del nombre de la variable ("nombre", "enlace"...) o, en
// plantillas posicionales, del texto que la precede: tras "aquí:", "enlace",
// "link" o dos puntos va un enlace; tras un saludo ("Hola", "Estimado/a") va el
// nombre. Así una plantilla cuyo {{1}} es el link no se rellena con el nombre.
function defaultVariableModes(template?: WaTemplate): Record<string, VariableMode> {
  const body = template?.bodyText ?? "";
  const textBefore = (variable: string) => {
    const index = body.search(new RegExp(`\\{\\{\\s*${variable}\\s*\\}\\}`));
    return index < 0 ? "" : body.slice(Math.max(0, index - 40), index);
  };
  return Object.fromEntries(variablesOf(template).map(({ key, variable }) => {
    if (key.startsWith("button:")) return [key, "text"];
    if (/nombre|name/i.test(variable)) return [key, "name"];
    if (/enlace|link|url/i.test(variable)) return [key, "content"];
    const before = key === variable ? textBefore(variable) : "";
    if (/(aqu[ií]|enlace|link|url|:)\s*$/i.test(before)) return [key, "content"];
    if (/(hola|estimad[oa]s?|querid[oa]s?|buen(os|as)? \w+)[\s,]*$/i.test(before) || variable === "1") return [key, "name"];
    return [key, variable === "2" ? "content" : "text"];
  }));
}

export function CampaignsPanel({ numberId }: { numberId: string }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [contents, setContents] = useState<Array<{ id: string; type: "bulletin" | "questionnaire"; title: string; url: string }>>([]);
  const [companyId, setCompanyId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [parameterValues, setParameterValues] = useState<Record<string, string>>({});
  const [variableModes, setVariableModes] = useState<Record<string, VariableMode>>({});
  const [external, setExternal] = useState<WaCampaignRecipient[]>([]);
  const [includeInternal, setIncludeInternal] = useState(true);
  const [selectedInternalIds, setSelectedInternalIds] = useState<Set<string>>(new Set());
  const [peopleSearch, setPeopleSearch] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [campaigns, setCampaigns] = useState<WaCampaignResult[]>([]);
  const [expandedCampaignId, setExpandedCampaignId] = useState("");
  const [campaignRecipients, setCampaignRecipients] = useState<WaCampaignRecipientResult[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [syncingTemplates, setSyncingTemplates] = useState(false);
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const headerFileRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Trae de Meta las plantillas nuevas o actualizadas y recarga la lista. Si
  // Meta falla, se queda con las que ya estaban guardadas en Firestore.
  const refreshTemplates = async (notify: boolean) => {
    setSyncingTemplates(true);
    try {
      const result = await syncTemplates(numberId);
      if (notify) toast.success(`Plantillas sincronizadas: ${result.approved} aprobadas${result.added ? `, ${result.added} nuevas` : ""}`);
    } catch (e) {
      toast.error("No se pudieron sincronizar las plantillas con Meta", { description: e instanceof Error ? e.message : String(e) });
    }
    try {
      setTemplates(await getTemplates(numberId));
    } finally {
      setSyncingTemplates(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([getCampaignAudienceData(), getTemplates(numberId), getRecentCampaigns()])
      .then(([data, tpl, recentCampaigns]) => {
        setCompanies(data.companies); setProjects(data.projects); setUsers(data.users); setContents(data.contents); setTemplates(tpl);
        setCampaigns(recentCampaigns);
      })
      .catch((e) => toast.error("No se pudieron cargar los datos", { description: e.message }))
      .finally(() => setLoading(false));
    refreshTemplates(false);
  }, [numberId]);

  const selectedCompany = companies.find(c => c.id === companyId);
  const normalizeName = (value?: string) => (value ?? "").trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/[^a-z0-9]/g, "");
  const visibleProjects = useMemo(() => projects.filter(p => {
    if (p.status !== "activo") return false; // proyectos desactivados no deben poder elegirse para enviar campañas
    if (!companyId) return true;
    return p.companyId === companyId ||
      normalizeName(p.companyName) === normalizeName(selectedCompany?.name);
  }), [projects, companyId, selectedCompany?.name]);
  const internalCandidates = useMemo(
    () => includeInternal ? recipientsFromUsers(users, companyId, projectId, companies, projects) : [],
    [users, companyId, projectId, includeInternal, companies, projects]
  );
  useEffect(() => {
    setSelectedInternalIds(new Set(internalCandidates.map(r => r.id)));
  }, [companyId, projectId, includeInternal, users]);
  const internal = useMemo(
    () => internalCandidates.filter(r => selectedInternalIds.has(r.id)),
    [internalCandidates, selectedInternalIds]
  );
  const visiblePeople = useMemo(() => {
    const query = peopleSearch.trim();
    if (!query) return internalCandidates;
    const digits = query.replace(/\D/g, "");
    return internalCandidates.filter(person =>
      nameMatches(person.name, query) ||
      (digits.length > 0 && person.phone.includes(digits))
    );
  }, [internalCandidates, peopleSearch]);

  // ── Personas sin teléfono corporativo (no se les puede enviar por esa vía) ──
  const [missingPhoneOpen, setMissingPhoneOpen] = useState(false);
  const [missingPhoneSearch, setMissingPhoneSearch] = useState("");
  const missingPhoneUsers = useMemo(
    () => includeInternal ? usersMissingCorporatePhone(users, companyId, projectId, companies, projects) : [],
    [users, companyId, projectId, includeInternal, companies, projects]
  );
  const visibleMissingPhone = useMemo(() => {
    const query = missingPhoneSearch.trim();
    if (!query) return missingPhoneUsers;
    return missingPhoneUsers.filter((person: WaMissingPhoneUser) =>
      nameMatches(person.name, query) ||
      (person.documentNumber ?? "").includes(query)
    );
  }, [missingPhoneUsers, missingPhoneSearch]);
  const recipients = useMemo(() => {
    const byPhone = new Map<string, WaCampaignRecipient>();
    [...internal, ...external].forEach(r => { if (!byPhone.has(r.phone)) byPhone.set(r.phone, r); });
    return [...byPhone.values()];
  }, [internal, external]);
  const selectedTemplate = templates.find(t => t.id === templateId);
  // Meta distingue plantillas POSITIONAL ({{1}}, {{2}}) y NAMED ({{nombre}});
  // las variables se envían en el mismo formato con que se creó la plantilla.
  const templateVariables = useMemo(() => variablesOf(selectedTemplate), [selectedTemplate]);
  const headerMediaLabel = MEDIA_HEADER_LABELS[selectedTemplate?.headerFormat ?? ""];

  // Plantilla con los encabezados exactos que reconoce parseExternalContacts.
  const downloadExternalTemplate = () => {
    const sheet = XLSX.utils.json_to_sheet([
      { nombre: "Ana Pérez", telefono: "3001234567", grupo: "Proveedores" },
      { nombre: "Luis Gómez", telefono: "+57 310 555 1234", grupo: "Clientes" },
    ]);
    sheet["!cols"] = [{ wch: 28 }, { wch: 20 }, { wch: 18 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Contactos");
    XLSX.writeFile(workbook, "plantilla-contactos-whatsapp.xlsx");
  };

  const handleHeaderFile = async (file?: File) => {
    if (!file || !selectedTemplate) return;
    setUploadingHeader(true);
    try {
      const url = await uploadTemplateHeaderMedia(numberId, selectedTemplate, file);
      setParameterValues(v => ({ ...v, header_media: url }));
      setTemplates(list => list.map(t => t.id === selectedTemplate.id ? { ...t, defaultHeaderMediaUrl: url } : t));
      toast.success(`${headerMediaLabel ?? "Archivo"} guardado para esta plantilla`);
    } catch (e) {
      toast.error("No se pudo subir el archivo", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setUploadingHeader(false);
    }
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = await parseExternalContacts(file);
      setExternal(parsed);
      toast.success(`${parsed.length} contactos externos válidos cargados`);
    } catch (e: any) {
      toast.error("No se pudo leer el archivo", { description: e.message });
    }
  };

  const handleSend = async () => {
    if (!campaignName.trim() || !templateId || recipients.length === 0 || !consentConfirmed) {
      toast.error("Completa el nombre, plantilla, destinatarios y confirmación de autorización.");
      return;
    }
    if (recipients.length > 500) {
      toast.error("Esta primera versión admite hasta 500 destinatarios por campaña.");
      return;
    }
    setSending(true);
    try {
      const result = await sendCampaign({
        name: campaignName.trim(), numberId, companyId: companyId || undefined,
        projectId: projectId || undefined, templateId, parameterValues, recipients,
      });
      if (result.error) {
        toast.error("La campaña se detuvo", { description: result.error, duration: 12000 });
      } else if (result.failed > 0) {
        toast.warning(`Envío terminado: ${result.sent} aceptados por Meta y ${result.failed} con error.`);
      } else {
        toast.success(`${result.sent} mensajes aceptados por Meta. Consulta abajo si fueron entregados o leídos.`);
      }
      // Una URL pegada a mano que funcionó queda como predeterminada de la plantilla.
      const headerUrl = parameterValues.header_media?.trim();
      let updatedTemplate = selectedTemplate;
      if (selectedTemplate && headerMediaLabel && headerUrl && headerUrl !== selectedTemplate.defaultHeaderMediaUrl && result.sent > 0) {
        await saveTemplateDefaultHeader(numberId, selectedTemplate.id, headerUrl).catch(() => {});
        updatedTemplate = { ...selectedTemplate, defaultHeaderMediaUrl: headerUrl };
        setTemplates(list => list.map(t => t.id === selectedTemplate.id ? updatedTemplate! : t));
      }
      setCampaigns(await getRecentCampaigns());
      setCampaignName(""); setExternal([]); setConsentConfirmed(false);
      setParameterValues(initialParameterValues(updatedTemplate, variableModes));
    } catch (e: any) {
      toast.error("No se pudo crear la campaña", { description: e.message });
    } finally { setSending(false); }
  };

  const toggleCampaign = async (campaignId: string) => {
    if (expandedCampaignId === campaignId) { setExpandedCampaignId(""); return; }
    setExpandedCampaignId(campaignId);
    setLoadingRecipients(true);
    try { setCampaignRecipients(await getCampaignRecipients(campaignId)); }
    catch (e: any) { toast.error("No se pudo cargar el detalle", { description: e.message }); }
    finally { setLoadingRecipients(false); }
  };

  const statusLabel = (recipient: WaCampaignRecipientResult) => {
    const state = recipient.deliveryStatus || recipient.status;
    return state === "read" ? "Leído" : state === "delivered" ? "Entregado" : state === "failed" ? "Fallido"
      : state === "skipped" ? "Omitido" : state === "sent" || state === "pending" ? "Aceptado" : state;
  };

  const handleExportRecipients = (campaign: WaCampaignResult) => {
    const rows = campaignRecipients.map(recipient => ({
      Número: `+${recipient.phone}`,
      Nombre: recipient.name || '',
      Empresa: companies.find(c => c.id === recipient.companyId)?.name || '',
      'Cuenta analítica': projects.find(p => p.id === recipient.projectId)?.name || '',
      Estado: statusLabel(recipient),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 16 }, { wch: 32 }, { wch: 32 }, { wch: 28 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Destinatarios');
    const safeName = campaign.name.replace(/[^\w\-]+/g, '_');
    XLSX.writeFile(wb, `campana-whatsapp-${safeName}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-[#00a884]" /></div>;

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Megaphone className="w-5 h-5 text-[#00a884]" /> Nueva campaña</h1>
          <p className="text-sm text-gray-500 mt-1">Combina usuarios de Inteegrados y contactos externos en una sola lista sin duplicados.</p>
        </div>

        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">1. Configuración</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <label className="text-sm text-gray-600">Nombre de campaña
              <input value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="Ej. Bienvenida julio"
                className="mt-1 w-full h-10 rounded-md border border-gray-200 px-3 outline-none focus:border-[#00a884]" />
            </label>
            <label className="text-sm text-gray-600">
              <span className="flex items-center justify-between">Plantilla aprobada
                <button type="button" onClick={() => refreshTemplates(true)} disabled={syncingTemplates}
                  className="inline-flex items-center gap-1 text-xs text-[#00a884] hover:underline disabled:opacity-50">
                  <RefreshCw className={`w-3 h-3 ${syncingTemplates ? "animate-spin" : ""}`} />
                  {syncingTemplates ? "Sincronizando..." : "Sincronizar con Meta"}
                </button>
              </span>
              <select value={templateId} onChange={e => {
                setTemplateId(e.target.value);
                const template = templates.find(t => t.id === e.target.value);
                const modes = defaultVariableModes(template);
                setVariableModes(modes);
                setParameterValues(initialParameterValues(template, modes));
              }} className="mt-1 w-full h-10 rounded-md border border-gray-200 px-3 bg-white">
                <option value="">Seleccionar plantilla</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.displayName}</option>)}
              </select>
            </label>
          </div>
          {templateId && (templateVariables.length > 0 || headerMediaLabel) && (
            <div className="rounded-lg border border-[#00a884]/20 bg-[#00a884]/5 p-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">Variables de la plantilla</p>
              {headerMediaLabel && (
                <div className="text-sm text-gray-600 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span>Encabezado ({headerMediaLabel})</span>
                    <button type="button" onClick={() => headerFileRef.current?.click()} disabled={uploadingHeader}
                      className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-[#00a884]/40 bg-white text-xs text-[#00a884] hover:bg-[#00a884]/5 disabled:opacity-50">
                      {uploadingHeader ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                      {uploadingHeader ? "Subiendo..." : parameterValues.header_media ? `Cambiar ${headerMediaLabel}` : `Subir ${headerMediaLabel}`}
                    </button>
                    <input ref={headerFileRef} type="file" hidden accept={headerMediaAccept(selectedTemplate?.headerFormat)}
                      onChange={e => { handleHeaderFile(e.target.files?.[0]); e.target.value = ""; }} />
                  </div>
                  {parameterValues.header_media && selectedTemplate?.headerFormat === "IMAGE" && (
                    <img src={parameterValues.header_media} alt="Encabezado" className="max-h-40 rounded-md border border-gray-200 bg-white" />
                  )}
                  <input value={parameterValues.header_media ?? ""}
                    onChange={e => setParameterValues(v => ({ ...v, header_media: e.target.value }))}
                    placeholder="O pega una URL pública https://..."
                    className="w-full h-9 rounded-md border border-gray-200 px-3 bg-white" />
                  <span className="block text-xs text-gray-400">
                    Meta no reutiliza el archivo de ejemplo de la plantilla. El que subas queda guardado y se usará por defecto en las próximas campañas con esta plantilla.
                  </span>
                </div>
              )}
              {templateVariables.map(({ key: variable, label, hint }) => {
                const value = parameterValues[variable] ?? "";
                const mode: VariableMode = variableModes[variable] ?? "text";
                const setValue = (next: string) => setParameterValues(v => ({ ...v, [variable]: next }));
                return (
                  <div key={variable} className="text-sm text-gray-600">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono">{label}</span>
                      <select value={mode} onChange={e => {
                          const next = e.target.value as VariableMode;
                          setVariableModes(m => ({ ...m, [variable]: next }));
                          setValue(next === "name" ? RECIPIENT_NAME_VALUE : "");
                        }}
                        className="h-8 rounded-md border border-gray-200 px-2 bg-white text-xs">
                        <option value="name">Nombre del destinatario</option>
                        <option value="content">Enlace de Inteegrados</option>
                        <option value="text">Texto o enlace libre</option>
                      </select>
                    </div>
                    {mode === "name" ? (
                      <input disabled value="Se completa automáticamente para cada persona" className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 bg-gray-100 text-gray-500" />
                    ) : mode === "content" ? (
                      <select value={contents.find(c => c.url === value)?.id ?? ""}
                        onChange={e => setValue(contents.find(c => c.id === e.target.value)?.url ?? "")}
                        className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 bg-white">
                        <option value="">Seleccionar boletín o cuestionario</option>
                        <optgroup label="Boletines publicados">{contents.filter(c => c.type === "bulletin").map(c => <option key={`b-${c.id}`} value={c.id}>{c.title}</option>)}</optgroup>
                        <optgroup label="Cuestionarios públicos">{contents.filter(c => c.type === "questionnaire").map(c => <option key={`q-${c.id}`} value={c.id}>{c.title}</option>)}</optgroup>
                      </select>
                    ) : (
                      <input value={value} onChange={e => setValue(e.target.value)} placeholder="Valor de la variable"
                        className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 bg-white" />
                    )}
                    {hint && <span className="text-xs text-gray-400">{hint}</span>}
                  </div>
                );
              })}
              {selectedTemplate?.bodyText && <p className="text-xs whitespace-pre-wrap text-gray-500 bg-white rounded-md p-3 border border-gray-100">{selectedTemplate.bodyText}</p>}
            </div>
          )}
          {templates.length === 0 && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-3">{syncingTemplates ? "Consultando plantillas en Meta..." : "No hay plantillas aprobadas en Meta para este número. Crea o espera la aprobación de una plantilla en WhatsApp Manager y pulsa \"Sincronizar con Meta\"."}</p>}
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Users className="w-4 h-4" /> 2. Usuarios de Inteegrados</h2>
            <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={includeInternal} onChange={e => setIncludeInternal(e.target.checked)} /> Incluir</label>
          </div>
          <div className="grid md:grid-cols-2 gap-4 opacity-100">
            <label className="text-sm text-gray-600"><Building2 className="inline w-4 h-4 mr-1" />Empresa
              <select disabled={!includeInternal} value={companyId} onChange={e => { setCompanyId(e.target.value); setProjectId(""); }} className="mt-1 w-full h-10 rounded-md border border-gray-200 px-3 bg-white disabled:opacity-50">
                <option value="">Todas las empresas</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="text-sm text-gray-600">Cuenta analítica
              <select disabled={!includeInternal} value={projectId} onChange={e => setProjectId(e.target.value)} className="mt-1 w-full h-10 rounded-md border border-gray-200 px-3 bg-white disabled:opacity-50">
                <option value="">Todas las cuentas analíticas</option>{visibleProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </div>
          <p className="text-sm text-gray-500">{internalCandidates.length} personas con teléfono válido · {internal.length} seleccionadas.</p>
          {includeInternal && internalCandidates.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="p-3 bg-gray-50 border-b border-gray-200 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={peopleSearch}
                    onChange={e => setPeopleSearch(e.target.value)}
                    placeholder="Buscar por nombre o celular…"
                    className="w-full h-10 rounded-lg border border-gray-200 bg-white pl-9 pr-9 text-sm outline-none focus:border-[#00a884] focus:ring-2 focus:ring-[#00a884]/10"
                  />
                  {peopleSearch && (
                    <button type="button" onClick={() => setPeopleSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-gray-600">
                    {peopleSearch ? `${visiblePeople.length} resultados` : `${internalCandidates.length} personas`}
                  </span>
                  <div className="flex gap-3 text-xs">
                    <button type="button" onClick={() => setSelectedInternalIds(previous => new Set([...previous, ...visiblePeople.map(r => r.id)]))} className="font-medium text-[#008C3C] hover:underline">Seleccionar visibles</button>
                    <button type="button" onClick={() => setSelectedInternalIds(previous => {
                      const next = new Set(previous);
                      visiblePeople.forEach(r => next.delete(r.id));
                      return next;
                    })} className="text-gray-500 hover:underline">Quitar visibles</button>
                  </div>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                {visiblePeople.map(person => (
                  <label key={person.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedInternalIds.has(person.id)}
                      onChange={e => setSelectedInternalIds(previous => {
                        const next = new Set(previous);
                        if (e.target.checked) next.add(person.id); else next.delete(person.id);
                        return next;
                      })}
                      className="accent-[#00a884]"
                    />
                    <span className="text-sm text-gray-700 flex-1 truncate">{person.name}</span>
                    <span className="text-xs text-gray-400 font-mono">+{person.phone}</span>
                  </label>
                ))}
                {visiblePeople.length === 0 && (
                  <div className="px-4 py-8 text-center">
                    <Search className="w-6 h-6 mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-500">No encontramos personas con esa búsqueda.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {includeInternal && missingPhoneUsers.length > 0 && (
          <section className="bg-white border border-amber-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setMissingPhoneOpen(open => !open)}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-amber-50/50 transition-colors"
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800">{missingPhoneUsers.length} persona{missingPhoneUsers.length !== 1 ? "s" : ""} sin teléfono corporativo</p>
                <p className="text-xs text-gray-500 mt-0.5">No se les puede enviar por WhatsApp con su número de empresa — algunas igual reciben por su celular personal.</p>
              </div>
              {missingPhoneOpen ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
            </button>
            {missingPhoneOpen && (
              <div className="border-t border-amber-100">
                <div className="p-3 bg-amber-50/40 border-b border-amber-100 relative">
                  <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={missingPhoneSearch}
                    onChange={e => setMissingPhoneSearch(e.target.value)}
                    placeholder="Buscar por nombre o cédula…"
                    className="w-full h-10 rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/10"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                  {visibleMissingPhone.map(person => (
                    <div key={person.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-700 truncate">{person.name}</p>
                        <p className="text-xs text-gray-400">
                          {person.documentNumber && <>Cédula {person.documentNumber} · </>}
                          {[person.company, person.project].filter(Boolean).join(" · ") || "Sin empresa/cuenta analítica"}
                        </p>
                      </div>
                      <span className={`text-[11px] font-medium px-2 py-1 rounded-full flex-shrink-0 ${person.hasPersonalPhone ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-600"}`}>
                        {person.hasPersonalPhone ? "Recibe por celular personal" : "Sin ningún teléfono"}
                      </span>
                    </div>
                  ))}
                  {visibleMissingPhone.length === 0 && (
                    <div className="px-4 py-8 text-center">
                      <Search className="w-6 h-6 mx-auto text-gray-300 mb-2" />
                      <p className="text-sm text-gray-500">No encontramos personas con esa búsqueda.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /> 3. Contactos externos</h2>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-blue-100 text-blue-800 font-semibold text-sm">
              <Info className="w-4 h-4" /> ¿Cómo preparar el archivo?
            </div>
            <div className="p-4 space-y-3 text-sm text-gray-700">
              <ol className="space-y-1.5 list-decimal list-inside">
                <li>Descarga la plantilla o crea un Excel con estos encabezados en la <b>primera fila</b>: <b>nombre</b>, <b>telefono</b> y <b>grupo</b>.</li>
                <li>Escribe una persona por fila. Solo <b>telefono</b> es obligatorio; <b>nombre</b> se usa para saludar en la plantilla y <b>grupo</b> es opcional.</li>
                <li>El teléfono puede ir con o sin +57, espacios o guiones: <span className="font-mono">3001234567</span>, <span className="font-mono">+57 300 123 4567</span>. Para otros países incluye el indicativo.</li>
                <li>Solo se lee la primera hoja. Los números repetidos, los fijos (601…) y los inválidos se omiten.</li>
              </ol>
              <div className="overflow-x-auto rounded-lg border border-blue-100 bg-white">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead className="bg-blue-100/70 text-blue-900"><tr><th className="px-3 py-2 text-left">nombre</th><th className="px-3 py-2 text-left">telefono</th><th className="px-3 py-2 text-left">grupo</th></tr></thead>
                  <tbody>
                    <tr className="border-t"><td className="px-3 py-2">Ana Pérez</td><td className="px-3 py-2 font-mono">3001234567</td><td className="px-3 py-2">Proveedores</td></tr>
                    <tr className="border-t"><td className="px-3 py-2">Luis Gómez</td><td className="px-3 py-2 font-mono">+57 310 555 1234</td><td className="px-3 py-2">Clientes</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={downloadExternalTemplate} className="px-4 py-2 rounded-lg border border-gray-200 text-sm hover:border-[#00a884] inline-flex items-center gap-2"><Download className="w-4 h-4" /> Descargar plantilla</button>
            <button onClick={() => fileRef.current?.click()} className="px-4 py-2 rounded-lg border border-gray-200 text-sm hover:border-[#00a884] inline-flex items-center gap-2"><Upload className="w-4 h-4" /> Importar Excel o CSV</button>
            {external.length > 0 && <><span className="text-sm text-gray-500">{external.length} externos válidos</span><button onClick={() => setExternal([])} className="text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button></>}
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div><p className="text-2xl font-bold text-gray-900">{recipients.length}</p><p className="text-sm text-gray-500">destinatarios únicos ({internal.length} internos + {external.length} externos)</p></div>
          <div className="space-y-3 md:max-w-md">
            <label className="flex gap-2 text-xs text-gray-600"><input type="checkbox" checked={consentConfirmed} onChange={e => setConsentConfirmed(e.target.checked)} className="mt-0.5" /><span>Confirmo que los destinatarios autorizaron comunicaciones por WhatsApp y que respetaré las solicitudes de exclusión.</span></label>
            <button onClick={handleSend} disabled={sending || recipients.length === 0 || !templates.length}
              className="w-full md:w-auto px-5 py-2.5 rounded-lg bg-[#00a884] text-white font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-40">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Crear y enviar campaña
            </button>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-gray-800">Historial y resultados</h2>
              <p className="text-xs text-gray-500 mt-1">“Aceptado” significa que Meta recibió el mensaje; entregado y leído llegan mediante el webhook.</p>
            </div>
            <button type="button" onClick={async () => setCampaigns(await getRecentCampaigns())} className="text-xs font-medium text-[#008C3C] hover:underline">Actualizar</button>
          </div>
          <div className="space-y-2">
            {campaigns.map(campaign => (
              <div key={campaign.id} className="border border-gray-200 rounded-lg overflow-hidden">
                <button type="button" onClick={() => toggleCampaign(campaign.id)} className="w-full p-3 text-left hover:bg-gray-50 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${campaign.status === "stopped" ? "bg-red-50 text-red-600" : campaign.failed ? "bg-amber-50 text-amber-600" : "bg-green-50 text-green-600"}`}>
                    {campaign.status === "stopped" || campaign.failed ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">{campaign.name}</p>
                    <p className="text-xs text-gray-500">
                      {campaign.total} destinatarios · {campaign.sent} aceptados · {campaign.failed} errores
                      {(campaign.skipped ?? 0) > 0 && ` · ${campaign.skipped} omitidos`}
                    </p>
                  </div>
                  <div className="hidden sm:flex gap-2 text-[11px]">
                    <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700">Entregados {campaign.delivered ?? 0}</span>
                    <span className="px-2 py-1 rounded-full bg-green-50 text-green-700">Leídos {campaign.read ?? 0}</span>
                    {(campaign.deliveryFailed ?? 0) > 0 && <span className="px-2 py-1 rounded-full bg-red-50 text-red-700">Fallidos {campaign.deliveryFailed}</span>}
                  </div>
                  {expandedCampaignId === campaign.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>
                {campaign.error && (
                  <div className="px-3 py-2 bg-red-50 border-t border-red-100 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700">{campaign.error}</p>
                  </div>
                )}
                {expandedCampaignId === campaign.id && (
                  <div className="border-t border-gray-100">
                    {!loadingRecipients && campaignRecipients.length > 0 && (
                      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex justify-end">
                        <button type="button" onClick={() => handleExportRecipients(campaign)} className="flex items-center gap-1.5 text-xs font-medium text-[#008C3C] hover:underline">
                          <Download className="w-3.5 h-3.5" /> Exportar Excel
                        </button>
                      </div>
                    )}
                    <div className="max-h-72 overflow-y-auto">
                      {loadingRecipients ? <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#00a884]" /></div> : campaignRecipients.map(recipient => {
                        const state = recipient.deliveryStatus || recipient.status;
                        const label = statusLabel(recipient);
                        return <div key={recipient.id} className="px-3 py-2 border-b last:border-0 border-gray-100 flex items-center gap-3">
                          <div className="min-w-0 flex-1"><p className="text-sm text-gray-700 truncate">{recipient.name || recipient.phone}</p><p className="text-xs text-gray-400">+{recipient.phone}</p></div>
                          <span className={`text-xs font-medium ${state === "failed" ? "text-red-600" : state === "skipped" ? "text-gray-400" : state === "read" ? "text-green-600" : state === "delivered" ? "text-blue-600" : "text-gray-500"}`} title={recipient.error}>{state === "read" && <Eye className="inline w-3.5 h-3.5 mr-1" />}{label}</span>
                          {recipient.error && state !== "skipped" && <span title={recipient.error} className="text-red-500"><AlertCircle className="w-4 h-4" /></span>}
                        </div>;
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {campaigns.length === 0 && <p className="py-6 text-center text-sm text-gray-400">Todavía no hay campañas registradas.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
