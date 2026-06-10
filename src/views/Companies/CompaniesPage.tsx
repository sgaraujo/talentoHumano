import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { companyService } from '@/services/companyService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Building2, Plus, Pencil, Trash2, Phone,
  Mail, MapPin, Search, Loader2, BarChart2, PowerOff, Power,
  Users, Calculator, Upload,
} from 'lucide-react';
import { toast } from 'sonner';

const SEED_COMPANIES = [
  { name: 'NEWSTAR SAS',                                    nit: '901269033-7' },
  { name: 'NEWFORCE SAS',                                   nit: '901311778-4' },
  { name: 'INVERSIONES EON SAS',                            nit: '901271083-1' },
  { name: 'INTEEGRA SAS BIC',                               nit: '900550189-7' },
  { name: 'NETIA SAS',                                      nit: '901259735-6' },
  { name: 'NETCOL INGENIERÍA SAS BIC',                      nit: '901193667-8' },
  { name: 'LETI SAS LOGISTRICA EMPRESARIAL DE TRANSPORTE',  nit: '901264922-7' },
  { name: 'TRIANGULUM BPO SAS',                             nit: '900265286-1' },
  { name: 'ITAC COLOMBIA SAS',                              nit: '901432693-6' },
  { name: 'UNIÓN TEMPORAL ITAC',                            nit: '901351139-9' },
  { name: 'UNIÓN TEMPORAL TECNOLOGÍA EIP',                  nit: '901817890-4' },
  { name: 'UNIÓN TEMPORAL FOMENTO TIC',                     nit: '901834909-7' },
  { name: 'UNIÓN TEMPORAL INTERNUQI',                       nit: '901943575-8' },
  { name: 'CONSORCIO SCIA NETCOL',                          nit: '901419833-7' },
  { name: 'PLEX DE COLOMBIA SAS - EN LIQUIDACIÓN',          nit: '901261185-1' },
  { name: 'RED EMPRESARIAL AMERICANA SAS',                  nit: '900703837-1' },
];
import type { Company } from '@/models/types/Company';

const EMPTY: Omit<Company, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '', nit: '', address: '', phone: '', email: '',
  logo: '', regional: '', baseDeOperacion: '', active: true,
  activeTH: false, activeContabilidad: false,
};

export const CompaniesPage = () => {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');

  const [formOpen, setFormOpen]   = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected]   = useState<Company | null>(null);
  const [form, setForm]           = useState(EMPTY);
  const [saving, setSaving]       = useState(false);
  const [importing, setImporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await companyService.getAll();
      setCompanies(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.nit?.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => { setSelected(null); setForm(EMPTY); setFormOpen(true); };

  const openEdit = (c: Company) => {
    setSelected(c);
    setForm({
      name: c.name, nit: c.nit, address: c.address || '',
      phone: c.phone || '', email: c.email || '', logo: c.logo || '',
      regional: c.regional || '', baseDeOperacion: c.baseDeOperacion || '',
      active: c.active,
      activeTH: c.activeTH ?? false,
      activeContabilidad: c.activeContabilidad ?? false,
    });
    setFormOpen(true);
  };

  const openDelete = (c: Company) => { setSelected(c); setDeleteOpen(true); };

  const handleToggleActive = async (c: Company) => {
    await companyService.update(c.id, { active: !c.active } as any);
    load();
  };

  const handleToggleTH = async (c: Company) => {
    await companyService.update(c.id, { activeTH: !(c.activeTH ?? false) } as any);
    load();
  };

  const handleToggleContabilidad = async (c: Company) => {
    await companyService.update(c.id, { activeContabilidad: !(c.activeContabilidad ?? false) } as any);
    load();
  };

  const handleSave = async () => {
    if (!form.name || !form.nit) return;
    setSaving(true);
    try {
      if (selected) { await companyService.update(selected.id, form); }
      else { await companyService.create(form); }
      setFormOpen(false);
      load();
    } finally { setSaving(false); }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const existing = new Set(companies.map(c => c.nit.trim()));
      const missing = SEED_COMPANIES.filter(s => !existing.has(s.nit));
      if (missing.length === 0) { toast.info('Todas las empresas ya existen'); return; }
      for (const s of missing) {
        await companyService.create({ ...EMPTY, name: s.name, nit: s.nit });
      }
      toast.success(`${missing.length} empresa${missing.length !== 1 ? 's' : ''} creada${missing.length !== 1 ? 's' : ''}`);
      load();
    } catch (e: any) {
      toast.error('Error al importar', { description: e.message });
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    await companyService.delete(selected.id);
    setDeleteOpen(false);
    load();
  };

  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-screen">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#4A4A4A]">Empresas</h1>
          <p className="text-[#4A4A4A]/70 mt-1 text-sm">Gestión de perfiles de empresa</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleImport} disabled={importing} variant="outline" className="border-blue-200 text-blue-600 hover:bg-blue-50">
            {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            Importar lista
          </Button>
          <Button onClick={openCreate} className="bg-[#008C3C] hover:bg-[#006C2F] text-white">
            <Plus className="w-4 h-4 mr-2" /> Nueva Empresa
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card className="border-l-4 border-l-[#008C3C]">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-2xl font-bold text-[#008C3C]">{companies.length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-[#1F8FBF]">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-gray-500">Activas</p>
            <p className="text-2xl font-bold text-[#1F8FBF]">{companies.filter(c => c.active).length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-gray-500">Talento Humano</p>
            <p className="text-2xl font-bold text-emerald-600">{companies.filter(c => c.activeTH).length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-gray-500">Contabilidad</p>
            <p className="text-2xl font-bold text-blue-600">{companies.filter(c => c.activeContabilidad).length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          placeholder="Buscar por nombre o NIT..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10 border-[#008C3C]/30 focus:ring-[#008C3C]"
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No hay empresas registradas</p>
          <Button onClick={openCreate} variant="link" className="text-[#008C3C] mt-2">
            Crear primera empresa
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => (
            <Card key={c.id} className="hover:shadow-md transition-shadow flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#008C3C]/10 flex items-center justify-center flex-shrink-0">
                      {c.logo
                        ? <img src={c.logo} alt={c.name} className="w-8 h-8 object-contain rounded" />
                        : <Building2 className="w-5 h-5 text-[#008C3C]" />
                      }
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold text-[#4A4A4A] leading-tight">
                        {c.name}
                      </CardTitle>
                      <p className="text-xs text-gray-500">NIT: {c.nit}</p>
                    </div>
                  </div>
                  <Badge
                    variant={c.active ? 'default' : 'secondary'}
                    className={c.active ? 'bg-green-100 text-green-700 text-xs' : 'text-xs'}
                  >
                    {c.active ? 'Activa' : 'Inactiva'}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col gap-3">
                {/* Contact info */}
                <div className="space-y-1">
                  {c.address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="truncate text-xs text-gray-600">{c.address}</span>
                    </div>
                  )}
                  {c.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="text-xs text-gray-600">{c.phone}</span>
                    </div>
                  )}
                  {c.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="truncate text-xs text-gray-600">{c.email}</span>
                    </div>
                  )}
                  {c.regional && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-[#008C3C] flex-shrink-0" />
                      <span className="text-xs text-[#008C3C]">{c.regional}</span>
                    </div>
                  )}
                  {c.baseDeOperacion && (
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="text-xs text-gray-600">{c.baseDeOperacion}</span>
                    </div>
                  )}
                </div>

                {/* Module toggles */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleToggleTH(c)}
                    title={c.activeTH ? 'Desactivar para Talento Humano' : 'Activar para Talento Humano'}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
                      ${c.activeTH
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                        : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100'}`}
                  >
                    <Users className="w-3 h-3" /> Talento H.
                  </button>
                  <button
                    onClick={() => handleToggleContabilidad(c)}
                    title={c.activeContabilidad ? 'Desactivar para Contabilidad' : 'Activar para Contabilidad'}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
                      ${c.activeContabilidad
                        ? 'bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100'
                        : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100'}`}
                  >
                    <Calculator className="w-3 h-3" /> Contabilidad
                  </button>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1 mt-auto">
                  <Button
                    size="sm"
                    className="flex-1 text-xs bg-[#008C3C] hover:bg-[#006C2F] text-white"
                    onClick={() => navigate(`/empresas/${c.id}/analytics`)}
                  >
                    <BarChart2 className="w-3.5 h-3.5 mr-1" /> Analytics
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => openEdit(c)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className={`text-xs ${c.active ? 'text-orange-500 hover:bg-orange-50 border-orange-200' : 'text-green-600 hover:bg-green-50 border-green-200'}`}
                    onClick={() => handleToggleActive(c)}
                    title={c.active ? 'Desactivar empresa' : 'Activar empresa'}
                  >
                    {c.active ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="text-xs text-red-500 hover:bg-red-50 border-red-200"
                    onClick={() => openDelete(c)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog: Crear / Editar */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected ? 'Editar empresa' : 'Nueva empresa'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1">
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre de la empresa" />
            </div>
            <div className="space-y-1">
              <Label>NIT *</Label>
              <Input value={form.nit} onChange={e => setForm(f => ({ ...f, nit: e.target.value }))} placeholder="900000000-0" />
            </div>
            <div className="space-y-1">
              <Label>Regional</Label>
              <Input value={form.regional} onChange={e => setForm(f => ({ ...f, regional: e.target.value }))} placeholder="Ej: CENTRO" />
            </div>
            <div className="space-y-1">
              <Label>Teléfono</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+57 601..." />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contacto@empresa.com" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Dirección</Label>
              <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Calle 123 #45-67, Bogotá" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Base de operación</Label>
              <Input value={form.baseDeOperacion} onChange={e => setForm(f => ({ ...f, baseDeOperacion: e.target.value }))} placeholder="Ej: Bogotá" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>URL del logo</Label>
              <Input value={form.logo} onChange={e => setForm(f => ({ ...f, logo: e.target.value }))} placeholder="https://..." />
            </div>
            <div className="col-span-2 pt-1">
              <Label className="text-xs text-gray-500 mb-2 block">Módulos activos</Label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, activeTH: !f.activeTH }))}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors flex-1 justify-center
                    ${form.activeTH
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'bg-gray-50 border-gray-200 text-gray-400'}`}
                >
                  <Users className="w-4 h-4" />
                  Talento Humano
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, activeContabilidad: !f.activeContabilidad }))}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors flex-1 justify-center
                    ${form.activeContabilidad
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-gray-50 border-gray-200 text-gray-400'}`}
                >
                  <Calculator className="w-4 h-4" />
                  Contabilidad
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !form.name || !form.nit}
              className="bg-[#008C3C] hover:bg-[#006C2F] text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (selected ? 'Guardar cambios' : 'Crear empresa')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Eliminar */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Eliminar empresa?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Se eliminará <strong>{selected?.name}</strong> permanentemente. Los usuarios vinculados no se verán afectados.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
