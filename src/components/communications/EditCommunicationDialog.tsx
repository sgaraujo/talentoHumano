import { useState, useEffect, useRef } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Paperclip, X, FileText, Image as ImageIcon, Link, Save } from 'lucide-react';
import { toast } from 'sonner';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/config/firebase';
import { communicationService } from '@/services/communicationService';
import type { Communication } from '@/models/types/Communication';

interface Attachment {
  name: string;
  url: string;
  uploading?: boolean;
  progress?: number;
  link?: string;
  _file?: File;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communication: Communication | null;
  onSaved: (updated: Partial<Communication>) => void;
}

export const EditCommunicationDialog = ({ open, onOpenChange, communication, onSaved }: Props) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [ctaEnabled, setCtaEnabled] = useState(false);
  const [ctaText, setCtaText] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && communication) {
      setTitle(communication.title);
      setBody(communication.body);
      setAttachments((communication.attachments ?? []).map(a => ({ ...a })));
      if (communication.ctaButton) {
        setCtaEnabled(true);
        setCtaText(communication.ctaButton.text);
        setCtaUrl(communication.ctaButton.url);
      } else {
        setCtaEnabled(false);
        setCtaText('');
        setCtaUrl('');
      }
    }
  }, [open, communication]);

  const uploadFile = async (file: File, idx: number) => {
    const storageRef = ref(storage, `comunicados/${Date.now()}_${file.name}`);
    const task = uploadBytesResumable(storageRef, file);
    task.on(
      'state_changed',
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
        setAttachments(prev => prev.map((a, i) => i === idx ? { ...a, url, uploading: false, progress: 100, _file: undefined } : a));
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
        next.push({ name: file.name, url: '', uploading: true, progress: 0, _file: file });
        setTimeout(() => uploadFile(file, idx), 0);
      });
      return next;
    });
    e.target.value = '';
  };

  const handleRemoveAttachment = async (idx: number) => {
    const att = attachments[idx];
    if (att.url && !att._file) {
      try { await deleteObject(ref(storage, att.url)); } catch { /* already gone */ }
    }
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!communication) return;
    if (!title.trim() || !body.trim()) { toast.error('Asunto y mensaje son obligatorios'); return; }
    if (attachments.some(a => a.uploading)) { toast.error('Espera a que terminen de subir los archivos'); return; }
    setSaving(true);
    try {
      const cleanAttachments = attachments.map(({ name, url, link }) => ({
        name, url, ...(link ? { link } : {}),
      }));
      const ctaButton = ctaEnabled && ctaText.trim() && ctaUrl.trim()
        ? { text: ctaText.trim(), url: ctaUrl.trim() }
        : null;
      await communicationService.updateContent(communication.id, {
        title: title.trim(),
        body: body.trim(),
        attachments: cleanAttachments,
        ctaButton,
      });
      toast.success('Comunicado actualizado');
      onSaved({ title: title.trim(), body: body.trim(), attachments: cleanAttachments, ctaButton: ctaButton ?? undefined });
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Error al guardar', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  if (!communication) return null;

  const isImage = (name: string) => /\.(jpe?g|png|gif|webp|svg)$/i.test(name);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Editar comunicado</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Asunto</label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Asunto del comunicado"
            />
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Mensaje</label>
            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Escribe el contenido del comunicado..."
              rows={8}
              className="resize-none"
            />
          </div>

          {/* CTA button */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-cta"
                checked={ctaEnabled}
                onChange={e => setCtaEnabled(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="edit-cta" className="text-sm font-medium text-gray-700 cursor-pointer">
                Botón de acción (CTA)
              </label>
            </div>
            {ctaEnabled && (
              <div className="grid grid-cols-2 gap-2 pl-5">
                <Input value={ctaText} onChange={e => setCtaText(e.target.value)} placeholder="Texto del botón" />
                <div className="relative">
                  <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <Input value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} placeholder="https://..." className="pl-8" />
                </div>
              </div>
            )}
          </div>

          {/* Attachments */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Archivos adjuntos</label>
              {attachments.length < 3 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-md hover:bg-gray-100 transition-colors"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  Adjuntar archivo
                </button>
              )}
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
            </div>

            {attachments.length > 0 && (
              <div className="space-y-2">
                {attachments.map((att, i) => (
                  <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${att.uploading ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                    {isImage(att.name)
                      ? <ImageIcon className="w-4 h-4 text-gray-400 shrink-0" />
                      : <FileText className="w-4 h-4 text-gray-400 shrink-0" />}
                    <span className="flex-1 truncate text-gray-700">{att.name}</span>
                    {att.uploading
                      ? <span className="text-xs text-blue-500">{att.progress ?? 0}%</span>
                      : (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={att.link ?? ''}
                            onChange={e => setAttachments(prev => prev.map((a, j) => j === i ? { ...a, link: e.target.value } : a))}
                            placeholder="URL al hacer clic (opcional)"
                            className="text-xs border border-gray-200 rounded px-2 py-0.5 w-44 focus:outline-none focus:ring-1 focus:ring-gray-300"
                          />
                          <button onClick={() => handleRemoveAttachment(i)} className="text-gray-400 hover:text-red-500">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !title.trim() || !body.trim()}
            className="bg-[#008C3C] hover:bg-[#006C2F] text-white"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
