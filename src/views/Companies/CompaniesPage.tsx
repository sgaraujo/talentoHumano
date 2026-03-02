import { useState, useEffect } from 'react';
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
  Building2, Plus, Pencil, Trash2, Users, Phone,
  Mail, MapPin, Search, Loader2, X,
} from 'lucide-react';
import type { Company } from '@/models/types/Company';

const EMPTY: Omit<Company, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '', nit: '', address: '', phone: '', email: '',
  logo: '', regional: '', baseDeOperacion: '', active: true,
};

export const CompaniesPage = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<Company | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  // Profile employees
  const [employees, setEmployees] = useState<any[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

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

  const openCreate = () => {
    setSelected(null);
    setForm(EMPTY);
    setFormOpen(true);
  };

  const openEdit = (c: Company) => {
    setSelected(c);
    setForm({
      name: c.name, nit: c.nit, address: c.address || '',
      phone: c.phone || '', email: c.email || '', logo: c.logo || '',
      regional: c.regional || '', baseDeOperacion: c.baseDeOperacion || '',
      active: c.active,
    });
    setFormOpen(true);
  };

  const openProfile = async (c: Company) => {
    setSelected(c);
    setProfileOpen(true);
    setLoadingEmployees(true);
    try {
      const emps = await companyService.getUsersByCompany(c.name);
      setEmployees(emps);
    } finally {
      setLoadingEmployees(false);
    }
  };

  const openDelete = (c: Company) => {
    setSelected(c);
    setDeleteOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.nit) return;
    setSaving(true);
    try {
      if (selected) {
        await companyService.update(selected.id, form);
      } else {
        await companyService.create(form);
      }
      setFormOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    await companyService.delete(selected.id);
    setDeleteOpen(false);
    load();
  };

  const activeEmployees = employees.filter((e: any) => e.role === 'colaborador');
  const retiredEmployees = employees.filter((e: any) => e.role === 'excolaborador');

  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#4A4A4A]">Empresas</h1>
          <p className="text-[#4A4A4A]/70 mt-1 text-sm">Gestión de perfiles de empresa</p>
        </div>
        <Button onClick={openCreate} className="bg-[#008C3C] hover:bg-[#006C2F] text-white">
          <Plus className="w-4 h-4 mr-2" /> Nueva Empresa
        </Button>
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

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <Card className="border-l-4 border-l-[#008C3C]">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-gray-500">Total empresas</p>
            <p className="text-2xl font-bold text-[#008C3C]">{companies.length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-[#1F8FBF]">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-gray-500">Activas</p>
            <p className="text-2xl font-bold text-[#1F8FBF]">{companies.filter(c => c.active).length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-gray-400">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-gray-500">Inactivas</p>
            <p className="text-2xl font-bold text-gray-500">{companies.filter(c => !c.active).length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Grid de empresas */}
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
            <Card key={c.id} className="hover:shadow-md transition-shadow cursor-pointer group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#008C3C]/10 flex items-center justify-center flex-shrink-0">
                      {c.logo ? (
                        <img src={c.logo} alt={c.name} className="w-8 h-8 object-contain rounded" />
                      ) : (
                        <Building2 className="w-5 h-5 text-[#008C3C]" />
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold text-[#4A4A4A] leading-tight">
                        {c.name}
                      </CardTitle>
                      <p className="text-xs text-gray-500">NIT: {c.nit}</p>
                    </div>
                  </div>
                  <Badge variant={c.active ? 'default' : 'secondary'}
                    className={c.active ? 'bg-green-100 text-green-700 text-xs' : 'text-xs'}>
                    {c.active ? 'Activa' : 'Inactiva'}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-1.5 text-sm text-gray-600">
                {c.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="truncate text-xs">{c.address}</span>
                  </div>
                )}
                {c.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="text-xs">{c.phone}</span>
                  </div>
                )}
                {c.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="truncate text-xs">{c.email}</span>
                  </div>
                )}
                {c.regional && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-[#008C3C] flex-shrink-0" />
                    <span className="text-xs text-[#008C3C]">{c.regional}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-3">
                  <Button size="sm" variant="outline" className="flex-1 text-xs border-[#008C3C] text-[#008C3C] hover:bg-[#008C3C] hover:text-white"
                    onClick={() => openProfile(c)}>
                    <Users className="w-3.5 h-3.5 mr-1" /> Ver perfil
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs"
                    onClick={() => openEdit(c)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs text-red-500 hover:bg-red-50 border-red-200"
                    onClick={() => openDelete(c)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Dialog: Crear / Editar ── */}
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

      {/* ── Dialog: Perfil de empresa ── */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-[#008C3C]/10 flex items-center justify-center flex-shrink-0">
                    {selected.logo ? (
                      <img src={selected.logo} alt={selected.name} className="w-10 h-10 object-contain rounded-lg" />
                    ) : (
                      <Building2 className="w-7 h-7 text-[#008C3C]" />
                    )}
                  </div>
                  <div>
                    <DialogTitle className="text-xl">{selected.name}</DialogTitle>
                    <p className="text-sm text-gray-500">NIT: {selected.nit}</p>
                    <Badge className={selected.active ? 'bg-green-100 text-green-700 mt-1' : 'mt-1'}>
                      {selected.active ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </div>
                </div>
              </DialogHeader>

              {/* Info de la empresa */}
              <div className="grid grid-cols-2 gap-3 my-2">
                {selected.address && (
                  <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
                    <MapPin className="w-4 h-4 text-[#008C3C] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">Dirección</p>
                      <p className="text-sm font-medium">{selected.address}</p>
                    </div>
                  </div>
                )}
                {selected.phone && (
                  <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
                    <Phone className="w-4 h-4 text-[#008C3C] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">Teléfono</p>
                      <p className="text-sm font-medium">{selected.phone}</p>
                    </div>
                  </div>
                )}
                {selected.email && (
                  <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
                    <Mail className="w-4 h-4 text-[#008C3C] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">Email</p>
                      <p className="text-sm font-medium">{selected.email}</p>
                    </div>
                  </div>
                )}
                {selected.regional && (
                  <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
                    <MapPin className="w-4 h-4 text-[#1F8FBF] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">Regional</p>
                      <p className="text-sm font-medium">{selected.regional}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Stats de empleados */}
              <div className="grid grid-cols-3 gap-3 my-2">
                <div className="text-center p-3 bg-[#008C3C]/5 rounded-lg border border-[#008C3C]/20">
                  <p className="text-2xl font-bold text-[#008C3C]">
                    {loadingEmployees ? '...' : employees.length}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Total colaboradores</p>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-2xl font-bold text-blue-600">
                    {loadingEmployees ? '...' : activeEmployees.length}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Activos</p>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-2xl font-bold text-red-600">
                    {loadingEmployees ? '...' : retiredEmployees.length}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Retirados</p>
                </div>
              </div>

              {/* Lista de empleados activos */}
              <div>
                <h3 className="text-sm font-semibold text-[#4A4A4A] mb-2 flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#008C3C]" />
                  Colaboradores activos ({activeEmployees.length})
                </h3>
                {loadingEmployees ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-6 h-6 animate-spin text-[#008C3C]" />
                  </div>
                ) : activeEmployees.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">Sin colaboradores activos registrados</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {activeEmployees.map((emp: any) => (
                      <div key={emp.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <div>
                          <p className="text-sm font-medium text-[#4A4A4A]">{emp.fullName || emp.email}</p>
                          <p className="text-xs text-gray-500">{emp.contractInfo?.assignment?.position || emp.personalData?.position || '—'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">{emp.contractInfo?.assignment?.project || '—'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Eliminar ── */}
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
