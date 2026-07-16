import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Send, Loader2, Users, Mail, Image, X, Plus,
  Eye, Paperclip, CheckCircle2, Search, History, ChevronDown, ChevronUp, BarChart2,
  Copy, RefreshCw,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { functions, storage, db } from '@/config/firebase';
import { FIRESTORE_COLLECTIONS } from '@/config/firestoreCollections';
import { userService } from '@/services/userService';
import { companyService } from '@/services/companyService';
import { projectService } from '@/services/projectService';
import { rolesService } from '@/services/rolesService';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

// ── Plantilla de correo Contabilidad ─────────────────────────────────────────
function buildPreview(title: string, body: string, attachments: { name: string; url: string }[]) {
  const dateStr = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const year = new Date().getFullYear();
  const isImage = (n: string) => /\.(jpe?g|png|gif|webp|svg)$/i.test(n);

  const attRows = attachments.map(a => isImage(a.name) ? `
    <tr><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;text-align:center">
      <img src="${a.url}" alt="${a.name}" style="max-width:100%;height:auto;border-radius:8px;border:1px solid #e5e7eb;display:block;margin:0 auto"/>
    </td></tr>` : `
    <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6">
      <span style="font-size:14px;margin-right:8px">📎</span>
      <span style="font-size:13px;color:#374151">${a.name}</span>
    </td></tr>`).join('');

  const attSection = attachments.length ? `
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#f8faff;border:1px solid #dbeafe;border-radius:10px;padding:4px 16px;margin:24px 0">
      <tr><td style="padding:12px 0 4px">
        <p style="margin:0;font-size:11px;color:#3b82f6;text-transform:uppercase;font-weight:700;letter-spacing:1px">Archivos adjuntos</p>
      </td></tr>
      ${attRows}
    </table>` : '';

  const bodyHtml = body.split('\n').filter(l => l.trim())
    .map(l => `<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.7">${l}</p>`).join('');

  return `<!DOCTYPE html>
<html lang="es" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f1f5f9">
<tr><td align="center" style="padding:28px 16px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" style="max-width:600px" cellpadding="0" cellspacing="0">

  <!-- HEADER azul contabilidad -->
  <tr><td bgcolor="#1e3a5f" style="background-color:#1e3a5f;padding:32px 32px 24px;text-align:center">
    <!-- ícono calculadora -->
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 16px">
      <tr><td bgcolor="#2563eb" style="background-color:#2563eb;width:56px;height:56px;border-radius:14px;text-align:center;vertical-align:middle">
        <span style="font-size:28px;line-height:56px">🧾</span>
      </td></tr>
    </table>
    <p style="margin:0 0 2px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#93c5fd;letter-spacing:3px;text-transform:uppercase">Comunicado Oficial</p>
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:1px">Equipo de Contabilidad</p>
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:14px auto 0">
      <tr><td bgcolor="#3b82f6" style="background-color:#3b82f6;height:2px;width:48px;font-size:0;line-height:0">&nbsp;</td></tr>
    </table>
    <p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#93c5fd">${dateStr}</p>
  </td></tr>

  <!-- SUBJECT BAR -->
  <tr><td bgcolor="#2563eb" style="background-color:#2563eb;padding:14px 32px">
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#ffffff">${title || '(Sin título)'}</p>
  </td></tr>

  <!-- BODY -->
  <tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:32px 32px 24px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0">
    <p style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#374151">
      Estimado/a <strong>colaborador/a</strong>,
    </p>
    <div>${bodyHtml || '<p style="color:#9ca3af;font-size:15px">Sin contenido</p>'}</div>
    ${attSection}
  </td></tr>

  <!-- FIRMA -->

  <!-- FOOTER -->
  <tr><td bgcolor="#1e3a5f" style="background-color:#1e3a5f;padding:20px 32px;text-align:center">
    <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:1px;color:#ffffff">Equipo de Contabilidad</p>
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#64748b">
      Mensaje confidencial &middot; &copy; ${year} · Todos los derechos reservados
    </p>
  </td></tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body></html>`;
}

// ── Page ──────────────────────────────────────────────────────────────────────
export const AccountingMessagesPage = () => {
  const { user } = useAuth();

  const [allUsers,   setAllUsers]   = useState<any[]>([]);
  const [companies,  setCompanies]  = useState<any[]>([]);
  const [projects,   setProjects]   = useState<any[]>([]);
  const [senderName, setSenderName] = useState('');
  const [loading,    setLoading]    = useState(true);

  // Compose state
  const [targetType,  setTargetType]  = useState<'all'|'company'|'project'|'manual'>('all');
  const [targetIds,   setTargetIds]   = useState<string[]>([]);
  const [empSearch,   setEmpSearch]   = useState('');
  const [manualUsers, setManualUsers] = useState<any[]>([]);
  const [subject,     setSubject]     = useState('');
  const [body,        setBody]        = useState('');
  const [sending,     setSending]     = useState(false);
  const [sent,        setSent]        = useState(false);

  // Attachments
  const [attachments, setAttachments] = useState<{
    file: File; name: string; url?: string; progress: number; uploading: boolean;
  }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Preview
  const [previewOpen, setPreviewOpen] = useState(false);

  // Ref para scroll al editor
  const composeRef = useRef<HTMLDivElement>(null);

  // History
  const [history,          setHistory]          = useState<any[]>([]);
  const [historyOpen,      setHistoryOpen]      = useState(false);
  const [historyLoading,   setHistoryLoading]   = useState(false);
  const [expandedHistory,  setExpandedHistory]  = useState<Set<string>>(new Set());
  const [resending,        setResending]        = useState<string | null>(null);

  // Stats
  const [statsData,    setStatsData]    = useState<any[]>([]);
  const [statsOpen,    setStatsOpen]    = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const q = query(collection(db, FIRESTORE_COLLECTIONS.accountingMessageLog), orderBy('sentAt', 'desc'), limit(30));
      const snap = await getDocs(q);
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { /* ignore */ } finally { setHistoryLoading(false); }
  };

  const cargarEnEditor = (m: any) => {
    setSubject(m.subject || '');
    setBody(m.body || '');
    setSent(false);
    composeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast.success('Mensaje cargado en el editor');
  };

  const reenviar = async (m: any) => {
    if (!m.recipients?.length) { toast.error('Sin destinatarios guardados'); return; }
    setResending(m.id);
    try {
      const fn = httpsCallable(functions, 'sendAccountingMessage');
      const recipientList = m.recipients.map((email: string) => ({ name: email.split('@')[0], email }));
      await fn({ subject: m.subject, body: m.body, recipients: recipientList, attachments: [] });
      toast.success('Mensaje reenviado', { description: `${m.recipients.length} destinatario${m.recipients.length !== 1 ? 's' : ''}` });
      loadHistory();
    } catch (e: any) {
      toast.error('Error al reenviar', { description: e?.message });
    } finally { setResending(null); }
  };

  const loadStats = async () => {
    if (statsData.length > 0) return;
    setStatsLoading(true);
    try {
      const snap = await getDocs(query(collection(db, FIRESTORE_COLLECTIONS.accountingMessageLog), orderBy('sentAt', 'desc')));
      setStatsData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { /* ignore */ } finally { setStatsLoading(false); }
  };

  const statsCards = useMemo(() => {
    const total = statsData.length;
    const totalDest = statsData.reduce((s, m) => s + (m.recipientCount ?? m.recipients?.length ?? 0), 0);
    const ultimo = statsData[0]?.sentAt?.toDate?.() ?? null;
    const promedio = total > 0 ? Math.round(totalDest / total) : 0;
    return { total, totalDest, ultimo, promedio };
  }, [statsData]);

  const statsMonthly = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string; mensajes: number; destinatarios: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' }),
        mensajes: 0, destinatarios: 0,
      });
    }
    for (const m of statsData) {
      const date = m.sentAt?.toDate?.();
      if (!date) continue;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const entry = months.find(mo => mo.key === key);
      if (entry) { entry.mensajes++; entry.destinatarios += m.recipientCount ?? m.recipients?.length ?? 0; }
    }
    return months;
  }, [statsData]);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      userService.getAll(),
      companyService.getAll(),
      projectService.getAll(),
    ]).then(([users, comps, projs]) => {
      setAllUsers(users);
      setCompanies(comps.filter((c: any) => c.active).sort((a: any, b: any) => a.name.localeCompare(b.name, 'es')));
      setProjects(projs.sort((a: any, b: any) => a.name.localeCompare(b.name, 'es')));
    }).catch(() => {}).finally(() => setLoading(false));

    if (user?.email) {
      rolesService.getByEmail(user.email).then(p => { if (p?.name) setSenderName(p.name); }).catch(() => {});
    }
  }, [user?.email]);

  // ── Resolve recipients ────────────────────────────────────────────────────
  const empResults = useMemo(() => {
    if (empSearch.trim().length < 2) return [];
    const q = empSearch.toLowerCase();
    const sel = new Set(manualUsers.map(u => u.id));
    return allUsers.filter(u => !sel.has(u.id) && u.fullName?.toLowerCase().includes(q)).slice(0, 12);
  }, [empSearch, allUsers, manualUsers]);

  const recipients = useMemo(() => {
    if (targetType === 'manual') {
      return manualUsers.map(u => ({
        userId: u.id, userName: u.fullName,
        userEmail: u.location?.corporateEmail || u.location?.personalEmail || u.email,
        company: u.contractInfo?.assignment?.company || '',
        project: u.contractInfo?.assignment?.project || '',
      })).filter(u => u.userEmail);
    }
    let users = allUsers.filter(u => u.role === 'colaborador' || u.role === 'lider');
    if (targetType === 'company' && targetIds.length > 0) {
      const normCo = (s: string) => s.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
      const namesNorm = new Set(
        targetIds
          .map(id => companies.find((c: any) => c.id === id)?.name)
          .filter(Boolean)
          .map((n: string) => normCo(n))
      );
      users = users.filter(u => namesNorm.has(normCo(u.contractInfo?.assignment?.company || '')));
    }
    if (targetType === 'project' && targetIds.length > 0) {
      const names = targetIds.map(id => projects.find((p: any) => p.id === id)?.name).filter(Boolean);
      users = users.filter(u =>
        targetIds.some(id => u.projectIds?.includes(id)) ||
        names.includes(u.contractInfo?.assignment?.project)
      );
    }
    const mapped = users.map(u => ({
      userId:    u.id,
      userName:  u.fullName,
      userEmail: (u.location?.corporateEmail || u.location?.personalEmail || u.email || '').trim().toLowerCase(),
      company:   u.contractInfo?.assignment?.company || '',
      project:   u.contractInfo?.assignment?.project || '',
    })).filter(u => u.userEmail);

    // Dedup por email — evita envíos duplicados si el usuario aparece varias veces
    const seen = new Set<string>();
    return mapped.filter(u => { if (seen.has(u.userEmail)) return false; seen.add(u.userEmail); return true; });
  }, [allUsers, companies, projects, targetType, targetIds, manualUsers]);

  // ── File upload ───────────────────────────────────────────────────────────
  const compressIfImage = (file: File): Promise<File> =>
    new Promise(resolve => {
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
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, `.${ext}`), { type: file.type === 'image/png' ? 'image/png' : 'image/jpeg' }));
        }, file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.82);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });

  const uploadFile = async (file: File, idx: number) => {
    const compressed = await compressIfImage(file);
    const storageRef = ref(storage, `accounting_messages/${Date.now()}_${compressed.name}`);
    const task = uploadBytesResumable(storageRef, compressed);
    task.on('state_changed',
      snap => {
        const pct = Math.round(snap.bytesTransferred / snap.totalBytes * 100);
        setAttachments(prev => prev.map((a, i) => i === idx ? { ...a, progress: pct } : a));
      },
      () => { setAttachments(prev => prev.map((a, i) => i === idx ? { ...a, uploading: false } : a)); toast.error(`Error subiendo ${file.name}`); },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        setAttachments(prev => prev.map((a, i) => i === idx ? { ...a, url, uploading: false, progress: 100 } : a));
      }
    );
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (attachments.length + files.length > 3) { toast.error('Máximo 3 archivos'); return; }
    setAttachments(prev => {
      const next = [...prev];
      files.forEach(file => {
        if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name} supera los 10 MB`); return; }
        const idx = next.length;
        next.push({ file, name: file.name, progress: 0, uploading: true });
        setTimeout(() => uploadFile(file, idx), 0);
      });
      return next;
    });
    e.target.value = '';
  };

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!subject.trim() || !body.trim() || recipients.length === 0) return;
    if (attachments.some(a => a.uploading)) { toast.error('Espera a que terminen de subir los archivos'); return; }
    setSending(true);
    try {
      const fn = httpsCallable(functions, 'sendAccountingMessage');
      const atts = attachments.filter(a => a.url).map(a => ({ name: a.name, url: a.url! }));
      const recipientList = recipients.map((r: any) => ({
        name:  r.userName || r.name || r.userEmail || r.email,
        email: r.userEmail || r.email,
      })).filter((r: any) => r.email);
      await fn({ subject, body, recipients: recipientList, attachments: atts });
      setSent(true);
      toast.success('Mensaje enviado', { description: `${recipients.length} destinatario${recipients.length !== 1 ? 's' : ''}` });
    } catch (e: any) {
      toast.error('Error al enviar', { description: e.message });
    } finally {
      setSending(false);
    }
  };

  const handleReset = () => {
    setSubject(''); setBody(''); setTargetType('all');
    setTargetIds([]); setAttachments([]); setSent(false);
  };

  // ── Attachments preview urls ──────────────────────────────────────────────
  const previewAttachments = attachments.filter(a => a.url).map(a => ({ name: a.name, url: a.url! }));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-screen">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#4A4A4A] flex items-center gap-2">
          <Send className="w-7 h-7 text-[#008C3C]" />
          Mensajes
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Envía comunicados a las personas de las empresas · desde <span className="font-medium">lguio@triangulum.net.co</span>
        </p>
      </div>

      <div ref={composeRef} />

      {sent ? (
        /* ── Confirmación ── */
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-gray-100 shadow-sm p-10 flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-800">¡Mensaje enviado!</p>
            <p className="text-sm text-gray-500 mt-1">
              Enviado a <span className="font-semibold">{recipients.length} persona{recipients.length !== 1 ? 's' : ''}</span> correctamente.
            </p>
          </div>
          <Button onClick={handleReset} className="bg-[#008C3C] hover:bg-[#006C2F] text-white mt-2">
            Enviar otro mensaje
          </Button>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 max-w-6xl">

          {/* ── Panel izquierdo: destinatarios ── */}
          <div className="space-y-4">

            {/* Targeting */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Destinatarios
              </p>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-gray-500 mb-1.5 block">Enviar a</Label>
                  <Select value={targetType} onValueChange={v => { setTargetType(v as any); setTargetIds([]); setManualUsers([]); setEmpSearch(''); }}>
                    <SelectTrigger className="border-gray-200 focus:ring-[#008C3C] text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los colaboradores</SelectItem>
                      <SelectItem value="company">Por empresa</SelectItem>
                      <SelectItem value="project">Por proyecto</SelectItem>
                      <SelectItem value="manual">Por colaborador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Multi-select empresa */}
                {targetType === 'company' && (
                  <div>
                    <Label className="text-xs text-gray-500 mb-1.5 block">Empresas</Label>
                    <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                      {companies.map((c: any) => (
                        <label key={c.id} className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors
                          ${targetIds.includes(c.id) ? 'bg-[#008C3C]/5' : ''}`}>
                          <input type="checkbox" className="accent-[#008C3C]"
                            checked={targetIds.includes(c.id)}
                            onChange={e => setTargetIds(prev =>
                              e.target.checked ? [...prev, c.id] : prev.filter(x => x !== c.id)
                            )} />
                          <span className="text-sm text-gray-700 flex-1 truncate">{c.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Multi-select proyecto */}
                {targetType === 'project' && (
                  <div>
                    <Label className="text-xs text-gray-500 mb-1.5 block">Proyectos</Label>
                    <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                      {projects.map((p: any) => (
                        <label key={p.id} className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors
                          ${targetIds.includes(p.id) ? 'bg-[#008C3C]/5' : ''}`}>
                          <input type="checkbox" className="accent-[#008C3C]"
                            checked={targetIds.includes(p.id)}
                            onChange={e => setTargetIds(prev =>
                              e.target.checked ? [...prev, p.id] : prev.filter(x => x !== p.id)
                            )} />
                          <span className="text-sm text-gray-700 flex-1 truncate">{p.name}</span>
                          {p.companyName && <span className="text-[10px] text-gray-400 flex-shrink-0 truncate max-w-[80px]">{p.companyName}</span>}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {/* Manual — buscador por nombre */}
                {targetType === 'manual' && (
                  <div>
                    <Label className="text-xs text-gray-500 mb-1.5 block">Buscar colaborador</Label>
                    <div className="relative mb-2">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                      <input
                        className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008C3C]"
                        placeholder="Nombre del colaborador…"
                        value={empSearch}
                        onChange={e => setEmpSearch(e.target.value)}
                      />
                    </div>
                    {empResults.length > 0 && (
                      <div className="border border-gray-200 rounded-lg mb-2 max-h-40 overflow-y-auto">
                        {empResults.map(u => (
                          <button key={u.id} type="button"
                            onClick={() => { setManualUsers(prev => [...prev, u]); setEmpSearch(''); }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-[#008C3C]/10 flex items-center justify-center text-[10px] font-bold text-[#008C3C] flex-shrink-0">
                              {u.fullName?.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{u.fullName}</p>
                              <p className="text-[11px] text-gray-400 truncate">{u.contractInfo?.assignment?.company}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {manualUsers.length > 0 && (
                      <div className="space-y-1">
                        {manualUsers.map(u => (
                          <div key={u.id} className="flex items-center gap-2 bg-[#008C3C]/5 border border-[#008C3C]/20 rounded-lg px-2.5 py-1.5">
                            <div className="w-5 h-5 rounded-full bg-[#008C3C]/20 flex items-center justify-center text-[9px] font-bold text-[#008C3C] flex-shrink-0">
                              {u.fullName?.charAt(0)}
                            </div>
                            <span className="text-xs text-gray-700 flex-1 truncate">{u.fullName}</span>
                            <button type="button" onClick={() => setManualUsers(prev => prev.filter(x => x.id !== u.id))}
                              className="text-gray-300 hover:text-red-500 transition-colors">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {manualUsers.length === 0 && empSearch.length < 2 && (
                      <p className="text-xs text-gray-400 text-center py-2">Escribe al menos 2 caracteres para buscar</p>
                    )}
                  </div>
                )}

              </div>
            </div>

            {/* Recipients summary */}
            <div className={`rounded-xl border p-4 shadow-sm transition-all
              ${recipients.length > 0 ? 'bg-[#008C3C]/5 border-[#008C3C]/20' : 'bg-white border-gray-100'}`}>
              <div className="flex items-center gap-2">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0
                  ${recipients.length > 0 ? 'bg-[#008C3C]' : 'bg-gray-100'}`}>
                  <Users className={`w-4 h-4 ${recipients.length > 0 ? 'text-white' : 'text-gray-400'}`} />
                </div>
                <div>
                  <p className={`text-2xl font-bold ${recipients.length > 0 ? 'text-[#008C3C]' : 'text-gray-400'}`}>
                    {recipients.length}
                  </p>
                  <p className="text-xs text-gray-500">destinatario{recipients.length !== 1 ? 's' : ''} seleccionado{recipients.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              {recipients.length > 0 && (
                <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
                  {recipients.slice(0, 5).map(r => (
                    <div key={r.userId} className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-[#008C3C]/20 flex items-center justify-center text-[9px] font-bold text-[#008C3C] flex-shrink-0">
                        {r.userName.charAt(0)}
                      </div>
                      <span className="text-xs text-gray-600 truncate">{r.userName}</span>
                    </div>
                  ))}
                  {recipients.length > 5 && (
                    <p className="text-xs text-gray-400 pl-7">+{recipients.length - 5} más</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Panel derecho: compositor ── */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> Componer mensaje
              </p>

              {/* Asunto */}
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500 uppercase font-semibold tracking-wide">Asunto</Label>
                <Input
                  placeholder="Escribe el asunto del mensaje..."
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="border-gray-200 focus-visible:ring-[#008C3C]"
                />
              </div>

              {/* Cuerpo */}
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500 uppercase font-semibold tracking-wide">Mensaje</Label>
                <Textarea
                  rows={8}
                  placeholder="Escribe el contenido del mensaje..."
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  className="border-gray-200 focus-visible:ring-[#008C3C] resize-none"
                />
              </div>

              {/* Adjuntos */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-gray-500 uppercase font-semibold tracking-wide flex items-center gap-1">
                    <Paperclip className="w-3 h-3" /> Adjuntos (imágenes / archivos)
                  </Label>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={attachments.length >= 3}
                    className="flex items-center gap-1 text-xs text-[#008C3C] hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3 h-3" /> Agregar
                  </button>
                  <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.xlsx,.docx" className="hidden" onChange={handleFileSelect} />
                </div>

                {attachments.length > 0 && (
                  <div className="space-y-2">
                    {attachments.map((att, i) => {
                      const isImg = /\.(jpe?g|png|gif|webp|svg)$/i.test(att.name);
                      return (
                        <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                          {isImg ? <Image className="w-4 h-4 text-blue-500 flex-shrink-0" /> : <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                          <span className="text-sm text-gray-700 flex-1 truncate">{att.name}</span>
                          {att.uploading ? (
                            <span className="text-xs text-gray-400">{att.progress}%</span>
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                          )}
                          <button type="button" onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                            className="text-gray-300 hover:text-red-500 transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Sender info */}
              <div className="flex items-center gap-2 px-3 py-2 bg-[#008C3C]/5 border border-[#008C3C]/20 rounded-lg">
                <Mail className="w-3.5 h-3.5 text-[#008C3C] flex-shrink-0" />
                <p className="text-xs text-[#008C3C]">
                  Se enviará desde <span className="font-semibold">lguio@triangulum.net.co</span>
                  {senderName && <> · remitente: <span className="font-semibold">{senderName}</span></>}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={() => setPreviewOpen(true)}
                  disabled={!subject.trim() && !body.trim()}
                  className="flex items-center gap-1.5 border-gray-200"
                >
                  <Eye className="w-4 h-4" /> Vista previa
                </Button>
                <Button
                  onClick={handleSend}
                  disabled={sending || recipients.length === 0 || !subject.trim() || !body.trim() || attachments.some(a => a.uploading)}
                  className="flex-1 bg-[#008C3C] hover:bg-[#006C2F] text-white"
                >
                  {sending
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                    : <><Send className="w-4 h-4 mr-2" /> Enviar a {recipients.length} persona{recipients.length !== 1 ? 's' : ''}</>}
                </Button>
              </div>

              {recipients.length === 0 && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
                  Selecciona al menos una empresa o proyecto para habilitar el envío
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Preview dialog ── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-[#008C3C]" />
              Vista previa del correo
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto rounded-lg border border-gray-200">
            <iframe
              srcDoc={buildPreview(subject, body, previewAttachments)}
              className="w-full"
              style={{ height: '520px', border: 'none' }}
              title="preview"
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Estadísticas ── */}
      <div className="mt-6 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          onClick={() => { setStatsOpen(o => !o); if (!statsOpen) loadStats(); }}
          className="w-full flex items-center gap-2 px-5 py-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <BarChart2 className="w-4 h-4 text-gray-400" />
          Estadísticas de envíos
          {statsOpen ? <ChevronUp className="w-4 h-4 ml-auto text-gray-400" /> : <ChevronDown className="w-4 h-4 ml-auto text-gray-400" />}
        </button>
        {statsOpen && (
          <div className="border-t border-gray-100 p-5">
            {statsLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-gray-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Calculando...
              </div>
            ) : (
              <>
                {/* Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  {[
                    { label: 'Mensajes enviados', value: statsCards.total, color: 'text-[#008C3C]', bg: 'bg-[#008C3C]/5' },
                    { label: 'Destinatarios alcanzados', value: statsCards.totalDest, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Promedio por envío', value: statsCards.promedio, color: 'text-purple-600', bg: 'bg-purple-50' },
                    {
                      label: 'Último envío',
                      value: statsCards.ultimo
                        ? statsCards.ultimo.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—',
                      color: 'text-amber-600', bg: 'bg-amber-50',
                    },
                  ].map(c => (
                    <div key={c.label} className={`${c.bg} rounded-xl p-4 flex flex-col gap-1`}>
                      <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
                      <p className="text-xs text-gray-500 leading-tight">{c.label}</p>
                    </div>
                  ))}
                </div>
                {/* Gráfica mensual */}
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Últimos 6 meses</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={statsMonthly} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      formatter={(value, name) =>
                        [value, name === 'mensajes' ? 'Mensajes' : 'Destinatarios']}
                      labelStyle={{ fontSize: 12 }}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Bar dataKey="mensajes" fill="#008C3C" radius={[4,4,0,0]} name="Mensajes" />
                    <Bar dataKey="destinatarios" fill="#93c5fd" radius={[4,4,0,0]} name="Destinatarios" />
                  </BarChart>
                </ResponsiveContainer>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Historial ── */}
      <div className="mt-4 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          onClick={() => { setHistoryOpen(o => !o); if (!historyOpen) loadHistory(); }}
          className="w-full flex items-center gap-2 px-5 py-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <History className="w-4 h-4 text-gray-400" />
          Historial de mensajes enviados
          {historyOpen ? <ChevronUp className="w-4 h-4 ml-auto text-gray-400" /> : <ChevronDown className="w-4 h-4 ml-auto text-gray-400" />}
        </button>
        {historyOpen && (
          <div className="border-t border-gray-100">
            {historyLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-gray-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
              </div>
            ) : history.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">Sin mensajes enviados aún.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {history.map(m => {
                  const date = m.sentAt?.toDate?.() ?? null;
                  const dateStr = date
                    ? date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
                      + ' ' + date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
                    : '—';
                  const count = m.recipientCount ?? m.recipients?.length ?? 0;
                  const isExpanded = expandedHistory.has(m.id);
                  return (
                    <div key={m.id}>
                      {/* Fila principal — clic para expandir */}
                      <button
                        className="w-full px-5 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors text-left"
                        onClick={() => setExpandedHistory(prev => {
                          const next = new Set(prev);
                          next.has(m.id) ? next.delete(m.id) : next.add(m.id);
                          return next;
                        })}
                      >
                        <Mail className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{m.subject}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {dateStr} · {count} destinatario{count !== 1 ? 's' : ''}
                            {m.sentBy && m.sentBy !== 'unknown' ? ` · ${m.sentBy}` : ''}
                          </p>
                        </div>
                        {isExpanded
                          ? <ChevronUp className="w-4 h-4 text-gray-300 mt-0.5 flex-shrink-0" />
                          : <ChevronDown className="w-4 h-4 text-gray-300 mt-0.5 flex-shrink-0" />}
                      </button>

                      {/* Panel expandido */}
                      {isExpanded && (
                        <div className="px-5 pb-4 bg-gray-50 border-t border-gray-100">
                          {m.body ? (
                            <div className="mt-3 text-sm text-gray-600 whitespace-pre-line bg-white border border-gray-100 rounded-lg p-3 max-h-48 overflow-y-auto leading-relaxed">
                              {m.body}
                            </div>
                          ) : (
                            <p className="mt-3 text-xs text-gray-400 italic">Sin cuerpo guardado.</p>
                          )}
                          {m.attachments?.length > 0 && (
                            <p className="mt-2 text-xs text-gray-400">
                              📎 {(m.attachments as string[]).join(', ')}
                            </p>
                          )}
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => cargarEnEditor(m)}
                              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                              <Copy className="w-3 h-3" /> Cargar en editor
                            </button>
                            <button
                              onClick={() => reenviar(m)}
                              disabled={resending === m.id}
                              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#008C3C] text-white hover:bg-[#007a34] transition-colors disabled:opacity-50"
                            >
                              {resending === m.id
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <RefreshCw className="w-3 h-3" />}
                              Reenviar a mismos destinatarios
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
};
