import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2, Plus, Pencil, Trash2, ChevronDown, ChevronUp,
  Users, UserMinus, FolderKanban, Crown, X, Check, Search,
  Building2, MapPin,
} from 'lucide-react';
import { toast } from 'sonner';
import { projectService } from '@/services/projectService';
import { membershipService } from '@/services/membershipService';
import { companyService } from '@/services/companyService';
import { userService } from '@/services/userService';
import type { Project } from '@/models/types/Project';
import type { Company } from '@/models/types/Company';

const PRIORITY_COLOR: Record<string, string> = {
  baja: 'bg-blue-50 text-blue-600 border-blue-200',
  media: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  alta: 'bg-orange-50 text-orange-600 border-orange-200',
  critica: 'bg-red-50 text-red-600 border-red-200',
};

const EMPTY_FORM = {
  name: '', companyId: '', sede: '', priority: 'media' as Project['priority'],
};

export const ProjectsPage = () => {
  const [projects, setProjects]     = useState<Project[]>([]);
  const [companies, setCompanies]   = useState<Company[]>([]);
  const [allUsers, setAllUsers]     = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);

  // Filters
  const [search, setSearch]             = useState('');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterStatus, setFilterStatus]   = useState('all');

  // Create / Edit
  const [formOpen, setFormOpen]         = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);

  // Leader editing  (projectId → true/false)
  const [editingLeader, setEditingLeader] = useState<string | null>(null);
  const [leaderVal, setLeaderVal]         = useState('');

  // Members expand + data
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [membersMap, setMembersMap]   = useState<Record<string, any[]>>({});
  const [addingMember, setAddingMember] = useState<string | null>(null);
  const [memberVal, setMemberVal]     = useState('');

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const [projs, comps, users] = await Promise.all([
        projectService.getAll(),
        companyService.getAll(),
        userService.getAll(),
      ]);
      setProjects(projs);
      setCompanies(comps);
      setAllUsers(users);
    } catch (e: any) {
      toast.error('Error al cargar proyectos', { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Load members when project expanded
  useEffect(() => {
    if (!expandedId || membersMap[expandedId]) return;
    membershipService.getProjectMembers(expandedId)
      .then(mems => setMembersMap(prev => ({ ...prev, [expandedId]: mems })))
      .catch(() => {});
  }, [expandedId]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return projects.filter(p => {
      if (filterCompany !== 'all' && p.companyId !== filterCompany && p.companyName !== filterCompany) return false;
      if (filterStatus  !== 'all' && p.status !== filterStatus) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [projects, filterCompany, filterStatus, search]);

  const getCompanyName = (p: Project) =>
    p.companyName || companies.find(c => c.id === p.companyId)?.name || '—';

  const getCompanyUsers = (p: Project) =>
    allUsers.filter(u =>
      u.companyIds?.includes(p.companyId) ||
      u.contractInfo?.assignment?.company === p.companyName
    );

  const getLeaderOptions = (p: Project) =>
    getCompanyUsers(p).filter(u => u.role === 'lider' || u.role === 'colaborador');

  const getMembersForProject = (projectId: string) => membersMap[projectId] ?? [];

  const getUserName = (userId: string) =>
    allUsers.find(u => u.id === userId)?.fullName || userId;

  const availableToAdd = (p: Project) => {
    const existing = new Set(getMembersForProject(p.id).map((m: any) => m.userId));
    return getCompanyUsers(p).filter(u => !existing.has(u.id));
  };

  // ── CRUD ─────────────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingProject(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (p: Project) => {
    setEditingProject(p);
    setForm({ name: p.name, companyId: p.companyId, sede: p.sede || '', priority: p.priority });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.companyId) {
      toast.error('Nombre y empresa son obligatorios');
      return;
    }
    setSaving(true);
    try {
      const selectedCompany = companies.find(c => c.id === form.companyId);
      if (editingProject) {
        await projectService.update(editingProject.id, {
          name: form.name.trim(), sede: form.sede, priority: form.priority,
        });
        toast.success('Proyecto actualizado');
      } else {
        await projectService.create({
          name: form.name.trim(),
          companyId: form.companyId,
          companyName: selectedCompany?.name || '',
          status: 'activo',
          priority: form.priority,
          sede: form.sede,
        });
        toast.success('Proyecto creado');
      }
      setFormOpen(false);
      load();
    } catch (e: any) {
      toast.error('Error', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Project) => {
    if (!confirm(`¿Eliminar el proyecto "${p.name}"?`)) return;
    try {
      await projectService.delete(p.id);
      toast.success('Proyecto eliminado');
      load();
    } catch (e: any) {
      toast.error('Error', { description: e.message });
    }
  };

  // ── Leader ────────────────────────────────────────────────────────────────
  const startEditLeader = (p: Project) => {
    setEditingLeader(p.id);
    setLeaderVal(p.leaderId || '');
  };

  const saveLeader = async (p: Project) => {
    const leader = getLeaderOptions(p).find(u => u.id === leaderVal);
    try {
      await projectService.update(p.id, {
        leaderId: leaderVal || undefined,
        leaderName: leader?.fullName || '',
      });
      setProjects(prev => prev.map(x =>
        x.id === p.id ? { ...x, leaderId: leaderVal, leaderName: leader?.fullName || '' } : x
      ));
      toast.success('Líder asignado');
    } catch (e: any) {
      toast.error('Error', { description: e.message });
    } finally {
      setEditingLeader(null);
    }
  };

  // ── Members ───────────────────────────────────────────────────────────────
  const handleAddMember = async (p: Project) => {
    if (!memberVal) return;
    const user = allUsers.find(u => u.id === memberVal);
    if (!user) return;
    setSaving(true);
    try {
      await membershipService.addToProject(memberVal, p.id, p.companyId, 'miembro');
      setMembersMap(prev => ({
        ...prev,
        [p.id]: [...(prev[p.id] || []), { userId: memberVal, projectId: p.id, role: 'miembro' }],
      }));
      setMemberVal('');
      setAddingMember(null);
      toast.success(`${user.fullName} agregado`);
    } catch (e: any) {
      toast.error('Error', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (projectId: string, userId: string) => {
    try {
      await membershipService.removeFromProject(userId, projectId);
      setMembersMap(prev => ({
        ...prev,
        [projectId]: (prev[projectId] || []).filter((m: any) => m.userId !== userId),
      }));
      toast.success('Persona removida');
    } catch (e: any) {
      toast.error('Error', { description: e.message });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-screen">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#4A4A4A]">Proyectos</h1>
          <p className="text-[#4A4A4A]/70 mt-1 text-sm">Gestión de proyectos por empresa</p>
        </div>
        <Button onClick={openCreate} className="bg-[#008C3C] hover:bg-[#006C2F] text-white">
          <Plus className="w-4 h-4 mr-2" /> Nuevo Proyecto
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Buscar proyecto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 border-gray-200"
            />
          </div>

          <Select value={filterCompany} onValueChange={setFilterCompany}>
            <SelectTrigger className="border-gray-200">
              <SelectValue placeholder="Todas las empresas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las empresas</SelectItem>
              {companies.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="border-gray-200">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="activo">Activo</SelectItem>
              <SelectItem value="pausado">Pausado</SelectItem>
              <SelectItem value="finalizado">Finalizado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm text-gray-500">
          {filtered.length} proyecto{filtered.length !== 1 ? 's' : ''}
          {filtered.length !== projects.length && ` de ${projects.length}`}
        </span>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <FolderKanban className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{projects.length === 0 ? 'No hay proyectos aún' : 'Ningún proyecto coincide con los filtros'}</p>
          {projects.length === 0 && (
            <Button onClick={openCreate} variant="link" className="text-[#008C3C] mt-2">
              Crear primer proyecto
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => {
            const isExpanded   = expandedId === p.id;
            const members      = getMembersForProject(p.id);
            const isAddingHere = addingMember === p.id;
            const available    = availableToAdd(p);
            const companyName  = getCompanyName(p);

            return (
              <div key={p.id} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">

                {/* ── Project row ── */}
                <div className="flex items-start gap-4 px-4 py-4">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-lg bg-[#008C3C]/10 flex items-center justify-center flex-shrink-0">
                    <FolderKanban className="w-5 h-5 text-[#008C3C]" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[#4A4A4A]">{p.name}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 capitalize text-[#008C3C] border-[#008C3C]/30">
                        {p.status}
                      </Badge>
                      {p.priority && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize ${PRIORITY_COLOR[p.priority] || ''}`}>
                          {p.priority}
                        </span>
                      )}
                    </div>

                    {/* Company + sede */}
                    <div className="flex items-center gap-3 mt-0.5">
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Building2 className="w-3 h-3" />
                        <span>{companyName}</span>
                      </div>
                      {p.sede && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <MapPin className="w-3 h-3" />
                          <span>{p.sede}</span>
                        </div>
                      )}
                    </div>

                    {/* Leader */}
                    {editingLeader === p.id ? (
                      <div className="flex items-center gap-2 mt-2">
                        <Select value={leaderVal} onValueChange={setLeaderVal}>
                          <SelectTrigger className="h-7 text-xs w-48">
                            <SelectValue placeholder="Sin líder" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Sin líder</SelectItem>
                            {getLeaderOptions(p).map(u => (
                              <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button onClick={() => saveLeader(p)}
                          className="w-6 h-6 rounded-full bg-[#008C3C] text-white flex items-center justify-center hover:bg-[#006C2F]">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setEditingLeader(null)}
                          className="w-6 h-6 rounded-full border border-gray-200 text-gray-400 flex items-center justify-center hover:bg-gray-50">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => startEditLeader(p)}
                        className="flex items-center gap-1 mt-1 text-xs text-gray-400 hover:text-[#008C3C] transition-colors">
                        <Crown className="w-3 h-3" />
                        {p.leaderName
                          ? <span className="text-[#008C3C] font-medium">{p.leaderName}</span>
                          : <span className="italic">Asignar líder</span>
                        }
                        <Pencil className="w-2.5 h-2.5 opacity-50" />
                      </button>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : p.id)}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#008C3C] px-2 py-1.5 rounded-lg hover:bg-[#008C3C]/5 transition-colors"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>{members.length}</span>
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    <button onClick={() => openEdit(p)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#1F8FBF] hover:bg-[#1F8FBF]/10 transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(p)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* ── Members panel ── */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                      Personas en este proyecto
                    </p>

                    {members.length === 0 && !isAddingHere ? (
                      <p className="text-xs text-gray-400 italic">Sin personas asignadas aún</p>
                    ) : (
                      <div className="space-y-1">
                        {members.map((m: any) => (
                          <div key={m.userId}
                            className="flex items-center justify-between bg-white rounded-lg px-3 py-1.5 border border-gray-100">
                            <span className="text-sm text-[#4A4A4A]">{getUserName(m.userId)}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] capitalize">{m.role}</Badge>
                              <button
                                onClick={() => handleRemoveMember(p.id, m.userId)}
                                className="w-5 h-5 rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors">
                                <UserMinus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {isAddingHere ? (
                      <div className="flex items-center gap-2 pt-1">
                        <Select value={memberVal} onValueChange={setMemberVal}>
                          <SelectTrigger className="h-8 text-xs flex-1">
                            <SelectValue placeholder="Seleccionar persona" />
                          </SelectTrigger>
                          <SelectContent>
                            {available.length === 0
                              ? <SelectItem value="__none" disabled>Sin personas disponibles</SelectItem>
                              : available.map(u => (
                                  <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>
                                ))
                            }
                          </SelectContent>
                        </Select>
                        <Button size="sm" onClick={() => handleAddMember(p)}
                          disabled={!memberVal || saving || memberVal === '__none'}
                          className="bg-[#008C3C] hover:bg-[#006C2F] text-white h-8 text-xs">
                          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          Agregar
                        </Button>
                        <button onClick={() => { setAddingMember(null); setMemberVal(''); }}
                          className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-100">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddingMember(p.id); setMemberVal(''); }}
                        className="flex items-center gap-1.5 text-xs text-[#008C3C] hover:underline mt-1">
                        <Plus className="w-3.5 h-3.5" /> Agregar persona
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Dialog: Crear / Editar ── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingProject ? 'Editar proyecto' : 'Nuevo proyecto'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {!editingProject && (
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Empresa *</Label>
                <Select value={form.companyId} onValueChange={v => setForm(f => ({ ...f, companyId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar empresa" /></SelectTrigger>
                  <SelectContent>
                    {companies.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Nombre del proyecto *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Proyecto Alpha"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Sede</Label>
              <Input
                value={form.sede}
                onChange={e => setForm(f => ({ ...f, sede: e.target.value }))}
                placeholder="Ej: Bogotá"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Prioridad</Label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as Project['priority'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baja">Baja</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="critica">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.name.trim() || (!editingProject && !form.companyId)}
              className="bg-[#008C3C] hover:bg-[#006C2F] text-white"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingProject ? 'Guardar' : 'Crear')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
