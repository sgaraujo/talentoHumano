import { useState, useEffect, useMemo, useRef } from 'react';
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
import { Loader2, Building2, UserCheck, UserMinus, X } from 'lucide-react';
import { toast } from 'sonner';
import { userService } from '@/services/userService';
import { companyService } from '@/services/companyService';
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
  const [companyNames, setCompanyNames] = useState<string[]>([]);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [search, setSearch] = useState('');
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

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
      const [allUsers, allCompanies] = await Promise.all([
        userService.getAll(),
        companyService.getAll(),
      ]);
      setUsers(allUsers);
      setCompanyNames(allCompanies.map(c => c.name).sort((a, b) => a.localeCompare(b, 'es')));
    } catch (error: any) {
      toast.error('Error al cargar datos', { description: error.message });
    } finally {
      setLoadingData(false);
    }
  };

  // Colaboradores y líderes activos
  const activeUsers = useMemo(
    () => users.filter(u => u.role === 'colaborador' || u.role === 'lider'),
    [users],
  );

  // Resultados de búsqueda por nombre o cédula
  const searchResults = useMemo(() => {
    if (search.trim().length < 2) return [];
    const q = search.trim().toLowerCase();
    return activeUsers
      .filter(u =>
        u.fullName?.toLowerCase().includes(q) ||
        (u as any).personalData?.documentNumber?.toString().includes(q)
      )
      .slice(0, 10);
  }, [search, activeUsers]);

  const selectedUser = users.find(u => u.id === formData.userId);

  const handleSubmit = async () => {
    if (!formData.userId || !formData.date) {
      toast.error('Completa los campos obligatorios', {
        description: 'Persona y fecha son requeridos',
      });
      return;
    }
    if (formData.type === 'retiro' && !formData.company) {
      toast.error('Falta la empresa del retiro', {
        description: 'Esta persona no tiene empresa en su perfil — selecciónala antes de continuar',
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
      setSearch('');
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

              {/* Persona seleccionada */}
              {selectedUser ? (
                <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-[#008C3C]/30 bg-[#008C3C]/5">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-[#4A4A4A] truncate">{selectedUser.fullName}</p>
                    <p className="text-[11px] text-gray-400 truncate">{selectedUser.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { set('userId', ''); setSearch(''); }}
                    className="text-gray-400 hover:text-red-500 flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div ref={searchRef} className="relative">
                  <Input
                    placeholder="Escribe el nombre o cédula (mín. 2 caracteres)…"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setShowResults(true); }}
                    onFocus={() => setShowResults(true)}
                    className="border-gray-200 focus-visible:ring-[#008C3C]"
                    autoComplete="off"
                  />
                  {showResults && searchResults.length > 0 && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden">
                      {searchResults.map(u => (
                        <button
                          key={u.id}
                          type="button"
                          onMouseDown={() => {
                            set('userId', u.id);
                            setSearch('');
                            setShowResults(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#008C3C]/5 text-left border-b border-gray-50 last:border-0"
                        >
                          <div className="w-8 h-8 rounded-full bg-[#008C3C]/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-[#008C3C]">
                              {u.fullName?.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-[#4A4A4A] truncate">{u.fullName}</p>
                            <p className="text-[10px] text-gray-400 truncate">
                              {(u as any).contractInfo?.assignment?.company || u.email}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-[10px] px-1.5 flex-shrink-0">{u.role}</Badge>
                        </button>
                      ))}
                    </div>
                  )}
                  {showResults && search.trim().length >= 2 && searchResults.length === 0 && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-sm text-gray-400">
                      Sin resultados para "{search}"
                    </div>
                  )}
                </div>
              )}

              {/* RETIRO: mostrar empresa/proyecto/área del perfil como info de solo lectura */}
              {formData.type === 'retiro' && selectedUser && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                    <Building2 className="w-3 h-3" /> Datos de la empresa (del perfil)
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {[
                      { label: 'Cuenta analítica', value: formData.project },
                      { label: 'Área', value: formData.area },
                      { label: 'Sede', value: formData.sede },
                    ].map(({ label, value }) => value ? (
                      <div key={label}>
                        <span className="text-gray-400">{label}: </span>
                        <span className="font-medium text-[#4A4A4A]">{value}</span>
                      </div>
                    ) : null)}
                  </div>
                  {formData.company ? (
                    <p className="text-xs">
                      <span className="text-gray-400">Empresa: </span>
                      <span className="font-medium text-[#4A4A4A]">{formData.company}</span>
                    </p>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-amber-600 text-xs">
                        Esta persona no tiene empresa asignada en su perfil — identifícala manualmente:
                      </p>
                      <Select value={formData.company} onValueChange={v => set('company', v)}>
                        <SelectTrigger className="border-amber-300 focus:ring-amber-500 h-8 text-xs">
                          <SelectValue placeholder="Selecciona la empresa del retiro" />
                        </SelectTrigger>
                        <SelectContent>
                          {companyNames.map(name => (
                            <SelectItem key={name} value={name}>{name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
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
                      <SelectItem value="Fallecimiento">Fallecimiento</SelectItem>
                      <SelectItem value="Anulado">Anulado</SelectItem>
                      <SelectItem value="Renuncia voluntaria">Renuncia voluntaria</SelectItem>
                      <SelectItem value="Sustitución patronal">Sustitución patronal</SelectItem>
                      <SelectItem value="Terminación contrato a término fijo">Terminación contrato a término fijo</SelectItem>
                      <SelectItem value="Terminación contrato con justa causa">Terminación contrato con justa causa</SelectItem>
                      <SelectItem value="Terminación contrato sin justa causa">Terminación contrato sin justa causa</SelectItem>
                      <SelectItem value="Terminación contrato de aprendizaje">Terminación contrato de aprendizaje</SelectItem>
                      <SelectItem value="Terminación de contrato por mutuo acuerdo">Terminación de contrato por mutuo acuerdo</SelectItem>
                      <SelectItem value="Terminación de contrato por obra o labor">Terminación de contrato por obra o labor</SelectItem>
                      <SelectItem value="Terminación de contrato por periodo de prueba">Terminación de contrato por periodo de prueba</SelectItem>
                      <SelectItem value="Terminación de contrato unilateral de aprendizaje">Terminación de contrato unilateral de aprendizaje</SelectItem>
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
