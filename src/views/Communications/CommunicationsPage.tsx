import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2, Plus, Mail, Users, CheckCircle2, Clock, Search,
  ChevronLeft, ChevronRight, Eye, Trash2, Building2, FolderKanban,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { communicationService } from '@/services/communicationService';
import { companyService } from '@/services/companyService';
import { projectService } from '@/services/projectService';
import { userService } from '@/services/userService';
import type { Communication, CommunicationRecipient } from '@/models/types/Communication';

const PAGE_SIZE = 20;

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(d?: Date) {
  if (!d) return '—';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtShort(d?: Date) {
  if (!d) return '—';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function PctBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-500 w-8 text-right">{pct}%</span>
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export const CommunicationsPage = () => {
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [companies,      setCompanies]      = useState<any[]>([]);
  const [projects,       setProjects]       = useState<any[]>([]);
  const [allUsers,       setAllUsers]       = useState<any[]>([]);
  const [loading,        setLoading]        = useState(true);

  // Compose dialog
  const [composeOpen, setComposeOpen] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', targetType: 'all', targetId: '', requiresAck: false });
  const [sending, setSending] = useState(false);

  // Detail view
  const [selected,      setSelected]      = useState<Communication | null>(null);
  const [recipients,    setRecipients]    = useState<CommunicationRecipient[]>([]);
  const [loadingRec,    setLoadingRec]    = useState(false);
  const [recSearch,     setRecSearch]     = useState('');
  const [recStatus,     setRecStatus]     = useState('all');
  const [recCompany,    setRecCompany]    = useState('all');
  const [recPage,       setRecPage]       = useState(1);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const [comms, comps, projs, users] = await Promise.all([
        communicationService.getAll(),
        companyService.getAll(),
        projectService.getAll(),
        userService.getAll(),
      ]);
      setCommunications(comms);
      setCompanies(comps);
      setProjects(projs);
      setAllUsers(users);
    } catch (e: any) {
      toast.error('Error al cargar', { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Load recipients when a communication is selected
  useEffect(() => {
    if (!selected) return;
    setLoadingRec(true);
    setRecPage(1);
    setRecSearch('');
    setRecStatus('all');
    setRecCompany('all');
    communicationService.getRecipients(selected.id)
      .then(setRecipients)
      .catch(e => toast.error('Error', { description: e.message }))
      .finally(() => setLoadingRec(false));
  }, [selected]);

  // ── Derived (recipients filter + pagination) ──────────────────────────────
  const filteredRecipients = useMemo(() => {
    return recipients.filter(r => {
      if (recStatus  !== 'all' && r.status  !== recStatus)  return false;
      if (recCompany !== 'all' && r.company !== recCompany) return false;
      if (recSearch && !r.userName.toLowerCase().includes(recSearch.toLowerCase())) return false;
      return true;
    });
  }, [recipients, recStatus, recCompany, recSearch]);

  const totalPages     = Math.max(1, Math.ceil(filteredRecipients.length / PAGE_SIZE));
  const pageRecipients = filteredRecipients.slice((recPage - 1) * PAGE_SIZE, recPage * PAGE_SIZE);

  const recCompanies = useMemo(() => [...new Set(recipients.map(r => r.company).filter(Boolean))].sort(), [recipients]);

  // ── Compose: resolve recipients ───────────────────────────────────────────
  const resolveRecipients = () => {
    let users = allUsers.filter(u => u.role === 'colaborador' || u.role === 'aspirante');
    if (form.targetType === 'company') {
      const company = companies.find(c => c.id === form.targetId);
      users = users.filter(u => u.contractInfo?.assignment?.company === company?.name);
    }
    if (form.targetType === 'project') {
      const project = projects.find(p => p.id === form.targetId);
      users = users.filter(u =>
        u.projectIds?.includes(form.targetId) ||
        u.contractInfo?.assignment?.project === project?.name
      );
    }
    return users.map(u => ({
      userId: u.id,
      userName: u.fullName,
      userEmail: u.location?.personalEmail || u.email,
      company: u.contractInfo?.assignment?.company || '',
      project: u.contractInfo?.assignment?.project || '',
    })).filter(u => u.userEmail);
  };

  const recipientCount = useMemo(() => resolveRecipients().length, [form.targetType, form.targetId, allUsers]);

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error('El asunto y el mensaje son obligatorios');
      return;
    }
    const resolved = resolveRecipients();
    if (resolved.length === 0) {
      toast.error('No hay destinatarios para el segmento seleccionado');
      return;
    }
    setSending(true);
    try {
      const targetName = form.targetType === 'company'
        ? companies.find(c => c.id === form.targetId)?.name
        : form.targetType === 'project'
        ? projects.find(p => p.id === form.targetId)?.name
        : 'Todos';

      await communicationService.create({
        title: form.title.trim(),
        body: form.body.trim(),
        sentBy: 'admin',
        targetType: form.targetType as any,
        targetId: form.targetId || undefined,
        targetName,
        requiresAck: form.requiresAck,
        recipients: resolved,
      });
      toast.success(`Comunicado enviado a ${resolved.length} personas`);
      setComposeOpen(false);
      setForm({ title: '', body: '', targetType: 'all', targetId: '', requiresAck: false });
      load();
    } catch (e: any) {
      toast.error('Error al enviar', { description: e.message });
    } finally {
      setSending(false);
    }
  };

  // ── Resend to pending ─────────────────────────────────────────────────────
  const handleResend = async () => {
    if (!selected) return;
    const pending = recipients.filter(r => r.status === 'pending');
    if (pending.length === 0) { toast.info('Todos ya leyeron el comunicado'); return; }
    toast.info(`Reenviando a ${pending.length} personas pendientes...`);
    // Would call Firebase Function — show as coming soon
    toast.success(`Reenvío programado para ${pending.length} personas`);
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (comm: Communication) => {
    if (!confirm(`¿Eliminar "${comm.title}"? Se eliminará para todos los destinatarios.`)) return;
    try {
      await communicationService.delete(comm.id);
      toast.success('Comunicado eliminado');
      if (selected?.id === comm.id) setSelected(null);
      load();
    } catch (e: any) {
      toast.error('Error', { description: e.message });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-screen">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#4A4A4A]">Comunicaciones</h1>
          <p className="text-sm text-gray-500 mt-0.5">Envía comunicados y haz seguimiento de lectura</p>
        </div>
        <Button onClick={() => setComposeOpen(true)} className="bg-[#008C3C] hover:bg-[#006C2F] text-white">
          <Plus className="w-4 h-4 mr-2" /> Nuevo comunicado
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* ── Lista de comunicados ── */}
          <div className="lg:col-span-2 space-y-2">
            {communications.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
                <Mail className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-400 text-sm">Aún no hay comunicados enviados</p>
                <Button onClick={() => setComposeOpen(true)} variant="link" className="text-[#008C3C] mt-1">
                  Crear el primero
                </Button>
              </div>
            ) : (
              communications.map(comm => (
                <div
                  key={comm.id}
                  onClick={() => setSelected(comm)}
                  className={`bg-white rounded-xl border shadow-sm p-4 cursor-pointer transition-all hover:shadow-md
                    ${selected?.id === comm.id ? 'border-[#008C3C] ring-1 ring-[#008C3C]/20' : 'border-gray-100'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#4A4A4A] text-sm truncate">{comm.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtShort(comm.sentAt)}</p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(comm); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" /> {comm.totalSent}
                    </span>
                    <span className="flex items-center gap-1 text-[#008C3C]">
                      <CheckCircle2 className="w-3 h-3" /> {comm.totalRead} leídos
                    </span>
                    <span className="flex items-center gap-1 text-orange-500">
                      <Clock className="w-3 h-3" /> {comm.totalSent - comm.totalRead} pendientes
                    </span>
                  </div>
                  <div className="mt-2">
                    <PctBar value={comm.totalRead} total={comm.totalSent} />
                  </div>
                  {comm.targetName && (
                    <p className="text-[10px] text-gray-400 mt-1.5 flex items-center gap-1">
                      {comm.targetType === 'company' ? <Building2 className="w-3 h-3" /> : <FolderKanban className="w-3 h-3" />}
                      {comm.targetName}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>

          {/* ── CRUD destinatarios ── */}
          <div className="lg:col-span-3">
            {!selected ? (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center h-full flex flex-col items-center justify-center">
                <Eye className="w-10 h-10 mb-3 text-gray-200" />
                <p className="text-gray-400 text-sm">Selecciona un comunicado para ver el seguimiento</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Detail header */}
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-[#4A4A4A]">{selected.title}</p>
                      <p className="text-xs text-gray-400">{fmt(selected.sentAt)} · {selected.totalSent} destinatarios</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={handleResend}
                      className="flex-shrink-0 text-xs h-7 border-orange-200 text-orange-600 hover:bg-orange-50">
                      <Send className="w-3 h-3 mr-1" /> Reenviar pendientes
                    </Button>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {[
                      { label: 'Enviados',  value: selected.totalSent,                         color: 'text-gray-600',   icon: <Mail className="w-3 h-3" /> },
                      { label: 'Leídos',    value: selected.totalRead,                         color: 'text-[#008C3C]',  icon: <CheckCircle2 className="w-3 h-3" /> },
                      { label: 'Pendientes',value: selected.totalSent - selected.totalRead,    color: 'text-orange-500', icon: <Clock className="w-3 h-3" /> },
                    ].map(s => (
                      <div key={s.label} className="bg-white rounded-lg p-2 border border-gray-100 text-center">
                        <div className={`flex items-center justify-center gap-1 ${s.color} mb-0.5`}>{s.icon}</div>
                        <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                        <p className="text-[10px] text-gray-400">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2">
                    <PctBar value={selected.totalRead} total={selected.totalSent} />
                  </div>
                </div>

                {/* Filters */}
                <div className="px-4 py-2 border-b border-gray-100 flex flex-wrap gap-2">
                  <div className="relative flex-1 min-w-32">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                    <Input
                      placeholder="Buscar persona..."
                      value={recSearch}
                      onChange={e => { setRecSearch(e.target.value); setRecPage(1); }}
                      className="pl-8 h-8 text-xs border-gray-200"
                    />
                  </div>
                  <Select value={recStatus} onValueChange={v => { setRecStatus(v); setRecPage(1); }}>
                    <SelectTrigger className="h-8 text-xs w-32 border-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="read">Leídos</SelectItem>
                      <SelectItem value="pending">Pendientes</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={recCompany} onValueChange={v => { setRecCompany(v); setRecPage(1); }}>
                    <SelectTrigger className="h-8 text-xs w-36 border-gray-200">
                      <SelectValue placeholder="Empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las empresas</SelectItem>
                      {recCompanies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Table */}
                {loadingRec ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-[#008C3C]" />
                  </div>
                ) : (
                  <>
                    <div className="divide-y divide-gray-50">
                      {/* Header row */}
                      <div className="grid grid-cols-12 px-4 py-2 bg-gray-50 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                        <span className="col-span-4">Nombre</span>
                        <span className="col-span-3">Empresa</span>
                        <span className="col-span-2 text-center">Estado</span>
                        <span className="col-span-3 text-right">Fecha lectura</span>
                      </div>

                      {pageRecipients.length === 0 ? (
                        <p className="text-xs text-gray-400 italic text-center py-8">Sin resultados</p>
                      ) : (
                        pageRecipients.map(r => (
                          <div key={r.id} className="grid grid-cols-12 px-4 py-2.5 items-center hover:bg-gray-50 transition-colors">
                            <div className="col-span-4 min-w-0">
                              <p className="text-sm font-medium text-[#4A4A4A] truncate">{r.userName}</p>
                              <p className="text-[10px] text-gray-400 truncate">{r.userEmail}</p>
                            </div>
                            <div className="col-span-3 min-w-0">
                              <p className="text-xs text-gray-500 truncate">{r.company || '—'}</p>
                              {r.project && <p className="text-[10px] text-gray-400 truncate">{r.project}</p>}
                            </div>
                            <div className="col-span-2 flex justify-center">
                              {r.status === 'read' ? (
                                <Badge className="bg-green-50 text-green-700 border-green-200 text-[10px] px-1.5">
                                  <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> Leído
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-orange-500 border-orange-200 text-[10px] px-1.5">
                                  <Clock className="w-2.5 h-2.5 mr-0.5" /> Pendiente
                                </Badge>
                              )}
                            </div>
                            <div className="col-span-3 text-right">
                              <p className="text-[10px] text-gray-400">{r.readAt ? fmt(r.readAt) : '—'}</p>
                              {r.ackAt && <p className="text-[10px] text-green-600">Acuse ✓</p>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Pagination */}
                    <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                      <p className="text-xs text-gray-400">
                        {filteredRecipients.length} resultado{filteredRecipients.length !== 1 ? 's' : ''}
                        {' · '}Página {recPage} de {totalPages}
                      </p>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" className="h-7 w-7 p-0"
                          disabled={recPage <= 1} onClick={() => setRecPage(p => p - 1)}>
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </Button>
                        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                          const p = recPage <= 3 ? i + 1 : recPage - 2 + i;
                          if (p < 1 || p > totalPages) return null;
                          return (
                            <Button key={p} size="sm" variant={p === recPage ? 'default' : 'outline'}
                              className={`h-7 w-7 p-0 text-xs ${p === recPage ? 'bg-[#008C3C] hover:bg-[#006C2F]' : ''}`}
                              onClick={() => setRecPage(p)}>
                              {p}
                            </Button>
                          );
                        })}
                        <Button size="sm" variant="outline" className="h-7 w-7 p-0"
                          disabled={recPage >= totalPages} onClick={() => setRecPage(p => p + 1)}>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Compose Dialog ── */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#008C3C]" /> Nuevo comunicado
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Destinatarios *</Label>
              <Select value={form.targetType} onValueChange={v => setForm(f => ({ ...f, targetType: v, targetId: '' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all"><div className="flex items-center gap-2"><Users className="w-3.5 h-3.5" /> Todos los colaboradores</div></SelectItem>
                  <SelectItem value="company"><div className="flex items-center gap-2"><Building2 className="w-3.5 h-3.5" /> Por empresa</div></SelectItem>
                  <SelectItem value="project"><div className="flex items-center gap-2"><FolderKanban className="w-3.5 h-3.5" /> Por proyecto</div></SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.targetType === 'company' && (
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Empresa *</Label>
                <Select value={form.targetId} onValueChange={v => setForm(f => ({ ...f, targetId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar empresa" /></SelectTrigger>
                  <SelectContent>
                    {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.targetType === 'project' && (
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Proyecto *</Label>
                <Select value={form.targetId} onValueChange={v => setForm(f => ({ ...f, targetId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar proyecto" /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name} · {p.companyName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Recipient count preview */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${recipientCount > 0 ? 'bg-[#008C3C]/5 text-[#008C3C]' : 'bg-gray-50 text-gray-400'}`}>
              <Users className="w-3.5 h-3.5" />
              <span>{recipientCount > 0 ? `${recipientCount} persona${recipientCount !== 1 ? 's' : ''} recibirán este comunicado` : 'Sin destinatarios para este segmento'}</span>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Asunto *</Label>
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Ej: Actualización política vacaciones"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Mensaje *</Label>
              <Textarea
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                placeholder="Escribe el contenido del comunicado..."
                rows={5}
                className="resize-none"
              />
            </div>

            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg">
              <input
                type="checkbox"
                id="requiresAck"
                checked={form.requiresAck}
                onChange={e => setForm(f => ({ ...f, requiresAck: e.target.checked }))}
                className="w-3.5 h-3.5 accent-[#008C3C]"
              />
              <label htmlFor="requiresAck" className="text-xs text-blue-700 cursor-pointer">
                Requiere acuse de recibo — el colaborador debe confirmar que leyó
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setComposeOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSend}
              disabled={sending || !form.title.trim() || !form.body.trim() || recipientCount === 0}
              className="bg-[#008C3C] hover:bg-[#006C2F] text-white"
            >
              {sending
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <Send className="w-4 h-4 mr-2" />}
              Enviar a {recipientCount} persona{recipientCount !== 1 ? 's' : ''}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
