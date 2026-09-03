import { useEffect, useState } from 'react';
import { BriefcaseBusiness, CreditCard, Landmark, Loader2, ShieldCheck, UserRound, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getHrEmployeeDetail } from '@/services/hrControlService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { updateHrEmployeeFields, updateEmploymentStatus, updateEmploymentTermination, type HrEditableValues } from '@/services/hrEmployeeEditService';
import { auth } from '@/config/firebase';
import { toast } from 'sonner';
import { MOTIVOS_RETIRO } from '@/domain/humanResources/terminationReasons';

const money = (value: unknown) => typeof value === 'number'
  ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value)
  : '—';
const value = (input: unknown) => String(input ?? '').trim() || '—';
const dateValue = (input: any): string => {
  if (!input) return '—';
  let parsed: Date;
  if (typeof input?.toDate === 'function') parsed = input.toDate();
  else if (typeof input?.seconds === 'number') parsed = new Date(input.seconds * 1000);
  else if (typeof input?._seconds === 'number') parsed = new Date(input._seconds * 1000);
  else if (typeof input === 'string') {
    const timestampMatch = input.match(/Timestamp\s*\(\s*seconds\s*=\s*(-?\d+)/i);
    if (timestampMatch) parsed = new Date(Number(timestampMatch[1]) * 1000);
    else if (/^\d{4}-\d{2}-\d{2}/.test(input)) {
      const [year, month, day] = input.slice(0, 10).split('-').map(Number);
      parsed = new Date(year, month - 1, day);
    } else parsed = new Date(input);
  } else parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('es-CO');
};
const dateInputValue = (input: any): string => {
  if (!input) return '';
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}/.test(input)) return input.slice(0, 10);
  let parsed: Date;
  if (typeof input?.toDate === 'function') parsed = input.toDate();
  else if (typeof input?.seconds === 'number') parsed = new Date(input.seconds * 1000);
  else if (typeof input?._seconds === 'number') parsed = new Date(input._seconds * 1000);
  else {
    const match = String(input).match(/Timestamp\s*\(\s*seconds\s*=\s*(-?\d+)/i);
    parsed = match ? new Date(Number(match[1]) * 1000) : new Date(input);
  }
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
};
const Field = ({ label, children }: { label: string; children: unknown }) => (
  <div><p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{label}</p><p className="text-sm text-gray-700 mt-0.5 break-words">{value(children)}</p></div>
);

export function HrEmployeeDetailDialog({ employeeId, open, onOpenChange, onUpdated }: {
  employeeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<HrEditableValues>({});
  const [terminationEditId, setTerminationEditId] = useState<string | null>(null);
  const [terminationForm, setTerminationForm] = useState<{ terminationReason: string; terminationCost: string; endDate: string }>({ terminationReason: '', terminationCost: '', endDate: '' });
  const [savingTermination, setSavingTermination] = useState(false);
  const beginTerminationEdit = (relationship: any) => {
    setTerminationForm({
      terminationReason: relationship.terminationReason || '', terminationCost: relationship.terminationCost != null ? String(relationship.terminationCost) : '',
      endDate: dateInputValue(relationship.endDate),
    });
    setTerminationEditId(relationship.id);
  };
  const saveTermination = async (employmentId: string) => {
    if (!employeeId) return;
    setSavingTermination(true);
    try {
      const cost = terminationForm.terminationCost.trim() ? Number(terminationForm.terminationCost.replace(/[^\d-]/g, '')) : undefined;
      await updateEmploymentTermination(employeeId, employmentId, { terminationReason: terminationForm.terminationReason, terminationCost: cost, endDate: terminationForm.endDate }, auth.currentUser?.email || 'usuario-desconocido');
      toast.success('Motivo de retiro actualizado');
      setDetail(await getHrEmployeeDetail(employeeId)); setTerminationEditId(null); onUpdated?.();
    } catch (reason: any) { toast.error('No se pudo guardar', { description: reason?.message }); }
    finally { setSavingTermination(false); }
  };
  const deactivateEmployment = async (employmentId: string) => {
    if (!employeeId) return;
    setSavingTermination(true);
    try {
      const cost = terminationForm.terminationCost.trim() ? Number(terminationForm.terminationCost.replace(/[^\d-]/g, '')) : undefined;
      await updateEmploymentStatus(employeeId, employmentId, 'retired', {
        terminationReason: terminationForm.terminationReason, terminationCost: cost, endDate: terminationForm.endDate,
      }, auth.currentUser?.email || 'usuario-desconocido');
      toast.success('Contrato desactivado');
      setDetail(await getHrEmployeeDetail(employeeId)); setTerminationEditId(null); onUpdated?.();
    } catch (reason: any) { toast.error('No se pudo desactivar', { description: reason?.message }); }
    finally { setSavingTermination(false); }
  };
  const activateEmployment = async (employmentId: string) => {
    if (!employeeId || !window.confirm('¿Deseas activar nuevamente este contrato? Se eliminarán sus datos de retiro.')) return;
    setSavingTermination(true);
    try {
      await updateEmploymentStatus(employeeId, employmentId, 'active', {}, auth.currentUser?.email || 'usuario-desconocido');
      toast.success('Contrato activado');
      setDetail(await getHrEmployeeDetail(employeeId)); setTerminationEditId(null); onUpdated?.();
    } catch (reason: any) { toast.error('No se pudo activar', { description: reason?.message }); }
    finally { setSavingTermination(false); }
  };
  const beginEdit = () => {
    setForm({
      corporateEmail: detail.corporateEmail, personalEmail: detail.personalEmail,
      corporatePhone: detail.corporatePhone, personalPhone: detail.personalPhone,
      eps: detail.socialSecurity?.eps, afp: detail.socialSecurity?.afp, ccf: detail.socialSecurity?.ccf,
      severanceFund: detail.socialSecurity?.severanceFund, bankName: detail.banking?.bankName,
      accountType: detail.banking?.accountType, accountNumber: detail.banking?.accountNumber,
    });
    setEditing(true);
  };
  const save = async () => {
    if (!employeeId) return;
    setSaving(true);
    try {
      const changes = await updateHrEmployeeFields(employeeId, form, auth.currentUser?.email || 'usuario-desconocido');
      toast.success(changes ? `${changes} campo${changes === 1 ? '' : 's'} actualizado${changes === 1 ? '' : 's'}` : 'No había cambios');
      setDetail(await getHrEmployeeDetail(employeeId)); setEditing(false); onUpdated?.();
    } catch (reason: any) { toast.error('No se pudo guardar', { description: reason?.message }); }
    finally { setSaving(false); }
  };
  useEffect(() => {
    if (!open || !employeeId) return;
    setLoading(true); setError(''); setDetail(null);
    getHrEmployeeDetail(employeeId).then(setDetail)
      .catch(reason => setError(reason?.message || 'No fue posible abrir el expediente.'))
      .finally(() => setLoading(false));
  }, [employeeId, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><UserRound className="w-5 h-5 text-[#008C3C]" />Expediente laboral</DialogTitle></DialogHeader>
        {loading && <div className="py-20 text-center text-gray-400"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[#008C3C]" />Cargando información protegida…</div>}
        {error && <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 flex gap-2"><XCircle className="w-5 h-5" />{error}</div>}
        {detail && <div className="space-y-5">
          <section className="rounded-xl bg-gradient-to-r from-[#006330] to-[#008C3C] text-white p-5 flex justify-between gap-4">
            <div>
            <p className="text-xl font-bold">{detail.fullName}</p>
            <p className="text-sm text-green-100 mt-1">Cédula {detail.documentNumber} · {detail.status === 'active' ? 'Vigente' : 'Retirado'}</p>
            <p className="text-xs text-green-200 mt-2">{detail.identityUserId ? 'Cuenta de plataforma vinculada' : 'Sin acceso a la plataforma'}</p>
            </div>
            {!editing && <Button variant="secondary" size="sm" onClick={beginEdit}>Editar expediente</Button>}
          </section>

          {editing && <section className="border-2 border-[#008C3C]/30 bg-green-50/30 rounded-xl p-4 space-y-4">
            <h3 className="font-semibold text-gray-700">Editar campos específicos</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {([
                ['corporateEmail','Correo corporativo'],['personalEmail','Correo personal'],['corporatePhone','Teléfono corporativo'],['personalPhone','Teléfono personal'],
                ['eps','EPS'],['afp','AFP'],['ccf','CCF'],['severanceFund','Cesantías'],
                ['bankName','Banco'],['accountType','Tipo de cuenta'],['accountNumber','Número de cuenta'],
              ] as const).map(([field,label]) => <label key={field} className="text-xs font-medium text-gray-500">{label}<Input className="mt-1 bg-white" value={form[field] ?? ''} onChange={event => setForm(previous => ({ ...previous, [field]: event.target.value }))} /></label>)}
            </div>
            <div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => setEditing(false)}>Cancelar</Button><Button className="bg-[#008C3C] hover:bg-[#006C2F]" disabled={saving} onClick={save}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Guardar cambios</Button></div>
          </section>}

          <section className="border rounded-xl p-4">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2 mb-4"><UserRound className="w-4 h-4" />Datos personales y contacto</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label="Tipo de documento">{detail.documentType}</Field><Field label="Fecha de nacimiento">{dateValue(detail.birthDate)}</Field>
              <Field label="Género">{detail.gender}</Field><Field label="Nacionalidad">{detail.nationality}</Field>
              <Field label="Correo corporativo">{detail.corporateEmail}</Field><Field label="Correo personal">{detail.personalEmail}</Field>
              <Field label="Teléfono corporativo">{detail.corporatePhone}</Field><Field label="Teléfono personal">{detail.personalPhone}</Field>
              <Field label="Ciudad">{detail.residence?.city}</Field><Field label="Departamento">{detail.residence?.department}</Field>
              <div className="sm:col-span-2"><Field label="Dirección">{detail.residence?.address}</Field></div>
            </div>
          </section>

          <section className="border rounded-xl p-4">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2 mb-4"><BriefcaseBusiness className="w-4 h-4" />Relaciones laborales ({detail.relationships.length})</h3>
            <div className="space-y-3">{detail.relationships.map((relationship: any) => <div key={relationship.id} className={`rounded-xl border p-4 ${relationship.status === 'active' ? 'border-green-200 bg-green-50/40' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex justify-between gap-3 mb-3"><div><p className="font-semibold text-gray-800">{value(relationship.companyName)}</p><p className="text-sm text-gray-500">{value(relationship.projectName)}</p></div><span className={`h-fit px-2 py-1 rounded-full text-xs font-semibold ${relationship.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>{relationship.status === 'active' ? 'Vigente' : 'Histórica'}</span></div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3"><Field label="Cargo">{relationship.position}</Field><Field label="Contrato">{relationship.contractType}</Field><Field label="Ingreso">{dateValue(relationship.startDate)}</Field><Field label="Jefe inmediato">{relationship.supervisor}</Field><Field label="Modalidad">{relationship.modality}</Field><Field label="Jornada">{relationship.workday}</Field><Field label="Cuenta analítica">{relationship.analyticalAccount}</Field></div>
              {relationship.status === 'active' && <div className="mt-4 pt-3 border-t border-green-100 flex justify-end">
                {terminationEditId === relationship.id ? (
                  <div className="space-y-2 w-full">
                    <div className="grid sm:grid-cols-3 gap-3">
                      <label className="text-xs font-medium text-gray-500">Fecha de retiro *<Input type="date" className="mt-1 bg-white" value={terminationForm.endDate} onChange={event => setTerminationForm(previous => ({ ...previous, endDate: event.target.value }))} /></label>
                      <label className="text-xs font-medium text-gray-500">Motivo de retiro *<Select value={terminationForm.terminationReason} onValueChange={terminationReason => setTerminationForm(previous => ({ ...previous, terminationReason }))}><SelectTrigger className="mt-1 bg-white"><SelectValue placeholder="Seleccionar motivo" /></SelectTrigger><SelectContent>{terminationForm.terminationReason && !MOTIVOS_RETIRO.includes(terminationForm.terminationReason as any) && <SelectItem value={terminationForm.terminationReason}>{terminationForm.terminationReason}</SelectItem>}{MOTIVOS_RETIRO.map(reason => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}</SelectContent></Select></label>
                      <label className="text-xs font-medium text-gray-500">Costo de retiro<Input className="mt-1 bg-white" value={terminationForm.terminationCost} onChange={event => setTerminationForm(previous => ({ ...previous, terminationCost: event.target.value }))} placeholder="$0" /></label>
                    </div>
                    <div className="flex justify-end gap-2"><Button size="sm" variant="outline" disabled={savingTermination} onClick={() => setTerminationEditId(null)}>Cancelar</Button><Button size="sm" variant="destructive" disabled={savingTermination} onClick={() => deactivateEmployment(relationship.id)}>{savingTermination && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Confirmar retiro</Button></div>
                  </div>
                ) : <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => beginTerminationEdit(relationship)}>Desactivar contrato</Button>}
              </div>}
              {relationship.payroll && <div className="mt-4 pt-3 border-t border-green-100 grid sm:grid-cols-3 gap-3"><Field label="Salario base">{money(relationship.payroll.baseSalary)}</Field><Field label="Auxilio transporte">{money(relationship.payroll.transportAllowance)}</Field><Field label="KPI salarial">{money(relationship.payroll.salaryKpi)}</Field></div>}
              {relationship.status !== 'active' && <div className="mt-4 pt-3 border-t border-gray-200">
                {terminationEditId === relationship.id ? (
                  <div className="space-y-2">
                    <div className="grid sm:grid-cols-3 gap-3">
                      <label className="text-xs font-medium text-gray-500">Fecha de retiro<Input type="date" className="mt-1 bg-white" value={terminationForm.endDate} onChange={event => setTerminationForm(previous => ({ ...previous, endDate: event.target.value }))} /></label>
                      <label className="text-xs font-medium text-gray-500">Motivo de retiro<Select value={terminationForm.terminationReason} onValueChange={terminationReason => setTerminationForm(previous => ({ ...previous, terminationReason }))}><SelectTrigger className="mt-1 bg-white"><SelectValue placeholder="Seleccionar motivo" /></SelectTrigger><SelectContent>{terminationForm.terminationReason && !MOTIVOS_RETIRO.includes(terminationForm.terminationReason as any) && <SelectItem value={terminationForm.terminationReason}>{terminationForm.terminationReason}</SelectItem>}{MOTIVOS_RETIRO.map(reason => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}</SelectContent></Select></label>
                      <label className="text-xs font-medium text-gray-500">Costo de retiro<Input className="mt-1 bg-white" value={terminationForm.terminationCost} onChange={event => setTerminationForm(previous => ({ ...previous, terminationCost: event.target.value }))} placeholder="$0" /></label>
                    </div>
                    <div className="flex justify-end gap-2"><Button size="sm" variant="outline" disabled={savingTermination} onClick={() => setTerminationEditId(null)}>Cancelar</Button><Button size="sm" className="bg-[#008C3C] hover:bg-[#006C2F]" disabled={savingTermination} onClick={() => saveTermination(relationship.id)}>{savingTermination && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Guardar</Button></div>
                  </div>
                ) : (
                  <div className="flex items-end justify-between gap-3">
                    <div className="grid sm:grid-cols-3 gap-3 flex-1"><Field label="Fecha de retiro">{dateValue(relationship.endDate)}</Field><Field label="Motivo de retiro">{relationship.terminationReason}</Field><Field label="Costo de retiro">{relationship.terminationCost != null ? money(relationship.terminationCost) : undefined}</Field></div>
                    <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => beginTerminationEdit(relationship)}>Editar retiro</Button><Button size="sm" className="bg-[#008C3C] hover:bg-[#006C2F]" disabled={savingTermination} onClick={() => activateEmployment(relationship.id)}>Activar contrato</Button></div>
                  </div>
                )}
              </div>}
            </div>)}</div>
          </section>

          <div className="grid md:grid-cols-2 gap-4">
            <section className="border rounded-xl p-4"><h3 className="font-semibold text-gray-700 flex items-center gap-2 mb-4"><Landmark className="w-4 h-4" />Información bancaria</h3><div className="grid grid-cols-2 gap-3"><Field label="Banco">{detail.banking?.bankName}</Field><Field label="Tipo de cuenta">{detail.banking?.accountType}</Field><div className="col-span-2"><Field label="Número de cuenta">{detail.banking?.accountNumber}</Field></div></div></section>
            <section className="border rounded-xl p-4"><h3 className="font-semibold text-gray-700 flex items-center gap-2 mb-4"><ShieldCheck className="w-4 h-4" />Seguridad social</h3><div className="grid grid-cols-2 gap-3"><Field label="EPS">{detail.socialSecurity?.eps}</Field><Field label="AFP">{detail.socialSecurity?.afp}</Field><Field label="CCF">{detail.socialSecurity?.ccf}</Field><Field label="Cesantías">{detail.socialSecurity?.severanceFund}</Field></div></section>
          </div>
          <p className="text-xs text-gray-400 flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" />Información sensible visible únicamente para Administrador y Talento Humano.</p>
        </div>}
      </DialogContent>
    </Dialog>
  );
}
