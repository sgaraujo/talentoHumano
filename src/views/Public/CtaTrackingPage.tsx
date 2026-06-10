import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { communicationService } from '@/services/communicationService';

export const CtaTrackingPage = () => {
  const { token } = useParams<{ token: string }>();

  useEffect(() => {
    if (!token) return;
    communicationService.getByToken(token).then(result => {
      if (!result?.communication.ctaButton) return;
      const { recipient, communication } = result;
      const redirect = () => { window.location.replace(communication.ctaButton!.url); };
      const tasks: Promise<any>[] = [];
      if (recipient.status !== 'read') {
        tasks.push(communicationService.markAsRead(recipient.id, communication.id).catch(() => {}));
      }
      if (!recipient.ctaClickedAt) {
        tasks.push(communicationService.markCtaClicked(recipient.id, communication.id).catch(() => {}));
      }
      Promise.allSettled(tasks).finally(redirect);
    }).catch(() => {
      window.history.back();
    });
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" />
    </div>
  );
};
