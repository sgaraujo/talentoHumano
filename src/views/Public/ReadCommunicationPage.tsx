import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Loader2, CheckCircle2, Mail, AlertCircle, Paperclip,
  Download, MousePointerClick, ClipboardList,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { communicationService } from '@/services/communicationService';
import type { Communication, CommunicationRecipient } from '@/models/types/Communication';

export const ReadCommunicationPage = () => {
  const { token } = useParams<{ token: string }>();
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [communication, setCommunication] = useState<Communication | null>(null);
  const [recipient,     setRecipient]     = useState<CommunicationRecipient | null>(null);
  const [acknowledged,  setAcknowledged]  = useState(false);
  const [acking,        setAcking]        = useState(false);

  useEffect(() => {
    if (!token) { setError('Enlace inválido'); setLoading(false); return; }

    communicationService.getByToken(token)
      .then(async result => {
        if (!result) { setError('Este enlace no es válido o ya expiró'); return; }
        setCommunication(result.communication);
        setRecipient(result.recipient);
        if (result.recipient.status !== 'read') {
          await communicationService.markAsRead(result.recipient.id, result.communication.id);
        }
        if (result.recipient.ackAt) setAcknowledged(true);
      })
      .catch(() => setError('Ocurrió un error al cargar el comunicado'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAck = async () => {
    if (!recipient) return;
    setAcking(true);
    try {
      await communicationService.markAsAcknowledged(recipient.id);
      setAcknowledged(true);
    } finally {
      setAcking(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" />
    </div>
  );

  if (error || !communication || !recipient) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-sm w-full text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h2 className="font-bold text-[#4A4A4A] text-lg mb-1">Enlace no válido</h2>
        <p className="text-sm text-gray-500">{error || 'No se encontró el comunicado'}</p>
      </div>
    </div>
  );

  const isImg = (name: string) => /\.(jpe?g|png|gif|webp|svg)$/i.test(name);
  const baseUrl = window.location.origin;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Branding */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-[#008C3C] flex items-center justify-center">
            <Mail className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-[#008C3C] text-lg">Inteegrados</span>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

          {/* Header */}
          <div className="bg-[#008C3C] px-6 py-5">
            <p className="text-xs text-white/70 uppercase tracking-wide mb-1">Comunicado oficial</p>
            <h1 className="text-xl font-bold text-white">{communication.title}</h1>
            <p className="text-white/70 text-xs mt-1">
              {communication.sentAt.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          </div>

          {/* Greeting */}
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <p className="text-sm text-gray-600">
              Hola <span className="font-semibold text-[#4A4A4A]">{recipient.userName}</span>, tienes un mensaje de tu empresa:
            </p>
          </div>

          {/* Body */}
          <div className="px-6 py-5">
            <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {communication.body}
            </div>
          </div>

          {/* CTA Button (custom) */}
          {communication.ctaButton && (
            <div className="px-6 py-4 border-t border-gray-100 bg-purple-50 flex items-center justify-center">
              <a
                href={communication.ctaButton.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm px-6 py-3 rounded-xl transition-colors"
              >
                <MousePointerClick className="w-4 h-4" />
                {communication.ctaButton.text}
              </a>
            </div>
          )}

          {/* Attachments */}
          {communication.attachments && communication.attachments.length > 0 && (
            <div className="px-6 py-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5" /> Archivos adjuntos
              </p>
              <div className="space-y-3">
                {communication.attachments.map((att, i) =>
                  isImg(att.name) ? (
                    <a key={i} href={att.link || att.url} target="_blank" rel="noopener noreferrer" className="block">
                      <img src={att.url} alt={att.name} loading="lazy" decoding="async"
                        className="w-full rounded-lg border border-gray-100 object-contain max-h-[400px] bg-gray-100 hover:opacity-90 transition-opacity" />
                    </a>
                  ) : (
                    <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-100 hover:bg-[#008C3C]/5 hover:border-[#008C3C]/20 transition-colors group">
                      <Paperclip className="w-4 h-4 text-gray-400 group-hover:text-[#008C3C]" />
                      <span className="flex-1 text-sm text-gray-700 truncate">{att.name}</span>
                      <Download className="w-4 h-4 text-gray-300 group-hover:text-[#008C3C]" />
                    </a>
                  )
                )}
              </div>
            </div>
          )}

          {/* Questionnaire button */}
          {recipient.quizToken && (
            <div className="px-6 py-4 border-t border-amber-100 bg-amber-50">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList className="w-4 h-4 text-amber-600" />
                <p className="text-sm font-semibold text-amber-800">
                  {communication.questionnaireName || 'Cuestionario adjunto'}
                </p>
              </div>
              {recipient.quizSubmittedAt ? (
                <div className="flex items-center gap-2 text-[#008C3C]">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm font-medium">Cuestionario completado · gracias por tu respuesta</span>
                </div>
              ) : (
                <>
                  <p className="text-xs text-amber-700 mb-3">
                    Este comunicado incluye un cuestionario. Por favor complétalo — tu opinión es importante.
                  </p>
                  <a
                    href={`${baseUrl}/responder/${recipient.quizToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors"
                  >
                    <ClipboardList className="w-4 h-4" />
                    Responder cuestionario →
                  </a>
                </>
              )}
            </div>
          )}

          {/* Read confirmation / Ack */}
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
            {acknowledged || !communication.requiresAck ? (
              <div className="flex items-center gap-2 text-[#008C3C]">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-sm font-medium">
                  {acknowledged ? 'Acuse de recibo confirmado' : 'Comunicado leído'}
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Este comunicado requiere tu confirmación de lectura:</p>
                <Button
                  onClick={handleAck}
                  disabled={acking}
                  className="bg-[#008C3C] hover:bg-[#006C2F] text-white w-full sm:w-auto"
                >
                  {acking
                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Confirmar que leí este comunicado
                </Button>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 pb-4">
          Este mensaje fue enviado por Inteegrados · Triangulum
        </p>
      </div>
    </div>
  );
};
