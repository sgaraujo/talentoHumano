import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Loader2, User, MapPin, Briefcase, Heart, Users,
  FileText, Calendar, Phone, Mail, AlertCircle,
  Building2, DollarSign, CreditCard, ShieldCheck, Edit2, Save, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { companyService } from '@/services/companyService';
import { projectService } from '@/services/projectService';
import { userService } from '@/services/userService';

const COLOMBIAN_EPS = [
  'Nueva EPS','Sanitas','Compensar','Sura','Famisanar','Coosalud','Mutual Ser',
  'Salud Total','Coomeva','AIC','Colsanitas','Capital Salud','Emssanar','Asmet Salud',
  'Mallamas','Pijaos Salud','Savia Salud','Dusakawi','Medimás','Cafesalud','Otro',
];
const COLOMBIAN_AFP = [
  'Colpensiones','Protección','Porvenir','Colfondos','Old Mutual','Skandia',
];
const COLOMBIAN_CESANTIAS = [
  'Porvenir','Protección','Colfondos','Skandia','Fondo Nacional del Ahorro','Old Mutual',
];
const COLOMBIAN_CCF = [
  'Compensar','Colsubsidio','Cafam','Comfama','Comfenalco Antioquia','Comfenalco Valle',
  'Comfandi','Comfamiliar Risaralda','Comfacor','Comfaunión','Cajasucre','Comfacundi',
  'Comfaboy','Comfaguajira','Comfanariño','Comfatol','Comfachocó','Otro',
];
const COLOMBIAN_BANKS = [
  'Bancolombia','Banco de Bogotá','Banco Popular','Banco Davivienda',
  'BBVA Colombia','Scotiabank Colpatria','Banco de Occidente','Banco Caja Social',
  'AV Villas','Banco Agrario de Colombia','Banco GNB Sudameris','Banco Itaú',
  'Banco Pichincha','Banco Falabella','Banco Mundo Mujer','Banco W',
  'Banco Finandina','Bancamía','Banco Cooperativo Coopcentral',
  'Nequi','Daviplata','Lulo Bank','Rappipay','Nu Colombia','Dale!','Movii','Uala','Otro',
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
}

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmt = (v: any): string => {
  if (v == null || v === '') return '—';
  return String(v);
};

const fmtDate = (date: any): string => {
  if (!date) return '—';
  let d: Date;
  if (date?.toDate) d = date.toDate();
  else if (date instanceof Date) d = date;
  else if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    const [y, m, day] = date.split('-').map(Number);
    d = new Date(y, m - 1, day);
  } else d = new Date(date);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CO');
};

const fmtMoney = (v: any): string => {
  if (v == null || v === '') return '—';
  const n = Number(v);
  return isNaN(n) ? '—' : `$${n.toLocaleString('es-CO')}`;
};

const toDateInput = (v: any): string => {
  if (!v) return '';
  if (v?.toDate) return v.toDate().toISOString().slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string') return v.slice(0, 10);
  return '';
};

function Row({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">{icon}{value}</p>
    </div>
  );
}

function Section({ title, icon, children }: {
  title: string; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="text-[#008C3C]">{icon}</div>
        <p className="text-sm font-semibold text-gray-700">{title}</p>
      </div>
      {children}
    </div>
  );
}

const INPUT_CLS = 'w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#008C3C] bg-white';

const ROLE_COLOR: Record<string, string> = {
  colaborador:   'bg-green-100 text-green-800',
  aspirante:     'bg-blue-100 text-blue-800',
  excolaborador: 'bg-gray-100 text-gray-700',
  descartado:    'bg-red-100 text-red-700',
};

// ─── getField / setField ──────────────────────────────────────────────────────
function getField(obj: any, path: string): any {
  return path.split('.').reduce((cur, k) => cur?.[k], obj);
}

function setField(obj: any, path: string, value: any): any {
  const clone = JSON.parse(JSON.stringify(obj ?? {}));
  const keys  = path.split('.');
  let cur = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return clone;
}

// ─────────────────────────────────────────────────────────────────────────────
export const ViewUserProfileDialog = ({ open, onOpenChange, userId }: Props) => {
  const [loading,    setLoading]    = useState(true);
  const [user,       setUser]       = useState<any>(null);
  const [isEditing,  setIsEditing]  = useState(false);
  const [editData,   setEditData]   = useState<any>(null);
  const [saving,     setSaving]     = useState(false);
  const [companies,     setCompanies]     = useState<{id:string;name:string}[]>([]);
  const [projects,      setProjects]      = useState<string[]>([]);
  const [allUsers,      setAllUsers]      = useState<any[]>([]);

  useEffect(() => {
    if (!open) return;
    companyService.getAll()
      .then((all: any[]) => setCompanies(all.filter(c => c.active).map(c => ({id:c.id,name:c.name})).sort((a,b)=>a.name.localeCompare(b.name,'es'))))
      .catch(()=>{});
    userService.getAll().then(setAllUsers).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    setIsEditing(false);
    getDoc(doc(db, 'users', userId))
      .then(snap => {
        if (!snap.exists()) { toast.error('Usuario no encontrado'); return; }
        const data = { id: snap.id, ...snap.data() };
        setUser(data);
        setEditData(JSON.parse(JSON.stringify(data)));
      })
      .catch(err => toast.error('Error al cargar perfil', { description: err.message }))
      .finally(() => setLoading(false));
  }, [open, userId]);

  const update = (path: string, value: any) =>
    setEditData((prev: any) => setField(prev, path, value));

  const get = (path: string) => getField(editData ?? {}, path);

  // Cargar proyectos cuando cambia la empresa
  const currentCompanyId = get('contractInfo.assignment.companyId');
  const currentCompanyName = get('contractInfo.assignment.company');
  useEffect(() => {
    if (!currentCompanyId && !currentCompanyName) { setProjects([]); return; }
    projectService.getByCompanyFull(currentCompanyId || '', currentCompanyName || '')
      .then((ps: any[]) => setProjects(ps.map((p: any) => p.name)))
      .catch(() => {});
  }, [currentCompanyId, currentCompanyName]);

  const handleSave = async () => {
    if (!userId || !editData) return;
    setSaving(true);
    try {
      const { id: _id, ...data } = editData;

      // ── Auto-historial: si cambió empresa o proyecto, guardar posición anterior ──
      const oldCompany  = user?.contractInfo?.assignment?.company  || '';
      const newCompany  = editData?.contractInfo?.assignment?.company || '';
      const oldProject  = user?.contractInfo?.assignment?.project  || '';
      const newProject  = editData?.contractInfo?.assignment?.project || '';

      const companyMoved  = oldCompany  && oldCompany  !== newCompany;
      const projectMoved  = oldProject  && oldProject  !== newProject && !companyMoved;

      if (companyMoved || projectMoved) {
        const isoDate = (v: any): string | undefined => {
          if (!v) return undefined;
          if (v?.toDate) return v.toDate().toISOString().slice(0, 10);
          if (v instanceof Date) return v.toISOString().slice(0, 10);
          if (typeof v === 'string') return v.slice(0, 10);
          return undefined;
        };

        const entryRaw = {
          company:      oldCompany,
          companyId:    user?.contractInfo?.assignment?.companyId   || '',
          project:      oldProject || '',
          projectId:    user?.contractInfo?.assignment?.projectId   || '',
          position:     user?.contractInfo?.assignment?.position    || '',
          area:         user?.contractInfo?.assignment?.area        || '',
          contractType: user?.contractInfo?.contract?.contractType  || '',
          startDate:    isoDate(user?.contractInfo?.contract?.startDate) ?? null,
          endDate:      new Date().toISOString().slice(0, 10),
          createdAt:    new Date().toISOString(),
        };
        // Eliminar claves con undefined (Firestore las rechaza)
        const entry = Object.fromEntries(
          Object.entries(entryRaw).filter(([, v]) => v !== undefined)
        );

        const existing: any[] = user?.employmentHistory ?? [];
        data.employmentHistory = [...existing, entry];
      }

      // Limpiar undefined recursivamente antes de enviar a Firestore
      const cleanData = JSON.parse(JSON.stringify(data, (_, v) => v === undefined ? null : v));
      await updateDoc(doc(db, 'users', userId), cleanData);
      setUser(editData);
      setIsEditing(false);
      const moved = companyMoved ? ` · Historial guardado: ${oldCompany}` : projectMoved ? ` · Historial guardado: ${oldProject}` : '';
      toast.success('Perfil actualizado' + moved);
    } catch (err: any) {
      toast.error('Error al guardar', { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditData(JSON.parse(JSON.stringify(user ?? {})));
    setIsEditing(false);
  };

  // ── field helpers ────────────────────────────────────────────────────────
  const F = (path: string, label: string, opts?: {
    type?: 'text' | 'number' | 'date' | 'email' | 'tel';
    icon?: React.ReactNode;
    options?: string[];
    money?: boolean;
    bool?: boolean;
  }) => {
    const raw = get(path);
    if (!isEditing) {
      const display = opts?.money ? fmtMoney(raw)
        : opts?.bool  ? (raw ? 'Sí' : 'No')
        : opts?.type === 'date' ? fmtDate(raw)
        : fmt(raw);
      return <Row label={label} value={display} icon={opts?.icon} />;
    }
    if (opts?.bool) {
      return (
        <div>
          <p className="text-xs text-gray-500 mb-0.5">{label}</p>
          <select className={INPUT_CLS} value={raw ? 'si' : 'no'}
            onChange={e => update(path, e.target.value === 'si')}>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </select>
        </div>
      );
    }
    if (opts?.options) {
      return (
        <div>
          <p className="text-xs text-gray-500 mb-0.5">{label}</p>
          <select className={INPUT_CLS} value={raw ?? ''}
            onChange={e => update(path, e.target.value)}>
            <option value="">—</option>
            {opts.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }
    return (
      <div>
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <input
          type={opts?.type ?? 'text'}
          className={INPUT_CLS}
          value={opts?.type === 'date' ? toDateInput(raw) : (raw ?? '')}
          onChange={e => update(path, opts?.type === 'number' ? Number(e.target.value) : e.target.value)}
        />
      </div>
    );
  };

  if (!userId) return null;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { cancelEdit(); onOpenChange(false); } }}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-[#008C3C]" />
            {isEditing ? 'Editando perfil' : 'Perfil del usuario'}
          </DialogTitle>
          {user && (
            <DialogDescription>{user.fullName} · {user.email}</DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" />
            </div>
          ) : !user ? (
            <p className="text-center py-12 text-gray-500">No se pudo cargar el perfil</p>
          ) : (
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="personal">Personal</TabsTrigger>
                <TabsTrigger value="profesional">Profesional</TabsTrigger>
                <TabsTrigger value="familia">Familia</TabsTrigger>
                <TabsTrigger value="laboral">Laboral</TabsTrigger>
              </TabsList>

              {/* ── GENERAL ──────────────────────────────────────────── */}
              <TabsContent value="general" className="space-y-4 mt-4">
                {!user.profileCompleted && !isEditing && (
                  <div className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3">
                    <AlertCircle className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-orange-900">Perfil incompleto</p>
                      <p className="text-xs text-orange-700 mt-0.5">El usuario aún no ha completado su cuestionario de onboarding.</p>
                    </div>
                  </div>
                )}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <User className="w-4 h-4 text-[#008C3C]" /> Información básica
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        {F('fullName', 'Nombre completo')}
                      </div>
                      {F('email', 'Correo personal', { type: 'email', icon: <Mail className="w-3.5 h-3.5 text-gray-400" /> })}
                      {F('location.corporateEmail', 'Correo corporativo', { type: 'email', icon: <Mail className="w-3.5 h-3.5 text-[#008C3C]" /> })}
                      {isEditing ? (
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Rol</p>
                          <select className={INPUT_CLS} value={get('role') ?? ''}
                            onChange={e => update('role', e.target.value)}>
                            {['colaborador','lider','aspirante','excolaborador','descartado'].map(r => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Rol</p>
                          <Badge className={`${ROLE_COLOR[user.role] ?? 'bg-gray-100 text-gray-700'} capitalize`}>{user.role}</Badge>
                        </div>
                      )}
                      {isEditing ? (
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Perfil completado</p>
                          <select className={INPUT_CLS} value={get('profileCompleted') ? 'si' : 'no'}
                            onChange={e => update('profileCompleted', e.target.value === 'si')}>
                            <option value="si">Completo</option>
                            <option value="no">Incompleto</option>
                          </select>
                        </div>
                      ) : (
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Perfil</p>
                          {user.profileCompleted
                            ? <Badge className="bg-green-100 text-green-800">Completo</Badge>
                            : <Badge variant="secondary">Incompleto</Badge>}
                        </div>
                      )}
                      {F('createdAt', 'Registro', { type: 'date', icon: <Calendar className="w-3.5 h-3.5 text-gray-400" /> })}
                      {/* Empresa — select dinámico */}
                      {isEditing ? (
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Empresa</p>
                          <select className={INPUT_CLS}
                            value={get('contractInfo.assignment.companyId') ?? ''}
                            onChange={e => {
                              const c = companies.find(x => x.id === e.target.value);
                              update('contractInfo.assignment.companyId', e.target.value);
                              update('contractInfo.assignment.company', c?.name ?? '');
                              update('contractInfo.assignment.project', '');
                              update('contractInfo.assignment.projectId', '');
                            }}>
                            <option value="">—</option>
                            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                      ) : (
                        <Row label="Empresa" value={fmt(get('contractInfo.assignment.company'))} icon={<Building2 className="w-3.5 h-3.5 text-gray-400" />} />
                      )}
                      {F('contractInfo.assignment.position', 'Cargo', { icon: <Briefcase className="w-3.5 h-3.5 text-gray-400" /> })}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── PERSONAL ─────────────────────────────────────────── */}
              <TabsContent value="personal" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#008C3C]" /> Datos personales
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      {F('personalData.documentType', 'Tipo de documento', {
                        options: ['CC','CE','Pasaporte','TI','NIT','PEP','PPT'],
                      })}
                      {F('personalData.documentNumber', 'Número de documento')}
                      {F('personalData.gender', 'Género', {
                        options: ['Masculino','Femenino','No binario','Prefiero no decir'],
                      })}
                      {F('personalData.birthDate', 'Fecha de nacimiento', { type: 'date' })}
                      {F('personalData.phone', 'Teléfono', { type: 'tel', icon: <Phone className="w-3.5 h-3.5 text-gray-400" /> })}
                      {F('personalData.maritalStatus', 'Estado civil', {
                        options: ['Soltero/a','Casado/a','Unión libre','Divorciado/a','Viudo/a'],
                      })}
                      {F('personalData.bloodType', 'Grupo sanguíneo', {
                        options: ['A+','A-','B+','B-','O+','O-','AB+','AB-'],
                      })}
                      {F('personalData.nationality', 'Nacionalidad')}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="w-4 h-4 text-[#008C3C]" /> Datos sociodemográficos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      {F('demographicData.genderIdentity', 'Identidad de género')}
                      {F('demographicData.sexualOrientation', 'Orientación sexual')}
                      {F('demographicData.ethnicity', 'Etnia')}
                      {F('demographicData.community', 'Comunidad')}
                      {F('demographicData.socioeconomicLevel', 'Nivel socioeconómico', {
                        options: ['1','2','3','4','5','6'],
                      })}
                      {F('demographicData.commuteTime', 'Tiempo de desplazamiento')}
                      {F('demographicData.disability', 'Discapacidad')}
                      {F('demographicData.protectedPopulation', 'Población protegida')}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#008C3C]" /> Ubicación y contacto
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      {F('location.country', 'País')}
                      {F('location.state', 'Departamento')}
                      {F('location.city', 'Ciudad')}
                      {F('location.neighborhood', 'Barrio')}
                      <div className="col-span-2">{F('location.address', 'Dirección')}</div>
                      {F('location.corporatePhone', 'Teléfono corporativo', { type: 'tel', icon: <Phone className="w-3.5 h-3.5 text-gray-400" /> })}
                      {F('location.linkedInProfile', 'LinkedIn')}
                    </div>
                    <Separator />
                    <Section title="Contacto de emergencia" icon={<Phone className="w-4 h-4" />}>
                      <div className="grid grid-cols-2 gap-4">
                        {F('location.emergencyContact.fullName', 'Nombre')}
                        {F('location.emergencyContact.relationship', 'Relación')}
                        {F('location.emergencyContact.phone', 'Teléfono', { type: 'tel' })}
                      </div>
                    </Section>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── PROFESIONAL ──────────────────────────────────────── */}
              <TabsContent value="profesional" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-[#008C3C]" /> Perfil profesional
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      {F('professionalProfile.knowledgeArea', 'Área de conocimiento')}
                      {F('professionalProfile.academicLevel', 'Nivel académico', {
                        options: ['Bachillerato','Técnico','Tecnólogo','Universitario','Especialización','Maestría','Doctorado'],
                      })}
                      {F('professionalProfile.educationStatus', 'Estado educativo', {
                        options: ['En curso','Graduado','Incompleto'],
                      })}
                      {F('professionalProfile.degree', 'Título')}
                      {F('professionalProfile.university', 'Universidad')}
                      {F('professionalProfile.educationalInstitution', 'Institución educativa')}
                    </div>

                    <Separator />
                    <Section title="Experiencia laboral" icon={<Briefcase className="w-4 h-4" />}>
                      <div className="grid grid-cols-2 gap-4">
                        {F('professionalProfile.experience.yearsOfExperience', 'Años de experiencia', { type: 'number' })}
                        {F('professionalProfile.experience.lastCompany', 'Última empresa')}
                        {F('professionalProfile.experience.lastPosition', 'Último cargo')}
                        {F('professionalProfile.experience.mostRecentSector', 'Sector')}
                        {F('professionalProfile.experience.experienceArea', 'Área de experiencia')}
                      </div>
                    </Section>

                    {user.professionalProfile?.languages?.length > 0 && (
                      <>
                        <Separator />
                        <Section title="Idiomas" icon={<FileText className="w-4 h-4" />}>
                          <div className="flex flex-wrap gap-2">
                            {user.professionalProfile.languages.map((l: any) => (
                              <Badge key={l.id} variant="outline" className="capitalize">
                                {l.language} – {l.level}
                              </Badge>
                            ))}
                          </div>
                        </Section>
                      </>
                    )}

                    {user.professionalProfile?.courses?.length > 0 && (
                      <>
                        <Separator />
                        <Section title="Cursos y certificaciones" icon={<FileText className="w-4 h-4" />}>
                          <div className="space-y-2">
                            {user.professionalProfile.courses.map((c: any) => (
                              <div key={c.id} className="rounded-lg bg-gray-50 px-3 py-2">
                                <p className="text-sm font-medium">{c.name}</p>
                                <p className="text-xs text-gray-500">{c.institution} · {fmtDate(c.completionDate)}</p>
                              </div>
                            ))}
                          </div>
                        </Section>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── FAMILIA ──────────────────────────────────────────── */}
              <TabsContent value="familia" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Heart className="w-4 h-4 text-[#008C3C]" /> Familia y hogar
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      {F('family.familyType', 'Tipo de familia', {
                        options: ['Nuclear','Monoparental','Extensa','Unipersonal','Reconstituida'],
                      })}
                      {F('family.numberOfCohabitants', 'Convivientes', { type: 'number' })}
                      {F('family.numberOfChildren', 'Hijos', { type: 'number' })}
                      {F('family.financialContribution', 'Aporte económico', {
                        options: ['Principal','Secundario','Ninguno'],
                      })}
                      {F('family.caregiverResponsibilities', 'Responsabilidades de cuidado')}
                      {F('family.hasPets', 'Mascotas', { bool: true })}
                    </div>

                    {user.family?.children?.length > 0 && (
                      <>
                        <Separator />
                        <Section title="Hijos" icon={<Users className="w-4 h-4" />}>
                          <div className="grid grid-cols-2 gap-2">
                            {user.family.children.map((c: any) => (
                              <div key={c.id} className="rounded-lg bg-gray-50 px-3 py-2">
                                <p className="text-sm font-medium">{c.name}</p>
                                <p className="text-xs text-gray-500">{c.age} años · {c.genderIdentity}</p>
                              </div>
                            ))}
                          </div>
                        </Section>
                      </>
                    )}

                    {user.family?.pets?.length > 0 && (
                      <>
                        <Separator />
                        <Section title="Mascotas" icon={<Heart className="w-4 h-4" />}>
                          <div className="flex flex-wrap gap-2">
                            {user.family.pets.map((p: any) => (
                              <Badge key={p.id} variant="outline">{p.name} ({p.type})</Badge>
                            ))}
                          </div>
                        </Section>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── LABORAL ──────────────────────────────────────────── */}
              <TabsContent value="laboral" className="space-y-4 mt-4">
                <Card>
                  <CardContent className="pt-5 space-y-6">

                    <Section title="Asignación" icon={<Building2 className="w-4 h-4" />}>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          {isEditing ? (
                            <div>
                              <p className="text-xs text-gray-500 mb-0.5">Empresa</p>
                              <select className={INPUT_CLS}
                                value={get('contractInfo.assignment.companyId') ?? ''}
                                onChange={e => {
                                  const c = companies.find(x => x.id === e.target.value);
                                  update('contractInfo.assignment.companyId', e.target.value);
                                  update('contractInfo.assignment.company', c?.name ?? '');
                                  update('contractInfo.assignment.project', '');
                                  update('contractInfo.assignment.projectId', '');
                                }}>
                                <option value="">—</option>
                                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            </div>
                          ) : (
                            <Row label="Empresa" value={fmt(get('contractInfo.assignment.company'))} />
                          )}
                        </div>
                        {F('contractInfo.assignment.area', 'Área')}
                        {F('contractInfo.assignment.position', 'Cargo')}
                        {/* Proyecto — select dinámico */}
                        {isEditing ? (
                          <div>
                            <p className="text-xs text-gray-500 mb-0.5">Proyecto</p>
                            <select className={INPUT_CLS}
                              value={get('contractInfo.assignment.project') ?? ''}
                              onChange={e => update('contractInfo.assignment.project', e.target.value)}>
                              <option value="">—</option>
                              {projects.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </div>
                        ) : (
                          <Row label="Proyecto" value={fmt(get('contractInfo.assignment.project'))} />
                        )}
                        {F('contractInfo.assignment.location', 'Sede')}
                        {/* Jefe directo — select con líderes globales + empresa */}
                        {isEditing ? (() => {
                          const leaders = allUsers
                            .filter(u => u.role === 'lider' || (u as any).isGlobalLeader)
                            .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
                          return (
                            <div>
                              <p className="text-xs text-gray-500 mb-0.5">Jefe directo</p>
                              <select className={INPUT_CLS}
                                value={get('contractInfo.assignment.directSupervisor') ?? ''}
                                onChange={e => update('contractInfo.assignment.directSupervisor', e.target.value)}>
                                <option value="">—</option>
                                {leaders.map(u => (
                                  <option key={u.id} value={u.fullName}>{u.fullName}</option>
                                ))}
                              </select>
                            </div>
                          );
                        })() : (
                          <Row label="Jefe directo" value={fmt(get('contractInfo.assignment.directSupervisor'))} />
                        )}
                        {F('contractInfo.assignment.costCenter', 'Centro de costos')}
                      </div>
                    </Section>

                    <Separator />

                    <Section title="Contrato" icon={<FileText className="w-4 h-4" />}>
                      <div className="grid grid-cols-2 gap-4">
                        {F('contractInfo.contract.contractType', 'Tipo de contrato', {
                          options: ['Término fijo','Término indefinido','Obra o labor','Prestación de servicios','Aprendizaje'],
                        })}
                        {F('contractInfo.contract.linkType', 'Tipo de vinculación', {
                          options: ['Directo','Cooperativa','Temporal','Contratista'],
                        })}
                        {F('contractInfo.contract.startDate', 'Fecha de inicio', { type: 'date' })}
                        {F('contractInfo.contract.endDate', 'Fecha de fin', { type: 'date' })}
                        {F('contractInfo.contract.probationPeriod', 'Período de prueba')}
                        {F('contractInfo.workConditions.workModality', 'Modalidad', {
                          options: ['Presencial','Remoto','Híbrido'],
                        })}
                      </div>
                    </Section>

                    <Separator />

                    <Section title="Salario" icon={<DollarSign className="w-4 h-4" />}>
                      <div className="grid grid-cols-2 gap-4">
                        {F('salaryInfo.baseSalary', 'Salario base', { type: 'number', money: !isEditing })}
                        {F('salaryInfo.salaryType', 'Tipo de salario', {
                          options: ['Ordinario','Integral'],
                        })}
                        {F('salaryInfo.transportAllowance', 'Auxilio de transporte', { type: 'number', money: !isEditing })}
                        {F('salaryInfo.foodAllowance', 'Subsidio de alimentación', { type: 'number', money: !isEditing })}
                      </div>
                    </Section>

                    <Separator />

                    <Section title="Seguridad Social" icon={<ShieldCheck className="w-4 h-4" />}>
                      <div className="grid grid-cols-2 gap-4">
                        {F('socialSecurity.eps', 'EPS', { options: COLOMBIAN_EPS })}
                        {F('socialSecurity.afp', 'Fondo de pensiones (AFP)', { options: COLOMBIAN_AFP })}
                        {F('socialSecurity.ccf', 'Caja de compensación (CCF)', { options: COLOMBIAN_CCF })}
                        {F('socialSecurity.arlRiskLevel', 'Nivel de riesgo ARL', {
                          options: ['I','II','III','IV','V'],
                        })}
                        {F('socialSecurity.severanceFund', 'Fondo de cesantías', { options: COLOMBIAN_CESANTIAS })}
                      </div>
                    </Section>

                    <Separator />

                    <Section title="Información bancaria" icon={<CreditCard className="w-4 h-4" />}>
                      <div className="grid grid-cols-2 gap-4">
                        {F('bankingInfo.bankName', 'Banco', { options: COLOMBIAN_BANKS })}
                        {F('bankingInfo.accountType', 'Tipo de cuenta', {
                          options: ['Cuenta de ahorros','Cuenta corriente'],
                        })}
                        <div className="col-span-2">
                          {F('bankingInfo.accountNumber', 'Número de cuenta')}
                        </div>
                      </div>
                    </Section>

                    {/* ── HISTORIAL ── */}
                    {((user?.employmentHistory ?? []).length > 0) && (
                      <>
                        <Separator />
                        <Section title="Historial laboral" icon={<Calendar className="w-4 h-4" />}>
                          <div className="relative pl-4">
                            {/* línea vertical */}
                            <div className="absolute left-1.5 top-2 bottom-2 w-0.5 bg-gray-200 rounded" />
                            <div className="space-y-4">
                              {[...(user?.employmentHistory ?? [])].reverse().map((h: any, i: number) => (
                                <div key={i} className="relative">
                                  {/* punto */}
                                  <div className="absolute -left-3 top-1.5 w-3 h-3 rounded-full bg-[#008C3C] border-2 border-white shadow" />
                                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 ml-2">
                                    <div className="flex items-start justify-between gap-2 flex-wrap">
                                      <div>
                                        <p className="text-sm font-semibold text-gray-800">{h.company}</p>
                                        {h.project && <p className="text-xs text-gray-500 mt-0.5">{h.project}</p>}
                                      </div>
                                      <div className="text-right shrink-0">
                                        <p className="text-[10px] text-gray-400">
                                          {h.startDate ? h.startDate : '—'} → {h.endDate ?? '—'}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                      {h.position && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-[11px] rounded-full border border-blue-100">
                                          <Briefcase className="w-2.5 h-2.5" />{h.position}
                                        </span>
                                      )}
                                      {h.area && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 text-[11px] rounded-full border border-purple-100">
                                          {h.area}
                                        </span>
                                      )}
                                      {h.contractType && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-[11px] rounded-full">
                                          {h.contractType}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </Section>
                      </>
                    )}

                    {isEditing && (user?.employmentHistory ?? []).length === 0 && (
                      <p className="text-xs text-gray-400 italic text-center py-2">
                        El historial se generará automáticamente cuando se cambie de empresa o proyecto.
                      </p>
                    )}

                  </CardContent>
                </Card>
              </TabsContent>

            </Tabs>
          )}
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-gray-100">
          {!loading && user && !isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5">
                <Edit2 className="w-3.5 h-3.5" /> Editar
              </Button>
              <Button onClick={() => onOpenChange(false)}
                className="bg-[#008C3C] hover:bg-[#006C2F] text-white">
                Cerrar
              </Button>
            </>
          ) : !loading && user && isEditing ? (
            <>
              <Button variant="outline" onClick={cancelEdit} disabled={saving}
                className="flex items-center gap-1.5">
                <X className="w-3.5 h-3.5" /> Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}
                className="bg-[#008C3C] hover:bg-[#006C2F] text-white flex items-center gap-1.5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Guardar cambios
              </Button>
            </>
          ) : (
            <div />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
