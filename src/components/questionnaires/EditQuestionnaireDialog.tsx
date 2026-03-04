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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus, Trash2, GripVertical, ArrowRight, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Question, QuestionType, Questionnaire } from '@/models/types/Questionnaire';

const FIELD_GROUPS = [
  {
    label: 'Datos Personales',
    fields: [
      { label: 'Tipo de documento', value: 'personalData.documentType' },
      { label: 'Número de documento', value: 'personalData.documentNumber' },
      { label: 'Género', value: 'personalData.gender' },
      { label: 'Fecha de nacimiento', value: 'personalData.birthDate' },
      { label: 'Grupo sanguíneo', value: 'personalData.bloodType' },
      { label: 'Estado civil', value: 'personalData.maritalStatus' },
      { label: 'Nacionalidad', value: 'personalData.nationality' },
      { label: 'Teléfono personal', value: 'personalData.phone' },
    ],
  },
  {
    label: 'Ubicación y Contacto',
    fields: [
      { label: 'País', value: 'location.country' },
      { label: 'Departamento', value: 'location.state' },
      { label: 'Ciudad', value: 'location.city' },
      { label: 'Barrio', value: 'location.neighborhood' },
      { label: 'Dirección', value: 'location.address' },
      { label: 'Correo personal', value: 'location.personalEmail' },
      { label: 'Teléfono corporativo', value: 'location.corporatePhone' },
      { label: 'Contacto emergencia – Nombre', value: 'location.emergencyContact.fullName' },
      { label: 'Contacto emergencia – Parentesco', value: 'location.emergencyContact.relationship' },
      { label: 'Contacto emergencia – Teléfono', value: 'location.emergencyContact.phone' },
    ],
  },
  {
    label: 'Perfil Profesional',
    fields: [
      { label: 'Nivel académico', value: 'professionalProfile.academicLevel' },
      { label: 'Título / Carrera', value: 'professionalProfile.degree' },
      { label: 'Institución educativa', value: 'professionalProfile.educationalInstitution' },
      { label: 'Área de conocimiento', value: 'professionalProfile.knowledgeArea' },
      { label: 'Estado de estudios', value: 'professionalProfile.educationStatus' },
    ],
  },
  {
    label: 'Datos Socioeconómicos',
    fields: [
      { label: 'Estrato socioeconómico', value: 'demographicData.socioeconomicLevel' },
      { label: 'Tiempo de desplazamiento', value: 'demographicData.commuteTime' },
      { label: 'Etnia / Comunidad', value: 'demographicData.ethnicity' },
      { label: 'Discapacidad', value: 'demographicData.disability' },
    ],
  },
  {
    label: 'Familia',
    fields: [
      { label: 'Tipo de familia', value: 'family.familyType' },
      { label: 'Número de hijos', value: 'family.numberOfChildren' },
      { label: 'Número de convivientes', value: 'family.numberOfCohabitants' },
      { label: 'Responsabilidades de cuidado', value: 'family.caregiverResponsibilities' },
    ],
  },
  {
    label: 'Seguridad Social',
    fields: [
      { label: 'EPS', value: 'socialSecurity.eps' },
      { label: 'Fondo de pensiones (AFP)', value: 'socialSecurity.afp' },
      { label: 'Caja de compensación (CCF)', value: 'socialSecurity.ccf' },
      { label: 'Nivel de riesgo ARL', value: 'socialSecurity.arlRiskLevel' },
    ],
  },
  {
    label: 'Información Bancaria',
    fields: [
      { label: 'Banco', value: 'bankingInfo.bankName' },
      { label: 'Tipo de cuenta', value: 'bankingInfo.accountType' },
      { label: 'Número de cuenta', value: 'bankingInfo.accountNumber' },
    ],
  },
  {
    label: 'Contrato y Asignación',
    fields: [
      { label: 'Empresa', value: 'contractInfo.assignment.company' },
      { label: 'Área asignada', value: 'contractInfo.assignment.area' },
      { label: 'Cargo / Posición', value: 'contractInfo.assignment.position' },
      { label: 'Proyecto', value: 'contractInfo.assignment.project' },
      { label: 'Sede', value: 'contractInfo.assignment.location' },
      { label: 'Tipo de contrato', value: 'contractInfo.contract.contractType' },
      { label: 'Fecha de inicio', value: 'contractInfo.contract.startDate' },
    ],
  },
  {
    label: 'Salario y Preferencias',
    fields: [
      { label: 'Salario base', value: 'salaryInfo.baseSalary' },
      { label: 'Modalidad de trabajo', value: 'preferences.workModality' },
      { label: 'Expectativa salarial', value: 'preferences.salaryExpectation' },
    ],
  },
];

interface FieldMapping {
  questionId: string;
  fieldPath: string;
  overwrite: boolean;
}

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
    isOnboarding: false,
    isRequired: false,
    allowMultipleCompletions: false,
  });
  const [questions, setQuestions] = useState<Question[]>([]);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [currentStep, setCurrentStep] = useState<'info' | 'questions' | 'mappings'>('info');

  useEffect(() => {
    if (questionnaire) {
      setFormData({
        title: questionnaire.title,
        description: questionnaire.description,
        targetRole: questionnaire.targetRole || 'all',
        active: questionnaire.active,
        isOnboarding: questionnaire.isOnboarding ?? false,
        isRequired: questionnaire.isRequired ?? false,
        allowMultipleCompletions: questionnaire.allowMultipleCompletions ?? false,
      });
      setQuestions([...questionnaire.questions]);
      setFieldMappings(
        (questionnaire.fieldMappings || []).map(m => ({
          questionId: m.questionId,
          fieldPath: m.fieldPath,
          overwrite: m.overwrite !== false,
        }))
      );
      setCurrentStep('info');
    }
  }, [questionnaire]);

  const addQuestion = () => {
    setQuestions(prev => [
      ...prev,
      { id: `q_${Date.now()}`, text: '', type: 'text', required: true, order: prev.length },
    ]);
  };

  const updateQuestion = (id: string, updates: Partial<Question>) => {
    setQuestions(questions.map(q => q.id === id ? { ...q, ...updates } : q));
  };

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter(q => q.id !== id));
    setFieldMappings(prev => prev.filter(m => m.questionId !== id));
  };

  const addOption = (questionId: string) => {
    const question = questions.find(q => q.id === questionId);
    if (!question) return;
    updateQuestion(questionId, {
      options: [...(question.options || []), { id: `opt_${Date.now()}`, label: '', value: '' }],
    });
  };

  const updateOption = (questionId: string, optionId: string, label: string) => {
    const question = questions.find(q => q.id === questionId);
    if (!question || !question.options) return;
    updateQuestion(questionId, {
      options: question.options.map(opt =>
        opt.id === optionId ? { ...opt, label, value: label.toLowerCase().replace(/\s+/g, '_') } : opt
      ),
    });
  };

  const removeOption = (questionId: string, optionId: string) => {
    const question = questions.find(q => q.id === questionId);
    if (!question || !question.options) return;
    updateQuestion(questionId, { options: question.options.filter(opt => opt.id !== optionId) });
  };

  const updateMapping = (questionId: string, field: 'fieldPath' | 'overwrite', value: any) => {
    setFieldMappings(prev => {
      const existing = prev.find(m => m.questionId === questionId);
      if (existing) {
        return prev.map(m => m.questionId === questionId ? { ...m, [field]: value } : m);
      }
      return [...prev, { questionId, fieldPath: '', overwrite: true, [field]: value }];
    });
  };

  const getMappingFor = (questionId: string): FieldMapping =>
    fieldMappings.find(m => m.questionId === questionId) ?? { questionId, fieldPath: '', overwrite: true };

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
    if (questions.some(q => !q.text.trim())) {
      toast.error('Error', { description: 'Todas las preguntas deben tener texto' });
      return;
    }

    setLoading(true);
    try {
      const { questionnaireService } = await import('@/services/questionnaireService');

      await questionnaireService.update(questionnaire.id, {
        ...formData,
        questions: questions.map((q, i) => ({ ...q, order: i })),
        fieldMappings: fieldMappings.filter(m => m.fieldPath),
      });

      toast.success('Cuestionario actualizado', {
        description: `${formData.title} ha sido actualizado exitosamente.`,
      });

      setCurrentStep('info');
      onQuestionnaireUpdated();
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Error al actualizar cuestionario', { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  if (!questionnaire) return null;

  const stepTitles = {
    info: 'Editar Cuestionario',
    questions: 'Editar Preguntas',
    mappings: 'Mapeo de Campos',
  };

  const stepDescriptions = {
    info: 'Actualiza la información básica del cuestionario',
    questions: 'Modifica las preguntas del cuestionario',
    mappings: 'Asocia cada pregunta a un campo del perfil del usuario',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{stepTitles[currentStep]}</DialogTitle>
          <DialogDescription>{stepDescriptions[currentStep]}</DialogDescription>
        </DialogHeader>

        {/* ── STEP 1: INFO ── */}
        {currentStep === 'info' && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Título *</Label>
              <Input
                id="edit-title"
                placeholder="Ej: Onboarding de Colaboradores"
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

            <div className="h-px bg-gray-100" />

            <div className="flex items-center justify-between">
              <Label htmlFor="edit-active">Activo</Label>
              <Switch
                id="edit-active"
                checked={formData.active}
                onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="edit-isOnboarding">Cuestionario de onboarding</Label>
                <p className="text-xs text-gray-400">Las respuestas actualizarán el perfil del usuario</p>
              </div>
              <Switch
                id="edit-isOnboarding"
                checked={formData.isOnboarding}
                onCheckedChange={(checked) => setFormData({ ...formData, isOnboarding: checked, isRequired: false, allowMultipleCompletions: false })}
              />
            </div>

            {formData.isOnboarding && (
              <div className="pl-4 border-l-2 border-[#008C3C]/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="edit-isRequired">Onboarding obligatorio</Label>
                    <p className="text-xs text-gray-400">El usuario debe completarlo para acceder</p>
                  </div>
                  <Switch
                    id="edit-isRequired"
                    checked={formData.isRequired}
                    onCheckedChange={(checked) => setFormData({ ...formData, isRequired: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="edit-allowMultiple">Permitir múltiples respuestas</Label>
                    <p className="text-xs text-gray-400">El usuario puede responderlo más de una vez</p>
                  </div>
                  <Switch
                    id="edit-allowMultiple"
                    checked={formData.allowMultipleCompletions}
                    onCheckedChange={(checked) => setFormData({ ...formData, allowMultipleCompletions: checked })}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={() => setCurrentStep('questions')}>
                Siguiente: Preguntas
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 2: QUESTIONS ── */}
        {currentStep === 'questions' && (
          <div className="space-y-4 py-4">
            <div className="space-y-4">
              {questions.map((question, index) => (
                <div key={question.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <GripVertical className="w-5 h-5 text-gray-400 mt-2 flex-shrink-0" />
                    <div className="flex-1 space-y-3">
                      <div className="flex gap-2">
                        <Input
                          placeholder={`Pregunta ${index + 1}`}
                          value={question.text}
                          onChange={(e) => updateQuestion(question.id, { text: e.target.value })}
                        />
                        <Select
                          value={question.type}
                          onValueChange={(value: QuestionType) => updateQuestion(question.id, { type: value })}
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
                                onChange={(e) => updateOption(question.id, option.id, e.target.value)}
                              />
                              <Button variant="ghost" size="sm" onClick={() => removeOption(question.id, option.id)}>
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          ))}
                          <Button variant="outline" size="sm" onClick={() => addOption(question.id)}>
                            <Plus className="w-4 h-4 mr-2" />Agregar opción
                          </Button>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Switch
                          checked={question.required}
                          onCheckedChange={(checked) => updateQuestion(question.id, { required: checked })}
                        />
                        <Label className="text-sm">Obligatoria</Label>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeQuestion(question.id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Button variant="outline" onClick={addQuestion} className="w-full">
              <Plus className="w-4 h-4 mr-2" />Agregar Pregunta
            </Button>

            <div className="flex justify-between gap-2 pt-4">
              <Button variant="outline" onClick={() => setCurrentStep('info')}>Atrás</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                {formData.isOnboarding ? (
                  <Button onClick={() => setCurrentStep('mappings')}>
                    Siguiente: Mapeo
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                ) : (
                  <Button onClick={handleSubmit} disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Guardar Cambios
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: FIELD MAPPINGS ── */}
        {currentStep === 'mappings' && (
          <div className="space-y-4 py-4">
            <div className="flex items-start gap-2 p-3 bg-[#008C3C]/5 border border-[#008C3C]/20 rounded-lg">
              <Link2 className="w-4 h-4 text-[#008C3C] mt-0.5 flex-shrink-0" />
              <p className="text-xs text-gray-600">
                Asocia cada pregunta a un campo del perfil. Al completar el cuestionario, las respuestas se guardarán automáticamente en el perfil del usuario.
              </p>
            </div>

            <div className="space-y-3">
              {questions.map((question) => {
                const mapping = getMappingFor(question.id);
                return (
                  <div key={question.id} className="border rounded-lg p-3 space-y-2">
                    <p className="text-sm font-medium text-gray-700 line-clamp-2">
                      {question.text || <span className="text-gray-400 italic">Pregunta sin título</span>}
                    </p>
                    <div className="flex gap-2 items-center">
                      <Select
                        value={mapping.fieldPath}
                        onValueChange={(v) => updateMapping(question.id, 'fieldPath', v)}
                      >
                        <SelectTrigger className="flex-1 text-sm">
                          <SelectValue placeholder="Sin mapear" />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          <SelectItem value="">Sin mapear</SelectItem>
                          {FIELD_GROUPS.map(group => (
                            <SelectGroup key={group.label}>
                              <SelectLabel className="text-xs font-semibold text-gray-400 uppercase">{group.label}</SelectLabel>
                              {group.fields.map(f => (
                                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                              ))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                      {mapping.fieldPath && (
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <Switch
                            id={`ow-${question.id}`}
                            checked={mapping.overwrite !== false}
                            onCheckedChange={(v) => updateMapping(question.id, 'overwrite', v)}
                          />
                          <Label htmlFor={`ow-${question.id}`} className="text-xs text-gray-500 cursor-pointer">
                            Sobrescribir
                          </Label>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between gap-2 pt-4">
              <Button variant="outline" onClick={() => setCurrentStep('questions')}>Atrás</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
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
