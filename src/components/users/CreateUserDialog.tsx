import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import {
  Check, Loader2, Sparkles, ChevronRight, ChevronLeft,
  User, Briefcase, DollarSign, CreditCard, Send, Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import type { UserRole } from '@/models/types/User';
import type { Questionnaire } from '@/models/types/Questionnaire';
import { userService } from '@/services/userService';
import { questionnaireService } from '@/services/questionnaireService';
import { assignmentService } from '@/services/assignmentService';
import { analyticsService } from '@/services/analyticsService';
import { companyService } from '@/services/companyService';
import { projectService } from '@/services/projectService';
import { membershipService } from '@/services/membershipService';
import type { Project } from '@/models/types/Project';

const CORPORATE_DOMAIN = 'inteegra.net.co';
const DEFAULT_Q_TITLES = [
  'Datos Personales',
  'Datos Sociodemográficos',
  'Perfil Profesional',
  'Ubicación y Contacto',
];

function generateCorporateEmail(fullName: string): string {
  const parts = fullName
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z\s]/g, '')
    .trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0];
  const last  = parts.length >= 3 ? parts[2] : parts[1] ?? '';
  return last ? `${first}.${last}@${CORPORATE_DOMAIN}` : `${first}@${CORPORATE_DOMAIN}`;
}

// ─── ComboInput: text input with autocomplete dropdown ─────────────────────
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

// ─── small helpers ─────────────────────────────────────────────────────────
function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function CheckRow({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: string;
}) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className="flex items-start gap-2.5 text-left w-full py-1">
      <div className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors
        ${checked ? 'bg-[#008C3C] border-[#008C3C]' : 'border-gray-300'}`}>
        {checked && <Check className="w-2.5 h-2.5 text-white" />}
      </div>
      <div>
        <p className={`text-sm font-medium ${checked ? 'text-[#008C3C]' : 'text-gray-700'}`}>{label}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
    </button>
  );
}

const STEPS = [
  { label: 'Básico',   Icon: User },
  { label: 'Contrato', Icon: Briefcase },
  { label: 'Salario',  Icon: DollarSign },
  { label: 'Bancario', Icon: CreditCard },
  { label: 'Enviar',   Icon: Send },
];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1 mb-5">
      {STEPS.map(({ label, Icon }, i) => (
        <div key={i} className="flex items-center gap-1 flex-1 min-w-0">
          <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap
            ${i === current ? 'bg-[#008C3C] text-white'
              : i < current ? 'bg-[#008C3C]/10 text-[#008C3C]'
              : 'bg-gray-100 text-gray-400'}`}>
            {i < current ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
            <span className="hidden sm:inline">{label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-px ${i < current ? 'bg-[#008C3C]/30' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── main component ────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUserCreated: () => void;
}

export const CreateUserDialog = ({ open, onOpenChange, onUserCreated }: Props) => {
  const [step, setStep]       = useState(0);
  const [loading, setLoading] = useState(false);

  // Step 0
  const [basic, setBasic] = useState({
    fullName: '', email: '', role: 'colaborador' as UserRole, corporateEmail: '',
  });
  const [corpEdited, setCorpEdited] = useState(false);

  // Step 1
  const [contract, setContract] = useState({
    companyId: '', company: '',
    projectId: '', project: '',
    leaderId: '',  leaderName: '',
    area: '', position: '', sede: '',
    contractType: '', startDate: '',
  });
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [projects,  setProjects]  = useState<Project[]>([]);
  const [allUsers,  setAllUsers]  = useState<any[]>([]);

  // Step 2
  const [ss, setSs] = useState({
    baseSalary: '', salaryType: '', transportAllowance: '', workModality: '',
    eps: '', afp: '', ccf: '', arlRiskLevel: '',
  });

  // Step 3
  const [banking, setBanking] = useState({ bankName: '', accountType: '', accountNumber: '' });

  // Step 4
  const [sendWelcome, setSendWelcome]       = useState(true);
  const [selectedQs,  setSelectedQs]        = useState<string[]>([]);
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);

  // ── auto corporate email ─────────────────────────────────────────────────
  useEffect(() => {
    if (!corpEdited)
      setBasic(p => ({ ...p, corporateEmail: generateCorporateEmail(p.fullName) }));
  }, [basic.fullName, corpEdited]);

  // ── load data per step ───────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 1) return;
    if (companies.length === 0)
      companyService.getAll()
        .then((all: any[]) => setCompanies(all.map(c => ({ id: c.id, name: c.name }))))
        .catch(() => {});
    if (allUsers.length === 0)
      userService.getAll().then(setAllUsers).catch(() => {});
  }, [step]);

  useEffect(() => {
    if (step !== 4) return;
    questionnaireService.getAll().then(all => {
      const active = all.filter(q => q.active);
      setQuestionnaires(active);
      if (selectedQs.length === 0)
        setSelectedQs(active.filter(q => DEFAULT_Q_TITLES.includes(q.title)).map(q => q.id));
    }).catch(() => {});
  }, [step]);

  // ── cargar proyectos cuando cambia la empresa ────────────────────────────
  useEffect(() => {
    if (!contract.companyId) { setProjects([]); return; }
    projectService.getByCompany(contract.companyId).then(setProjects).catch(() => {});
    // resetear campos dependientes de empresa
    setContract(p => ({ ...p, projectId: '', project: '', leaderId: '', leaderName: '', area: '', position: '', sede: '' }));
  }, [contract.companyId]);

  // ── reset on close ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setStep(0);
      setBasic({ fullName: '', email: '', role: 'colaborador', corporateEmail: '' });
      setCorpEdited(false);
      setContract({ companyId: '', company: '', projectId: '', project: '', leaderId: '', leaderName: '', area: '', position: '', sede: '', contractType: '', startDate: '' });
      setSs({ baseSalary: '', salaryType: '', transportAllowance: '', workModality: '', eps: '', afp: '', ccf: '', arlRiskLevel: '' });
      setBanking({ bankName: '', accountType: '', accountNumber: '' });
      setSendWelcome(true);
      setSelectedQs([]);
      setQuestionnaires([]);
    }
  }, [open]);

  // ── opciones derivadas de usuarios de la empresa ─────────────────────────
  const companyUsers = useMemo(() =>
    allUsers.filter(u =>
      u.companyIds?.includes(contract.companyId) ||
      u.contractInfo?.assignment?.company === contract.company
    ),
    [allUsers, contract.companyId, contract.company]
  );

  const uniq = (arr: (string | undefined)[]) =>
    [...new Set(arr.filter((v): v is string => !!v))].sort();

  const areaOptions     = useMemo(() => uniq(companyUsers.map(u => u.contractInfo?.assignment?.area)),     [companyUsers]);
  const positionOptions = useMemo(() => uniq(companyUsers.map(u => u.contractInfo?.assignment?.position)), [companyUsers]);
  const sedeOptions     = useMemo(() => uniq(companyUsers.map(u => u.contractInfo?.assignment?.location)), [companyUsers]);

  // Líderes disponibles en esta empresa
  const leaderOptions = useMemo(() =>
    companyUsers.filter(u => u.role === 'lider' || u.role === 'colaborador'),
    [companyUsers]
  );

  // ── submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setLoading(true);
    try {
      const exists = await userService.checkEmailExists(basic.email);
      if (exists) throw new Error('Ya existe un usuario con ese correo.');

      const newUserId = await userService.createUser({
        email: basic.email, fullName: basic.fullName, role: basic.role,
      });

      const upd: Record<string, any> = {};
      const set = (k: string, v: any) => { if (v !== '' && v != null) upd[k] = v; };

      set('location.corporateEmail',                  basic.corporateEmail);
      set('contractInfo.assignment.company',          contract.company);
      set('contractInfo.assignment.area',             contract.area);
      set('contractInfo.assignment.position',         contract.position);
      set('contractInfo.assignment.project',          contract.project);
      set('contractInfo.assignment.location',         contract.sede);
      set('contractInfo.contract.contractType',       contract.contractType);
      set('contractInfo.contract.startDate',          contract.startDate);
      set('leaderId',                                 contract.leaderId);
      set('salaryInfo.baseSalary',                    ss.baseSalary ? Number(ss.baseSalary) : '');
      set('salaryInfo.salaryType',                    ss.salaryType);
      set('salaryInfo.transportAllowance',            ss.transportAllowance ? Number(ss.transportAllowance) : '');
      set('contractInfo.workConditions.workModality', ss.workModality);
      set('socialSecurity.eps',                       ss.eps);
      set('socialSecurity.afp',                       ss.afp);
      set('socialSecurity.ccf',                       ss.ccf);
      set('socialSecurity.arlRiskLevel',              ss.arlRiskLevel);
      set('bankingInfo.bankName',                     banking.bankName);
      set('bankingInfo.accountType',                  banking.accountType);
      set('bankingInfo.accountNumber',                banking.accountNumber);

      if (Object.keys(upd).length > 0) await userService.update(newUserId, upd);

      // Crear membresías (empresa + proyecto)
      if (contract.companyId) {
        try {
          await membershipService.addToCompany(newUserId, contract.companyId,
            basic.role === 'lider' ? 'lider' : 'miembro');
        } catch (e) { console.warn('Company membership failed:', e); }
      }
      if (contract.projectId && contract.companyId) {
        try {
          await membershipService.addToProject(newUserId, contract.projectId, contract.companyId,
            basic.role === 'lider' ? 'lider' : 'miembro');
        } catch (e) { console.warn('Project membership failed:', e); }
      }

      // Registrar movimiento de ingreso automáticamente para colaboradores y líderes
      if (basic.role === 'colaborador' || basic.role === 'lider') {
        try {
          const movDate = contract.startDate
            ? (() => { const [y, m, d] = contract.startDate.split('-').map(Number); return new Date(y, m - 1, d); })()
            : new Date();
          await analyticsService.registerMovement({
            type: 'ingreso',
            userId: newUserId,
            userName: basic.fullName,
            userEmail: basic.email,
            date: movDate,
            createdBy: 'sistema',
            ...(contract.company  && { company: contract.company }),
            ...(contract.project  && { project: contract.project }),
            ...(contract.area     && { area:    contract.area }),
            ...(contract.sede     && { sede:    contract.sede }),
          });
        } catch (e) { console.warn('Auto-ingreso movement failed:', e); }
      }

      if (sendWelcome) {
        try {
          await (httpsCallable(functions, 'sendWelcomeEmail'))({
            to: basic.email, userName: basic.fullName, corporateEmail: basic.corporateEmail,
            appUrl: import.meta.env.VITE_APP_URL ?? window.location.origin,
          });
        } catch (err) { console.warn('Welcome email failed:', err); }
      }

      if (selectedQs.length > 0) {
        const qs = selectedQs
          .map(id => questionnaires.find(q => q.id === id))
          .filter((q): q is Questionnaire => !!q)
          .map(q => ({ id: q.id, title: q.title }));
        try {
          await assignmentService.assignBatchToUser(
            qs,
            { id: newUserId, email: basic.email, fullName: basic.fullName },
          );
        } catch (err) { console.warn('Batch assignment failed:', err); }
      }

      toast.success('Usuario creado', {
        description: `${basic.fullName} fue registrado y se enviaron las notificaciones.`,
      });
      onUserCreated();
      onOpenChange(false);
    } catch (err: any) {
      toast.error('Error al crear usuario', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const next = () => setStep(s => Math.min(s + 1, 4));
  const back = () => setStep(s => Math.max(s - 1, 0));
  const step0Valid = basic.fullName.trim() && basic.email.trim();

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear Nuevo Usuario</DialogTitle>
          <DialogDescription>
            {['Datos básicos de acceso', 'Vinculación laboral',
              'Compensación y seguridad social', 'Cuenta de nómina',
              'Correo de bienvenida y cuestionarios'][step]}
          </DialogDescription>
        </DialogHeader>

        <StepBar current={step} />

        {/* ── STEP 0: BÁSICO ──────────────────────────────────────────── */}
        {step === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Field label="Nombre completo" required>
                <Input placeholder="Juan Pérez" value={basic.fullName}
                  onChange={e => setBasic(p => ({ ...p, fullName: e.target.value }))} />
              </Field>
            </div>

            <Field label="Correo personal" required hint="Para login y notificaciones">
              <Input type="email" placeholder="juan@gmail.com" value={basic.email}
                onChange={e => setBasic(p => ({ ...p, email: e.target.value }))} />
            </Field>

            <Field label="Tipo de usuario" required>
              <Select value={basic.role}
                onValueChange={v => setBasic(p => ({ ...p, role: v as UserRole }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="colaborador">Colaborador</SelectItem>
                  <SelectItem value="lider">Líder de proyecto</SelectItem>
                  <SelectItem value="aspirante">Aspirante</SelectItem>
                  <SelectItem value="excolaborador">Ex-colaborador</SelectItem>
                  <SelectItem value="descartado">Descartado</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <div className="sm:col-span-2">
              <Field label="Correo corporativo" hint="Se guardará en el perfil. Crea el buzón en Microsoft 365.">
                <div className="relative">
                  <Input type="email" value={basic.corporateEmail}
                    placeholder={`nombre.apellido@${CORPORATE_DOMAIN}`}
                    onChange={e => { setBasic(p => ({ ...p, corporateEmail: e.target.value })); setCorpEdited(true); }} />
                  {!corpEdited && basic.fullName && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-[#008C3C] pointer-events-none">
                      <Sparkles className="w-3 h-3" />Auto
                    </span>
                  )}
                </div>
              </Field>
            </div>
          </div>
        )}

        {/* ── STEP 1: CONTRATO ────────────────────────────────────────── */}
        {step === 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Empresa */}
            <div className="sm:col-span-2">
              <Field label="Empresa">
                <Select value={contract.companyId}
                  onValueChange={v => {
                    const c = companies.find(x => x.id === v);
                    setContract(p => ({ ...p, companyId: v, company: c?.name ?? '' }));
                  }}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar empresa" /></SelectTrigger>
                  <SelectContent>
                    {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* Proyecto — desde colección real */}
            <div className="sm:col-span-2">
              <Field label="Proyecto" hint={!contract.companyId ? 'Selecciona una empresa primero' : ''}>
                <Select
                  value={contract.projectId}
                  disabled={!contract.companyId}
                  onValueChange={v => {
                    const p = projects.find(x => x.id === v);
                    setContract(prev => ({
                      ...prev,
                      projectId: v,
                      project: p?.name ?? '',
                      area:  prev.area  || p?.area  || '',
                      sede:  prev.sede  || p?.sede  || '',
                    }));
                  }}>
                  <SelectTrigger><SelectValue placeholder={projects.length ? 'Seleccionar proyecto' : 'Sin proyectos'} /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        <span>{p.name}</span>
                        {p.status !== 'activo' && <span className="ml-2 text-xs text-gray-400">({p.status})</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* Líder directo */}
            <div className="sm:col-span-2">
              <Field label="Líder / Jefe directo">
                <Select
                  value={contract.leaderId}
                  disabled={!contract.companyId}
                  onValueChange={v => {
                    const u = leaderOptions.find(x => x.id === v);
                    setContract(p => ({ ...p, leaderId: v, leaderName: u?.fullName ?? '' }));
                  }}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar líder" /></SelectTrigger>
                  <SelectContent>
                    {leaderOptions.map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        <span>{u.fullName}</span>
                        <span className="ml-2 text-xs text-gray-400 capitalize">({u.role})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* Área */}
            <Field label="Área / Departamento">
              <ComboInput
                key={`area-${contract.companyId}`}
                value={contract.area}
                onChange={v => setContract(p => ({ ...p, area: v }))}
                options={areaOptions}
                placeholder={areaOptions.length ? `${areaOptions.length} disponibles…` : 'Ej: Recursos Humanos'}
              />
            </Field>

            {/* Cargo */}
            <Field label="Cargo / Posición">
              <ComboInput
                key={`pos-${contract.companyId}`}
                value={contract.position}
                onChange={v => setContract(p => ({ ...p, position: v }))}
                options={positionOptions}
                placeholder={positionOptions.length ? `${positionOptions.length} disponibles…` : 'Ej: Analista'}
              />
            </Field>

            {/* Sede */}
            <Field label="Sede">
              <ComboInput
                key={`sede-${contract.companyId}`}
                value={contract.sede}
                onChange={v => setContract(p => ({ ...p, sede: v }))}
                options={sedeOptions}
                placeholder={sedeOptions.length ? `${sedeOptions.length} disponibles…` : 'Ej: Bogotá'}
              />
            </Field>

            {/* Tipo de contrato */}
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

            {/* Fecha inicio */}
            <Field label="Fecha de inicio">
              <Input type="date" value={contract.startDate}
                onChange={e => setContract(p => ({ ...p, startDate: e.target.value }))} />
            </Field>
          </div>
        )}

        {/* ── STEP 2: SALARIO + SEG. SOCIAL ───────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
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
                  <Input placeholder="Ej: Sura, Compensar, Nueva EPS…" value={ss.eps}
                    onChange={e => setSs(p => ({ ...p, eps: e.target.value }))} />
                </Field>
                <Field label="Fondo de pensiones (AFP)">
                  <Input placeholder="Ej: Protección, Porvenir, Colfondos…" value={ss.afp}
                    onChange={e => setSs(p => ({ ...p, afp: e.target.value }))} />
                </Field>
                <Field label="Caja de compensación (CCF)">
                  <Input placeholder="Ej: Compensar, Cafam, Colsubsidio…" value={ss.ccf}
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
          </div>
        )}

        {/* ── STEP 3: BANCARIO ────────────────────────────────────────── */}
        {step === 3 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Field label="Banco">
                <Select value={banking.bankName}
                  onValueChange={v => setBanking(p => ({ ...p, bankName: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar banco" /></SelectTrigger>
                  <SelectContent>
                    {['Bancolombia','Davivienda','BBVA','Banco de Bogotá','Banco Popular',
                      'Banco de Occidente','AV Villas','Nequi','Daviplata','Otro'].map(b => (
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
          </div>
        )}

        {/* ── STEP 4: ENVIAR ──────────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-5">
            <CheckRow
              checked={sendWelcome}
              onChange={setSendWelcome}
              label="Correo de bienvenida"
              description={`Se envía a ${basic.email || 'el correo personal'} con el acceso a la plataforma`}
            />

            <div className="h-px bg-gray-100" />

            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                Cuestionarios a enviar al usuario
              </p>
              {questionnaires.length === 0 ? (
                <p className="text-sm text-gray-400 py-3">Cargando cuestionarios…</p>
              ) : (
                <div className="space-y-1">
                  {questionnaires.map(q => (
                    <CheckRow
                      key={q.id}
                      checked={selectedQs.includes(q.id)}
                      onChange={checked =>
                        setSelectedQs(prev => checked ? [...prev, q.id] : prev.filter(id => id !== q.id))
                      }
                      label={q.title}
                      description={q.description}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Summary */}
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-1.5 text-sm text-gray-600">
              <p><span className="font-semibold text-gray-800">Usuario:</span> {basic.fullName}</p>
              <p><span className="font-semibold text-gray-800">Correo:</span> {basic.email}</p>
              {basic.corporateEmail && (
                <p><span className="font-semibold text-gray-800">Corporativo:</span> {basic.corporateEmail}</p>
              )}
              {contract.company     && <p><span className="font-semibold text-gray-800">Empresa:</span> {contract.company}</p>}
              {contract.project     && <p><span className="font-semibold text-gray-800">Proyecto:</span> {contract.project}</p>}
              {contract.leaderName  && <p><span className="font-semibold text-gray-800">Líder:</span> {contract.leaderName}</p>}
              {contract.position    && <p><span className="font-semibold text-gray-800">Cargo:</span> {contract.position}</p>}
              {contract.area        && <p><span className="font-semibold text-gray-800">Área:</span> {contract.area}</p>}
            </div>
          </div>
        )}

        {/* ── NAVIGATION ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-2">
          <Button type="button" variant="outline" onClick={back} disabled={step === 0}>
            <ChevronLeft className="w-4 h-4 mr-1" />Atrás
          </Button>

          <div className="flex gap-2">
            {step > 0 && step < 4 && (
              <Button type="button" variant="ghost" className="text-gray-400 text-sm" onClick={next}>
                Omitir
              </Button>
            )}
            {step < 4 ? (
              <Button type="button" disabled={step === 0 && !step0Valid} onClick={next}
                className="bg-[#008C3C] hover:bg-[#006C2F] text-white">
                Siguiente<ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button type="button" disabled={loading} onClick={handleSubmit}
                className="bg-[#008C3C] hover:bg-[#006C2F] text-white gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {loading ? 'Creando…' : 'Crear usuario'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
