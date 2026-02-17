import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface DeleteQuestionnaireDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questionnaire: any | null;
  onQuestionnaireDeleted: () => void;
}

export const DeleteQuestionnaireDialog = ({ 
  open, 
  onOpenChange, 
  questionnaire, 
  onQuestionnaireDeleted 
}: DeleteQuestionnaireDialogProps) => {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!questionnaire) return;

    setLoading(true);

    try {
      const { questionnaireService } = await import('@/services/questionnaireService');
      await questionnaireService.delete(questionnaire.id);
      
      toast.success('Cuestionario eliminado', {
        description: `${questionnaire.title} ha sido eliminado exitosamente.`,
      });
      
      onQuestionnaireDeleted();
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Error al eliminar cuestionario', {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Estás completamente seguro?</AlertDialogTitle>
          <AlertDialogDescription>
            Estás a punto de eliminar el cuestionario{' '}
            <strong className="text-gray-900">"{questionnaire?.title}"</strong>.
            <br />
            <br />
            Esta acción <strong>no se puede deshacer</strong> y eliminará:
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>El cuestionario completo</li>
              <li>Todas sus preguntas ({questionnaire?.questions?.length || 0})</li>
              <li>Todas las respuestas asociadas</li>
            </ul>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sí, eliminar permanentemente
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};