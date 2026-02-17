import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus, Trash2, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import type { Question, QuestionType, Questionnaire } from '@/models/types/Questionnaire';

interface EditQuestionnaireDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questionnaire: Questionnaire | null;
  onQuestionnaireUpdated: () => void;
}

export const EditQuestionnaireDialog = ({ 
  open, 
  onOpenChange, 
  questionnaire,
  onQuestionnaireUpdated 
}: EditQuestionnaireDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    targetRole: 'all' as 'colaborador' | 'aspirante' | 'excolaborador' | 'all',
    active: true,
  });
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentStep, setCurrentStep] = useState<'info' | 'questions'>('info');

  useEffect(() => {
    if (questionnaire) {
      setFormData({
        title: questionnaire.title,
        description: questionnaire.description,
        targetRole: questionnaire.targetRole || 'all',
        active: questionnaire.active,
      });
      setQuestions([...questionnaire.questions]);
    }
  }, [questionnaire]);

  const addQuestion = () => {
    const newQuestion: Question = {
      id: `q_${Date.now()}`,
      text: '',
      type: 'text',
      required: true,
      order: questions.length,
    };
    setQuestions([...questions, newQuestion]);
  };

  const updateQuestion = (id: string, updates: Partial<Question>) => {
    setQuestions(questions.map(q => 
      q.id === id ? { ...q, ...updates } : q
    ));
  };

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter(q => q.id !== id));
  };

  const addOption = (questionId: string) => {
    const question = questions.find(q => q.id === questionId);
    if (!question) return;

    const newOption = {
      id: `opt_${Date.now()}`,
      label: '',
      value: '',
    };

    updateQuestion(questionId, {
      options: [...(question.options || []), newOption],
    });
  };

  const updateOption = (questionId: string, optionId: string, label: string) => {
    const question = questions.find(q => q.id === questionId);
    if (!question || !question.options) return;

    const updatedOptions = question.options.map(opt =>
      opt.id === optionId ? { ...opt, label, value: label.toLowerCase().replace(/\s+/g, '_') } : opt
    );

    updateQuestion(questionId, { options: updatedOptions });
  };

  const removeOption = (questionId: string, optionId: string) => {
    const question = questions.find(q => q.id === questionId);
    if (!question || !question.options) return;

    updateQuestion(questionId, {
      options: question.options.filter(opt => opt.id !== optionId),
    });
  };

  const handleSubmit = async () => {
    if (!questionnaire) return;

    if (!formData.title.trim()) {
      toast.error('Error', { description: 'El título es obligatorio' });
      return;
    }

    if (questions.length === 0) {
      toast.error('Error', { description: 'Debes agregar al menos una pregunta' });
      return;
    }

    const hasEmptyQuestions = questions.some(q => !q.text.trim());
    if (hasEmptyQuestions) {
      toast.error('Error', { description: 'Todas las preguntas deben tener texto' });
      return;
    }

    setLoading(true);

    try {
      const { questionnaireService } = await import('@/services/questionnaireService');
      
      await questionnaireService.update(questionnaire.id, {
        ...formData,
        questions: questions.map((q, index) => ({ ...q, order: index })),
      });

      toast.success('Cuestionario actualizado', {
        description: `${formData.title} ha sido actualizado exitosamente.`,
      });

      setCurrentStep('info');
      onQuestionnaireUpdated();
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Error al actualizar cuestionario', {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  if (!questionnaire) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {currentStep === 'info' ? 'Editar Cuestionario' : 'Editar Preguntas'}
          </DialogTitle>
          <DialogDescription>
            {currentStep === 'info' 
              ? 'Actualiza la información básica del cuestionario'
              : 'Modifica las preguntas del cuestionario'
            }
          </DialogDescription>
        </DialogHeader>

        {currentStep === 'info' ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Título *</Label>
              <Input
                id="edit-title"
                placeholder="Ej: Encuesta de Clima Laboral"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Descripción</Label>
              <Textarea
                id="edit-description"
                placeholder="Describe el objetivo del cuestionario..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-targetRole">Dirigido a</Label>
              <Select
                value={formData.targetRole}
                onValueChange={(value: any) => setFormData({ ...formData, targetRole: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="colaborador">Colaboradores</SelectItem>
                  <SelectItem value="aspirante">Aspirantes</SelectItem>
                  <SelectItem value="excolaborador">Ex-colaboradores</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="edit-active">Activo</Label>
              <Switch
                id="edit-active"
                checked={formData.active}
                onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={() => setCurrentStep('questions')}>
                Siguiente: Preguntas
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-4">
              {questions.map((question, index) => (
                <div key={question.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <GripVertical className="w-5 h-5 text-gray-400 mt-2" />
                    <div className="flex-1 space-y-3">
                      <div className="flex gap-2">
                        <Input
                          placeholder={`Pregunta ${index + 1}`}
                          value={question.text}
                          onChange={(e) => updateQuestion(question.id, { text: e.target.value })}
                        />
                        <Select
                          value={question.type}
                          onValueChange={(value: QuestionType) => 
                            updateQuestion(question.id, { type: value })
                          }
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Texto corto</SelectItem>
                            <SelectItem value="textarea">Texto largo</SelectItem>
                            <SelectItem value="select">Selección única</SelectItem>
                            <SelectItem value="multiple">Selección múltiple</SelectItem>
                            <SelectItem value="rating">Calificación</SelectItem>
                            <SelectItem value="date">Fecha</SelectItem>
                            <SelectItem value="number">Número</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {(question.type === 'select' || question.type === 'multiple') && (
                        <div className="ml-4 space-y-2">
                          <Label className="text-sm text-gray-600">Opciones:</Label>
                          {question.options?.map((option) => (
                            <div key={option.id} className="flex gap-2">
                              <Input
                                placeholder="Opción"
                                value={option.label}
                                onChange={(e) => 
                                  updateOption(question.id, option.id, e.target.value)
                                }
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeOption(question.id, option.id)}
                              >
                                <Trash2 className="w-4 h-4 text-red-600" />
                              </Button>
                            </div>
                          ))}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addOption(question.id)}
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Agregar opción
                          </Button>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Switch
                          checked={question.required}
                          onCheckedChange={(checked) => 
                            updateQuestion(question.id, { required: checked })
                          }
                        />
                        <Label className="text-sm">Obligatoria</Label>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeQuestion(question.id)}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Button variant="outline" onClick={addQuestion} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Agregar Pregunta
            </Button>

            <div className="flex justify-between gap-2 pt-4">
              <Button variant="outline" onClick={() => setCurrentStep('info')}>
                Atrás
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSubmit} disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Guardar Cambios
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};