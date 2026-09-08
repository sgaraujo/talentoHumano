import { useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, Pencil, Plus, Search, Settings2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { companyService } from '@/services/companyService';
import { useAppRole } from '@/hooks/useAppRole';
import type { Company } from '@/models/types/Company';
import { toast } from 'sonner';

type CompanyForm = Omit<Company, 'id' | 'createdAt' | 'updatedAt'>;
const emptyForm = (): CompanyForm => ({
  name: '', nit: '', address: '', phone: '', email: '', logo: '', regional: '', baseDeOperacion: '',
  aliases: [], active: true, activeTH: true, activeContabilidad: false,
  modules: { humanResources: true, accounting: false, communications: true },
});

export function CompanySettingsPage() {
  const { role } = useAppRole();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Company | null>(null);
  const [form, setForm] = useState<CompanyForm>(emptyForm());
  const [open, setOpen] = useState(false);
  const [aliasesText, setAliasesText] = useState('');
  const load = async () => { setLoading(true); try { setCompanies((await companyService.getAll()).sort((a,b) => a.name.localeCompare(b.name, 'es'))); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => companies.filter(item => [item.name,item.nit,...(item.aliases ?? [])].some(value => value?.toLowerCase().includes(search.toLowerCase()))), [companies,search]);
  const create = () => { setSelected(null); setForm(emptyForm()); setAliasesText(''); setOpen(true); };
  const edit = (company: Company) => {
    setSelected(company);
    setForm({
      name: company.name, nit: company.nit, address: company.address || '', phone: company.phone || '', email: company.email || '', logo: company.logo || '',
      regional: company.regional || '', baseDeOperacion: company.baseDeOperacion || '', aliases: company.aliases ?? [], active: company.active,
      activeTH: company.activeTH ?? company.modules?.humanResources ?? false,
      activeContabilidad: company.activeContabilidad ?? company.modules?.accounting ?? false,
      modules: company.modules ?? { humanResources: company.activeTH ?? false, accounting: company.activeContabilidad ?? false, communications: true },
    });
    setAliasesText((company.aliases ?? []).join('\n')); setOpen(true);
  };
  const setField = <K extends keyof CompanyForm>(field: K, value: CompanyForm[K]) => setForm(previous => ({ ...previous, [field]: value }));
  const toggleModule = (field: 'humanResources' | 'accounting' | 'communications') => setForm(previous => ({
    ...previous,
    activeTH: field === 'humanResources' ? !previous.modules?.humanResources : previous.activeTH,
    activeContabilidad: field === 'accounting' ? !previous.modules?.accounting : previous.activeContabilidad,
    modules: { ...previous.modules, [field]: !previous.modules?.[field] },
  }));
  const save = async () => {
    if (!form.name.trim() || !form.nit.trim()) return;
    setSaving(true);
    try {
      const aliases = [...new Set(aliasesText.split(/\r?\n|,/).map(value => value.trim()).filter(value => value && value.toLowerCase() !== form.name.trim().toLowerCase()))];
      const payload = { ...form, name: form.name.trim(), nit: form.nit.trim(), aliases };
      if (selected) await companyService.update(selected.id, payload); else await companyService.create(payload);
      toast.success(selected ? 'Empresa actualizada' : 'Empresa creada'); setOpen(false); await load();
    } catch (reason: any) { toast.error('No fue posible guardar', { description: reason?.message }); }
    finally { setSaving(false); }
  };
  const remove = async (company: Company) => {
    if (role !== 'admin' || !window.confirm(`¿Eliminar definitivamente ${company.name}? Solo hazlo si no tiene relaciones ni cuentas analíticas.`)) return;
    try { await companyService.delete(company.id); toast.success('Empresa eliminada'); await load(); }
    catch (reason: any) { toast.error('No fue posible eliminar', { description: reason?.message }); }
  };

  return <div className="p-4 sm:p-6 bg-gray-50 min-h-screen space-y-5">
    <div className="flex items-start justify-between gap-3 flex-wrap"><div><h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Settings2 className="w-6 h-6 text-[#008C3C]" />Configuración de empresas</h1><p className="text-sm text-gray-500 mt-1">Catálogo maestro, nombres oficiales, alias y módulos habilitados</p></div><Button onClick={create} className="bg-[#008C3C] hover:bg-[#006C2F]"><Plus className="w-4 h-4 mr-2" />Nueva empresa</Button></div>
    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800"><b>Esta pantalla configura el catálogo.</b> La dotación, nómina, cuentas analíticas e indicadores se consultan desde el módulo Empresas y no se guardan aquí.</div>
    <div className="bg-white border rounded-xl overflow-hidden"><div className="p-4 border-b relative"><Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><Input value={search} onChange={event => setSearch(event.target.value)} className="pl-9" placeholder="Buscar nombre, NIT o alias…" /></div>
      {loading ? <div className="py-16 text-center text-gray-400"><Loader2 className="w-7 h-7 animate-spin mx-auto" /></div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="text-left px-4 py-3">Empresa</th><th className="text-left px-4 py-3">Alias</th><th className="text-left px-4 py-3">Módulos</th><th className="text-left px-4 py-3">Estado</th><th className="px-4 py-3"></th></tr></thead><tbody className="divide-y">{filtered.map(company => <tr key={company.id} className="hover:bg-gray-50"><td className="px-4 py-3"><div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-[#008C3C]" /><div><p className="font-semibold text-gray-700">{company.name}</p><p className="text-xs text-gray-400">{company.nit}</p></div></div></td><td className="px-4 py-3 text-xs text-gray-500 max-w-xs">{company.aliases?.join(', ') || 'Sin alias'}</td><td className="px-4 py-3"><div className="flex gap-1 flex-wrap">{(company.modules?.humanResources ?? company.activeTH) && <Tag>TH</Tag>}{(company.modules?.accounting ?? company.activeContabilidad) && <Tag>Contabilidad</Tag>}{company.modules?.communications && <Tag>Correos</Tag>}</div></td><td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-full ${company.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{company.active ? 'Activa' : 'Inactiva'}</span></td><td className="px-4 py-3"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => edit(company)}><Pencil className="w-3.5 h-3.5" /></Button>{role === 'admin' && <Button size="sm" variant="outline" className="text-red-500" onClick={() => remove(company)}><Trash2 className="w-3.5 h-3.5" /></Button>}</div></td></tr>)}</tbody></table></div>}
    </div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{selected ? 'Configurar empresa' : 'Nueva empresa'}</DialogTitle></DialogHeader><div className="grid sm:grid-cols-2 gap-4 py-2">
      <Field label="Razón social *"><Input value={form.name} onChange={event => setField('name', event.target.value)} /></Field><Field label="NIT *"><Input value={form.nit} onChange={event => setField('nit', event.target.value)} /></Field>
      <Field label="Correo"><Input type="email" value={form.email} onChange={event => setField('email', event.target.value)} /></Field><Field label="Teléfono"><Input value={form.phone} onChange={event => setField('phone', event.target.value)} /></Field>
      <Field label="Dirección"><Input value={form.address} onChange={event => setField('address', event.target.value)} /></Field><Field label="Ubicación principal"><Input value={form.baseDeOperacion} onChange={event => setField('baseDeOperacion', event.target.value)} placeholder="Bogotá" /></Field>
      <Field label="Regional"><Input value={form.regional} onChange={event => setField('regional', event.target.value)} /></Field><Field label="URL del logo"><Input value={form.logo} onChange={event => setField('logo', event.target.value)} /></Field>
      <div className="sm:col-span-2"><Label>Alias históricos</Label><textarea value={aliasesText} onChange={event => setAliasesText(event.target.value)} rows={3} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" placeholder={'INTEEGRA S.A.S BIC\nINTEEGRA SAS BIC'} /><p className="text-xs text-gray-400 mt-1">Uno por línea. Sirven para relacionar registros antiguos con la empresa oficial.</p></div>
      <div className="sm:col-span-2"><Label>Módulos habilitados</Label><div className="grid sm:grid-cols-3 gap-2 mt-2">{([['humanResources','Talento Humano'],['accounting','Contabilidad'],['communications','Correos']] as const).map(([field,label]) => <button type="button" key={field} onClick={() => toggleModule(field)} className={`rounded-lg border px-3 py-2 text-sm font-medium ${form.modules?.[field] ? 'bg-green-50 border-green-300 text-green-700' : 'bg-gray-50 text-gray-400'}`}>{form.modules?.[field] ? '✓ ' : ''}{label}</button>)}</div></div>
      <div className="sm:col-span-2"><button type="button" onClick={() => setField('active', !form.active)} className={`w-full rounded-lg border px-3 py-2 text-sm font-medium ${form.active ? 'bg-green-50 border-green-300 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{form.active ? '✓ Empresa activa' : 'Empresa inactiva'}</button></div>
    </div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save} disabled={saving || !form.name.trim() || !form.nit.trim()} className="bg-[#008C3C] hover:bg-[#006C2F]">{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Guardar</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><Label>{label}</Label><div className="mt-1">{children}</div></div>; }
function Tag({ children }: { children: React.ReactNode }) { return <span className="text-[10px] bg-blue-50 text-blue-700 rounded-full px-2 py-1">{children}</span>; }
