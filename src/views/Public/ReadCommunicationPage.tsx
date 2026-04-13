import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, CheckCircle2, Mail, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { communicationService } from '@/services/communicationService';
import type { Communication, CommunicationRecipient } from '@/models/types/Communication';

export const ReadCommunicationPage = () => {
  const { token } = useParams<{ token: string }>();
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [communication, setCommunication] = useState<Communication | null>(null);
  const [recipient,    setRecipient]    = useState<CommunicationRecipient | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [acking,       setAcking]       = useState(false);

  useEffect(() => {
    if (!token) { setError('Enlace inválido'); setLoading(false); return; }

    communicationService.getByToken(token)
      .then(async result => {
        if (!result) { setError('Este enlace no es válido o ya expiró'); return; }
        setCommunication(result.communication);
        setRecipient(result.recipient);

        // Mark as read automatically on open
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

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" />
    </div>
  );

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error || !communication || !recipient) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-sm w-full text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h2 className="font-bold text-[#4A4A4A] text-lg mb-1">Enlace no válido</h2>
        <p className="text-sm text-gray-500">{error || 'No se encontró el comunicado'}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Branding */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-[#008C3C] flex items-center justify-center">
            <Mail className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-[#008C3C] text-lg">Nelyoda</span>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

          {/* Green header */}
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

          {/* Read confirmation */}
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
          Este mensaje fue enviado por Nelyoda · Sistema de Gestión de Talento Humano
        </p>
      </div>
    </div>
  );
};
