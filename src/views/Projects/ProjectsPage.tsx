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

  // Leader editing
  const [editingLeader, setEditingLeader] = useState<string | null>(null);
  const [leaderSearch, setLeaderSearch]   = useState('');
  const [leaderVal, setLeaderVal]         = useState('');

  // Members expand + data
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [membersMap, setMembersMap]     = useState<Record<string, any[]>>({});
  const [addingMember, setAddingMember] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberVal, setMemberVal]       = useState('');

  // ── Load + migrate legacy projects from user profiles ────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const [projs, comps, users] = await Promise.all([
        projectService.getAll(),
        companyService.getAll(),
        userService.getAll(),
      ]);
      setCompanies(comps);
      setAllUsers(users);

      // Auto-migrate: create Firestore docs for projects that only exist as
      // strings in user profiles (contractInfo.assignment.project)
      const knownKeys = new Set(
        projs.map(p => `${(p.companyName || '').toLowerCase()}::${p.name.toLowerCase()}`)
      );

      const toCreate: Array<{ name: string; companyId: string; companyName: string; sede: string }> = [];
      users.forEach(u => {
        const a = u.contractInfo?.assignment;
        if (!a?.project?.trim()) return;
        const key = `${(a.company || '').toLowerCase()}::${a.project.trim().toLowerCase()}`;
        if (knownKeys.has(key)) return;
        knownKeys.add(key);
        const company = comps.find(c => c.name === a.company);
        toCreate.push({
          name: a.project.trim(),
          companyId: company?.id || '',
          companyName: a.company || '',
          sede: a.location || '',
        });
      });

      if (toCreate.length > 0) {
        await Promise.all(
          toCreate.map(p =>
            projectService.create({
              name: p.name,
              companyId: p.companyId,
              companyName: p.companyName,
              status: 'activo',
              priority: 'media',
              sede: p.sede,
            })
          )
        );
        // Reload after migration
        const migrated = await projectService.getAll();
        setProjects(migrated);
      } else {
        setProjects(projs);
      }
    } catch (e: any) {
      toast.error('Error al cargar proyectos', { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // (no async load needed — members derived directly from allUsers below)

  // ── Derived ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return projects.filter(p => {
      if (filterCompany !== 'all') {
        const company = companies.find(c => c.id === filterCompany);
        if (p.companyId !== filterCompany && p.companyName !== company?.name) return false;
      }
      if (filterStatus !== 'all' && p.status !== filterStatus) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [projects, filterCompany, filterStatus, search, companies]);

  const getCompanyName = (p: Project) =>
    p.companyName || companies.find(c => c.id === p.companyId)?.name || '—';

  const getCompanyUsers = (p: Project) => {
    // If project has companyId, prefer matching by it; fallback to companyName match; else return all
    if (p.companyId) {
      const byId = allUsers.filter(u =>
        u.companyIds?.includes(p.companyId) ||
        u.contractInfo?.assignment?.company === p.companyName
      );
      if (byId.length > 0) return byId;
    }
    if (p.companyName) {
      const byName = allUsers.filter(u =>
        u.contractInfo?.assignment?.company === p.companyName
      );
      if (byName.length > 0) return byName;
    }
    // Fallback: return all users so leader/member assignment is always possible
    return allUsers;
  };

  const getLeaderOptions = (p: Project) => {
    const companyUsers = getCompanyUsers(p);
    // Return all company users as potential leaders (not role-restricted)
    return companyUsers;
  };

  // Miembros = usuarios cuyo projectIds incluye el id, O cuyo assignment.project coincide con el nombre
  const getMembersForProject = (p: Project) => {
    const fromProfiles = allUsers.filter(u =>
      u.projectIds?.includes(p.id) ||
      (p.name && u.contractInfo?.assignment?.project === p.name)
    ).map(u => ({ userId: u.id, projectId: p.id, role: 'miembro' }));

    // Agregar manualmente añadidos vía membersMap que no estén ya en fromProfiles
    const profileIds = new Set(fromProfiles.map(m => m.userId));
    const extra = (membersMap[p.id] ?? []).filter((m: any) => !profileIds.has(m.userId));

    return [...fromProfiles, ...extra];
  };

  const getUserName = (userId: string) =>
    allUsers.find(u => u.id === userId)?.fullName || userId;

  const availableToAdd = (p: Project) => {
    const existing = new Set(getMembersForProject(p).map((m: any) => m.userId));
    return allUsers.filter(u => !existing.has(u.id));
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
    setLeaderSearch(p.leaderName || '');
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
      // Remove from project_memberships collection (if exists there)
      await membershipService.removeFromProject(userId, projectId);
      // Reload users so getMembersForProject recomputes from allUsers
      const { userService: us } = await import('@/services/userService');
      const updated = await us.getAll();
      setAllUsers(updated);
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
            const members      = getMembersForProject(p);
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
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="relative w-52">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                            <input
                              autoFocus
                              value={leaderSearch}
                              onChange={e => { setLeaderSearch(e.target.value); setLeaderVal(''); }}
                              placeholder="Buscar persona..."
                              className="w-full h-7 pl-7 pr-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#008C3C]"
                            />
                          </div>
                          <button onClick={() => saveLeader(p)}
                            className="w-6 h-6 rounded-full bg-[#008C3C] text-white flex items-center justify-center hover:bg-[#006C2F]">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setEditingLeader(null)}
                            className="w-6 h-6 rounded-full border border-gray-200 text-gray-400 flex items-center justify-center hover:bg-gray-50">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {leaderSearch.trim().length >= 2 && (
                          <div className="w-52 max-h-36 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-md z-10 relative">
                            {[{ id: '', fullName: 'Sin líder' }, ...getLeaderOptions(p).filter(u =>
                              u.fullName?.toLowerCase().includes(leaderSearch.toLowerCase())
                            ).slice(0, 20)].map(u => (
                              <button
                                key={u.id}
                                onClick={() => { setLeaderVal(u.id); setLeaderSearch(u.fullName); }}
                                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#008C3C]/10 transition-colors ${leaderVal === u.id ? 'bg-[#008C3C]/10 font-medium text-[#008C3C]' : 'text-gray-700'}`}
                              >
                                {u.fullName}
                              </button>
                            ))}
                          </div>
                        )}
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
                      <div className="pt-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                            <input
                              autoFocus
                              value={memberSearch}
                              onChange={e => { setMemberSearch(e.target.value); setMemberVal(''); }}
                              placeholder="Buscar persona..."
                              className="w-full h-8 pl-7 pr-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#008C3C]"
                            />
                          </div>
                          <Button size="sm" onClick={() => handleAddMember(p)}
                            disabled={!memberVal || saving}
                            className="bg-[#008C3C] hover:bg-[#006C2F] text-white h-8 text-xs">
                            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            Agregar
                          </Button>
                          <button onClick={() => { setAddingMember(null); setMemberVal(''); setMemberSearch(''); }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-100">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {memberSearch.trim().length >= 2 && (
                          <div className="max-h-36 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-md">
                            {available.filter(u =>
                              u.fullName?.toLowerCase().includes(memberSearch.toLowerCase())
                            ).slice(0, 20).map(u => (
                              <button
                                key={u.id}
                                onClick={() => { setMemberVal(u.id); setMemberSearch(u.fullName); }}
                                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#008C3C]/10 transition-colors ${memberVal === u.id ? 'bg-[#008C3C]/10 font-medium text-[#008C3C]' : 'text-gray-700'}`}
                              >
                                {u.fullName}
                              </button>
                            ))}
                            {available.filter(u =>
                              u.fullName?.toLowerCase().includes(memberSearch.toLowerCase())
                            ).length === 0 && (
                              <p className="px-3 py-2 text-xs text-gray-400 italic">Sin resultados</p>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddingMember(p.id); setMemberVal(''); setMemberSearch(''); }}
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
