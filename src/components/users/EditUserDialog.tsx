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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { userService } from '@/services/userService';
import type { User, UserRole } from '@/models/types/User';

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  onUserUpdated: () => void;
}

export const EditUserDialog = ({ open, onOpenChange, user, onUserUpdated }: EditUserDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    fullName: '',
    role: 'colaborador' as UserRole,
    
    // Datos personales
    documentType: '',
    documentNumber: '',
    gender: '',
    birthDate: '',
    phone: '',
    
    // Ubicación
    country: '',
    city: '',
    address: '',
    
    // Contrato (solo colaboradores)
    contractStartDate: '',
    contractEndDate: '',
    probationPeriod: '',
    baseSalary: '',
    position: '',
  });

  useEffect(() => {
    if (user) {
      setFormData({
        email: user.email || '',
        fullName: user.fullName || '',
        role: user.role || 'colaborador',
        
        // Datos personales
        documentType: user.personalData?.documentType || '',
        documentNumber: user.personalData?.documentNumber || '',
        gender: user.personalData?.gender || '',
        birthDate: user.personalData?.birthDate 
          ? formatDateForInput(user.personalData.birthDate)
          : '',
        phone: user.personalData?.phone || '',
        
        // Ubicación
        country: user.location?.country || '',
        city: user.location?.city || '',
        address: user.location?.address || '',
        
        // Contrato
        contractStartDate: user.contractInfo?.contract?.startDate
          ? formatDateForInput(user.contractInfo.contract.startDate)
          : '',
        contractEndDate: user.contractInfo?.contract?.endDate
          ? formatDateForInput(user.contractInfo.contract.endDate)
          : '',
        probationPeriod: user.contractInfo?.contract?.probationPeriod || '',
        baseSalary: user.contractInfo?.workConditions?.baseSalary?.toString() || '',
        position: user.contractInfo?.assignment?.position || '',
      });
    }
  }, [user]);

  const formatDateForInput = (date: any): string => {
    if (!date) return '';
    
    let dateObj: Date;
    
    if (date.toDate && typeof date.toDate === 'function') {
      dateObj = date.toDate();
    } else if (typeof date === 'string') {
      // Si es string en formato DD/MM/YYYY
      const parts = date.split('/');
      if (parts.length === 3) {
        dateObj = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      } else {
        dateObj = new Date(date);
      }
    } else {
      dateObj = new Date(date);
    }
    
    // Formato YYYY-MM-DD para input type="date"
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  };

  const handleSubmit = async () => {
    if (!user) return;

    if (!formData.email.trim() || !formData.fullName.trim()) {
      toast.error('Error', {
        description: 'El email y nombre completo son obligatorios',
      });
      return;
    }

    setLoading(true);

    try {
      const updates: any = {
        email: formData.email,
        fullName: formData.fullName,
        role: formData.role,
        updatedAt: new Date(),
      };

      // Datos personales
      if (formData.documentType || formData.documentNumber || formData.gender || formData.birthDate || formData.phone) {
        updates['personalData.documentType'] = formData.documentType;
        updates['personalData.documentNumber'] = formData.documentNumber;
        updates['personalData.gender'] = formData.gender;
        updates['personalData.phone'] = formData.phone;
        
        if (formData.birthDate) {
          updates['personalData.birthDate'] = new Date(formData.birthDate);
        }
      }

      // Ubicación
      if (formData.country || formData.city || formData.address) {
        updates['location.country'] = formData.country;
        updates['location.city'] = formData.city;
        updates['location.address'] = formData.address;
      }

      // Contrato (solo para colaboradores)
      if (formData.role === 'colaborador') {
        if (formData.contractStartDate) {
          updates['contractInfo.contract.startDate'] = new Date(formData.contractStartDate);
        }
        if (formData.contractEndDate) {
          updates['contractInfo.contract.endDate'] = new Date(formData.contractEndDate);
        }
        if (formData.probationPeriod) {
          updates['contractInfo.contract.probationPeriod'] = formData.probationPeriod;
        }
        if (formData.baseSalary) {
          updates['contractInfo.workConditions.baseSalary'] = parseFloat(formData.baseSalary);
        }
        if (formData.position) {
          updates['contractInfo.assignment.position'] = formData.position;
        }
      }

      await userService.update(user.id, updates);

      toast.success('Usuario actualizado', {
        description: 'Los cambios se han guardado correctamente.',
      });

      onUserUpdated();
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Error al actualizar usuario', {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Editar Usuario</DialogTitle>
          <DialogDescription>
            Actualiza la información del usuario
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic" className="flex-1 overflow-hidden">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">Básico</TabsTrigger>
            <TabsTrigger value="personal">Personal</TabsTrigger>
            <TabsTrigger value="contract">Contrato</TabsTrigger>
          </TabsList>

          <div className="overflow-y-auto max-h-[500px] mt-4">
            {/* TAB: BÁSICO */}
            <TabsContent value="basic" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="usuario@ejemplo.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName">Nombre Completo *</Label>
                <Input
                  id="fullName"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="Juan Pérez"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Rol</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value: UserRole) => setFormData({ ...formData, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="colaborador">Colaborador</SelectItem>
                    <SelectItem value="aspirante">Aspirante</SelectItem>
                    <SelectItem value="excolaborador">Ex-colaborador</SelectItem>
                    <SelectItem value="descartado">Descartado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            {/* TAB: PERSONAL */}
            <TabsContent value="personal" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="documentType">Tipo de Documento</Label>
                  <Select
                    value={formData.documentType}
                    onValueChange={(value) => setFormData({ ...formData, documentType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cédula de Ciudadanía">Cédula de Ciudadanía</SelectItem>
                      <SelectItem value="Cédula de Extranjería">Cédula de Extranjería</SelectItem>
                      <SelectItem value="Pasaporte">Pasaporte</SelectItem>
                      <SelectItem value="Tarjeta de Identidad">Tarjeta de Identidad</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="documentNumber">Número de Documento</Label>
                  <Input
                    id="documentNumber"
                    value={formData.documentNumber}
                    onChange={(e) => setFormData({ ...formData, documentNumber: e.target.value })}
                    placeholder="1234567890"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gender">Género</Label>
                  <Select
                    value={formData.gender}
                    onValueChange={(value) => setFormData({ ...formData, gender: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Masculino">Masculino</SelectItem>
                      <SelectItem value="Femenino">Femenino</SelectItem>
                      <SelectItem value="Otro">Otro</SelectItem>
                      <SelectItem value="Prefiero no decir">Prefiero no decir</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="birthDate">Fecha de Nacimiento</Label>
                  <Input
                    id="birthDate"
                    type="date"
                    value={formData.birthDate}
                    onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="3001234567"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="country">País</Label>
                <Input
                  id="country"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  placeholder="Colombia"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">Ciudad</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Bogotá"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Dirección</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Calle 123 #45-67"
                />
              </div>
            </TabsContent>

            {/* TAB: CONTRATO */}
            <TabsContent value="contract" className="space-y-4">
              {formData.role === 'colaborador' ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="contractStartDate">Fecha de Inicio</Label>
                      <Input
                        id="contractStartDate"
                        type="date"
                        value={formData.contractStartDate}
                        onChange={(e) => setFormData({ ...formData, contractStartDate: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="contractEndDate">Fecha de Fin (Opcional)</Label>
                      <Input
                        id="contractEndDate"
                        type="date"
                        value={formData.contractEndDate}
                        onChange={(e) => setFormData({ ...formData, contractEndDate: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="probationPeriod">Periodo de Prueba</Label>
                    <Input
                      id="probationPeriod"
                      value={formData.probationPeriod}
                      onChange={(e) => setFormData({ ...formData, probationPeriod: e.target.value })}
                      placeholder="3 meses"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="baseSalary">Salario Básico</Label>
                    <Input
                      id="baseSalary"
                      type="number"
                      value={formData.baseSalary}
                      onChange={(e) => setFormData({ ...formData, baseSalary: e.target.value })}
                      placeholder="4500000"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="position">Cargo</Label>
                    <Input
                      id="position"
                      value={formData.position}
                      onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                      placeholder="Desarrollador Full Stack"
                    />
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>La información de contrato solo aplica para colaboradores</p>
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Guardar Cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};