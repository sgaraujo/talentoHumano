import { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Loader2, Plus, Pencil, Trash2, ChevronDown, ChevronUp,
  Users, UserMinus, FolderKanban, Crown, X, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { projectService } from '@/services/projectService';
import { membershipService } from '@/services/membershipService';
import { userService } from '@/services/userService';
import type { Project } from '@/models/types/Project';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  companyName: string;
}

const EMPTY_FORM = { name: '', sede: '', priority: 'media' as Project['priority'] };

export const ManageProjectsDialog = ({ open, onOpenChange, companyId, companyName }: Props) => {
  const [projects, setProjects]       = useState<Project[]>([]);
  const [companyUsers, setCompanyUsers] = useState<any[]>([]);
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);

  // Which project is expanded to show members
  const [expandedId, setExpandedId]   = useState<string | null>(null);

  // Project create/edit
  const [formOpen, setFormOpen]       = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [form, setForm]               = useState(EMPTY_FORM);

  // Leader assignment per project (projectId → leaderId being edited)
  const [editingLeader, setEditingLeader] = useState<string | null>(null);
  const [leaderVal, setLeaderVal]     = useState('');

  // Members per project
  const [membersMap, setMembersMap]   = useState<Record<string, any[]>>({});
  const [addingMember, setAddingMember] = useState<string | null>(null); // projectId
  const [memberVal, setMemberVal]     = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [projs, users] = await Promise.all([
        projectService.getByCompanyFull(companyId, companyName),
        userService.getAll(),
      ]);
      setProjects(projs);
      const filtered = users.filter((u: any) =>
        (u.companyIds && u.companyIds.includes(companyId)) ||
        u.contractInfo?.assignment?.company === companyName
      );
      setCompanyUsers(filtered);
    } catch (e: any) {
      toast.error('Error al cargar proyectos', { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) { load(); setExpandedId(null); }
  }, [open]);

  // Load members when a project is expanded
  useEffect(() => {
    if (!expandedId || membersMap[expandedId]) return;
    membershipService.getProjectMembers(expandedId).then(mems => {
      setMembersMap(prev => ({ ...prev, [expandedId]: mems }));
    }).catch(() => {});
  }, [expandedId]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const leaderOptions = useMemo(
    () => companyUsers.filter(u => u.role === 'lider' || u.role === 'colaborador'),
    [companyUsers],
  );

  const getMembersForProject = (projectId: string) => membersMap[projectId] ?? [];

  const getUserName = (userId: string) =>
    companyUsers.find(u => u.id === userId)?.fullName || userId;

  // Available users to add to a project (not already members)
  const availableToAdd = (projectId: string) => {
    const existing = new Set(getMembersForProject(projectId).map((m: any) => m.userId));
    return companyUsers.filter(u => !existing.has(u.id));
  };

  // ── Project CRUD ─────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingProject(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (p: Project) => {
    setEditingProject(p);
    setForm({ name: p.name, sede: p.sede || '', priority: p.priority });
    setFormOpen(true);
  };

  const handleSaveProject = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editingProject) {
        await projectService.update(editingProject.id, {
          name: form.name.trim(),
          sede: form.sede,
          priority: form.priority,
        });
        toast.success('Proyecto actualizado');
      } else {
        await projectService.create({
          name: form.name.trim(),
          companyId,
          companyName,
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

  const handleDeleteProject = async (p: Project) => {
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
    const leader = leaderOptions.find(u => u.id === leaderVal);
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
  const handleAddMember = async (projectId: string) => {
    if (!memberVal) return;
    const user = companyUsers.find(u => u.id === memberVal);
    if (!user) return;
    setSaving(true);
    try {
      await membershipService.addToProject(memberVal, projectId, companyId, 'miembro');
      const newMem = { userId: memberVal, projectId, companyId, role: 'miembro' };
      setMembersMap(prev => ({
        ...prev,
        [projectId]: [...(prev[projectId] || []), newMem],
      }));
      setMemberVal('');
      setAddingMember(null);
      toast.success(`${user.fullName} agregado al proyecto`);
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
      toast.success('Persona removida del proyecto');
    } catch (e: any) {
      toast.error('Error', { description: e.message });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-[#008C3C]" />
              Proyectos — {companyName}
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-500">{projects.length} proyecto{projects.length !== 1 ? 's' : ''}</p>
            <Button size="sm" onClick={openCreate}
              className="bg-[#008C3C] hover:bg-[#006C2F] text-white gap-1">
              <Plus className="w-4 h-4" /> Nuevo proyecto
            </Button>
          </div>

          <div className="overflow-y-auto flex-1 space-y-2 pr-1">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-[#008C3C]" />
              </div>
            ) : projects.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <FolderKanban className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No hay proyectos — crea el primero</p>
              </div>
            ) : projects.map(p => {
              const isExpanded = expandedId === p.id;
              const members    = getMembersForProject(p.id);
              const isAddingHere = addingMember === p.id;
              const available  = availableToAdd(p.id);

              return (
                <div key={p.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  {/* ── Project row ── */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#4A4A4A] text-sm">{p.name}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 capitalize text-[#008C3C] border-[#008C3C]/30">
                          {p.status}
                        </Badge>
                      </div>

                      {/* Leader row */}
                      {editingLeader === p.id ? (
                        <div className="flex items-center gap-2 mt-1.5">
                          <Select value={leaderVal} onValueChange={setLeaderVal}>
                            <SelectTrigger className="h-7 text-xs w-44">
                              <SelectValue placeholder="Sin líder" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">Sin líder</SelectItem>
                              {leaderOptions.map(u => (
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
                          className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-400 hover:text-[#008C3C] transition-colors">
                          <Crown className="w-3 h-3" />
                          {p.leaderName
                            ? <span className="text-[#008C3C] font-medium">{p.leaderName}</span>
                            : <span className="italic">Asignar líder</span>
                          }
                          <Pencil className="w-2.5 h-2.5 opacity-60" />
                        </button>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : p.id)}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#008C3C] px-2 py-1 rounded-lg hover:bg-[#008C3C]/5 transition-colors"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>{members.length}</span>
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      <button onClick={() => openEdit(p)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#1F8FBF] hover:bg-[#1F8FBF]/10 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDeleteProject(p)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
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

                      {/* Add member */}
                      {isAddingHere ? (
                        <div className="flex items-center gap-2 pt-1">
                          <Select value={memberVal} onValueChange={setMemberVal}>
                            <SelectTrigger className="h-8 text-xs flex-1">
                              <SelectValue placeholder="Seleccionar persona" />
                            </SelectTrigger>
                            <SelectContent>
                              {available.map(u => (
                                <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button size="sm" onClick={() => handleAddMember(p.id)}
                            disabled={!memberVal || saving}
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
        </DialogContent>
      </Dialog>

      {/* ── Sub-dialog: Create / Edit project ── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingProject ? 'Editar proyecto' : 'Nuevo proyecto'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Nombre del proyecto *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Proyecto Alpha" autoFocus />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Sede (opcional)</Label>
              <Input value={form.sede} onChange={e => setForm(f => ({ ...f, sede: e.target.value }))}
                placeholder="Ej: Bogotá" />
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
            <Button onClick={handleSaveProject} disabled={saving || !form.name.trim()}
              className="bg-[#008C3C] hover:bg-[#006C2F] text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingProject ? 'Guardar' : 'Crear')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
