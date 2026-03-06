import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Building2, UserCheck, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { userService } from '@/services/userService';
import { analyticsService } from '@/services/analyticsService';
import type { User } from '@/models/types/User';

interface RegisterMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const EMPTY_FORM = {
  type: 'retiro' as 'ingreso' | 'retiro',
  userId: '',
  date: new Date().toISOString().split('T')[0],
  reason: '',
  company: '',
  project: '',
  sede: '',
  area: '',
  cost: '',
  notes: '',
};

export const RegisterMovementDialog = ({
  open, onOpenChange, onSuccess,
}: RegisterMovementDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  useEffect(() => {
    if (open) loadData();
  }, [open]);

  // RETIRO: when user selected → auto-fill company/project/area/sede from profile
  useEffect(() => {
    if (!formData.userId) return;
    const selected = users.find(u => u.id === formData.userId);
    if (!selected) return;
    const a = (selected as any).contractInfo?.assignment;
    setFormData(prev => ({
      ...prev,
      company: a?.company || '',
      project: a?.project || '',
      area:    a?.area    || '',
      sede:    a?.sede    || '',
    }));
  }, [formData.userId]);

  const loadData = async () => {
    try {
      setLoadingData(true);
      const allUsers = await userService.getAll();
      setUsers(allUsers);
    } catch (error: any) {
      toast.error('Error al cargar datos', { description: error.message });
    } finally {
      setLoadingData(false);
    }
  };

  // RETIRO: colaboradores y líderes activos
  const filteredUsers = useMemo(
    () => users.filter(u => u.role === 'colaborador' || u.role === 'lider'),
    [users],
  );

  const selectedUser = users.find(u => u.id === formData.userId);

  const handleSubmit = async () => {
    if (!formData.userId || !formData.date) {
      toast.error('Completa los campos obligatorios', {
        description: 'Persona y fecha son requeridos',
      });
      return;
    }
    setLoading(true);
    try {
      if (!selectedUser) throw new Error('Usuario no encontrado');

      const movDate = (() => {
        const [y, m, d] = formData.date.split('-').map(Number);
        return new Date(y, m - 1, d);
      })();

      // Empresa a guardar: en retiro viene del perfil del usuario
      const companyToSave = formData.company ||
        (selectedUser as any).contractInfo?.assignment?.company || '';

      await analyticsService.registerMovement({
        type:      formData.type,
        userId:    formData.userId,
        userName:  selectedUser.fullName,
        userEmail: selectedUser.email,
        date:      movDate,
        createdBy: 'admin',
        ...(formData.reason  && { reason:  formData.reason }),
        ...(companyToSave    && { company: companyToSave }),
        ...(formData.project && { project: formData.project }),
        ...(formData.sede    && { sede:    formData.sede }),
        ...(formData.area    && { area:    formData.area }),
        ...(formData.cost    && { cost:    parseFloat(formData.cost) }),
        ...(formData.notes   && { notes:   formData.notes }),
      });

      await userService.update(formData.userId, {
        role: 'excolaborador',
        administrativeRecord: {
          ...(selectedUser as any).administrativeRecord,
          terminationDate:   movDate,
          terminationReason: formData.reason || '',
        },
      } as any);

      toast.success('Retiro registrado', {
        description: 'El retiro fue guardado correctamente.',
      });

      setFormData({ ...EMPTY_FORM });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Error al registrar movimiento', { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const set = (field: string, value: string) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#4A4A4A]">
            <UserMinus className="w-5 h-5 text-red-500" /> Registrar Retiro
          </DialogTitle>
          <DialogDescription>
            Selecciona la persona — la empresa se toma de su perfil automáticamente
          </DialogDescription>
        </DialogHeader>

        {loadingData ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[#008C3C]" />
          </div>
        ) : (
          <div className="space-y-5">

            {/* ── Persona ── */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5" />
                Persona que se retira *
              </p>

              {filteredUsers.length === 0 ? (
                <div className="p-4 rounded-xl bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
                  No hay colaboradores activos para retirar.
                </div>
              ) : (
                <Select value={formData.userId} onValueChange={v => set('userId', v)}>
                  <SelectTrigger className="border-gray-200 focus:ring-[#008C3C]">
                    <SelectValue placeholder="Selecciona una persona" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredUsers.map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{u.fullName || u.email}</span>
                          <Badge variant="outline" className="text-[10px] px-1 py-0">{u.role}</Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* RETIRO: mostrar empresa/proyecto/área del perfil como info de solo lectura */}
              {formData.type === 'retiro' && selectedUser && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                    <Building2 className="w-3 h-3" /> Datos de la empresa (del perfil)
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {[
                      { label: 'Empresa', value: formData.company },
                      { label: 'Proyecto', value: formData.project },
                      { label: 'Área', value: formData.area },
                      { label: 'Sede', value: formData.sede },
                    ].map(({ label, value }) => value ? (
                      <div key={label}>
                        <span className="text-gray-400">{label}: </span>
                        <span className="font-medium text-[#4A4A4A]">{value}</span>
                      </div>
                    ) : null)}
                    {!formData.company && (
                      <p className="col-span-2 text-amber-600">
                        Esta persona no tiene empresa asignada en su perfil
                      </p>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* ── Detalles ── */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Detalles</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">Fecha de retiro *</Label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={e => set('date', e.target.value)}
                    className="border-gray-200 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">Motivo</Label>
                  <Select value={formData.reason} onValueChange={v => set('reason', v)}>
                    <SelectTrigger className="border-gray-200 focus:ring-[#008C3C]">
                      <SelectValue placeholder="Selecciona un motivo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="voluntario">Voluntario</SelectItem>
                      <SelectItem value="involuntario">Involuntario</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">Costo del retiro</Label>
                  <Input
                    type="number"
                    value={formData.cost}
                    onChange={e => set('cost', e.target.value)}
                    placeholder="0"
                    className="border-gray-200 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Notas adicionales</Label>
                <Textarea
                  value={formData.notes}
                  onChange={e => set('notes', e.target.value)}
                  placeholder="Observaciones sobre este movimiento..."
                  rows={2}
                  className="border-gray-200 text-sm resize-none"
                />
              </div>
            </div>

          </div>
        )}

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || loadingData || !formData.userId}
            className="bg-red-500 hover:bg-red-600 text-white"
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Registrar Retiro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
