import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { userService } from '@/services/userService';
import { analyticsService } from '@/services/analyticsService';
import type { User } from '@/models/types/User';

interface RegisterMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const RegisterMovementDialog = ({
  open,
  onOpenChange,
  onSuccess,
}: RegisterMovementDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [formData, setFormData] = useState({
    type: 'ingreso' as 'ingreso' | 'retiro',
    userId: '',
    date: new Date().toISOString().split('T')[0],
    reason: '',
    company: '',
    sede: '',
    area: '',
    cost: '',
    notes: '',
  });

  useEffect(() => {
    if (open) {
      loadUsers();
    }
  }, [open]);

  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      const allUsers = await userService.getAll();
      console.log('Usuarios cargados:', allUsers.length);
      console.log('Roles:', allUsers.map(u => ({ name: u.fullName, role: u.role })));
      setUsers(allUsers);
    } catch (error: any) {
      console.error('Error cargando usuarios:', error);
      toast.error('Error al cargar usuarios', {
        description: error.message,
      });
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleSubmit = async () => {
  if (!formData.userId || !formData.date) {
    toast.error('Completa los campos obligatorios', {
      description: 'Usuario y fecha son requeridos',
    });
    return;
  }

  setLoading(true);

  try {
    const selectedUser = users.find(u => u.id === formData.userId);
    if (!selectedUser) {
      throw new Error('Usuario no encontrado');
    }

    // Crear objeto de movimiento solo con campos que tienen valor
    const movementData: any = {
      type: formData.type,
      userId: formData.userId,
      userName: selectedUser.fullName,
      userEmail: selectedUser.email,
      date: new Date(formData.date),
      createdBy: 'admin',
    };

    // Solo agregar campos opcionales si tienen valor
    if (formData.reason) movementData.reason = formData.reason;
    if (formData.company) movementData.company = formData.company;
    if (formData.sede) movementData.sede = formData.sede;
    if (formData.area) movementData.area = formData.area;
    if (formData.cost) movementData.cost = parseFloat(formData.cost);
    if (formData.notes) movementData.notes = formData.notes;

    // Registrar movimiento
    await analyticsService.registerMovement(movementData);

    // Si es un retiro, actualizar el rol del usuario a 'excolaborador'
    if (formData.type === 'retiro') {
      await userService.update(formData.userId, {
        role: 'excolaborador',
      });
    }

    // Si es un ingreso, actualizar el rol del usuario a 'colaborador'
    if (formData.type === 'ingreso') {
      await userService.update(formData.userId, {
        role: 'colaborador',
      });
    }

    toast.success('Movimiento registrado', {
      description: `${formData.type === 'ingreso' ? 'Ingreso' : 'Retiro'} registrado correctamente`,
    });

    // Resetear formulario
    setFormData({
      type: 'ingreso',
      userId: '',
      date: new Date().toISOString().split('T')[0],
      reason: '',
      company: '',
      sede: '',
      area: '',
      cost: '',
      notes: '',
    });

    onSuccess();
    onOpenChange(false);
  } catch (error: any) {
    toast.error('Error al registrar movimiento', {
      description: error.message,
    });
  } finally {
    setLoading(false);
  }
};
  // Filtrar usuarios según el tipo de movimiento
  const getFilteredUsers = () => {
    if (formData.type === 'ingreso') {
      // Para ingresos: mostrar aspirantes y ex-colaboradores
      const filtered = users.filter(u => 
        u.role === 'aspirante' || u.role === 'excolaborador'
      );
      console.log('Usuarios filtrados para ingreso:', filtered.length);
      return filtered;
    } else {
      // Para retiros: mostrar colaboradores activos
      const filtered = users.filter(u => u.role === 'colaborador');
      console.log('Usuarios filtrados para retiro:', filtered.length);
      return filtered;
    }
  };

  const filteredUsers = getFilteredUsers();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar Movimiento</DialogTitle>
          <DialogDescription>
            Registra un ingreso o retiro de personal
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tipo de movimiento */}
          <div className="space-y-2">
            <Label htmlFor="type">Tipo de Movimiento *</Label>
            <Select
              value={formData.type}
              onValueChange={(value: 'ingreso' | 'retiro') => 
                setFormData({ ...formData, type: value, userId: '' })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ingreso">Ingreso</SelectItem>
                <SelectItem value="retiro">Retiro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Usuario */}
          <div className="space-y-2">
            <Label htmlFor="userId">Usuario *</Label>
            {loadingUsers ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-4 border rounded-lg bg-yellow-50 text-yellow-800">
                <p className="text-sm">
                  {formData.type === 'ingreso' 
                    ? 'No hay aspirantes ni ex-colaboradores disponibles. Crea usuarios con rol "aspirante" o "excolaborador" para registrar ingresos.'
                    : 'No hay colaboradores activos disponibles. Crea usuarios con rol "colaborador" para registrar retiros.'
                  }
                </p>
              </div>
            ) : (
              <Select
                value={formData.userId}
                onValueChange={(value) => setFormData({ ...formData, userId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un usuario" />
                </SelectTrigger>
                <SelectContent>
                  {filteredUsers.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      <div className="flex items-center gap-2">
                        <span>{user.fullName}</span>
                        <span className="text-xs text-gray-500">({user.role})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-gray-500">
              Mostrando {filteredUsers.length} usuario(s) disponibles
              {formData.type === 'ingreso' 
                ? ' (Aspirantes y Ex-colaboradores)'
                : ' (Colaboradores activos)'
              }
            </p>
          </div>

          {/* Fecha */}
          <div className="space-y-2">
            <Label htmlFor="date">Fecha *</Label>
            <Input
              id="date"
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            />
          </div>

          {/* Motivo (solo para retiros) */}
          {formData.type === 'retiro' && (
            <div className="space-y-2">
              <Label htmlFor="reason">Motivo</Label>
              <Select
                value={formData.reason}
                onValueChange={(value) => setFormData({ ...formData, reason: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un motivo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="voluntario">Voluntario</SelectItem>
                  <SelectItem value="involuntario">Involuntario</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Empresa */}
          <div className="space-y-2">
            <Label htmlFor="company">Empresa</Label>
            <Input
              id="company"
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              placeholder="Nombre de la empresa"
            />
          </div>

          {/* Sede */}
          <div className="space-y-2">
            <Label htmlFor="sede">Sede</Label>
            <Input
              id="sede"
              value={formData.sede}
              onChange={(e) => setFormData({ ...formData, sede: e.target.value })}
              placeholder="Sede o ubicación"
            />
          </div>

          {/* Área */}
          <div className="space-y-2">
            <Label htmlFor="area">Área</Label>
            <Input
              id="area"
              value={formData.area}
              onChange={(e) => setFormData({ ...formData, area: e.target.value })}
              placeholder="Área o departamento"
            />
          </div>

          {/* Costo (solo para retiros) */}
          {formData.type === 'retiro' && (
            <div className="space-y-2">
              <Label htmlFor="cost">Costo del Retiro</Label>
              <Input
                id="cost"
                type="number"
                value={formData.cost}
                onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                placeholder="5000000"
              />
            </div>
          )}

          {/* Notas */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notas Adicionales</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Información adicional sobre el movimiento..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading || filteredUsers.length === 0 || !formData.userId}
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Registrar {formData.type === 'ingreso' ? 'Ingreso' : 'Retiro'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};