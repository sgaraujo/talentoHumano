import { useState, useEffect, useMemo } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Plus } from 'lucide-react';

const CORPORATE_DOMAIN = 'inteegra.net.co';

const COLOMBIAN_BANKS = [
  'Bancolombia','Banco de Bogotá','Banco Popular','Banco Davivienda',
  'BBVA Colombia','Scotiabank Colpatria','Banco de Occidente','Banco Caja Social',
  'AV Villas','Banco Agrario de Colombia','Banco GNB Sudameris','Banco Itaú',
  'Banco Pichincha','Banco Falabella','Banco Mundo Mujer','Banco W',
  'Banco Finandina','Bancamía','Banco Cooperativo Coopcentral',
  'Nequi','Daviplata','Lulo Bank','Rappipay','Nu Colombia','Dale!','Movii','Uala','Otro',
];
import { toast } from 'sonner';
import { userService } from '@/services/userService';
import { companyService } from '@/services/companyService';
import { projectService } from '@/services/projectService';
import { membershipService } from '@/services/membershipService';
import type { User, UserRole } from '@/models/types/User';
import type { Project } from '@/models/types/Project';

// ─── helpers ─────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  );
}

function ComboInput({
  value, onChange, options, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!value) return options;
    const q = value.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(q) && o !== value);
  }, [options, value]);

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
          {filtered.map(opt => (
            <button
              key={opt}
              type="button"
              onMouseDown={e => { e.preventDefault(); onChange(opt); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
            >
              {opt}
            </button>
          ))}
          {value && !options.includes(value) && (
            <div className="px-3 py-2 text-xs text-[#008C3C] border-t border-gray-100 flex items-center gap-1">
              <Plus className="w-3 h-3" />
              Crear: <span className="font-semibold ml-1">"{value}"</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatDateForInput(date: any): string {
  if (!date) return '';
  let d: Date;
  if (date?.toDate) d = date.toDate();
  else if (typeof date === 'string' && date.includes('/')) {
    const [dd, mm, yyyy] = date.split('/');
    d = new Date(+yyyy, +mm - 1, +dd);
  } else {
    d = new Date(date);
  }
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ─── ProjectComboInput ────────────────────────────────────────────────────────
function ProjectComboInput({
  value, projects, disabled, placeholder, onChange,
}: {
  value: string;
  projects: Project[];
  disabled?: boolean;
  placeholder?: string;
  onChange: (name: string, id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!value) return projects;
    const q = value.toLowerCase();
    return projects.filter(p => p.name.toLowerCase().includes(q));
  }, [projects, value]);

  const isNew = value.trim() !== '' && !projects.some(p => p.name === value);

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={e => onChange(e.target.value, '')}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      {open && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map(p => (
            <button
              key={p.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); onChange(p.name, p.id); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
            >
              {p.name}
            </button>
          ))}
          {filtered.length === 0 && !isNew && (
            <div className="px-3 py-2 text-xs text-gray-400">
              No hay proyectos — escribe para crear uno nuevo
            </div>
          )}
          {isNew && (
            <div className="px-3 py-2 text-xs text-[#008C3C] border-t border-gray-100 flex items-center gap-1">
              <Plus className="w-3 h-3" />
              Crear proyecto: <span className="font-semibold ml-1">"{value}"</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── props ────────────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  onUserUpdated: () => void;
}

export const EditUserDialog = ({ open, onOpenChange, user, onUserUpdated }: Props) => {
  const [loading, setLoading] = useState(false);

  // ── form state ────────────────────────────────────────────────────────────
  const [basic, setBasic] = useState({
    fullName: '', email: '', role: 'colaborador' as UserRole, corporateEmail: '',
  });

  const [contract, setContract] = useState({
    companyId: '', company: '', projectId: '', project: '', leaderId: '', leaderName: '',
    area: '', position: '', sede: '', contractType: '', startDate: '', endDate: '',
  });

  const [ss, setSs] = useState({
    baseSalary: '', salaryType: '', transportAllowance: '', mealAllowance: '', workModality: '',
    eps: '', afp: '', ccf: '', arlRiskLevel: '',
  });

  const [banking, setBanking] = useState({
    bankName: '', accountType: '', accountNumber: '',
  });

  // ── external data ─────────────────────────────────────────────────────────
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects]   = useState<Project[]>([]);
  const [allUsers, setAllUsers]   = useState<any[]>([]);

  // ── load companies + all users once on open ───────────────────────────────
  useEffect(() => {
    if (!open) return;
    companyService.getAll()
      .then((all: any[]) => setCompanies(all.map(c => ({ id: c.id, name: c.name }))))
      .catch(() => {});
    userService.getAll().then(setAllUsers).catch(() => {});
  }, [open]);

  // ── load projects when company changes ────────────────────────────────────
  useEffect(() => {
    if (!contract.companyId && !contract.company) { setProjects([]); return; }
    projectService.getByCompanyFull(contract.companyId || '', contract.company || '').then(setProjects).catch(e => console.error('Error loading projects:', e));
  }, [contract.companyId]);

  // ── populate form when user changes ──────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    setBasic({
      fullName:       user.fullName || '',
      email:          user.email    || '',
      role:           user.role     || 'colaborador',
      corporateEmail: user.location?.corporateEmail || '',
    });
    setContract({
      companyId:    user.contractInfo?.assignment?.companyId    || '',
      company:      user.contractInfo?.assignment?.company      || '',
      projectId:    user.contractInfo?.assignment?.projectId    || '',
      project:      user.contractInfo?.assignment?.project      || '',
      leaderId:     user.leaderId                               || '',
      leaderName:   user.contractInfo?.assignment?.leaderName   || '',
      area:         user.contractInfo?.assignment?.area         || '',
      position:     user.contractInfo?.assignment?.position     || '',
      sede:         user.contractInfo?.assignment?.location     || '',
      contractType: user.contractInfo?.contract?.contractType   || '',
      startDate:    formatDateForInput(user.contractInfo?.contract?.startDate),
      endDate:      formatDateForInput(user.contractInfo?.contract?.endDate),
    });
    setSs({
      baseSalary:          user.salaryInfo?.baseSalary?.toString()                 || '',
      salaryType:          user.salaryInfo?.salaryType                             || '',
      transportAllowance:  user.salaryInfo?.transportAllowance?.toString()         || '',
      mealAllowance:       (user.salaryInfo as any)?.mealAllowance?.toString()     || '',
      workModality:        user.contractInfo?.workConditions?.workModality         || '',
      eps:                 user.socialSecurity?.eps                                || '',
      afp:                 user.socialSecurity?.afp                                || '',
      ccf:                 user.socialSecurity?.ccf                                || '',
      arlRiskLevel:        user.socialSecurity?.arlRiskLevel                       || '',
    });
    setBanking({
      bankName:      user.bankingInfo?.bankName      || '',
      accountType:   user.bankingInfo?.accountType   || '',
      accountNumber: user.bankingInfo?.accountNumber || '',
    });
  }, [user]);

  // ── derive autocomplete options from company users ────────────────────────
  const companyUsers = useMemo(
    () => allUsers.filter(u =>
      u.id !== user?.id && (
        (u.companyIds && u.companyIds.includes(contract.companyId)) ||
        u.contractInfo?.assignment?.company === contract.company
      )
    ),
    [allUsers, contract.companyId, contract.company, user?.id],
  );

  const leaderOptions = useMemo(
    () => companyUsers.filter(u => u.role === 'lider' || u.role === 'colaborador'),
    [companyUsers],
  );

  const uniq = (arr: (string | undefined)[]) =>
    [...new Set(arr.filter((v): v is string => !!v))].sort();

  const areaOptions     = useMemo(() => uniq(companyUsers.map(u => u.contractInfo?.assignment?.area)),     [companyUsers]);
  const positionOptions = useMemo(() => uniq(companyUsers.map(u => u.contractInfo?.assignment?.position)), [companyUsers]);
  const sedeOptions     = useMemo(() => uniq(companyUsers.map(u => u.contractInfo?.assignment?.location)), [companyUsers]);

  // ── submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!user) return;
    if (!basic.email.trim() || !basic.fullName.trim()) {
      toast.error('Error', { description: 'Nombre y correo son obligatorios.' });
      return;
    }

    setLoading(true);
    try {
      const upd: Record<string, any> = {
        email:    basic.email,
        fullName: basic.fullName,
        role:     basic.role,
      };
      const set = (k: string, v: any) => { if (v !== '' && v != null) upd[k] = v; };

      set('location.corporateEmail',                  basic.corporateEmail);

      set('contractInfo.assignment.companyId',        contract.companyId);
      set('contractInfo.assignment.company',          contract.company);
      set('contractInfo.assignment.projectId',        contract.projectId);
      set('contractInfo.assignment.project',          contract.project);
      set('contractInfo.assignment.leaderName',       contract.leaderName);
      set('contractInfo.assignment.area',             contract.area);
      set('contractInfo.assignment.position',         contract.position);
      set('contractInfo.assignment.location',         contract.sede);
      set('contractInfo.contract.contractType',       contract.contractType);
      if (contract.leaderId) upd['leaderId'] = contract.leaderId;
      if (contract.startDate) upd['contractInfo.contract.startDate'] = parseLocalDate(contract.startDate);
      if (contract.endDate)   upd['contractInfo.contract.endDate']   = parseLocalDate(contract.endDate);

      set('salaryInfo.baseSalary',                    ss.baseSalary ? Number(ss.baseSalary) : undefined);
      set('salaryInfo.salaryType',                    ss.salaryType);
      set('salaryInfo.transportAllowance',            ss.transportAllowance ? Number(ss.transportAllowance) : undefined);
      set('salaryInfo.mealAllowance',                 ss.mealAllowance ? Number(ss.mealAllowance) : undefined);
      set('contractInfo.workConditions.workModality', ss.workModality);
      set('socialSecurity.eps',                       ss.eps);
      set('socialSecurity.afp',                       ss.afp);
      set('socialSecurity.ccf',                       ss.ccf);
      set('socialSecurity.arlRiskLevel',              ss.arlRiskLevel);

      set('bankingInfo.bankName',                     banking.bankName);
      set('bankingInfo.accountType',                  banking.accountType);
      set('bankingInfo.accountNumber',                banking.accountNumber);

      // Si el proyecto es nuevo (nombre escrito manualmente, sin ID), crearlo
      let resolvedProjectId = contract.projectId;
      if (contract.project.trim() && !contract.projectId && contract.companyId) {
        try {
          resolvedProjectId = await projectService.create({
            name: contract.project.trim(),
            companyId: contract.companyId,
            companyName: contract.company,
            status: 'activo',
            priority: 'media',
          });
          upd['contractInfo.assignment.projectId'] = resolvedProjectId;
        } catch (e) { console.warn('Project auto-create failed:', e); }
      }

      await userService.update(user.id, upd);

      // Sync memberships
      if (contract.companyId) {
        await membershipService.addToCompany(user.id, contract.companyId, basic.role === 'lider' ? 'lider' : 'miembro');
      }
      if (resolvedProjectId && contract.companyId) {
        await membershipService.addToProject(user.id, resolvedProjectId, contract.companyId, basic.role === 'lider' ? 'lider' : 'miembro');
      }

      toast.success('Usuario actualizado', {
        description: 'Los cambios se guardaron correctamente.',
      });
      onUserUpdated();
      onOpenChange(false);
    } catch (err: any) {
      toast.error('Error al actualizar', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Editar Usuario</DialogTitle>
          <DialogDescription>Actualiza la información de {user.fullName}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">Básico</TabsTrigger>
            <TabsTrigger value="contract">Contrato</TabsTrigger>
            <TabsTrigger value="salary">Salario</TabsTrigger>
            <TabsTrigger value="banking">Bancario</TabsTrigger>
          </TabsList>

          <div className="overflow-y-auto flex-1 mt-4 pr-1">

            {/* ── TAB: BÁSICO ───────────────────────────────────────────── */}
            <TabsContent value="basic" className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-0">
              <div className="sm:col-span-2">
                <Field label="Nombre completo *">
                  <Input
                    value={basic.fullName}
                    onChange={e => setBasic(p => ({ ...p, fullName: e.target.value }))}
                    placeholder="Juan Pérez"
                  />
                </Field>
              </div>

              <Field label="Correo personal *">
                <Input
                  type="email"
                  value={basic.email}
                  onChange={e => setBasic(p => ({ ...p, email: e.target.value }))}
                  placeholder="juan@gmail.com"
                />
                {basic.email.includes(CORPORATE_DOMAIN) && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠️ Parece un correo corporativo. Los cuestionarios deben enviarse al correo personal.
                  </p>
                )}
              </Field>

              <Field label="Tipo de usuario">
                <Select value={basic.role} onValueChange={v => setBasic(p => ({ ...p, role: v as UserRole }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="colaborador">Colaborador</SelectItem>
                    <SelectItem value="lider">Líder</SelectItem>
                    <SelectItem value="aspirante">Aspirante</SelectItem>
                    <SelectItem value="excolaborador">Ex-colaborador</SelectItem>
                    <SelectItem value="descartado">Descartado</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <div className="sm:col-span-2">
                <Field label="Correo corporativo">
                  <Input
                    type="email"
                    value={basic.corporateEmail}
                    onChange={e => setBasic(p => ({ ...p, corporateEmail: e.target.value }))}
                    placeholder="nombre.apellido@inteegra.net.co"
                  />
                </Field>
              </div>
            </TabsContent>

            {/* ── TAB: CONTRATO ─────────────────────────────────────────── */}
            <TabsContent value="contract" className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-0">
              <div className="sm:col-span-2">
                <Field label="Empresa">
                  <Select
                    value={contract.companyId}
                    onValueChange={v => {
                      const c = companies.find(c => c.id === v);
                      setContract(p => ({
                        ...p,
                        companyId: v,
                        company: c?.name || '',
                        projectId: '', project: '',
                        leaderId: '', leaderName: '',
                        area: '', position: '', sede: '',
                      }));
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Seleccionar empresa" /></SelectTrigger>
                    <SelectContent>
                      {companies.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field label="Proyecto">
                <ProjectComboInput
                  key={`proj-${contract.companyId}`}
                  value={contract.project}
                  projects={projects}
                  disabled={!contract.companyId}
                  placeholder={contract.companyId ? 'Seleccionar o crear proyecto…' : 'Primero selecciona empresa'}
                  onChange={(name, id) =>
                    setContract(p => ({ ...p, project: name, projectId: id }))
                  }
                />
              </Field>

              <Field label="Líder">
                <Select
                  value={contract.leaderId}
                  onValueChange={v => {
                    const l = leaderOptions.find(u => u.id === v);
                    setContract(p => ({ ...p, leaderId: v, leaderName: l?.fullName || '' }));
                  }}
                  disabled={!contract.companyId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar líder (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {leaderOptions.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Área / Departamento">
                <ComboInput
                  key={`area-${contract.companyId}`}
                  value={contract.area}
                  onChange={v => setContract(p => ({ ...p, area: v }))}
                  options={areaOptions}
                  placeholder={areaOptions.length ? `${areaOptions.length} disponibles…` : 'Ej: Recursos Humanos'}
                />
              </Field>

              <Field label="Cargo / Posición">
                <ComboInput
                  key={`pos-${contract.companyId}`}
                  value={contract.position}
                  onChange={v => setContract(p => ({ ...p, position: v }))}
                  options={positionOptions}
                  placeholder={positionOptions.length ? `${positionOptions.length} disponibles…` : 'Ej: Analista'}
                />
              </Field>

              <Field label="Sede">
                <ComboInput
                  key={`sede-${contract.companyId}`}
                  value={contract.sede}
                  onChange={v => setContract(p => ({ ...p, sede: v }))}
                  options={sedeOptions}
                  placeholder={sedeOptions.length ? `${sedeOptions.length} disponibles…` : 'Ej: Bogotá'}
                />
              </Field>

              <Field label="Tipo de contrato">
                <Select value={contract.contractType}
                  onValueChange={v => setContract(p => ({ ...p, contractType: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Término fijo">Término fijo</SelectItem>
                    <SelectItem value="Término indefinido">Término indefinido</SelectItem>
                    <SelectItem value="Prestación de servicios">Prestación de servicios</SelectItem>
                    <SelectItem value="Contrato de aprendizaje">Contrato de aprendizaje</SelectItem>
                    <SelectItem value="Obra o labor">Obra o labor</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Fecha de inicio">
                <Input type="date" value={contract.startDate}
                  onChange={e => setContract(p => ({ ...p, startDate: e.target.value }))} />
              </Field>

              <div className="sm:col-span-2">
                <Field label="Fecha de fin (opcional)">
                  <Input type="date" value={contract.endDate}
                    onChange={e => setContract(p => ({ ...p, endDate: e.target.value }))} />
                </Field>
              </div>
            </TabsContent>

            {/* ── TAB: SALARIO + SEG. SOCIAL ────────────────────────────── */}
            <TabsContent value="salary" className="space-y-5 mt-0">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Salario</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Salario base (COP)">
                    <Input type="number" placeholder="0" value={ss.baseSalary}
                      onChange={e => setSs(p => ({ ...p, baseSalary: e.target.value }))} />
                  </Field>
                  <Field label="Tipo de salario">
                    <Select value={ss.salaryType} onValueChange={v => setSs(p => ({ ...p, salaryType: v }))}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Salario ordinario">Salario ordinario</SelectItem>
                        <SelectItem value="Salario integral">Salario integral</SelectItem>
                        <SelectItem value="Honorarios">Honorarios</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Auxilio de transporte (COP)">
                    <Input type="number" placeholder="0" value={ss.transportAllowance}
                      onChange={e => setSs(p => ({ ...p, transportAllowance: e.target.value }))} />
                  </Field>
                  <Field label="Auxilio de alimentación (COP)">
                    <Input type="number" placeholder="0" value={ss.mealAllowance}
                      onChange={e => setSs(p => ({ ...p, mealAllowance: e.target.value }))} />
                  </Field>
                  <Field label="Modalidad de trabajo">
                    <Select value={ss.workModality} onValueChange={v => setSs(p => ({ ...p, workModality: v }))}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="presencial">Presencial</SelectItem>
                        <SelectItem value="remoto">Remoto</SelectItem>
                        <SelectItem value="híbrido">Híbrido</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </div>

              <div className="h-px bg-gray-100" />

              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Seguridad Social</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="EPS">
                    <Input placeholder="Ej: Sura, Compensar…" value={ss.eps}
                      onChange={e => setSs(p => ({ ...p, eps: e.target.value }))} />
                  </Field>
                  <Field label="Fondo de pensiones (AFP)">
                    <Input placeholder="Ej: Protección, Porvenir…" value={ss.afp}
                      onChange={e => setSs(p => ({ ...p, afp: e.target.value }))} />
                  </Field>
                  <Field label="Caja de compensación (CCF)">
                    <Input placeholder="Ej: Compensar, Cafam…" value={ss.ccf}
                      onChange={e => setSs(p => ({ ...p, ccf: e.target.value }))} />
                  </Field>
                  <Field label="Nivel de riesgo ARL">
                    <Select value={ss.arlRiskLevel} onValueChange={v => setSs(p => ({ ...p, arlRiskLevel: v }))}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="I">Nivel I – Riesgo mínimo</SelectItem>
                        <SelectItem value="II">Nivel II – Riesgo bajo</SelectItem>
                        <SelectItem value="III">Nivel III – Riesgo medio</SelectItem>
                        <SelectItem value="IV">Nivel IV – Riesgo alto</SelectItem>
                        <SelectItem value="V">Nivel V – Riesgo máximo</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </div>
            </TabsContent>

            {/* ── TAB: BANCARIO ─────────────────────────────────────────── */}
            <TabsContent value="banking" className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-0">
              <div className="sm:col-span-2">
                <Field label="Banco">
                  <Select value={banking.bankName}
                    onValueChange={v => setBanking(p => ({ ...p, bankName: v }))}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar banco" /></SelectTrigger>
                    <SelectContent>
                      {COLOMBIAN_BANKS.map(b => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Tipo de cuenta">
                <Select value={banking.accountType}
                  onValueChange={v => setBanking(p => ({ ...p, accountType: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cuenta de ahorros">Cuenta de ahorros</SelectItem>
                    <SelectItem value="Cuenta corriente">Cuenta corriente</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Número de cuenta">
                <Input placeholder="000000000000" value={banking.accountNumber}
                  onChange={e => setBanking(p => ({ ...p, accountNumber: e.target.value }))} />
              </Field>
            </TabsContent>

          </div>
        </Tabs>

        {/* ── FOOTER ──────────────────────────────────────────────────────── */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}
            className="bg-[#008C3C] hover:bg-[#006C2F] text-white">
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Guardar cambios
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
