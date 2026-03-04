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
import { Loader2, Building2, UserCheck, UserMinus, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { userService } from '@/services/userService';
import { analyticsService } from '@/services/analyticsService';
import { companyService } from '@/services/companyService';
import type { User } from '@/models/types/User';
import type { Company } from '@/models/types/Company';

interface RegisterMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const EMPTY_FORM = {
  type: 'ingreso' as 'ingreso' | 'retiro',
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
  const [companies, setCompanies] = useState<Company[]>([]);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  useEffect(() => {
    if (open) loadData();
  }, [open]);

  // INGRESO: when company changes → reset project, area, sede, userId
  useEffect(() => {
    if (formData.type !== 'ingreso') return;
    setFormData(prev => ({ ...prev, project: '', area: '', sede: '', userId: '' }));
  }, [formData.company]);

  // RETIRO: when user selected → auto-fill company/project/area/sede from profile
  // INGRESO: when user selected → auto-fill project/area/sede (company already chosen)
  useEffect(() => {
    if (!formData.userId) return;
    const selected = users.find(u => u.id === formData.userId);
    if (!selected) return;
    const a = (selected as any).contractInfo?.assignment;
    if (formData.type === 'retiro') {
      setFormData(prev => ({
        ...prev,
        company: a?.company || '',
        project: a?.project || '',
        area:    a?.area    || '',
        sede:    a?.sede    || '',
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        project: a?.project || prev.project,
        area:    a?.area    || prev.area,
        sede:    a?.sede    || prev.sede,
      }));
    }
  }, [formData.userId]);

  // Projects / areas / sedes from users of the selected company (only used for INGRESO)
  const companyProjects = useMemo(() => {
    if (!formData.company || formData.type !== 'ingreso') return [];
    const s = new Set<string>();
    users.forEach(u => {
      if ((u as any).contractInfo?.assignment?.company === formData.company) {
        const p = (u as any).contractInfo?.assignment?.project;
        if (p) s.add(p);
      }
    });
    return [...s].sort();
  }, [users, formData.company, formData.type]);

  const companyAreas = useMemo(() => {
    if (!formData.company || formData.type !== 'ingreso') return [];
    const s = new Set<string>();
    users.forEach(u => {
      if ((u as any).contractInfo?.assignment?.company === formData.company) {
        const a = (u as any).contractInfo?.assignment?.area;
        if (a) s.add(a);
      }
    });
    return [...s].sort();
  }, [users, formData.company, formData.type]);

  const companySedes = useMemo(() => {
    if (!formData.company || formData.type !== 'ingreso') return [];
    const s = new Set<string>();
    users.forEach(u => {
      if ((u as any).contractInfo?.assignment?.company === formData.company) {
        const v = (u as any).contractInfo?.assignment?.sede;
        if (v) s.add(v);
      }
    });
    return [...s].sort();
  }, [users, formData.company, formData.type]);

  const loadData = async () => {
    try {
      setLoadingData(true);
      const [allUsers, allCompanies] = await Promise.all([
        userService.getAll(),
        companyService.getAll(),
      ]);
      setUsers(allUsers);
      setCompanies(allCompanies.filter(c => c.active !== false));
    } catch (error: any) {
      toast.error('Error al cargar datos', { description: error.message });
    } finally {
      setLoadingData(false);
    }
  };

  // INGRESO: aspirantes + excolaboradores (filtered by company if selected)
  // RETIRO:  todos los colaboradores activos (sin filtro de empresa)
  const filteredUsers = useMemo(() => users.filter(u => {
    if (formData.type === 'ingreso') {
      if (u.role !== 'aspirante' && u.role !== 'excolaborador') return false;
      if (formData.company) {
        const uc = (u as any).contractInfo?.assignment?.company;
        if (uc && uc !== formData.company) return false;
      }
      return true;
    }
    return u.role === 'colaborador';
  }), [users, formData.type, formData.company]);

  const selectedUser = users.find(u => u.id === formData.userId);

  const handleSubmit = async () => {
    if (!formData.userId || !formData.date) {
      toast.error('Completa los campos obligatorios', {
        description: 'Persona y fecha son requeridos',
      });
      return;
    }
    if (formData.type === 'ingreso' && !formData.company) {
      toast.error('Selecciona una empresa', {
        description: 'La empresa es obligatoria para registrar el ingreso',
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

      if (formData.type === 'retiro') {
        await userService.update(formData.userId, {
          role: 'excolaborador',
          administrativeRecord: {
            ...(selectedUser as any).administrativeRecord,
            terminationDate:   movDate,
            terminationReason: formData.reason || '',
          },
        } as any);
      } else {
        await userService.update(formData.userId, {
          role: 'colaborador',
          contractInfo: {
            ...(selectedUser as any).contractInfo,
            contract: {
              ...(selectedUser as any).contractInfo?.contract,
              startDate: movDate,
            },
            assignment: {
              ...(selectedUser as any).contractInfo?.assignment,
              ...(companyToSave    && { company: companyToSave }),
              ...(formData.project && { project: formData.project }),
              ...(formData.area    && { area:    formData.area }),
              ...(formData.sede    && { sede:    formData.sede }),
            },
          },
        } as any);
      }

      toast.success('Movimiento registrado', {
        description: `${formData.type === 'ingreso' ? 'Ingreso' : 'Retiro'} guardado correctamente`,
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

  const SelectOrInput = ({
    label, value, options, onChange, placeholder, disabled,
  }: {
    label: string; value: string; options: string[];
    onChange: (v: string) => void; placeholder: string; disabled?: boolean;
  }) => (
    <div className="space-y-1">
      <Label className="text-xs text-gray-500">
        {label}
        {options.length > 0 && (
          <span className="ml-1 text-[#008C3C] font-normal">({options.length})</span>
        )}
      </Label>
      {options.length > 0 ? (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="bg-white border-gray-200 focus:ring-[#008C3C] text-sm">
            <SelectValue placeholder={`Selecciona ${label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : (
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="bg-white border-gray-200 text-sm"
        />
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#4A4A4A]">
            {formData.type === 'ingreso'
              ? <><UserPlus className="w-5 h-5 text-[#008C3C]" /> Registrar Ingreso</>
              : <><UserMinus className="w-5 h-5 text-red-500" /> Registrar Retiro</>
            }
          </DialogTitle>
          <DialogDescription>
            {formData.type === 'ingreso'
              ? 'Selecciona la empresa primero, luego la persona que ingresa'
              : 'Selecciona la persona — la empresa se toma de su perfil automáticamente'
            }
          </DialogDescription>
        </DialogHeader>

        {loadingData ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[#008C3C]" />
          </div>
        ) : (
          <div className="space-y-5">

            {/* ── Selector de tipo ── */}
            <div className="grid grid-cols-2 gap-2">
              {(['ingreso', 'retiro'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFormData({ ...EMPTY_FORM, type: t })}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                    formData.type === t
                      ? t === 'ingreso'
                        ? 'border-[#008C3C] bg-[#008C3C]/10 text-[#008C3C]'
                        : 'border-red-500 bg-red-50 text-red-600'
                      : 'border-gray-200 text-gray-400 hover:border-gray-300'
                  }`}
                >
                  {t === 'ingreso' ? <UserPlus className="w-4 h-4" /> : <UserMinus className="w-4 h-4" />}
                  {t === 'ingreso' ? 'Ingreso' : 'Retiro'}
                </button>
              ))}
            </div>

            {/* ══════════════════════════════════════════
                INGRESO: primero empresa, luego persona
                ══════════════════════════════════════════ */}
            {formData.type === 'ingreso' && (
              <div className="rounded-xl border border-[#008C3C]/20 bg-[#008C3C]/5 p-4 space-y-3">
                <p className="text-xs font-semibold text-[#008C3C] uppercase tracking-wide flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" /> Empresa *
                </p>

                <Select value={formData.company} onValueChange={v => set('company', v)}>
                  <SelectTrigger className="bg-white border-[#008C3C]/30 focus:ring-[#008C3C]">
                    <SelectValue placeholder="Selecciona una empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map(c => (
                      <SelectItem key={c.id} value={c.name}>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-[#008C3C]" />
                          {c.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="grid grid-cols-2 gap-3">
                  <SelectOrInput
                    label="Proyecto"
                    value={formData.project}
                    options={companyProjects}
                    onChange={v => set('project', v)}
                    placeholder={formData.company ? 'Sin proyectos aún' : 'Selecciona empresa primero'}
                    disabled={!formData.company}
                  />
                  <SelectOrInput
                    label="Área"
                    value={formData.area}
                    options={companyAreas}
                    onChange={v => set('area', v)}
                    placeholder={formData.company ? 'Sin áreas aún' : 'Selecciona empresa primero'}
                    disabled={!formData.company}
                  />
                  <SelectOrInput
                    label="Sede"
                    value={formData.sede}
                    options={companySedes}
                    onChange={v => set('sede', v)}
                    placeholder={formData.company ? 'Sin sedes aún' : 'Selecciona empresa primero'}
                    disabled={!formData.company}
                  />
                </div>
              </div>
            )}

            {/* ── Persona ── */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5" />
                {formData.type === 'ingreso' ? 'Persona que ingresa *' : 'Persona que se retira *'}
              </p>

              {filteredUsers.length === 0 ? (
                <div className="p-4 rounded-xl bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
                  {formData.type === 'ingreso'
                    ? 'No hay aspirantes ni ex-colaboradores disponibles.'
                    : 'No hay colaboradores activos para retirar.'
                  }
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

              {/* INGRESO: chip de confirmación */}
              {formData.type === 'ingreso' && selectedUser && (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100 text-xs text-gray-500">
                  <span className="font-medium text-[#4A4A4A]">{selectedUser.fullName}</span>
                  <span>·</span>
                  <span>{selectedUser.email}</span>
                </div>
              )}
            </div>

            {/* ── Detalles ── */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Detalles</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">
                    {formData.type === 'retiro' ? 'Fecha de retiro *' : 'Fecha de ingreso *'}
                  </Label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={e => set('date', e.target.value)}
                    className="border-gray-200 text-sm"
                  />
                </div>

                {formData.type === 'retiro' && (
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
                )}

                {formData.type === 'retiro' && (
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
                )}
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
            className={formData.type === 'ingreso'
              ? 'bg-[#008C3C] hover:bg-[#006C2F] text-white'
              : 'bg-red-500 hover:bg-red-600 text-white'
            }
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Registrar {formData.type === 'ingreso' ? 'Ingreso' : 'Retiro'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
