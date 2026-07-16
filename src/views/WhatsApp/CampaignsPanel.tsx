import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Building2, CheckCircle2, ChevronDown, ChevronUp, Eye, FileSpreadsheet, Loader2, Megaphone, Search, Send, Users, X } from "lucide-react";
import { toast } from "sonner";
import { getTemplates } from "@/services/whatsappService";
import {
  getCampaignAudienceData, getCampaignRecipients, getRecentCampaigns, parseExternalContacts, recipientsFromUsers, sendCampaign,
  type WaCampaignRecipientResult, type WaCampaignResult,
} from "@/services/whatsappCampaignService";
import type { Company } from "@/models/types/Company";
import type { Project } from "@/models/types/Project";
import type { User } from "@/models/types/User";
import type { WaTemplate } from "@/models/types/WhatsApp";
import type { WaCampaignRecipient } from "@/models/types/WhatsAppCampaign";

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
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([getCampaignAudienceData(), getTemplates(numberId), getRecentCampaigns()])
      .then(([data, tpl, recentCampaigns]) => {
        setCompanies(data.companies); setProjects(data.projects); setUsers(data.users); setContents(data.contents); setTemplates(tpl);
        setCampaigns(recentCampaigns);
      })
      .catch((e) => toast.error("No se pudieron cargar los datos", { description: e.message }))
      .finally(() => setLoading(false));
  }, [numberId]);

  const selectedCompany = companies.find(c => c.id === companyId);
  const normalizeName = (value?: string) => (value ?? "").trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/[^a-z0-9]/g, "");
  const visibleProjects = useMemo(() => projects.filter(p => {
    if (!companyId) return true;
    return p.companyId === companyId ||
      normalizeName(p.companyName) === normalizeName(selectedCompany?.name);
  }), [projects, companyId, selectedCompany?.name]);
  const internalCandidates = useMemo(
    () => includeInternal ? recipientsFromUsers(users, companyId, projectId) : [],
    [users, companyId, projectId, includeInternal]
  );
  useEffect(() => {
    setSelectedInternalIds(new Set(internalCandidates.map(r => r.id)));
  }, [companyId, projectId, includeInternal, users]);
  const internal = useMemo(
    () => internalCandidates.filter(r => selectedInternalIds.has(r.id)),
    [internalCandidates, selectedInternalIds]
  );
  const visiblePeople = useMemo(() => {
    const query = peopleSearch.trim().toLocaleLowerCase("es");
    if (!query) return internalCandidates;
    const digits = query.replace(/\D/g, "");
    return internalCandidates.filter(person =>
      person.name.toLocaleLowerCase("es").includes(query) ||
      (digits.length > 0 && person.phone.includes(digits))
    );
  }, [internalCandidates, peopleSearch]);
  const recipients = useMemo(() => {
    const byPhone = new Map<string, WaCampaignRecipient>();
    [...internal, ...external].forEach(r => { if (!byPhone.has(r.phone)) byPhone.set(r.phone, r); });
    return [...byPhone.values()];
  }, [internal, external]);
  const selectedTemplate = templates.find(t => t.id === templateId);
  const variableNumbers = useMemo(() => {
    const found = [...(selectedTemplate?.bodyText ?? "").matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map(m => Number(m[1]));
    return [...new Set(found)].sort((a, b) => a - b);
  }, [selectedTemplate]);

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
      if (result.failed > 0) {
        toast.warning(`Envío terminado: ${result.sent} aceptados por Meta y ${result.failed} con error.`);
      } else {
        toast.success(`${result.sent} mensajes aceptados por Meta. Consulta abajo si fueron entregados o leídos.`);
      }
      setCampaigns(await getRecentCampaigns());
      setCampaignName(""); setExternal([]); setConsentConfirmed(false); setParameterValues({});
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

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-[#00a884]" /></div>;

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Megaphone className="w-5 h-5 text-[#00a884]" /> Nueva campaña</h1>
          <p className="text-sm text-gray-500 mt-1">Combina usuarios de Nelyoda y contactos externos en una sola lista sin duplicados.</p>
        </div>

        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">1. Configuración</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <label className="text-sm text-gray-600">Nombre de campaña
              <input value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="Ej. Bienvenida julio"
                className="mt-1 w-full h-10 rounded-md border border-gray-200 px-3 outline-none focus:border-[#00a884]" />
            </label>
            <label className="text-sm text-gray-600">Plantilla aprobada
              <select value={templateId} onChange={e => { setTemplateId(e.target.value); setParameterValues({}); }} className="mt-1 w-full h-10 rounded-md border border-gray-200 px-3 bg-white">
                <option value="">Seleccionar plantilla</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.displayName}</option>)}
              </select>
            </label>
          </div>
          {templateId && variableNumbers.length > 0 && (
            <div className="rounded-lg border border-[#00a884]/20 bg-[#00a884]/5 p-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">Variables de la plantilla</p>
              {variableNumbers.map(variable => variable === 1 ? (
                <label key={variable} className="block text-sm text-gray-600">{`{{1}}`} — nombre del destinatario
                  <input disabled value="Se completa automáticamente para cada persona" className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 bg-gray-100 text-gray-500" />
                </label>
              ) : (
                <label key={variable} className="block text-sm text-gray-600">{`{{${variable}}}`} {variable === 2 ? "— enlace del contenido" : ""}
                  <input value={parameterValues[String(variable)] ?? ""}
                    onChange={e => setParameterValues(v => ({ ...v, [String(variable)]: e.target.value }))}
                    placeholder={variable === 2 ? "Selecciona un contenido o pega un enlace" : "Valor de la variable"}
                    className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 bg-white" />
                </label>
              ))}
              {variableNumbers.includes(2) && (
                <label className="block text-sm text-gray-600">Tomar enlace de Nelyoda
                  <select value={contents.find(c => c.url === parameterValues["2"])?.id ?? ""}
                    onChange={e => {
                      const content = contents.find(c => c.id === e.target.value);
                      setParameterValues(v => ({ ...v, "2": content?.url ?? "" }));
                    }} className="mt-1 w-full h-10 rounded-md border border-gray-200 px-3 bg-white">
                    <option value="">Seleccionar boletín o cuestionario</option>
                    <optgroup label="Boletines publicados">{contents.filter(c => c.type === "bulletin").map(c => <option key={`b-${c.id}`} value={c.id}>{c.title}</option>)}</optgroup>
                    <optgroup label="Cuestionarios públicos">{contents.filter(c => c.type === "questionnaire").map(c => <option key={`q-${c.id}`} value={c.id}>{c.title}</option>)}</optgroup>
                  </select>
                </label>
              )}
              {selectedTemplate?.bodyText && <p className="text-xs whitespace-pre-wrap text-gray-500 bg-white rounded-md p-3 border border-gray-100">{selectedTemplate.bodyText}</p>}
            </div>
          )}
          {templates.length === 0 && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-3">Primero registra una plantilla aprobada en <code>whatsapp/data/numbers/{numberId}/templates</code>.</p>}
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Users className="w-4 h-4" /> 2. Usuarios de Nelyoda</h2>
            <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={includeInternal} onChange={e => setIncludeInternal(e.target.checked)} /> Incluir</label>
          </div>
          <div className="grid md:grid-cols-2 gap-4 opacity-100">
            <label className="text-sm text-gray-600"><Building2 className="inline w-4 h-4 mr-1" />Empresa
              <select disabled={!includeInternal} value={companyId} onChange={e => { setCompanyId(e.target.value); setProjectId(""); }} className="mt-1 w-full h-10 rounded-md border border-gray-200 px-3 bg-white disabled:opacity-50">
                <option value="">Todas las empresas</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="text-sm text-gray-600">Proyecto
              <select disabled={!includeInternal} value={projectId} onChange={e => setProjectId(e.target.value)} className="mt-1 w-full h-10 rounded-md border border-gray-200 px-3 bg-white disabled:opacity-50">
                <option value="">Todos los proyectos</option>{visibleProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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

        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /> 3. Contactos externos</h2>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => fileRef.current?.click()} className="px-4 py-2 rounded-lg border border-gray-200 text-sm hover:border-[#00a884]">Importar Excel o CSV</button>
            {external.length > 0 && <><span className="text-sm text-gray-500">{external.length} externos válidos</span><button onClick={() => setExternal([])} className="text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button></>}
          </div>
          <p className="text-xs text-gray-400">Columnas reconocidas: nombre, telefono y grupo. Los números repetidos o inválidos se excluyen.</p>
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
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${campaign.failed ? "bg-amber-50 text-amber-600" : "bg-green-50 text-green-600"}`}>
                    {campaign.failed ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">{campaign.name}</p>
                    <p className="text-xs text-gray-500">{campaign.total} destinatarios · {campaign.sent} aceptados · {campaign.failed} errores</p>
                  </div>
                  <div className="hidden sm:flex gap-2 text-[11px]">
                    <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700">Entregados {campaign.delivered ?? 0}</span>
                    <span className="px-2 py-1 rounded-full bg-green-50 text-green-700">Leídos {campaign.read ?? 0}</span>
                    {(campaign.deliveryFailed ?? 0) > 0 && <span className="px-2 py-1 rounded-full bg-red-50 text-red-700">Fallidos {campaign.deliveryFailed}</span>}
                  </div>
                  {expandedCampaignId === campaign.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>
                {expandedCampaignId === campaign.id && (
                  <div className="border-t border-gray-100 max-h-72 overflow-y-auto">
                    {loadingRecipients ? <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#00a884]" /></div> : campaignRecipients.map(recipient => {
                      const state = recipient.deliveryStatus || recipient.status;
                      const label = state === "read" ? "Leído" : state === "delivered" ? "Entregado" : state === "failed" ? "Fallido" : state === "sent" || state === "pending" ? "Aceptado" : state;
                      return <div key={recipient.id} className="px-3 py-2 border-b last:border-0 border-gray-100 flex items-center gap-3">
                        <div className="min-w-0 flex-1"><p className="text-sm text-gray-700 truncate">{recipient.name || recipient.phone}</p><p className="text-xs text-gray-400">+{recipient.phone}</p></div>
                        <span className={`text-xs font-medium ${state === "failed" ? "text-red-600" : state === "read" ? "text-green-600" : state === "delivered" ? "text-blue-600" : "text-gray-500"}`}>{state === "read" && <Eye className="inline w-3.5 h-3.5 mr-1" />}{label}</span>
                        {recipient.error && <span title={recipient.error} className="text-red-500"><AlertCircle className="w-4 h-4" /></span>}
                      </div>;
                    })}
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
