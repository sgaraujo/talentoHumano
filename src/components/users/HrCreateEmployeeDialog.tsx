import { useEffect, useMemo, useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createHrEmployee } from '@/services/hrEmployeeEditService';
import { companyService } from '@/services/companyService';
import { projectService } from '@/services/projectService';
import { auth } from '@/config/firebase';
import { toast } from 'sonner';
import type { Company } from '@/models/types/Company';
import type { Project } from '@/models/types/Project';

const EMPTY_EMPLOYEE = {
  documentType: 'CC', documentNumber: '', fullName: '', birthDate: '', gender: '', nationality: '',
  personalEmail: '', personalPhone: '', corporateEmail: '', corporatePhone: '',
  city: '', department: '', address: '',
};

const EMPTY_EMPLOYMENT = {
  companyId: '', projectId: '', position: '', contractType: '', startDate: '',
  modality: '', workday: '', supervisor: '', area: '',
};

export function HrCreateEmployeeDialog({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [employee, setEmployee] = useState({ ...EMPTY_EMPLOYEE });
  const [employment, setEmployment] = useState({ ...EMPTY_EMPLOYMENT });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmployee({ ...EMPTY_EMPLOYEE });
    setEmployment({ ...EMPTY_EMPLOYMENT });
    Promise.all([companyService.getAll(), projectService.getAll()])
      .then(([comps, projs]) => { setCompanies(comps); setProjects(projs); })
      .catch(() => toast.error('No se pudieron cargar empresas y proyectos'));
  }, [open]);

  const visibleProjects = useMemo(
    () => projects.filter(p => !employment.companyId || p.companyId === employment.companyId),
    [projects, employment.companyId],
  );

  const setEmp = (field: keyof typeof EMPTY_EMPLOYEE, value: string) => setEmployee(prev => ({ ...prev, [field]: value }));
  const setRel = (field: keyof typeof EMPTY_EMPLOYMENT, value: string) => setEmployment(prev => ({ ...prev, [field]: value }));

  const handleCreate = async () => {
    if (!employee.documentNumber.trim() || !employee.fullName.trim()) {
      toast.error('Cédula y nombre completo son obligatorios');
      return;
    }
    setSaving(true);
    try {
      const selectedCompany = companies.find(c => c.id === employment.companyId);
      const selectedProject = projects.find(p => p.id === employment.projectId);
      const hasEmployment = Boolean(employment.companyId);
      await createHrEmployee(
        employee,
        hasEmployment ? {
          companyId: employment.companyId, companyName: selectedCompany?.name,
          projectId: employment.projectId || undefined, projectName: selectedProject?.name,
          position: employment.position, contractType: employment.contractType, startDate: employment.startDate,
          modality: employment.modality, workday: employment.workday, supervisor: employment.supervisor, area: employment.area,
        } : null,
        auth.currentUser?.email || 'usuario-desconocido',
      );
      toast.success(`Expediente de ${employee.fullName} creado`);
      onCreated?.();
      onOpenChange(false);
    } catch (reason: any) {
      toast.error('No se pudo crear el expediente', { description: reason?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[#008C3C]" /> Nueva persona
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <section className="border rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-gray-700">Datos personales</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="text-xs font-medium text-gray-500">Tipo de documento
                <Input className="mt-1" value={employee.documentType} onChange={e => setEmp('documentType', e.target.value)} placeholder="CC" />
              </label>
              <label className="text-xs font-medium text-gray-500">Cédula *
                <Input className="mt-1" value={employee.documentNumber} onChange={e => setEmp('documentNumber', e.target.value)} placeholder="1234567890" />
              </label>
              <label className="text-xs font-medium text-gray-500 sm:col-span-2">Nombre completo *
                <Input className="mt-1" value={employee.fullName} onChange={e => setEmp('fullName', e.target.value)} placeholder="Nombre Apellido" />
              </label>
              <label className="text-xs font-medium text-gray-500">Fecha de nacimiento
                <Input type="date" className="mt-1" value={employee.birthDate} onChange={e => setEmp('birthDate', e.target.value)} />
              </label>
              <label className="text-xs font-medium text-gray-500">Género
                <Input className="mt-1" value={employee.gender} onChange={e => setEmp('gender', e.target.value)} />
              </label>
              <label className="text-xs font-medium text-gray-500">Nacionalidad
                <Input className="mt-1" value={employee.nationality} onChange={e => setEmp('nationality', e.target.value)} />
              </label>
              <label className="text-xs font-medium text-gray-500">Correo corporativo
                <Input className="mt-1" value={employee.corporateEmail} onChange={e => setEmp('corporateEmail', e.target.value)} />
              </label>
              <label className="text-xs font-medium text-gray-500">Correo personal
                <Input className="mt-1" value={employee.personalEmail} onChange={e => setEmp('personalEmail', e.target.value)} />
              </label>
              <label className="text-xs font-medium text-gray-500">Teléfono corporativo
                <Input className="mt-1" value={employee.corporatePhone} onChange={e => setEmp('corporatePhone', e.target.value)} />
              </label>
              <label className="text-xs font-medium text-gray-500">Teléfono personal
                <Input className="mt-1" value={employee.personalPhone} onChange={e => setEmp('personalPhone', e.target.value)} />
              </label>
              <label className="text-xs font-medium text-gray-500">Ciudad
                <Input className="mt-1" value={employee.city} onChange={e => setEmp('city', e.target.value)} />
              </label>
              <label className="text-xs font-medium text-gray-500">Departamento
                <Input className="mt-1" value={employee.department} onChange={e => setEmp('department', e.target.value)} />
              </label>
              <label className="text-xs font-medium text-gray-500 sm:col-span-2 lg:col-span-4">Dirección
                <Input className="mt-1" value={employee.address} onChange={e => setEmp('address', e.target.value)} />
              </label>
            </div>
          </section>

          <section className="border rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-gray-700">Relación laboral inicial</h3>
            <p className="text-xs text-gray-400 -mt-2">Opcional — si no seleccionas empresa, el expediente queda creado sin vínculo activo.</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Empresa</Label>
                <Select value={employment.companyId} onValueChange={v => setEmployment(prev => ({ ...prev, companyId: v, projectId: '' }))}>
                  <SelectTrigger><SelectValue placeholder="Sin empresa" /></SelectTrigger>
                  <SelectContent>
                    {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Proyecto</Label>
                <Select disabled={!employment.companyId} value={employment.projectId} onValueChange={v => setRel('projectId', v)}>
                  <SelectTrigger><SelectValue placeholder="Sin proyecto" /></SelectTrigger>
                  <SelectContent>
                    {visibleProjects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <label className="text-xs font-medium text-gray-500">Cargo
                <Input className="mt-1" value={employment.position} onChange={e => setRel('position', e.target.value)} />
              </label>
              <label className="text-xs font-medium text-gray-500">Tipo de contrato
                <Input className="mt-1" value={employment.contractType} onChange={e => setRel('contractType', e.target.value)} />
              </label>
              <label className="text-xs font-medium text-gray-500">Fecha de ingreso
                <Input type="date" className="mt-1" value={employment.startDate} onChange={e => setRel('startDate', e.target.value)} />
              </label>
              <label className="text-xs font-medium text-gray-500">Modalidad
                <Input className="mt-1" value={employment.modality} onChange={e => setRel('modality', e.target.value)} placeholder="Presencial / Remoto" />
              </label>
              <label className="text-xs font-medium text-gray-500">Jornada
                <Input className="mt-1" value={employment.workday} onChange={e => setRel('workday', e.target.value)} />
              </label>
              <label className="text-xs font-medium text-gray-500">Jefe inmediato
                <Input className="mt-1" value={employment.supervisor} onChange={e => setRel('supervisor', e.target.value)} />
              </label>
              <label className="text-xs font-medium text-gray-500">Área
                <Input className="mt-1" value={employment.area} onChange={e => setRel('area', e.target.value)} />
              </label>
            </div>
          </section>

          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button className="bg-[#008C3C] hover:bg-[#006C2F]" disabled={saving} onClick={handleCreate}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Crear expediente
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
