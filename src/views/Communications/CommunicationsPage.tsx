import React, { useState, useEffect, useMemo } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
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
  Link, MousePointerClick, ClipboardList, UserPlus, BarChart2, Copy, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/config/firebase';
import { communicationService } from '@/services/communicationService';
import { EditCommunicationDialog } from '@/components/communications/EditCommunicationDialog';
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
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
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

// ── Email preview generator (mirrors Cloud Function template) ─────────────────
function generateEmailPreview(params: {
  title: string;
  body: string;
  ctaButton?: { text: string; url: string };
  questionnaireName?: string;
  attachments?: { name: string; url: string; link?: string }[];
}): string {
  const { title, body, ctaButton, questionnaireName, attachments = [] } = params;
  const dateStr = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
  const year = new Date().getFullYear();

  const isImage = (name: string) => /\.(jpe?g|png|gif|webp|svg)$/i.test(name);
  const attachmentRows = attachments.map(att => isImage(att.name) ? `
    <tr><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;text-align:center">
      <img src="${att.url}" alt="${att.name}" style="max-width:100%;height:auto;border-radius:8px;border:1px solid #e5e7eb" />
    </td></tr>` : `
    <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6">
      <span style="font-size:14px;margin-right:8px">📎</span>
      <span style="font-size:13px;color:#374151">${att.name}</span>
    </td></tr>`).join('');

  const attachmentsSection = attachments.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:4px 16px;margin:24px 0">
      <tr><td style="padding:12px 0 4px">
        <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:700;letter-spacing:1px">Archivos adjuntos</p>
      </td></tr>
      ${attachmentRows}
    </table>` : '';

  const bodyHtml = body.split('\n').filter(l => l.trim())
    .map(l => `<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.7">${l}</p>`).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <style>
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
    body{margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif}
  </style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
  <tr><td align="center">
    <table width="100%" style="max-width:580px" cellpadding="0" cellspacing="0">

      <!-- HEADER -->
      <tr><td bgcolor="#004d22" style="background:#004d22;padding:36px 32px 28px;border-radius:16px 16px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0 0 4px;font-size:28px;letter-spacing:4px;font-weight:800">
          INTE<span style="color:#7BCB6A">E</span>GRADOS
        </h1>
        <p style="color:#a7f3d0;margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase">Gestión de Talento Humano</p>
        <div style="width:48px;height:3px;background:#7BCB6A;border-radius:2px;margin:20px auto 0"></div>
        <p style="margin:16px 0 0;font-size:11px;color:#a7f3d0;letter-spacing:2px;text-transform:uppercase;font-weight:600">📣 Comunicado Oficial</p>
        <h2 style="color:#fff;margin:8px 0 0;font-size:22px;font-weight:700;line-height:1.3">${title || '(Sin título)'}</h2>
        <p style="color:#a7f3d0;margin:10px 0 0;font-size:12px">${dateStr}</p>
      </td></tr>

      <!-- BODY -->
      <tr><td bgcolor="#ffffff" style="background:#fff;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;padding:40px 32px">
        <p style="margin:0 0 6px;font-size:16px;color:#374151;text-align:left">
          Hola <strong>Destinatario</strong>,
        </p>
        <div style="text-align:left;margin:0 0 24px">${bodyHtml || '<p style="color:#9ca3af;font-size:15px">(Sin contenido)</p>'}</div>

        <!-- BOTÓN PRINCIPAL -->
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td align="center">
            <span style="display:inline-block;background:#008C3C;color:#fff;
                         text-decoration:none;padding:18px 48px;border-radius:12px;
                         font-weight:800;font-size:17px;letter-spacing:0.5px;
                         box-shadow:0 4px 14px rgba(0,140,60,0.35)">
              Ver comunicado &nbsp;→
            </span>
          </td></tr>
          <tr><td align="center" style="padding-top:14px">
            <p style="margin:0;font-size:11px;color:#9ca3af">Este enlace es personal. No lo compartas.</p>
          </td></tr>
        </table>

        ${ctaButton?.text ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px">
          <tr><td align="center">
            <span style="display:inline-block;background:#7c3aed;color:#fff;
                         padding:13px 32px;border-radius:10px;font-weight:700;font-size:14px">
              ${ctaButton.text} →
            </span>
          </td></tr>
        </table>` : ''}

        ${questionnaireName ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 0">
          <tr><td style="border-top:1px solid #f3f4f6;padding-top:24px">
            <p style="margin:0 0 4px;font-size:11px;color:#92400e;font-weight:700;letter-spacing:1px;text-transform:uppercase;text-align:center">📋 Cuestionario adjunto</p>
            <p style="margin:0 0 16px;font-size:13px;color:#78350f;text-align:center"><strong>${questionnaireName}</strong> — tu opinión es importante</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center">
                <span style="display:inline-block;background:#d97706;color:#fff;
                             padding:14px 36px;border-radius:10px;font-weight:700;font-size:15px;
                             box-shadow:0 4px 12px rgba(217,119,6,0.30)">
                  Responder encuesta &nbsp;→
                </span>
              </td></tr>
              <tr><td align="center" style="padding-top:10px">
                <p style="margin:0;font-size:11px;color:#9ca3af">Enlace personal e intransferible.</p>
              </td></tr>
            </table>
          </td></tr>
        </table>` : ''}

        ${attachmentsSection}
      </td></tr>

      <!-- INFO BAR -->
      <tr><td bgcolor="#f0fdf4" style="background:#f0fdf4;border:1px solid #e5e7eb;border-top:none;padding:14px 32px">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:12px;color:#166534">✅ Mensaje oficial enviado por Inteegrados.</td>
          <td style="text-align:right;font-size:12px;color:#6b7280">PREVIEW</td>
        </tr></table>
      </td></tr>

      <!-- FIRMA -->
      <tr><td bgcolor="#ffffff" style="background:#fff;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;padding:16px 32px;text-align:center">
        <img src="https://nelyoda.web.app/firma-nelly.jpg" alt="Firma" style="max-width:480px;width:100%;display:block;margin:0 auto"/>
      </td></tr>

      <!-- FOOTER -->
      <tr><td bgcolor="#1f2937" style="background:#1f2937;border-radius:0 0 16px 16px;padding:24px 32px;text-align:center">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:2px;color:#fff">INTE<span style="color:#7BCB6A">E</span>GRADOS</p>
        <p style="margin:0 0 12px;font-size:11px;color:#9ca3af">Sistema de Gestión de Talento Humano</p>
        <p style="margin:0;font-size:10px;color:#6b7280;line-height:1.6">
          Correo confidencial y exclusivo para Destinatario.<br/>
          No compartas estos enlaces. © ${year} Inteegrados · Todos los derechos reservados.
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

// ── main ──────────────────────────────────────────────────────────────────────

export const CommunicationsPage = () => {
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [loading, setLoading] = useState(true);

  // Main list filters
  const [search, setSearch] = useState('');
  const [filterTarget, setFilterTarget] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');

  // Compose
  const [composeOpen, setComposeOpen] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', targetType: 'all', targetIds: [] as string[], requiresAck: false });
  const [sending, setSending] = useState(false);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [attachments, setAttachments] = useState<{ file: File; url?: string; progress: number; uploading: boolean; link?: string }[]>([]);

  // CTA button
  const [ctaEnabled, setCtaEnabled] = useState(false);
  const [ctaText, setCtaText] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');

  // Questionnaire selector
  const [selectedQuestionnaireId, setSelectedQuestionnaireId] = useState('');

  // Manual employee picker
  const [empSearch, setEmpSearch] = useState('');
  const [manualUsers, setManualUsers] = useState<any[]>([]);

  // Recipients modal
  const [selected, setSelected] = useState<Communication | null>(null);
  const [recipients, setRecipients] = useState<CommunicationRecipient[]>([]);
  const [loadingRec, setLoadingRec] = useState(false);
  const [recSearch, setRecSearch] = useState('');
  const [recStatus, setRecStatus] = useState('all');
  const [recCompany, setRecCompany] = useState('all');
  const [recPage, setRecPage] = useState(1);
  const [showCharts, setShowCharts] = useState(false);

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
  const availableMonths = useMemo(() => {
    const keys = new Set(communications.map(c => {
      const d = c.sentAt;
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }));
    return [...keys].sort((a, b) => b.localeCompare(a)).map(key => {
      const [y, m] = key.split('-');
      const label = new Date(+y, +m - 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
      return { key, label };
    });
  }, [communications]);

  const filteredComms = useMemo(() => {
    return communications.filter(c => {
      if (filterTarget !== 'all' && c.targetType !== filterTarget) return false;
      if (search && !c.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterMonth !== 'all') {
        const key = `${c.sentAt.getFullYear()}-${String(c.sentAt.getMonth() + 1).padStart(2, '0')}`;
        if (key !== filterMonth) return false;
      }
      return true;
    });
  }, [communications, filterTarget, search, filterMonth]);

  // ── Recipients filter + pagination ────────────────────────────────────────
  const filteredRecipients = useMemo(() => {
    return recipients.filter(r => {
      if (recStatus !== 'all' && r.status !== recStatus) return false;
      if (recCompany !== 'all' && r.company !== recCompany) return false;
      if (recSearch && !r.userName.toLowerCase().includes(recSearch.toLowerCase())) return false;
      return true;
    });
  }, [recipients, recStatus, recCompany, recSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredRecipients.length / PAGE_SIZE));
  const pageRecipients = filteredRecipients.slice((recPage - 1) * PAGE_SIZE, recPage * PAGE_SIZE);
  const recCompanies = useMemo(() => [...new Set(recipients.map(r => r.company).filter(Boolean))].sort(), [recipients]);

  // ── Monthly read rate (last 6 months) ────────────────────────────────────
  const monthlyStats = useMemo(() => {
  const MONTHS = 6;
  const map = new Map<string, { sent: number; read: number }>();

  for (const c of filteredComms) {
    const key = `${c.sentAt.getFullYear()}-${String(c.sentAt.getMonth() + 1).padStart(2, '0')}`;

    const cur = map.get(key) ?? {
      sent: 0,
      read: 0,
    };

    map.set(key, {
      sent: cur.sent + c.totalSent,
      read: cur.read + c.totalRead,
    });
  }

  const sorted = [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-MONTHS);

  const months = sorted.map(([key, { sent, read }]) => {
    const [y, m] = key.split('-');

    const label = new Date(+y, +m - 1).toLocaleDateString('es-CO', {
      month: 'short',
      year: '2-digit',
    });

    const pctRaw = sent > 0 ? (read / sent) * 100 : 0;
    const pct = Math.round(pctRaw);

    return {
      key,
      label,
      pct,
      pctRaw,
      sent,
      read,
    };
  });

  const avg =
    months.length > 0
      ? Math.round(
          months.reduce((s, m) => s + m.pctRaw, 0) / months.length
        )
      : 0;

  return {
    months,
    avg,
  };
}, [filteredComms]);

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
    let users = allUsers.filter(u => u.role === 'colaborador' || u.role === 'aspirante' || u.role === 'lider');
    if (form.targetType === 'company' && form.targetIds.length > 0) {
      const names = form.targetIds.map(id => companies.find(c => c.id === id)?.name).filter(Boolean);
      users = users.filter(u => names.includes(u.contractInfo?.assignment?.company));
    }
    if (form.targetType === 'project' && form.targetIds.length > 0) {
      const projectNames = form.targetIds.map(id => projects.find(p => p.id === id)?.name).filter(Boolean);
      users = users.filter(u =>
        form.targetIds.some(id => u.projectIds?.includes(id)) ||
        projectNames.includes(u.contractInfo?.assignment?.project)
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
    [form.targetType, form.targetIds, allUsers, manualUsers]
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
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => {
          if (!blob) { resolve(file); return; }
          const ext = file.type === 'image/png' ? 'png' : 'jpg';
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
    setForm({ title: '', body: '', targetType: 'all', targetIds: [], requiresAck: false });
    setAttachments([]);
    setManualUsers([]);
    setEmpSearch('');
    setCtaEnabled(false); setCtaText(''); setCtaUrl('');
    setSelectedQuestionnaireId('');
    setComposePreview(false);
    setSenderKey('default');
  };

  const handleSend = () => {
    if (!form.title.trim() || !form.body.trim()) { toast.error('Asunto y mensaje son obligatorios'); return; }
    if (attachments.some(a => a.uploading)) { toast.error('Espera a que terminen de subir los archivos'); return; }
    const resolved = resolveRecipients();
    if (resolved.length === 0) { toast.error('Sin destinatarios para este segmento'); return; }
    setSendConfirmOpen(true);
  };

  const executeSend = async () => {
    setSendConfirmOpen(false);
    const resolved = resolveRecipients();
    setSending(true);
    try {
      const targetName = form.targetType === 'company'
        ? form.targetIds.map(id => companies.find(c => c.id === id)?.name).filter(Boolean).join(', ')
        : form.targetType === 'project'
          ? form.targetIds.map(id => projects.find(p => p.id === id)?.name).filter(Boolean).join(', ')
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
        targetId: form.targetIds[0] || undefined, targetName,
        requiresAck: form.requiresAck, recipients: resolved,
        attachments: attachmentData,
        ctaButton: ctaEnabled && ctaText.trim() && ctaUrl.trim()
          ? { text: ctaText.trim(), url: ctaUrl.trim() }
          : undefined,
        questionnaireId: selectedQuestionnaireId || undefined,
        questionnaireName: selectedQuestionnaireId
          ? questionnaires.find(q => q.id === selectedQuestionnaireId)?.title
          : undefined,
        senderKey,
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

  const handleDuplicate = (comm: Communication) => {
    setForm({
      title: `${comm.title} (copia)`,
      body: comm.body,
      targetType: comm.targetType,
      targetIds: comm.targetId ? [comm.targetId] : [],
      requiresAck: comm.requiresAck ?? false,
    });
    if (comm.ctaButton) {
      setCtaEnabled(true);
      setCtaText(comm.ctaButton.text);
      setCtaUrl(comm.ctaButton.url);
    } else {
      setCtaEnabled(false);
      setCtaText('');
      setCtaUrl('');
    }
    setSelectedQuestionnaireId(comm.questionnaireId ?? '');
    setSenderKey(comm.senderKey ?? 'default');
    const dupeAttachments = (comm.attachments ?? []).map(att => ({
      file: new File([], att.name, { type: 'application/octet-stream' }),
      url: att.url,
      progress: 100,
      uploading: false,
      ...(att.link ? { link: att.link } : {}),
    }));
    setAttachments(dupeAttachments);
    setManualUsers([]);
    setComposeOpen(true);
  };

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Communication | null>(null);

  const handleEditComm = (comm: Communication) => { setEditTarget(comm); setEditOpen(true); };

  const [resending, setResending] = useState(false);
  const [resendingOneIds, setResendingOneIds] = useState<Set<string>>(new Set());
  const [resendConfirm, setResendConfirm] = useState<Communication | null>(null);
  const [resendingListId, setResendingListId] = useState<string | null>(null);
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [addPersonSearch, setAddPersonSearch] = useState('');
  const [addingPerson, setAddingPerson] = useState(false);
  const [addMode, setAddMode] = useState<'person' | 'company' | 'project'>('person');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [composePreview, setComposePreview] = useState(false);
  const [previewTab, setPreviewTab] = useState<'form' | 'preview'>('form');
  const [senderKey, setSenderKey] = useState<'default' | 'inteegra'>('default');

  // Debounced live preview HTML for split-screen compose mode
  const [debouncedPreviewHtml, setDebouncedPreviewHtml] = useState('');
  React.useEffect(() => {
    if (!composePreview) return;
    const timer = setTimeout(() => {
      setDebouncedPreviewHtml(generateEmailPreview({
        title: form.title,
        body: form.body,
        ctaButton: ctaEnabled && ctaText.trim() && ctaUrl.trim() ? { text: ctaText.trim(), url: ctaUrl.trim() } : undefined,
        questionnaireName: selectedQuestionnaireId
          ? (questionnaires.find(q => q.id === selectedQuestionnaireId)?.title ?? undefined)
          : undefined,
        attachments: attachments.filter(a => a.url).map(a => ({ name: a.file.name, url: a.url! })),
      }));
    }, 300);
    return () => clearTimeout(timer);
  }, [composePreview, form.title, form.body, ctaEnabled, ctaText, ctaUrl, selectedQuestionnaireId, questionnaires, attachments]);

  const doResendPending = async (comm: Communication, pendingRecs: CommunicationRecipient[]) => {
    const { httpsCallable } = await import('firebase/functions');
    const { functions } = await import('@/config/firebase');
    const sendFn = httpsCallable(functions, 'sendCommunicationEmail');
    const base = import.meta.env.VITE_APP_URL ?? window.location.origin;
    const tokenMap = pendingRecs.map(r => ({
      email: r.userEmail,
      name: r.userName,
      link: `${base}/comunicado/${r.token}`,
      ...(r.quizToken ? { quizLink: `${base}/responder/${r.quizToken}` } : {}),
      ...(comm.ctaButton ? { ctaTrackingUrl: `${base}/comunicado/${r.token}/cta` } : {}),
    }));
    await sendFn({
      communicationId: comm.id,
      title: comm.title,
      body: comm.body,
      recipients: tokenMap,
      attachments: comm.attachments ?? [],
      ctaButton: comm.ctaButton ?? null,
      questionnaireName: comm.questionnaireName ?? null,
      senderKey: comm.senderKey || 'default',
    });
  };

  const handleResend = async () => {
    if (!selected) return;
    const pending = recipients.filter(r => r.status === 'pending');
    if (pending.length === 0) { toast.info('Todos ya leyeron el comunicado'); return; }
    setResending(true);
    try {
      await doResendPending(selected, pending);
      toast.success(`Correo reenviado a ${pending.length} persona${pending.length > 1 ? 's' : ''}`);
    } catch (e: any) {
      toast.error('Error al reenviar', { description: e.message });
    } finally {
      setResending(false);
    }
  };

  const handleResendFromList = async (comm: Communication) => {
    setResendConfirm(null);
    setResendingListId(comm.id);
    try {
      const recs = await communicationService.getRecipients(comm.id);
      const pending = recs.filter(r => r.status === 'pending');
      if (pending.length === 0) { toast.info('Todos ya leyeron este comunicado'); return; }
      await doResendPending(comm, pending);
      toast.success(`Correo reenviado a ${pending.length} persona${pending.length > 1 ? 's' : ''}`);
    } catch (e: any) {
      toast.error('Error al reenviar', { description: e.message });
    } finally {
      setResendingListId(null);
    }
  };

  const handleResendOne = async (r: CommunicationRecipient) => {
    if (!selected || resendingOneIds.has(r.id)) return;
    setResendingOneIds(prev => new Set([...prev, r.id]));
    try {
      await communicationService.resendOne(r, selected);
      toast.success(`Correo enviado a ${r.userName}`);
    } catch (e: any) {
      toast.error('Error al reenviar', { description: e.message });
    } finally {
      setResendingOneIds(prev => { const s = new Set(prev); s.delete(r.id); return s; });
    }
  };

  const addPersonResults = useMemo(() => {
    if (addPersonSearch.trim().length < 2) return [];
    const q = addPersonSearch.trim().toLowerCase();
    const existing = new Set(recipients.map(r => r.userId));
    return allUsers
      .filter(u => !existing.has(u.id) && u.fullName?.toLowerCase().includes(q))
      .slice(0, 12);
  }, [addPersonSearch, allUsers, recipients]);

  const handleAddPerson = async (user: any) => {
    if (!selected || addingPerson) return;
    const email = user.location?.corporateEmail || user.location?.personalEmail || user.email;
    if (!email) { toast.error('El usuario no tiene email registrado'); return; }
    setAddingPerson(true);
    try {
      await communicationService.addRecipient({
        communicationId: selected.id,
        userId: user.id,
        userName: user.fullName,
        userEmail: email,
        company: user.contractInfo?.assignment?.company || '',
        project: user.contractInfo?.assignment?.project || '',
        comm: selected,
      });
      toast.success(`${user.fullName} añadido y notificado`);
      setAddPersonOpen(false);
      setAddPersonSearch('');
    } catch (e: any) {
      toast.error('Error al añadir persona', { description: e.message });
    } finally {
      setAddingPerson(false);
    }
  };

  const handleAddBulk = async (filterFn: (u: any) => boolean, label: string) => {
    if (!selected || addingPerson) return;
    const existing = new Set(recipients.map(r => r.userId));
    const toAdd = allUsers.filter(u =>
      u.role === 'colaborador' && !existing.has(u.id) && filterFn(u) &&
      (u.location?.corporateEmail || u.location?.personalEmail || u.email)
    );
    if (toAdd.length === 0) { toast.info('Todos ya están en el comunicado'); return; }
    setAddingPerson(true);
    try {
      for (const user of toAdd) {
        const email = user.location?.corporateEmail || user.location?.personalEmail || user.email;
        await communicationService.addRecipient({
          communicationId: selected.id,
          userId: user.id,
          userName: user.fullName,
          userEmail: email,
          company: user.contractInfo?.assignment?.company || '',
          project: user.contractInfo?.assignment?.project || '',
          comm: selected,
        });
      }
      toast.success(`${toAdd.length} persona${toAdd.length !== 1 ? 's' : ''} añadida${toAdd.length !== 1 ? 's' : ''} de ${label}`);
      setAddPersonOpen(false);
    } catch (e: any) {
      toast.error('Error al añadir', { description: e.message });
    } finally {
      setAddingPerson(false);
    }
  };

  const handleExportPending = async () => {
    if (!selected) return;
    if (filteredRecipients.length === 0) { toast.info('No hay registros para exportar'); return; }
    const XLSX = await import('xlsx');
    const rows = filteredRecipients.map(r => ({
      'Campaña': selected.title,
      'Nombre': r.userName,
      'Email': r.userEmail,
      'Empresa': r.company || '—',
      'Proyecto': r.project || '—',
      'Estado': r.status === 'read' ? 'Leído' : 'Pendiente',
      'Fecha envío': r.sentAt ? r.sentAt.toLocaleDateString('es-CO') : '—',
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

      {/* Global stats — reflect current month filter */}
      {communications.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Comunicados', value: filteredComms.length, color: '#4A4A4A', icon: <Mail className="w-4 h-4" /> },
            /* { label: 'Enviados a', value: filteredComms.reduce((s, c) => s + c.totalSent, 0) + ' pers.', color: '#1F8FBF', icon: <Users className="w-4 h-4" /> }, */
            { label: 'Leídos', value: filteredComms.reduce((s, c) => s + c.totalRead, 0), color: '#008C3C', icon: <CheckCircle2 className="w-4 h-4" /> },
            {
              label: 'Promedio apertura Mensual',
              value: monthlyStats.months.length > 0 ? `${monthlyStats.avg}%` : '—',
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
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <Input placeholder="Buscar comunicado..." value={search}
            onChange={e => setSearch(e.target.value)} className="pl-9 h-8 text-sm border-gray-200" />
        </div>
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="h-8 text-sm w-40 border-gray-200 capitalize"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los meses</SelectItem>
            {availableMonths.map(({ key, label }) => (
              <SelectItem key={key} value={key} className="capitalize">{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterTarget} onValueChange={setFilterTarget}>
          <SelectTrigger className="h-8 text-sm w-40 border-gray-200"><SelectValue /></SelectTrigger>
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

      {/* List */}
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
        <>
          {/* ── Mobile cards (< sm) ── */}
          <div className="sm:hidden space-y-2">
            {filteredComms.map(comm => {
              const pending = comm.totalSent - comm.totalRead;
              return (
                <div key={comm.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#4A4A4A] leading-snug">{comm.title}</p>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        {comm.targetType === 'company' ? <Building2 className="w-3 h-3 text-gray-400" />
                          : comm.targetType === 'project' ? <FolderKanban className="w-3 h-3 text-gray-400" />
                            : <Users className="w-3 h-3 text-gray-400" />}
                        <span className="text-[10px] text-gray-400">{comm.targetName || 'Todos'}</span>
                        <span className="text-[10px] text-gray-300">·</span>
                        <span className="text-[10px] text-gray-400">{fmtShort(comm.sentAt)}</span>
                        {comm.requiresAck && <span className="text-[9px] bg-blue-50 text-blue-600 px-1 rounded">Acuse</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {pending > 0 && (
                        <button onClick={() => setResendConfirm(comm)}
                          title="Reenviar a pendientes"
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-colors">
                          {resendingListId === comm.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Send className="w-4 h-4" />}
                        </button>
                      )}
                      <button onClick={() => handleEditComm(comm)}
                        title="Editar comunicado"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDuplicate(comm)}
                        title="Duplicar comunicado"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button onClick={() => openDetail(comm)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#008C3C] hover:bg-[#008C3C]/10 transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={e => handleDelete(comm, e)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-2 text-center">
                    <div className="bg-gray-50 rounded-lg py-1.5">
                      <p className="text-sm font-bold text-gray-600">{comm.totalSent}</p>
                      <p className="text-[10px] text-gray-400">enviados</p>
                    </div>
                    <div className="bg-green-50 rounded-lg py-1.5">
                      <p className="text-sm font-bold text-[#008C3C]">{comm.totalRead}</p>
                      <p className="text-[10px] text-gray-400">leídos</p>
                    </div>
                    <div className={`rounded-lg py-1.5 ${pending > 0 ? 'bg-orange-50' : 'bg-gray-50'}`}>
                      <p className={`text-sm font-bold ${pending > 0 ? 'text-orange-500' : 'text-gray-300'}`}>{pending}</p>
                      <p className="text-[10px] text-gray-400">pend.</p>
                    </div>
                  </div>
                  <PctBar value={comm.totalRead} total={comm.totalSent} />
                </div>
              );
            })}
          </div>

          {/* ── Desktop table (sm+) ── */}
          <div className="hidden sm:block bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
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
                    <div className="col-span-4 min-w-0 pr-2">
                      <p className="text-sm font-semibold text-[#4A4A4A] truncate">{comm.title}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        {comm.targetType === 'company' ? <Building2 className="w-3 h-3 text-gray-400" />
                          : comm.targetType === 'project' ? <FolderKanban className="w-3 h-3 text-gray-400" />
                            : comm.targetType === 'manual' ? <Search className="w-3 h-3 text-gray-400" />
                              : <Users className="w-3 h-3 text-gray-400" />}
                        <span className="text-[10px] text-gray-400 truncate">{comm.targetName || 'Todos'}</span>
                        {comm.requiresAck && <span className="text-[9px] bg-blue-50 text-blue-600 px-1 rounded">Acuse</span>}
                      </div>
                    </div>
                    <div className="col-span-2 text-center">
                      <span className="text-sm font-semibold text-gray-600">{comm.totalSent}</span>
                      <p className="text-[10px] text-gray-400">personas</p>
                    </div>
                    <div className="col-span-1 text-center">
                      <span className="text-sm font-semibold text-[#008C3C]">{comm.totalRead}</span>
                    </div>
                    <div className="col-span-1 text-center">
                      <span className={`text-sm font-semibold ${pending > 0 ? 'text-orange-500' : 'text-gray-300'}`}>{pending}</span>
                    </div>
                    <div className="col-span-2 pr-2">
                      <PctBar value={comm.totalRead} total={comm.totalSent} />
                    </div>
                    <div className="col-span-1 text-center">
                      <p className="text-[10px] text-gray-400 leading-tight">{fmtShort(comm.sentAt)}</p>
                    </div>
                    <div className="col-span-1 flex items-center justify-center gap-1">
                      {pending > 0 && (
                        <button onClick={() => setResendConfirm(comm)}
                          title="Reenviar a pendientes"
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-colors opacity-0 group-hover:opacity-100">
                          {resendingListId === comm.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Send className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <button onClick={() => handleEditComm(comm)}
                        title="Editar comunicado"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors opacity-0 group-hover:opacity-100">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDuplicate(comm)}
                        title="Duplicar comunicado"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors opacity-0 group-hover:opacity-100">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => openDetail(comm)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#008C3C] hover:bg-[#008C3C]/10 transition-colors">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={e => handleDelete(comm, e)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── Recipients modal ── */}
      <Dialog open={!!selected} onOpenChange={open => { if (!open) { setSelected(null); if (recUnsubRef.current) { recUnsubRef.current(); recUnsubRef.current = null; } } }}>
        <DialogContent className="w-full max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col p-0 gap-0 sm:rounded-2xl rounded-none">

          <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
            <DialogTitle className="text-base flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#008C3C]" />
              <span className="truncate">{selected?.title}</span>
            </DialogTitle>
            <p className="text-xs text-gray-400 mt-0.5">
              Enviado el {fmtShort(selected?.sentAt)} · {selected?.totalSent} destinatarios
            </p>
          </DialogHeader>

          {/* Stats + bar */}
          {selected && (() => {
            const totalSent = selected.totalSent;
            const totalRead = recipients.filter(r => r.status === 'read').length;
            const pending = totalSent - totalRead;
            const ctaClicks = selected.totalCtaClicks ?? 0;
            const hasCta = !!selected.ctaButton;
            const stats = [
              { label: 'Enviados', value: totalSent, color: 'text-gray-600', bg: 'bg-gray-50' },
              { label: 'Leídos', value: totalRead, color: 'text-[#008C3C]', bg: 'bg-green-50' },
              { label: 'Pendientes', value: pending, color: 'text-orange-500', bg: 'bg-orange-50' },
              ...(hasCta ? [{ label: 'Clics botón', value: ctaClicks, color: 'text-purple-600', bg: 'bg-purple-50' }] : []),
            ];
            return (
              <div className="px-4 sm:px-6 py-3 space-y-2 flex-shrink-0">
                <div className={`grid gap-2 ${hasCta ? 'grid-cols-4' : 'grid-cols-3'}`}>
                  {stats.map(s => (
                    <div key={s.label} className={`${s.bg} rounded-lg p-2 text-center border border-gray-100`}>
                      <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-[10px] text-gray-400">{s.label}</p>
                    </div>
                  ))}
                </div>
                <PctBar value={totalRead} total={totalSent} />
              </div>
            );
          })()}

          {/* Filters */}
          <div className="px-4 sm:px-6 pb-2 flex flex-wrap gap-2 border-t border-gray-100 pt-2 flex-shrink-0">
            <div className="relative flex-1 min-w-[120px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
              <Input placeholder="Buscar..." value={recSearch}
                onChange={e => { setRecSearch(e.target.value); setRecPage(1); }}
                className="pl-8 h-8 text-xs border-gray-200" />
            </div>
            <Select value={recStatus} onValueChange={v => { setRecStatus(v); setRecPage(1); }}>
              <SelectTrigger className="h-8 text-xs w-28 border-gray-200"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="read">Leídos</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
              </SelectContent>
            </Select>
            <Select value={recCompany} onValueChange={v => { setRecCompany(v); setRecPage(1); }}>
              <SelectTrigger className="h-8 text-xs w-32 border-gray-200"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {recCompanies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={handleResend} disabled={resending}
                className="h-8 text-xs border-orange-200 text-orange-600 hover:bg-orange-50 px-2.5">
                {resending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                <span className="hidden sm:inline ml-1">Reenviar pendientes</span>
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setAddPersonOpen(true); setAddPersonSearch(''); }}
                className="h-8 text-xs border-blue-200 text-blue-600 hover:bg-blue-50 px-2.5">
                <UserPlus className="w-3 h-3" /><span className="hidden sm:inline ml-1">Añadir</span>
              </Button>
              <Button size="sm" variant="outline" onClick={() => {
                if (!selected) return;
                setPreviewHtml(generateEmailPreview({
                  title: selected.title,
                  body: selected.body,
                  ctaButton: selected.ctaButton,
                  questionnaireName: selected.questionnaireName ?? undefined,
                  attachments: selected.attachments ?? [],
                }));
                setPreviewOpen(true);
              }} className="h-8 text-xs border-purple-200 text-purple-600 hover:bg-purple-50 px-2.5">
                <Eye className="w-3 h-3" /><span className="hidden sm:inline ml-1">Correo</span>
              </Button>
              <Button size="sm" variant="outline" onClick={handleExportPending}
                className="h-8 text-xs border-green-200 text-green-700 hover:bg-green-50 px-2.5">
                <FileDown className="w-3 h-3" /><span className="hidden sm:inline ml-1">Excel</span>
              </Button>
              <Button size="sm" variant="outline" onClick={handleExportPDF}
                className="h-8 text-xs border-red-200 text-red-600 hover:bg-red-50 px-2.5">
                <FileText className="w-3 h-3" /><span className="hidden sm:inline ml-1">PDF</span>
              </Button>
              <Button size="sm" variant={showCharts ? 'default' : 'outline'}
                onClick={() => setShowCharts(p => !p)}
                className={`h-8 text-xs px-2.5 ${showCharts ? 'bg-[#008C3C] hover:bg-[#006C2F]' : 'border-[#008C3C]/40 text-[#008C3C] hover:bg-green-50'}`}>
                <BarChart2 className="w-3 h-3" /><span className="hidden sm:inline ml-1">Gráficas</span>
              </Button>
            </div>
          </div>

          {/* Charts panel */}
          {showCharts && selected && (() => {
            const totalRead = recipients.filter(r => r.status === 'read').length;
            const pending = recipients.filter(r => r.status === 'pending').length;
            const pieData = [
              { name: 'Leídos', value: totalRead, fill: '#008C3C' },
              { name: 'Pendientes', value: pending, fill: '#f97316' },
            ];
            const allCompanies = [...new Set(recipients.map(r => r.company).filter(Boolean))].sort();
            const barData = allCompanies
              .map(co => {
                const coRecs = recipients.filter(r => r.company === co);
                return {
                  name: co.length > 14 ? co.slice(0, 13) + '…' : co,
                  Leídos: coRecs.filter(r => r.status === 'read').length,
                  Pendientes: coRecs.filter(r => r.status === 'pending').length,
                };
              })
              .sort((a, b) => b.Pendientes - a.Pendientes);
            return (
              <div className="px-4 sm:px-6 py-3 border-t border-gray-100 bg-gray-50/60 flex-shrink-0">
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Donut */}
                  <div className="flex flex-col items-center">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">General</p>
                    <ResponsiveContainer width={160} height={140}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={38} outerRadius={58}
                          dataKey="value" strokeWidth={0}>
                          {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                        </Pie>
                        <Tooltip formatter={(v) => v} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex gap-3 mt-1">
                      <span className="flex items-center gap-1 text-[10px] text-gray-600">
                        <span className="w-2 h-2 rounded-full bg-[#008C3C] inline-block" />Leídos ({totalRead})
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-gray-600">
                        <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />Pendientes ({pending})
                      </span>
                    </div>
                  </div>

                  {/* Bar by company */}
                  {barData.length > 0 && (
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Por empresa</p>
                      <ResponsiveContainer width="100%" height={Math.max(100, barData.length * 28)}>
                        <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barSize={10}>
                          <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                          <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                          <Bar dataKey="Leídos" fill="#008C3C" radius={[0, 3, 3, 0]} />
                          <Bar dataKey="Pendientes" fill="#f97316" radius={[0, 3, 3, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Recipients list */}
          <div className="flex-1 overflow-auto border-t border-gray-100">
            {loadingRec ? (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[#008C3C]" /></div>
            ) : pageRecipients.length === 0 ? (
              <p className="text-xs text-gray-400 italic text-center py-10">Sin resultados</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {pageRecipients.map(r => (
                  <div key={r.id} className="group px-4 sm:px-6 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#4A4A4A] truncate">{r.userName}</p>
                        <p className="text-[10px] text-gray-400 truncate">{r.userEmail}</p>
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">{r.company || '—'}{r.project ? ` · ${r.project}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Resend button — visible on hover for all, always visible for pending */}
                        <button
                          onClick={() => handleResendOne(r)}
                          disabled={resendingOneIds.has(r.id)}
                          title="Reenviar correo a esta persona"
                          className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors disabled:opacity-40
                            ${r.status === 'read'
                              ? 'opacity-0 group-hover:opacity-100 text-gray-400 hover:text-[#008C3C] hover:bg-[#008C3C]/10'
                              : 'text-orange-400 hover:text-orange-600 hover:bg-orange-50'}`}
                        >
                          {resendingOneIds.has(r.id)
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Send className="w-3.5 h-3.5" />}
                        </button>
                        <div className="flex flex-col items-end gap-1">
                          {r.status === 'read' ? (
                            <Badge className="bg-green-50 text-green-700 border-green-200 text-[10px] px-1.5">
                              <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> Leído
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-orange-500 border-orange-200 text-[10px] px-1.5">
                              <Clock className="w-2.5 h-2.5 mr-0.5" /> Pendiente
                            </Badge>
                          )}
                          {r.readAt && <p className="text-[10px] text-gray-400">{fmt(r.readAt)}</p>}
                          {r.ackAt && <p className="text-[10px] text-green-600">Acuse ✓</p>}
                          {r.ctaClickedAt && selected?.ctaButton && (
                            <p className="text-[10px] text-purple-600">
                              <MousePointerClick className="w-2.5 h-2.5 inline mr-0.5" />
                              Clic · {fmt(r.ctaClickedAt)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-t border-gray-100 flex-shrink-0">
            <p className="text-xs text-gray-400">
              {filteredRecipients.length} · pág. {recPage}/{totalPages}
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

      {/* ── Add Person Dialog ── */}
      <Dialog open={addPersonOpen} onOpenChange={open => { setAddPersonOpen(open); if (!open) { setAddPersonSearch(''); setAddMode('person'); } }}>
        <DialogContent className="w-full max-w-sm p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-gray-100">
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserPlus className="w-4 h-4 text-blue-600" /> Añadir al comunicado
            </DialogTitle>
          </DialogHeader>

          {/* Mode tabs */}
          <div className="flex border-b border-gray-100">
            {([
              { key: 'person', label: 'Empleado', icon: <Users className="w-3.5 h-3.5" /> },
              { key: 'company', label: 'Empresa', icon: <Building2 className="w-3.5 h-3.5" /> },
              { key: 'project', label: 'Proyecto', icon: <FolderKanban className="w-3.5 h-3.5" /> },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => { setAddMode(tab.key); setAddPersonSearch(''); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors
                  ${addMode === tab.key ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-400 hover:text-gray-600'}`}
              >
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>

          <div className="px-5 py-4 space-y-3">
            {/* ── Empleado ── */}
            {addMode === 'person' && (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <Input
                    placeholder="Buscar por nombre..."
                    value={addPersonSearch}
                    onChange={e => setAddPersonSearch(e.target.value)}
                    className="pl-9 h-9 text-sm border-gray-200"
                    autoFocus
                  />
                </div>
                {addPersonSearch.trim().length >= 2 ? (
                  addPersonResults.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-3">Sin resultados</p>
                  ) : (
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {addPersonResults.map(u => {
                        const email = u.location?.corporateEmail || u.location?.personalEmail || u.email;
                        return (
                          <button key={u.id} onClick={() => handleAddPerson(u)} disabled={addingPerson}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors text-left disabled:opacity-50">
                            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-xs font-bold text-blue-600">
                              {u.fullName?.[0]?.toUpperCase() ?? '?'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-700 truncate">{u.fullName}</p>
                              <p className="text-[10px] text-gray-400 truncate">{email || 'Sin email'}</p>
                            </div>
                            {addingPerson ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 flex-shrink-0" /> : <Send className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <p className="text-xs text-gray-300 text-center py-4">Escribe al menos 2 caracteres</p>
                )}
              </>
            )}

            {/* ── Empresa ── */}
            {addMode === 'company' && (() => {
              const existing = new Set(recipients.map(r => r.userId));
              return (
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {companies.filter(c => c.activeTH).length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-4">No hay empresas activas en TH</p>
                  )}
                  {companies.filter(c => c.activeTH).map(c => {
                    const count = allUsers.filter(u =>
                      u.role === 'colaborador' && !existing.has(u.id) &&
                      u.contractInfo?.assignment?.company === c.name &&
                      (u.location?.corporateEmail || u.location?.personalEmail || u.email)
                    ).length;
                    return (
                      <button key={c.id} disabled={addingPerson || count === 0}
                        onClick={() => handleAddBulk(u => u.contractInfo?.assignment?.company === c.name, c.name)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-50 transition-colors text-left disabled:opacity-40">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          {c.logo ? <img src={c.logo} alt={c.name} className="w-6 h-6 object-contain rounded" /> : <Building2 className="w-4 h-4 text-emerald-600" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-700 truncate">{c.name}</p>
                          <p className="text-[10px] text-gray-400">{count === 0 ? 'Todos ya añadidos' : `${count} sin añadir`}</p>
                        </div>
                        {addingPerson ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 flex-shrink-0" /> : <Send className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {/* ── Proyecto ── */}
            {addMode === 'project' && (() => {
              const existing = new Set(recipients.map(r => r.userId));
              return (
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {projects.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-4">No hay proyectos</p>
                  )}
                  {projects.map(p => {
                    const count = allUsers.filter(u =>
                      u.role === 'colaborador' && !existing.has(u.id) &&
                      (u.contractInfo?.assignment?.projectId === p.id || u.contractInfo?.assignment?.project === p.name) &&
                      (u.location?.corporateEmail || u.location?.personalEmail || u.email)
                    ).length;
                    return (
                      <button key={p.id} disabled={addingPerson || count === 0}
                        onClick={() => handleAddBulk(u =>
                          u.contractInfo?.assignment?.projectId === p.id || u.contractInfo?.assignment?.project === p.name, p.name)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-50 transition-colors text-left disabled:opacity-40">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <FolderKanban className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-700 truncate">{p.name}</p>
                          <p className="text-[10px] text-gray-400">{p.companyName || ''}{count === 0 ? ' · Todos ya añadidos' : ` · ${count} sin añadir`}</p>
                        </div>
                        {addingPerson ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 flex-shrink-0" /> : <Send className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Compose Dialog ── */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className={`w-full flex flex-col p-0 gap-0 transition-all duration-300
          ${composePreview
            ? 'max-w-full h-[100dvh] sm:max-w-[92vw] sm:h-[92dvh]'
            : 'max-w-lg max-h-[92dvh] sm:max-h-[90vh]'}`}>
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#008C3C]" /> Nuevo comunicado
              </DialogTitle>
              <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg p-0.5 flex-shrink-0">
                <button
                  onClick={() => setSenderKey('default')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                    ${senderKey === 'default' ? 'bg-white shadow-sm text-[#008C3C] border border-gray-200' : 'text-gray-400 hover:text-gray-600'}`}>
                  Inteegrados
                </button>
                <button
                  onClick={() => setSenderKey('inteegra')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                    ${senderKey === 'inteegra' ? 'bg-white shadow-sm text-blue-600 border border-gray-200' : 'text-gray-400 hover:text-gray-600'}`}>
                  Inteegra
                </button>
              </div>
            </div>
          </DialogHeader>

          {/* Mobile tab bar (only when preview is open) */}
          {composePreview && (
            <div className="flex sm:hidden border-b border-gray-100 flex-shrink-0">
              <button
                onClick={() => setPreviewTab('form')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${previewTab === 'form' ? 'text-[#008C3C] border-b-2 border-[#008C3C]' : 'text-gray-500'}`}>
                Formulario
              </button>
              <button
                onClick={() => setPreviewTab('preview')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${previewTab === 'preview' ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-500'}`}>
                Vista previa
              </button>
            </div>
          )}

          {/* Split container */}
          <div className={`flex-1 min-h-0 flex ${composePreview ? 'flex-col sm:flex-row' : 'flex-col overflow-y-auto'}`}>

            {/* ── Form side ── */}
            <div className={composePreview
              ? `shrink-0 overflow-y-auto border-gray-100 px-5 py-4 space-y-3
                 sm:w-[400px] sm:border-r
                 ${previewTab === 'preview' ? 'hidden sm:block' : 'block'}`
              : 'px-5 py-4 space-y-3'}>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Destinatarios *</Label>
                <Select value={form.targetType} onValueChange={v => {
                  setForm(f => ({ ...f, targetType: v, targetIds: [] }));
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
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500">Empresa(s) *</Label>
                  {form.targetIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 rounded-lg border border-gray-200">
                      {form.targetIds.map(id => {
                        const co = companies.find(c => c.id === id);
                        return co ? (
                          <span key={id} className="inline-flex items-center gap-1 text-xs bg-[#008C3C]/10 text-[#008C3C] px-2 py-1 rounded-full font-medium">
                            <Building2 className="w-3 h-3" />{co.name}
                            <button type="button" onClick={() => setForm(f => ({ ...f, targetIds: f.targetIds.filter(x => x !== id) }))} className="hover:text-red-600 ml-0.5"><X className="w-3 h-3" /></button>
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                  {form.targetIds.length < companies.filter(c => c.activeTH).length && (
                    <Select value="" onValueChange={v => { if (v) setForm(f => ({ ...f, targetIds: [...f.targetIds, v] })); }}>
                      <SelectTrigger><SelectValue placeholder="Agregar empresa..." /></SelectTrigger>
                      <SelectContent>
                        {companies.filter(c => c.activeTH && !form.targetIds.includes(c.id)).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {form.targetType === 'project' && (
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500">Proyecto(s) *</Label>
                  {form.targetIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 rounded-lg border border-gray-200">
                      {form.targetIds.map(id => {
                        const pr = projects.find(p => p.id === id);
                        return pr ? (
                          <span key={id} className="inline-flex items-center gap-1 text-xs bg-[#008C3C]/10 text-[#008C3C] px-2 py-1 rounded-full font-medium">
                            <FolderKanban className="w-3 h-3" />{pr.name}
                            <button type="button" onClick={() => setForm(f => ({ ...f, targetIds: f.targetIds.filter(x => x !== id) }))} className="hover:text-red-600 ml-0.5"><X className="w-3 h-3" /></button>
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                  {form.targetIds.length < projects.length && (
                    <Select value="" onValueChange={v => { if (v) setForm(f => ({ ...f, targetIds: [...f.targetIds, v] })); }}>
                      <SelectTrigger><SelectValue placeholder="Agregar proyecto..." /></SelectTrigger>
                      <SelectContent>
                        {projects.filter(p => !form.targetIds.includes(p.id)).map(p => <SelectItem key={p.id} value={p.id}>{p.name} · {p.companyName}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
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
            </div>{/* end form side */}

            {/* ── Preview side (live) ── */}
            {composePreview && (
              <div className={`flex-1 overflow-hidden flex flex-col bg-gray-50
                ${previewTab === 'form' ? 'hidden sm:flex' : 'flex'}`}>
                <div className="px-3 py-2 border-b border-gray-100 bg-white items-center gap-2 flex-shrink-0 hidden sm:flex">
                  <Eye className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-xs font-medium text-gray-500">Vista previa en vivo</span>
                  <span className="ml-auto text-[10px] text-gray-400">Se actualiza con cada cambio</span>
                </div>
                <iframe
                  title="live-preview"
                  srcDoc={debouncedPreviewHtml}
                  sandbox="allow-same-origin"
                  className="flex-1 w-full border-0"
                />
              </div>
            )}
          </div>{/* end split container */}

          <div className="flex flex-col-reverse sm:flex-row justify-between gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0 bg-white">
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" onClick={closeCompose} className="flex-1 sm:flex-none">Cancelar</Button>
              <Button variant="outline" onClick={() => { setComposePreview(p => !p); setPreviewTab('form'); }}
                className={`flex-1 sm:flex-none ${composePreview
                  ? 'border-blue-400 bg-blue-50 text-blue-700'
                  : 'border-blue-200 text-blue-600 hover:bg-blue-50'}`}>
                <Eye className="w-4 h-4 mr-1.5" />
                {composePreview ? 'Ocultar preview' : 'Vista previa'}
              </Button>
            </div>
            <Button onClick={handleSend} disabled={sending || !form.title.trim() || !form.body.trim() || recipientCount === 0}
              className="bg-[#008C3C] hover:bg-[#006C2F] text-white w-full sm:w-auto">
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Enviar a {recipientCount} persona{recipientCount !== 1 ? 's' : ''}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Email Preview Dialog ── */}
      {/* Confirm resend pending */}
      <Dialog open={!!resendConfirm} onOpenChange={open => { if (!open) setResendConfirm(null); }}>
        <DialogContent className="max-w-sm p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Send className="w-4 h-4 text-orange-500" /> Reenviar a pendientes
            </DialogTitle>
          </DialogHeader>
          {resendConfirm && (
            <>
              <p className="text-sm text-gray-600 mt-2">
                Se reenviará el correo a{' '}
                <span className="font-semibold text-orange-500">
                  {resendConfirm.totalSent - resendConfirm.totalRead} persona{resendConfirm.totalSent - resendConfirm.totalRead !== 1 ? 's' : ''}
                </span>{' '}
                que aún no han leído <span className="font-medium">"{resendConfirm.title}"</span>.
              </p>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" className="flex-1" onClick={() => setResendConfirm(null)}>Cancelar</Button>
                <Button
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                  disabled={resendingListId === resendConfirm.id}
                  onClick={() => handleResendFromList(resendConfirm)}>
                  {resendingListId === resendConfirm.id
                    ? <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    : <Send className="w-4 h-4 mr-1" />}
                  Reenviar
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit communication dialog ── */}
      <EditCommunicationDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        communication={editTarget}
        onSaved={updated => {
          setCommunications(prev => prev.map(c =>
            c.id === editTarget?.id ? { ...c, ...updated } : c
          ));
        }}
      />

      {/* ── Confirm send dialog ── */}
      <Dialog open={sendConfirmOpen} onOpenChange={setSendConfirmOpen}>
        <DialogContent className="max-w-sm p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Send className="w-4 h-4 text-[#008C3C]" /> Confirmar envío
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 mt-2">
            Se enviará el comunicado{' '}
            <span className="font-semibold">"{form.title}"</span>
            {' '}a{' '}
            <span className="font-semibold text-[#008C3C]">
              {recipientCount} persona{recipientCount !== 1 ? 's' : ''}
            </span>.
            {' '}Esta acción no se puede deshacer.
          </p>
          <div className="flex gap-2 mt-5">
            <Button variant="outline" className="flex-1" onClick={() => setSendConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button className="flex-1 bg-[#008C3C] hover:bg-[#006C2F] text-white" onClick={executeSend}>
              <Send className="w-4 h-4 mr-1.5" />
              Enviar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="w-full max-w-2xl h-[90dvh] flex flex-col p-0 gap-0 sm:rounded-2xl">
          <DialogHeader className="px-5 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Eye className="w-4 h-4 text-blue-600" /> Vista previa del correo
            </DialogTitle>
            <p className="text-xs text-gray-400 mt-0.5">Así verá el destinatario el correo. Los botones no son funcionales en esta vista.</p>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            <iframe
              title="preview-email"
              sandbox="allow-same-origin"
              className="w-full h-full border-0"
              srcDoc={previewHtml}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
