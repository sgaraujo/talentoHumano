import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Check, Loader2, Mail, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { UserRole } from '@/models/types/User';
import type { Questionnaire } from '@/models/types/Questionnaire';
import { questionnaireService } from '@/services/questionnaireService';
import { assignmentService } from '@/services/assignmentService';

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserCreated: () => void;
}

export const CreateUserDialog = ({ open, onOpenChange, onUserCreated }: CreateUserDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    fullName: '',
    role: 'colaborador' as UserRole,
  });
  const [sendQuestionnaire, setSendQuestionnaire] = useState(false);
  const [questionnaireId, setQuestionnaireId] = useState('');
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);

  useEffect(() => {
    if (!open) return;
    questionnaireService.getAll().then(all => {
      setQuestionnaires(all.filter(q => q.active));
    }).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) {
      setFormData({ email: '', fullName: '', role: 'colaborador' });
      setSendQuestionnaire(false);
      setQuestionnaireId('');
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { userService } = await import('@/services/userService');

      const exists = await userService.checkEmailExists(formData.email);
      if (exists) throw new Error('Ya existe un usuario con ese correo.');

      const newUserId = await userService.createUser({
        email: formData.email,
        fullName: formData.fullName,
        role: formData.role,
      });

      if (sendQuestionnaire && questionnaireId) {
        const questionnaire = questionnaires.find(q => q.id === questionnaireId);
        if (questionnaire) {
          try {
            await assignmentService.assignToUsers(
              questionnaireId,
              questionnaire.title,
              [{ id: newUserId, email: formData.email, fullName: formData.fullName }],
              false,
              false
            );
            toast.success('Usuario creado y cuestionario enviado', {
              description: `Se envió "${questionnaire.title}" a ${formData.email}.`,
            });
          } catch {
            toast.success('Usuario creado', {
              description: `${formData.fullName} fue agregado, pero hubo un error al enviar el cuestionario.`,
            });
          }
        }
      } else {
        toast.success('Usuario creado exitosamente', {
          description: `${formData.fullName} ha sido agregado al sistema.`,
        });
      }

      onUserCreated();
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Error al crear usuario', {
        description: error.message ?? 'Ocurrió un error inesperado.',
      });
    } finally {
      setLoading(false);
    }
  };

  const onboardingQuestionnaires = questionnaires.filter(q => q.isOnboarding);
  const otherQuestionnaires = questionnaires.filter(q => !q.isOnboarding);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Crear Nuevo Usuario</DialogTitle>
          <DialogDescription>
            Ingresa los datos básicos. Puedes enviarle un cuestionario para que complete su perfil.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="fullName">Nombre completo *</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Juan Pérez"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email">Correo electrónico *</Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@ejemplo.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="role">Tipo de usuario *</Label>
              <Select
                value={formData.role}
                onValueChange={(value) => setFormData({ ...formData, role: value as UserRole })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="colaborador">Colaborador</SelectItem>
                  <SelectItem value="aspirante">Aspirante</SelectItem>
                  <SelectItem value="excolaborador">Ex-colaborador</SelectItem>
                  <SelectItem value="descartado">Descartado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="h-px bg-gray-100" />

            {/* Questionnaire toggle */}
            <button
              type="button"
              onClick={() => { setSendQuestionnaire(v => !v); setQuestionnaireId(''); }}
              className="flex items-center gap-2.5 text-sm font-medium text-left"
            >
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                sendQuestionnaire ? 'bg-[#008C3C] border-[#008C3C]' : 'border-gray-300'
              }`}>
                {sendQuestionnaire && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              <span className={sendQuestionnaire ? 'text-[#008C3C]' : 'text-gray-500'}>
                Enviar cuestionario al usuario
              </span>
            </button>

            {sendQuestionnaire && (
              <div className="grid gap-2 pl-6">
                <Label htmlFor="questionnaire" className="text-xs text-gray-500">
                  Cuestionario a enviar *
                </Label>
                <Select value={questionnaireId} onValueChange={setQuestionnaireId}>
                  <SelectTrigger id="questionnaire">
                    <SelectValue placeholder="Selecciona un cuestionario" />
                  </SelectTrigger>
                  <SelectContent>
                    {onboardingQuestionnaires.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                          Onboarding
                        </div>
                        {onboardingQuestionnaires.map(q => (
                          <SelectItem key={q.id} value={q.id}>{q.title}</SelectItem>
                        ))}
                      </>
                    )}
                    {otherQuestionnaires.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                          Otros
                        </div>
                        {otherQuestionnaires.map(q => (
                          <SelectItem key={q.id} value={q.id}>{q.title}</SelectItem>
                        ))}
                      </>
                    )}
                    {questionnaires.length === 0 && (
                      <div className="px-2 py-3 text-sm text-gray-400 text-center">
                        No hay cuestionarios activos
                      </div>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  El usuario recibirá un enlace por correo para completarlo.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || (sendQuestionnaire && !questionnaireId)}
              className="gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {!loading && sendQuestionnaire && <Send className="h-4 w-4" />}
              {sendQuestionnaire ? 'Crear y enviar' : 'Crear usuario'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
