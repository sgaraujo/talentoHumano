import React, { useState, useEffect, useMemo } from 'react';
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
  ChevronLeft, ChevronRight, Trash2, Building2, FolderKanban,
  Send, Eye, Paperclip, X, FileText, Image, FileDown,
  Link, MousePointerClick, ClipboardList,
} from 'lucide-react';
import { toast } from 'sonner';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/config/firebase';
import { communicationService } from '@/services/communicationService';
import { companyService } from '@/services/companyService';
import { projectService } from '@/services/projectService';
import { userService } from '@/services/userService';
import type { Communication, CommunicationRecipient } from '@/models/types/Communication';
import { questionnaireService } from '@/services/questionnaireService';
import type { Questionnaire } from '@/models/types/Questionnaire';

const PAGE_SIZE = 20;

function fmt(d?: Date) {
  if (!d) return '—';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtShort(d?: Date) {
  if (!d) return '—';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function PctBar({ value, total }: { value: number; total: number }) {
  const pct   = total > 0 ? Math.round((value / total) * 100) : 0;
  const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[60px]">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold tabular-nums" style={{ color: pct >= 80 ? '#16a34a' : pct >= 50 ? '#ca8a04' : '#dc2626' }}>
        {pct}%
      </span>
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export const CommunicationsPage = () => {
  const [communications,  setCommunications]  = useState<Communication[]>([]);
  const [companies,       setCompanies]       = useState<any[]>([]);
  const [projects,        setProjects]        = useState<any[]>([]);
  const [allUsers,        setAllUsers]        = useState<any[]>([]);
  const [questionnaires,  setQuestionnaires]  = useState<Questionnaire[]>([]);
  const [loading,         setLoading]         = useState(true);

  // Main list filters
  const [search,         setSearch]         = useState('');
  const [filterTarget,   setFilterTarget]   = useState('all');

  // Compose
  const [composeOpen, setComposeOpen] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', targetType: 'all', targetId: '', requiresAck: false });
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<{ file: File; url?: string; progress: number; uploading: boolean; link?: string }[]>([]);

  // CTA button
  const [ctaEnabled, setCtaEnabled] = useState(false);
  const [ctaText,    setCtaText]    = useState('');
  const [ctaUrl,     setCtaUrl]     = useState('');

  // Questionnaire selector
  const [selectedQuestionnaireId, setSelectedQuestionnaireId] = useState('');

  // Manual employee picker
  const [empSearch,   setEmpSearch]   = useState('');
  const [manualUsers, setManualUsers] = useState<any[]>([]);

  // Recipients modal
  const [selected,    setSelected]    = useState<Communication | null>(null);
  const [recipients,  setRecipients]  = useState<CommunicationRecipient[]>([]);
  const [loadingRec,  setLoadingRec]  = useState(false);
  const [recSearch,   setRecSearch]   = useState('');
  const [recStatus,   setRecStatus]   = useState('all');
  const [recCompany,  setRecCompany]  = useState('all');
  const [recPage,     setRecPage]     = useState(1);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const [comps, projs, users, quests] = await Promise.all([
        companyService.getAll(),
        projectService.getAll(),
        userService.getAll(),
        questionnaireService.getAll(),
      ]);
      setCompanies(comps);
      setProjects(projs);
      setAllUsers(users);
      setQuestionnaires(quests.filter((q: Questionnaire) => q.active));
    } catch (e: any) {
      toast.error('Error al cargar', { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const unsub = communicationService.subscribe(comms => {
      setCommunications(comms);
      setSelected(prev => prev ? (comms.find(c => c.id === prev.id) ?? prev) : null);
    });
    return () => unsub();
  }, []);

  // Realtime recipient listener ref
  const recUnsubRef = React.useRef<(() => void) | null>(null);

  // Open recipient modal
  const openDetail = (comm: Communication) => {
    setSelected(comm);
    setLoadingRec(true);
    setRecPage(1); setRecSearch(''); setRecStatus('all'); setRecCompany('all');
    // Unsub previous listener if any
    if (recUnsubRef.current) { recUnsubRef.current(); recUnsubRef.current = null; }
    recUnsubRef.current = communicationService.subscribeRecipients(comm.id, recs => {
      setRecipients(recs);
      setLoadingRec(false);
    });
  };

  // ── Filtered main list ────────────────────────────────────────────────────
  const filteredComms = useMemo(() => {
    return communications.filter(c => {
      if (filterTarget !== 'all' && c.targetType !== filterTarget) return false;
      if (search && !c.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [communications, filterTarget, search]);

  // ── Recipients filter + pagination ────────────────────────────────────────
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
  const recCompanies   = useMemo(() => [...new Set(recipients.map(r => r.company).filter(Boolean))].sort(), [recipients]);

  // ── Compose helpers ───────────────────────────────────────────────────────
  const resolveRecipients = () => {
    if (form.targetType === 'manual') {
      return manualUsers.map(u => ({
        userId: u.id, userName: u.fullName,
        userEmail: u.location?.corporateEmail || u.location?.personalEmail || u.email,
        company: u.contractInfo?.assignment?.company || '',
        project: u.contractInfo?.assignment?.project || '',
      })).filter(u => u.userEmail);
    }
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
      userId: u.id, userName: u.fullName,
      userEmail: u.location?.corporateEmail || u.location?.personalEmail || u.email,
      company: u.contractInfo?.assignment?.company || '',
      project: u.contractInfo?.assignment?.project || '',
    })).filter(u => u.userEmail);
  };

  // Filtered employee search results (min 2 chars, max 15, exclude already selected)
  const empResults = useMemo(() => {
    if (empSearch.trim().length < 2) return [];
    const q = empSearch.trim().toLowerCase();
    const selectedIds = new Set(manualUsers.map(u => u.id));
    return allUsers
      .filter(u => !selectedIds.has(u.id) && u.fullName?.toLowerCase().includes(q))
      .slice(0, 15);
  }, [empSearch, allUsers, manualUsers]);

  const recipientCount = useMemo(
    () => resolveRecipients().length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.targetType, form.targetId, allUsers, manualUsers]
  );

  /** Compresses JPG/PNG images via Canvas before upload. Returns original file for other types. */
  const compressIfImage = (file: File): Promise<File> => {
    return new Promise(resolve => {
      if (!file.type.match(/^image\/(jpeg|jpg|png|webp)$/)) { resolve(file); return; }
      const img = document.createElement('img');
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 1600;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else                { width  = Math.round(width  * MAX / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => {
          if (!blob) { resolve(file); return; }
          const ext  = file.type === 'image/png' ? 'png' : 'jpg';
          const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, `.${ext}`), { type: mime }));
        }, file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.82);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  };

  const uploadFile = async (file: File, idx: number) => {
    const compressed = await compressIfImage(file);
    const storageRef = ref(storage, `comunicados/${Date.now()}_${compressed.name}`);
    const task = uploadBytesResumable(storageRef, compressed);
    task.on('state_changed',
      snap => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        setAttachments(prev => prev.map((a, i) => i === idx ? { ...a, progress: pct } : a));
      },
      () => {
        setAttachments(prev => prev.map((a, i) => i === idx ? { ...a, uploading: false } : a));
        toast.error(`Error subiendo ${file.name}`);
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        setAttachments(prev => prev.map((a, i) => i === idx ? { ...a, url, uploading: false, progress: 100 } : a));
      }
    );
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (attachments.length + files.length > 3) {
      toast.error('Máximo 3 archivos por comunicado');
      return;
    }
    setAttachments(prev => {
      const next = [...prev];
      files.forEach((file, fi) => {
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} supera los 10 MB`); return;
        }
        const idx = next.length;
        next.push({ file, progress: 0, uploading: true });
        // kick off after state flush
        setTimeout(() => uploadFile(file, idx), 0);
        fi; // suppress lint
      });
      return next;
    });
    e.target.value = '';
  };

  const handleRemoveAttachment = async (idx: number) => {
    const att = attachments[idx];
    if (att.url) {
      try {
        const fileRef = ref(storage, att.url);
        await deleteObject(fileRef);
      } catch (_) { /* already deleted or not found */ }
    }
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const closeCompose = () => {
    setComposeOpen(false);
    setForm({ title: '', body: '', targetType: 'all', targetId: '', requiresAck: false });
    setAttachments([]);
    setManualUsers([]);
    setEmpSearch('');
    setCtaEnabled(false); setCtaText(''); setCtaUrl('');
    setSelectedQuestionnaireId('');
  };

  const handleSend = async () => {
    if (!form.title.trim() || !form.body.trim()) { toast.error('Asunto y mensaje son obligatorios'); return; }
    if (attachments.some(a => a.uploading)) { toast.error('Espera a que terminen de subir los archivos'); return; }
    const resolved = resolveRecipients();
    if (resolved.length === 0) { toast.error('Sin destinatarios para este segmento'); return; }
    setSending(true);
    try {
      const targetName = form.targetType === 'company'
        ? companies.find(c => c.id === form.targetId)?.name
        : form.targetType === 'project'
        ? projects.find(p => p.id === form.targetId)?.name
        : form.targetType === 'manual'
        ? manualUsers.map(u => u.fullName.split(' ')[0]).join(', ')
        : 'Todos';
      const attachmentData = attachments.filter(a => a.url).map(a => ({
        name: a.file.name, url: a.url!,
        ...(a.link?.trim() ? { link: a.link.trim() } : {}),
      }));
      await communicationService.create({
        title: form.title.trim(), body: form.body.trim(),
        sentBy: 'admin', targetType: form.targetType as any,
        targetId: form.targetId || undefined, targetName,
        requiresAck: form.requiresAck, recipients: resolved,
        attachments: attachmentData,
        ctaButton: ctaEnabled && ctaText.trim() && ctaUrl.trim()
          ? { text: ctaText.trim(), url: ctaUrl.trim() }
          : undefined,
        questionnaireId: selectedQuestionnaireId || undefined,
        questionnaireName: selectedQuestionnaireId
          ? questionnaires.find(q => q.id === selectedQuestionnaireId)?.title
          : undefined,
      });
      toast.success(`Comunicado enviado a ${resolved.length} personas`);
      closeCompose();
      load();
    } catch (e: any) {
      toast.error('Error al enviar', { description: e.message });
    } finally {
      setSending(false);
    }
  };

  const [resending, setResending] = useState(false);

  const handleResend = async () => {
    if (!selected) return;
    const pending = recipients.filter(r => r.status === 'pending');
    if (pending.length === 0) { toast.info('Todos ya leyeron el comunicado'); return; }
    setResending(true);
    try {
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('@/config/firebase');
      const sendFn = httpsCallable(functions, 'sendCommunicationEmail');
      const tokenMap = pending.map(r => ({
        email: r.userEmail,
        name: r.userName,
        link: `${window.location.origin}/comunicado/${r.token}`,
      }));
      await sendFn({
        communicationId: selected.id,
        title: selected.title,
        body: selected.body,
        recipients: tokenMap,
        attachments: selected.attachments ?? [],
      });
      toast.success(`Correo reenviado a ${pending.length} persona${pending.length > 1 ? 's' : ''}`);
    } catch (e: any) {
      toast.error('Error al reenviar', { description: e.message });
    } finally {
      setResending(false);
    }
  };

  const handleExportPending = async () => {
    if (!selected) return;
    if (filteredRecipients.length === 0) { toast.info('No hay registros para exportar'); return; }
    const XLSX = await import('xlsx');
    const rows = filteredRecipients.map(r => ({
      'Campaña':       selected.title,
      'Nombre':        r.userName,
      'Email':         r.userEmail,
      'Empresa':       r.company || '—',
      'Proyecto':      r.project || '—',
      'Estado':        r.status === 'read' ? 'Leído' : 'Pendiente',
      'Fecha envío':   r.sentAt ? r.sentAt.toLocaleDateString('es-CO') : '—',
      'Fecha lectura': r.readAt ? r.readAt.toLocaleDateString('es-CO') : '—',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
    const filtro = recStatus !== 'all' ? `_${recStatus}` : '';
    XLSX.writeFile(wb, `Reporte_${selected.title.slice(0, 25)}${filtro}.xlsx`);
  };

  const handleExportPDF = async () => {
    if (!selected) return;
    if (filteredRecipients.length === 0) { toast.info('No hay registros para exportar'); return; }
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF({ orientation: 'landscape' });
    const dateStr = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
    const filtroLabel = recStatus === 'pending' ? 'Pendientes' : recStatus === 'read' ? 'Leídos' : 'Todos';

    // Header
    doc.setFillColor(0, 140, 60);
    doc.rect(0, 0, 297, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('INTEEGRADOS — Reporte de Comunicados', 14, 10);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generado: ${dateStr}`, 14, 17);

    // Campaign info
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Campaña: ${selected.title}`, 14, 30);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Filtro: ${filtroLabel}  |  Total registros: ${filteredRecipients.length}  |  Enviado: ${fmtShort(selected.sentAt)}`, 14, 37);

    autoTable(doc, {
      startY: 42,
      head: [['Nombre', 'Email', 'Empresa', 'Proyecto', 'Estado', 'Fecha Envío', 'Fecha Lectura']],
      body: filteredRecipients.map(r => [
        r.userName,
        r.userEmail,
        r.company || '—',
        r.project || '—',
        r.status === 'read' ? 'Leído' : 'Pendiente',
        r.sentAt ? r.sentAt.toLocaleDateString('es-CO') : '—',
        r.readAt ? r.readAt.toLocaleDateString('es-CO') : '—',
      ]),
      headStyles: { fillColor: [0, 140, 60], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: [40, 40, 40] },
      alternateRowStyles: { fillColor: [240, 253, 244] },
      didDrawCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 4) {
          const val = data.cell.raw as string;
          if (val === 'Pendiente') doc.setTextColor(234, 88, 12);
          else if (val === 'Leído') doc.setTextColor(0, 140, 60);
        }
      },
      margin: { left: 14, right: 14 },
    });

    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(`Página ${i} de ${pageCount} — Inteegrados © ${new Date().getFullYear()}`, 14, doc.internal.pageSize.height - 6);
    }

    doc.save(`Reporte_${selected.title.slice(0, 25)}_${filtroLabel}.pdf`);
  };

  const handleDelete = async (comm: Communication, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`¿Eliminar "${comm.title}"?`)) return;
    try {
      await communicationService.delete(comm.id);
      toast.success('Comunicado eliminado');
      load();
    } catch (e: any) {
      toast.error('Error', { description: (e as any).message });
    }
  };

  // ── render ────────────────────────────────────────────────────────────────
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

      {/* Global stats */}
      {communications.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Comunicados',  value: communications.length, color: '#4A4A4A', icon: <Mail className="w-4 h-4" /> },
            { label: 'Enviados a',   value: communications.reduce((s, c) => s + c.totalSent, 0) + ' personas', color: '#1F8FBF', icon: <Users className="w-4 h-4" /> },
            { label: 'Total leídos', value: communications.reduce((s, c) => s + c.totalRead, 0), color: '#008C3C', icon: <CheckCircle2 className="w-4 h-4" /> },
            {
              label: 'Apertura global',
              value: (() => {
                const totalSent = communications.reduce((s, c) => s + c.totalSent, 0);
                const totalRead = communications.reduce((s, c) => s + c.totalRead, 0);
                return totalSent > 0 ? Math.round((totalRead / totalSent) * 100) + '%' : '—';
              })(),
              color: '#8B5CF6',
              icon: <Eye className="w-4 h-4" />,
            },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center gap-1.5 mb-1" style={{ color: s.color }}>
                {s.icon}
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{s.label}</span>
              </div>
              <p className="text-2xl font-bold text-[#4A4A4A]">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 mb-4 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <Input placeholder="Buscar comunicado..." value={search}
            onChange={e => setSearch(e.target.value)} className="pl-9 h-8 text-sm border-gray-200" />
        </div>
        <Select value={filterTarget} onValueChange={setFilterTarget}>
          <SelectTrigger className="h-8 text-sm w-44 border-gray-200"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="all_users">Todos los colaboradores</SelectItem>
            <SelectItem value="company">Por empresa</SelectItem>
            <SelectItem value="project">Por proyecto</SelectItem>
          </SelectContent>
        </Select>
        <span className="flex items-center text-xs text-gray-400 px-1">
          {filteredComms.length} comunicado{filteredComms.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" /></div>
      ) : filteredComms.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-14 text-center">
          <Mail className="w-12 h-12 mx-auto mb-3 text-gray-200" />
          <p className="text-gray-400">
            {communications.length === 0 ? 'Aún no hay comunicados enviados' : 'Ningún comunicado coincide con los filtros'}
          </p>
          {communications.length === 0 && (
            <Button onClick={() => setComposeOpen(true)} variant="link" className="text-[#008C3C] mt-1">
              Crear el primero
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-12 px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            <span className="col-span-4">Comunicado</span>
            <span className="col-span-2 text-center">Enviado a</span>
            <span className="col-span-1 text-center">Leídos</span>
            <span className="col-span-1 text-center">Pend.</span>
            <span className="col-span-2">Apertura</span>
            <span className="col-span-1 text-center">Fecha</span>
            <span className="col-span-1 text-center">Ver</span>
          </div>

          <div className="divide-y divide-gray-50">
            {filteredComms.map(comm => {
              const pending = comm.totalSent - comm.totalRead;
              return (
                <div key={comm.id} className="grid grid-cols-12 px-4 py-3 items-center hover:bg-gray-50/60 transition-colors group">

                  {/* Title + target */}
                  <div className="col-span-4 min-w-0 pr-2">
                    <p className="text-sm font-semibold text-[#4A4A4A] truncate">{comm.title}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {comm.targetType === 'company'
                        ? <Building2 className="w-3 h-3 text-gray-400" />
                        : comm.targetType === 'project'
                        ? <FolderKanban className="w-3 h-3 text-gray-400" />
                        : comm.targetType === 'manual'
                        ? <Search className="w-3 h-3 text-gray-400" />
                        : <Users className="w-3 h-3 text-gray-400" />}
                      <span className="text-[10px] text-gray-400 truncate">
                        {comm.targetName || 'Todos'}
                      </span>
                      {comm.requiresAck && (
                        <span className="text-[9px] bg-blue-50 text-blue-600 px-1 rounded">Acuse</span>
                      )}
                    </div>
                  </div>

                  {/* Total sent */}
                  <div className="col-span-2 text-center">
                    <span className="text-sm font-semibold text-gray-600">{comm.totalSent}</span>
                    <p className="text-[10px] text-gray-400">personas</p>
                  </div>

                  {/* Read */}
                  <div className="col-span-1 text-center">
                    <span className="text-sm font-semibold text-[#008C3C]">{comm.totalRead}</span>
                  </div>

                  {/* Pending */}
                  <div className="col-span-1 text-center">
                    <span className={`text-sm font-semibold ${pending > 0 ? 'text-orange-500' : 'text-gray-300'}`}>
                      {pending}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="col-span-2 pr-2">
                    <PctBar value={comm.totalRead} total={comm.totalSent} />
                  </div>

                  {/* Date */}
                  <div className="col-span-1 text-center">
                    <p className="text-[10px] text-gray-400 leading-tight">{fmtShort(comm.sentAt)}</p>
                  </div>

                  {/* Actions */}
                  <div className="col-span-1 flex items-center justify-center gap-1">
                    <button
                      onClick={() => openDetail(comm)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#008C3C] hover:bg-[#008C3C]/10 transition-colors"
                      title="Ver seguimiento"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={e => handleDelete(comm, e)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Recipients modal ── */}
      <Dialog open={!!selected} onOpenChange={open => { if (!open) { setSelected(null); if (recUnsubRef.current) { recUnsubRef.current(); recUnsubRef.current = null; } } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#008C3C]" />
              {selected?.title}
            </DialogTitle>
            <p className="text-xs text-gray-400 mt-0.5">
              Enviado el {fmtShort(selected?.sentAt)} · {selected?.totalSent} destinatarios
            </p>
          </DialogHeader>

          {/* Stats row — derived from live recipients */}
          {selected && (() => {
            const totalSent = selected.totalSent;
            const totalRead = recipients.filter(r => r.status === 'read').length;
            const pending   = totalSent - totalRead;
            return (
              <>
                <div className="grid grid-cols-3 gap-2 pb-2">
                  {[
                    { label: 'Enviados',   value: totalSent, color: 'text-gray-600',   bg: 'bg-gray-50'   },
                    { label: 'Leídos',     value: totalRead, color: 'text-[#008C3C]', bg: 'bg-green-50'  },
                    { label: 'Pendientes', value: pending,   color: 'text-orange-500', bg: 'bg-orange-50' },
                  ].map(s => (
                    <div key={s.label} className={`${s.bg} rounded-lg p-2.5 text-center border border-gray-100`}>
                      <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-[10px] text-gray-400">{s.label}</p>
                    </div>
                  ))}
                </div>
                <PctBar value={totalRead} total={totalSent} />
              </>
            );
          })()}

          {/* Filters */}
          <div className="flex flex-wrap gap-2 py-2 border-t border-gray-100">
            <div className="relative flex-1 min-w-36">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
              <Input placeholder="Buscar..." value={recSearch}
                onChange={e => { setRecSearch(e.target.value); setRecPage(1); }}
                className="pl-8 h-8 text-xs border-gray-200" />
            </div>
            <Select value={recStatus} onValueChange={v => { setRecStatus(v); setRecPage(1); }}>
              <SelectTrigger className="h-8 text-xs w-32 border-gray-200"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="read">Leídos</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
              </SelectContent>
            </Select>
            <Select value={recCompany} onValueChange={v => { setRecCompany(v); setRecPage(1); }}>
              <SelectTrigger className="h-8 text-xs w-36 border-gray-200"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las empresas</SelectItem>
                {recCompanies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline"
              onClick={handleResend} disabled={resending}
              className="h-8 text-xs border-orange-200 text-orange-600 hover:bg-orange-50">
              {resending
                ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                : <Send className="w-3 h-3 mr-1" />}
              Reenviar pendientes
            </Button>
            <Button size="sm" variant="outline"
              onClick={handleExportPending}
              className="h-8 text-xs border-green-200 text-green-700 hover:bg-green-50">
              <FileDown className="w-3 h-3 mr-1" />
              Excel
            </Button>
            <Button size="sm" variant="outline"
              onClick={handleExportPDF}
              className="h-8 text-xs border-red-200 text-red-600 hover:bg-red-50">
              <FileText className="w-3 h-3 mr-1" />
              PDF
            </Button>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto border border-gray-100 rounded-lg">
            {loadingRec ? (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[#008C3C]" /></div>
            ) : (
              <>
                <div className="grid grid-cols-12 px-4 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-wide sticky top-0">
                  <span className="col-span-4">Nombre</span>
                  <span className="col-span-3">Empresa</span>
                  <span className="col-span-2 text-center">Estado</span>
                  <span className="col-span-3 text-right">Fecha lectura</span>
                </div>

                <div className="divide-y divide-gray-50">
                  {pageRecipients.length === 0 ? (
                    <p className="text-xs text-gray-400 italic text-center py-8">Sin resultados</p>
                  ) : pageRecipients.map(r => (
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
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              {filteredRecipients.length} resultado{filteredRecipients.length !== 1 ? 's' : ''} · Página {recPage} de {totalPages}
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
                  <Button key={p} size="sm"
                    variant={p === recPage ? 'default' : 'outline'}
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
        </DialogContent>
      </Dialog>

      {/* ── Compose Dialog ── */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="w-full max-w-lg mx-auto flex flex-col max-h-[92dvh] sm:max-h-[90vh] p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#008C3C]" /> Nuevo comunicado
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Destinatarios *</Label>
              <Select value={form.targetType} onValueChange={v => {
                setForm(f => ({ ...f, targetType: v, targetId: '' }));
                setManualUsers([]); setEmpSearch('');
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all"><div className="flex items-center gap-2"><Users className="w-3.5 h-3.5" /> Todos los colaboradores</div></SelectItem>
                  <SelectItem value="company"><div className="flex items-center gap-2"><Building2 className="w-3.5 h-3.5" /> Por empresa</div></SelectItem>
                  <SelectItem value="project"><div className="flex items-center gap-2"><FolderKanban className="w-3.5 h-3.5" /> Por proyecto</div></SelectItem>
                  <SelectItem value="manual"><div className="flex items-center gap-2"><Search className="w-3.5 h-3.5" /> Por empleado</div></SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.targetType === 'company' && (
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Empresa *</Label>
                <Select value={form.targetId} onValueChange={v => setForm(f => ({ ...f, targetId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar empresa" /></SelectTrigger>
                  <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            {form.targetType === 'project' && (
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Proyecto *</Label>
                <Select value={form.targetId} onValueChange={v => setForm(f => ({ ...f, targetId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar proyecto" /></SelectTrigger>
                  <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name} · {p.companyName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            {/* Manual employee picker */}
            {form.targetType === 'manual' && (
              <div className="space-y-2">
                <Label className="text-xs text-gray-500">Buscar y agregar empleados *</Label>

                {/* Selected chips */}
                {manualUsers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 rounded-lg border border-gray-200 max-h-28 overflow-y-auto">
                    {manualUsers.map(u => (
                      <span key={u.id}
                        className="inline-flex items-center gap-1 text-xs bg-[#008C3C]/10 text-[#008C3C] px-2 py-1 rounded-full font-medium">
                        {u.fullName}
                        <button
                          type="button"
                          onClick={() => setManualUsers(prev => prev.filter(x => x.id !== u.id))}
                          className="hover:text-red-600 transition-colors ml-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Search input + results */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <Input
                    value={empSearch}
                    onChange={e => setEmpSearch(e.target.value)}
                    placeholder="Escribe el nombre (mín. 2 letras)..."
                    className="pl-9 text-sm"
                  />
                </div>

                {empResults.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm max-h-44 overflow-y-auto">
                    {empResults.map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => { setManualUsers(prev => [...prev, u]); setEmpSearch(''); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#008C3C]/5 transition-colors border-b border-gray-50 last:border-0"
                      >
                        <div className="w-7 h-7 rounded-full bg-[#008C3C]/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-[11px] font-bold text-[#008C3C]">
                            {u.fullName?.charAt(0)?.toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#4A4A4A] truncate">{u.fullName}</p>
                          <p className="text-[10px] text-gray-400 truncate">
                            {u.contractInfo?.assignment?.company || ''}{u.contractInfo?.assignment?.project ? ` · ${u.contractInfo.assignment.project}` : ''}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {empSearch.trim().length >= 2 && empResults.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-2">Sin resultados para "{empSearch}"</p>
                )}
              </div>
            )}

            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${recipientCount > 0 ? 'bg-[#008C3C]/5 text-[#008C3C]' : 'bg-gray-50 text-gray-400'}`}>
              <Users className="w-3.5 h-3.5" />
              <span>{recipientCount > 0 ? `${recipientCount} persona${recipientCount !== 1 ? 's' : ''} recibirán este comunicado` : 'Sin destinatarios'}</span>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Asunto *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ej: Actualización política vacaciones" />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Mensaje *</Label>
              <Textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Escribe el contenido del comunicado..." rows={5} className="resize-none" />
            </div>

            {/* Adjuntos */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-gray-500">Adjuntos (máx. 3 archivos · 10 MB c/u)</Label>
                <label className={`flex items-center gap-1.5 text-xs cursor-pointer px-2.5 py-1.5 rounded-lg border transition-colors
                  ${attachments.length >= 3 ? 'opacity-40 pointer-events-none border-gray-200 text-gray-400' : 'border-[#008C3C] text-[#008C3C] hover:bg-[#008C3C]/5'}`}>
                  <Paperclip className="w-3.5 h-3.5" />
                  Agregar archivo
                  <input type="file" className="hidden" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                    onChange={handleFileSelect} disabled={attachments.length >= 3} />
                </label>
              </div>

              {attachments.length > 0 && (
                <div className="space-y-1.5">
                  {attachments.map((att, i) => {
                    const sizeMB = (att.file.size / 1024 / 1024).toFixed(1);
                    const isImg = att.file.type.startsWith('image/');
                    return (
                      <div key={i} className={`px-3 py-2 rounded-lg border transition-colors ${att.uploading ? 'bg-[#008C3C]/5 border-[#008C3C]/20' : att.url ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100'}`}>
                        <div className="flex items-center gap-2">
                          {isImg
                            ? <Image className="w-4 h-4 text-blue-400 flex-shrink-0" />
                            : <FileText className="w-4 h-4 text-red-400 flex-shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-700 truncate">{att.file.name}</p>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-400">{sizeMB} MB</span>
                              {att.uploading && <span className="text-[10px] text-[#008C3C] font-medium">{att.progress}%</span>}
                              {att.url && <span className="text-[10px] text-green-600 font-medium">Listo</span>}
                            </div>
                          </div>
                          {att.uploading
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#008C3C] flex-shrink-0" />
                            : att.url
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                            : null}
                          <button onClick={() => handleRemoveAttachment(i)}
                            className="w-5 h-5 flex items-center justify-center rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        {att.uploading && att.progress > 0 && (
                          <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-[#008C3C] rounded-full transition-all duration-300" style={{ width: `${att.progress}%` }} />
                          </div>
                        )}
                        {/* Link input for images */}
                        {isImg && att.url && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <Link className="w-3 h-3 text-blue-400 flex-shrink-0" />
                            <input
                              type="url"
                              placeholder="Link al hacer clic en la imagen (opcional)"
                              value={att.link || ''}
                              onChange={e => setAttachments(prev => prev.map((a, j) => j === i ? { ...a, link: e.target.value } : a))}
                              className="flex-1 text-[11px] border-0 bg-transparent text-blue-600 placeholder-blue-300 focus:outline-none focus:ring-0 p-0"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* CTA button */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 rounded-lg">
                <input type="checkbox" id="ctaEnabled" checked={ctaEnabled}
                  onChange={e => setCtaEnabled(e.target.checked)}
                  className="w-3.5 h-3.5 accent-purple-600" />
                <label htmlFor="ctaEnabled" className="text-xs text-purple-700 cursor-pointer flex items-center gap-1">
                  <MousePointerClick className="w-3 h-3" /> Agregar botón de acción (CTA)
                </label>
              </div>
              {ctaEnabled && (
                <div className="pl-3 space-y-2 border-l-2 border-purple-200">
                  <Input
                    placeholder="Texto del botón (ej: Inscribirse al evento)"
                    value={ctaText}
                    onChange={e => setCtaText(e.target.value)}
                    className="text-sm h-8"
                  />
                  <Input
                    type="url"
                    placeholder="URL de destino (https://...)"
                    value={ctaUrl}
                    onChange={e => setCtaUrl(e.target.value)}
                    className="text-sm h-8"
                  />
                  {ctaText && ctaUrl && (
                    <div className="flex">
                      <span className="text-[10px] bg-purple-600 text-white px-3 py-1 rounded-full font-semibold">
                        {ctaText} →
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Questionnaire selector */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg">
                <ClipboardList className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                <span className="text-xs text-amber-700 font-medium">Adjuntar cuestionario (opcional)</span>
              </div>
              <Select
                value={selectedQuestionnaireId || '__none__'}
                onValueChange={v => setSelectedQuestionnaireId(v === '__none__' ? '' : v)}
              >
                <SelectTrigger className="text-sm border-amber-200 focus:ring-amber-400">
                  <SelectValue placeholder="Seleccionar cuestionario..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    <span className="text-gray-400">Sin cuestionario</span>
                  </SelectItem>
                  {questionnaires.map(q => (
                    <SelectItem key={q.id} value={q.id}>
                      <div className="flex items-center gap-2">
                        <ClipboardList className="w-3.5 h-3.5 text-amber-500" />
                        <span>{q.title}</span>
                        <span className="text-[10px] text-gray-400">· {q.questions.length} preguntas</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedQuestionnaireId && (() => {
                const q = questionnaires.find(x => x.id === selectedQuestionnaireId);
                return q ? (
                  <div className="pl-3 flex items-center justify-between bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
                    <div>
                      <p className="text-xs font-semibold text-amber-800">{q.title}</p>
                      <p className="text-[10px] text-amber-600">{q.questions.length} preguntas · Los destinatarios responden al abrir el comunicado</p>
                    </div>
                    <button onClick={() => setSelectedQuestionnaireId('')} className="text-amber-300 hover:text-red-400">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : null;
              })()}
              {questionnaires.length === 0 && (
                <p className="text-[10px] text-gray-400 px-3">No hay cuestionarios activos. Créalos en el módulo de Cuestionarios.</p>
              )}
            </div>

            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg">
              <input type="checkbox" id="requiresAck" checked={form.requiresAck}
                onChange={e => setForm(f => ({ ...f, requiresAck: e.target.checked }))}
                className="w-3.5 h-3.5 accent-[#008C3C]" />
              <label htmlFor="requiresAck" className="text-xs text-blue-700 cursor-pointer">
                Requiere acuse de recibo — el colaborador debe confirmar que leyó
              </label>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0 bg-white">
            <Button variant="outline" onClick={closeCompose} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={handleSend} disabled={sending || !form.title.trim() || !form.body.trim() || recipientCount === 0}
              className="bg-[#008C3C] hover:bg-[#006C2F] text-white w-full sm:w-auto">
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Enviar a {recipientCount} persona{recipientCount !== 1 ? 's' : ''}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
