import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Loader2, User, MapPin, Briefcase, Heart, Users,
  FileText, Calendar, Phone, Mail, AlertCircle,
  Building2, DollarSign, CreditCard, ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';

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

function Row({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
        {icon}
        {value}
      </p>
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

const ROLE_COLOR: Record<string, string> = {
  colaborador:   'bg-green-100 text-green-800',
  aspirante:     'bg-blue-100 text-blue-800',
  excolaborador: 'bg-gray-100 text-gray-700',
  descartado:    'bg-red-100 text-red-700',
};

// ─────────────────────────────────────────────────────────────────────────────
export const ViewUserProfileDialog = ({ open, onOpenChange, userId }: Props) => {
  const [loading, setLoading] = useState(true);
  const [user, setUser]       = useState<any>(null);

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    getDoc(doc(db, 'users', userId))
      .then(snap => {
        if (!snap.exists()) { toast.error('Usuario no encontrado'); return; }
        setUser({ id: snap.id, ...snap.data() });
      })
      .catch(err => toast.error('Error al cargar perfil', { description: err.message }))
      .finally(() => setLoading(false));
  }, [open, userId]);

  if (!userId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-[#008C3C]" />
            Perfil del usuario
          </DialogTitle>
          {user && (
            <DialogDescription>
              {user.fullName} · {user.email}
            </DialogDescription>
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

              {/* ── GENERAL ───────────────────────────────────────────── */}
              <TabsContent value="general" className="space-y-4 mt-4">
                {!user.profileCompleted && (
                  <div className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3">
                    <AlertCircle className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-orange-900">Perfil incompleto</p>
                      <p className="text-xs text-orange-700 mt-0.5">
                        El usuario aún no ha completado su cuestionario de onboarding.
                      </p>
                    </div>
                  </div>
                )}

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <User className="w-4 h-4 text-[#008C3C]" />
                      Información básica
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Row label="Nombre completo" value={fmt(user.fullName)} />
                      </div>
                      <Row label="Correo personal" value={fmt(user.email)}
                        icon={<Mail className="w-3.5 h-3.5 text-gray-400" />} />
                      <Row label="Correo corporativo"
                        value={fmt(user.location?.corporateEmail)}
                        icon={<Mail className="w-3.5 h-3.5 text-[#008C3C]" />} />
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Rol</p>
                        <Badge className={`${ROLE_COLOR[user.role] ?? 'bg-gray-100 text-gray-700'} capitalize`}>
                          {user.role}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Perfil</p>
                        {user.profileCompleted
                          ? <Badge className="bg-green-100 text-green-800">Completo</Badge>
                          : <Badge variant="secondary">Incompleto</Badge>}
                      </div>
                      <Row label="Registro" value={fmtDate(user.createdAt)}
                        icon={<Calendar className="w-3.5 h-3.5 text-gray-400" />} />
                      {user.contractInfo?.assignment?.company && (
                        <Row label="Empresa" value={fmt(user.contractInfo.assignment.company)}
                          icon={<Building2 className="w-3.5 h-3.5 text-gray-400" />} />
                      )}
                      {user.contractInfo?.assignment?.position && (
                        <Row label="Cargo" value={fmt(user.contractInfo.assignment.position)}
                          icon={<Briefcase className="w-3.5 h-3.5 text-gray-400" />} />
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── PERSONAL ──────────────────────────────────────────── */}
              <TabsContent value="personal" className="space-y-4 mt-4">
                {/* Datos personales */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#008C3C]" />
                      Datos personales
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {user.personalData ? (
                      <div className="grid grid-cols-2 gap-4">
                        <Row label="Tipo de documento" value={fmt(user.personalData.documentType)} />
                        <Row label="Número de documento" value={fmt(user.personalData.documentNumber)} />
                        <Row label="Género" value={fmt(user.personalData.gender)} />
                        <Row label="Fecha de nacimiento" value={fmtDate(user.personalData.birthDate)} />
                        <Row label="Teléfono" value={fmt(user.personalData.phone)}
                          icon={<Phone className="w-3.5 h-3.5 text-gray-400" />} />
                        <Row label="Estado civil" value={fmt(user.personalData.maritalStatus)} />
                        <Row label="Grupo sanguíneo" value={fmt(user.personalData.bloodType)} />
                        <Row label="Nacionalidad" value={fmt(user.personalData.nationality)} />
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-4">Sin datos personales</p>
                    )}
                  </CardContent>
                </Card>

                {/* Datos sociodemográficos */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="w-4 h-4 text-[#008C3C]" />
                      Datos sociodemográficos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {user.demographicData ? (
                      <div className="grid grid-cols-2 gap-4">
                        <Row label="Identidad de género" value={fmt(user.demographicData.genderIdentity)} />
                        <Row label="Orientación sexual" value={fmt(user.demographicData.sexualOrientation)} />
                        <Row label="Etnia" value={fmt(user.demographicData.ethnicity)} />
                        <Row label="Comunidad" value={fmt(user.demographicData.community)} />
                        <Row label="Nivel socioeconómico" value={fmt(user.demographicData.socioeconomicLevel)} />
                        <Row label="Tiempo de desplazamiento" value={fmt(user.demographicData.commuteTime)} />
                        <Row label="Discapacidad" value={fmt(user.demographicData.disability) === '—' ? 'Ninguna' : fmt(user.demographicData.disability)} />
                        <Row label="Población protegida" value={fmt(user.demographicData.protectedPopulation)} />
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-4">Sin datos sociodemográficos</p>
                    )}
                  </CardContent>
                </Card>

                {/* Ubicación */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#008C3C]" />
                      Ubicación y contacto
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {user.location ? (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <Row label="País" value={fmt(user.location.country)} />
                          <Row label="Departamento" value={fmt(user.location.state)} />
                          <Row label="Ciudad" value={fmt(user.location.city)} />
                          <Row label="Barrio" value={fmt(user.location.neighborhood)} />
                          <div className="col-span-2">
                            <Row label="Dirección" value={fmt(user.location.address)} />
                          </div>
                          <Row label="Teléfono corporativo" value={fmt(user.location.corporatePhone)}
                            icon={<Phone className="w-3.5 h-3.5 text-gray-400" />} />
                          <Row label="LinkedIn" value={fmt(user.location.linkedInProfile)} />
                        </div>

                        {user.location.emergencyContact && (
                          <>
                            <Separator />
                            <Section title="Contacto de emergencia" icon={<Phone className="w-4 h-4" />}>
                              <div className="grid grid-cols-2 gap-4">
                                <Row label="Nombre" value={fmt(user.location.emergencyContact.fullName)} />
                                <Row label="Relación" value={fmt(user.location.emergencyContact.relationship)} />
                                <Row label="Teléfono" value={fmt(user.location.emergencyContact.phone)} />
                              </div>
                            </Section>
                          </>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-4">Sin datos de ubicación</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── PROFESIONAL ───────────────────────────────────────── */}
              <TabsContent value="profesional" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-[#008C3C]" />
                      Perfil profesional
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {user.professionalProfile ? (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <Row label="Área de conocimiento" value={fmt(user.professionalProfile.knowledgeArea)} />
                          <Row label="Nivel académico" value={fmt(user.professionalProfile.academicLevel)} />
                          <Row label="Estado educativo" value={fmt(user.professionalProfile.educationStatus)} />
                          <Row label="Título" value={fmt(user.professionalProfile.degree)} />
                          <Row label="Universidad" value={fmt(user.professionalProfile.university)} />
                          <Row label="Institución educativa" value={fmt(user.professionalProfile.educationalInstitution)} />
                        </div>

                        {user.professionalProfile.experience && (
                          <>
                            <Separator />
                            <Section title="Experiencia laboral" icon={<Briefcase className="w-4 h-4" />}>
                              <div className="grid grid-cols-2 gap-4">
                                <Row label="Años de experiencia"
                                  value={`${user.professionalProfile.experience.yearsOfExperience ?? 0} años`} />
                                <Row label="Última empresa" value={fmt(user.professionalProfile.experience.lastCompany)} />
                                <Row label="Último cargo" value={fmt(user.professionalProfile.experience.lastPosition)} />
                                <Row label="Sector" value={fmt(user.professionalProfile.experience.mostRecentSector)} />
                                <Row label="Área de experiencia" value={fmt(user.professionalProfile.experience.experienceArea)} />
                              </div>
                            </Section>
                          </>
                        )}

                        {user.professionalProfile.languages?.length > 0 && (
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

                        {user.professionalProfile.courses?.length > 0 && (
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
                      </>
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-4">Sin datos profesionales</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── FAMILIA ───────────────────────────────────────────── */}
              <TabsContent value="familia" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Heart className="w-4 h-4 text-[#008C3C]" />
                      Familia y hogar
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {user.family ? (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <Row label="Tipo de familia" value={fmt(user.family.familyType)} />
                          <Row label="Convivientes" value={fmt(user.family.numberOfCohabitants)} />
                          <Row label="Hijos" value={fmt(user.family.numberOfChildren)} />
                          <Row label="Aporte económico" value={fmt(user.family.financialContribution)} />
                          <Row label="Responsabilidades de cuidado" value={fmt(user.family.caregiverResponsibilities)} />
                          <Row label="Mascotas" value={user.family.hasPets ? 'Sí' : 'No'} />
                        </div>

                        {user.family.children?.length > 0 && (
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

                        {user.family.pets?.length > 0 && (
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
                      </>
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-4">Sin datos familiares</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── LABORAL ───────────────────────────────────────────── */}
              <TabsContent value="laboral" className="space-y-4 mt-4">
                <Card>
                  <CardContent className="pt-5 space-y-6">

                    {/* Asignación */}
                    <Section title="Asignación" icon={<Building2 className="w-4 h-4" />}>
                      {user.contractInfo?.assignment ? (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="col-span-2">
                            <Row label="Empresa" value={fmt(user.contractInfo.assignment.company)} />
                          </div>
                          <Row label="Área" value={fmt(user.contractInfo.assignment.area)} />
                          <Row label="Cargo" value={fmt(user.contractInfo.assignment.position)} />
                          <Row label="Proyecto" value={fmt(user.contractInfo.assignment.project)} />
                          <Row label="Sede" value={fmt(user.contractInfo.assignment.location)} />
                          <Row label="Jefe directo" value={fmt(user.contractInfo.assignment.directSupervisor)} />
                          <Row label="Centro de costos" value={fmt(user.contractInfo.assignment.costCenter)} />
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400">Sin asignación registrada</p>
                      )}
                    </Section>

                    <Separator />

                    {/* Contrato */}
                    <Section title="Contrato" icon={<FileText className="w-4 h-4" />}>
                      {user.contractInfo?.contract ? (
                        <div className="grid grid-cols-2 gap-4">
                          <Row label="Tipo de contrato" value={fmt(user.contractInfo.contract.contractType)} />
                          <Row label="Tipo de vinculación" value={fmt(user.contractInfo.contract.linkType)} />
                          <Row label="Fecha de inicio" value={fmtDate(user.contractInfo.contract.startDate)} />
                          <Row label="Fecha de fin"
                            value={user.contractInfo.contract.endDate
                              ? fmtDate(user.contractInfo.contract.endDate)
                              : 'Indefinido'} />
                          <Row label="Período de prueba" value={fmt(user.contractInfo.contract.probationPeriod)} />
                          <Row label="Modalidad"
                            value={fmt(user.contractInfo.workConditions?.workModality)} />
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400">Sin contrato registrado</p>
                      )}
                    </Section>

                    <Separator />

                    {/* Salario */}
                    <Section title="Salario" icon={<DollarSign className="w-4 h-4" />}>
                      {user.salaryInfo ? (
                        <div className="grid grid-cols-2 gap-4">
                          <Row label="Salario base" value={fmtMoney(user.salaryInfo.baseSalary)} />
                          <Row label="Tipo de salario" value={fmt(user.salaryInfo.salaryType)} />
                          <Row label="Auxilio de transporte" value={fmtMoney(user.salaryInfo.transportAllowance)} />
                          <Row label="Subsidio de alimentación" value={fmtMoney(user.salaryInfo.foodAllowance)} />
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400">Sin información salarial</p>
                      )}
                    </Section>

                    <Separator />

                    {/* Seguridad Social */}
                    <Section title="Seguridad Social" icon={<ShieldCheck className="w-4 h-4" />}>
                      {user.socialSecurity ? (
                        <div className="grid grid-cols-2 gap-4">
                          <Row label="EPS" value={fmt(user.socialSecurity.eps)} />
                          <Row label="Fondo de pensiones (AFP)" value={fmt(user.socialSecurity.afp)} />
                          <Row label="Caja de compensación (CCF)" value={fmt(user.socialSecurity.ccf)} />
                          <Row label="Nivel de riesgo ARL" value={fmt(user.socialSecurity.arlRiskLevel)} />
                          <Row label="Fondo de cesantías" value={fmt(user.socialSecurity.severanceFund)} />
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400">Sin seguridad social registrada</p>
                      )}
                    </Section>

                    <Separator />

                    {/* Bancario */}
                    <Section title="Información bancaria" icon={<CreditCard className="w-4 h-4" />}>
                      {user.bankingInfo ? (
                        <div className="grid grid-cols-2 gap-4">
                          <Row label="Banco" value={fmt(user.bankingInfo.bankName)} />
                          <Row label="Tipo de cuenta" value={fmt(user.bankingInfo.accountType)} />
                          <div className="col-span-2">
                            <Row label="Número de cuenta" value={fmt(user.bankingInfo.accountNumber)} />
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400">Sin información bancaria</p>
                      )}
                    </Section>

                  </CardContent>
                </Card>
              </TabsContent>

            </Tabs>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-100">
          <Button onClick={() => onOpenChange(false)}
            className="bg-[#008C3C] hover:bg-[#006C2F] text-white">
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
