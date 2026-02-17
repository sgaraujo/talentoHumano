import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, XCircle } from 'lucide-react';
import type { Questionnaire } from '@/models/types/Questionnaire';

interface ViewQuestionnaireDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questionnaire: Questionnaire | null;
}

export const ViewQuestionnaireDialog = ({ 
  open, 
  onOpenChange, 
  questionnaire 
}: ViewQuestionnaireDialogProps) => {
  if (!questionnaire) return null;

  const getQuestionTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      text: 'Texto corto',
      textarea: 'Texto largo',
      select: 'Selección única',
      multiple: 'Selección múltiple',
      rating: 'Calificación',
      date: 'Fecha',
      number: 'Número',
    };
    return types[type] || type;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle className="text-2xl">{questionnaire.title}</DialogTitle>
              <DialogDescription className="mt-2">
                {questionnaire.description}
              </DialogDescription>
            </div>
            {questionnaire.active ? (
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                <CheckCircle className="w-3 h-3 mr-1" />
                Activo
              </Badge>
            ) : (
              <Badge variant="secondary">
                <XCircle className="w-3 h-3 mr-1" />
                Inactivo
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Dirigido a:</span>
              <p className="font-medium capitalize">
                {questionnaire.targetRole === 'all' ? 'Todos' : questionnaire.targetRole}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Total de preguntas:</span>
              <p className="font-medium">{questionnaire.questions.length}</p>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Preguntas</h3>
            {questionnaire.questions
              .sort((a, b) => a.order - b.order)
              .map((question, index) => (
                <Card key={question.id}>
                  <CardContent className="pt-6">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium">
                            {index + 1}. {question.text}
                            {question.required && (
                              <span className="text-red-500 ml-1">*</span>
                            )}
                          </p>
                        </div>
                        <Badge variant="outline" className="ml-2">
                          {getQuestionTypeLabel(question.type)}
                        </Badge>
                      </div>

                      {(question.type === 'select' || question.type === 'multiple') && 
                       question.options && question.options.length > 0 && (
                        <div className="ml-6 mt-2 space-y-1">
                          <p className="text-sm text-gray-500">Opciones:</p>
                          <ul className="list-disc list-inside space-y-1">
                            {question.options.map((option) => (
                              <li key={option.id} className="text-sm text-gray-700">
                                {option.label}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};