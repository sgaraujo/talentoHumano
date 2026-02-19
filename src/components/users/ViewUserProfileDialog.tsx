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
  Loader2, 
  User, 
  MapPin, 
  Briefcase, 
  Heart, 
  Users, 
  FileText,
  Calendar,
  Phone,
  Mail,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';

interface ViewUserProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
}

const formatDate = (date: any): string => {
  if (!date) return 'No especificado';
  let d: Date;
  if (date.toDate && typeof date.toDate === 'function') {
    d = date.toDate();
  } else if (date instanceof Date) {
    d = date;
  } else if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    const [y, m, day] = date.split('-').map(Number);
    d = new Date(y, m - 1, day);
  } else {
    d = new Date(date);
  }
  return isNaN(d.getTime()) ? 'No especificado' : d.toLocaleDateString();
};

export const ViewUserProfileDialog = ({
  open,
  onOpenChange,
  userId
}: ViewUserProfileDialogProps) => {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    if (open && userId) {
      loadUserProfile();
    }
  }, [open, userId]);

  const loadUserProfile = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      
      // Obtener documento completo del usuario
      const userDoc = await getDoc(doc(db, 'users', userId));
      
      if (!userDoc.exists()) {
        toast.error('Usuario no encontrado');
        return;
      }

      setUser({
        id: userDoc.id,
        ...userDoc.data(),
      });
    } catch (error: any) {
      toast.error('Error al cargar perfil', {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  if (!userId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Perfil del Usuario
          </DialogTitle>
          {user && (
            <DialogDescription>
              {user.fullName} • {user.email}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : user ? (
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="personal">Personal</TabsTrigger>
                <TabsTrigger value="profesional">Profesional</TabsTrigger>
                <TabsTrigger value="familia">Familia</TabsTrigger>
                <TabsTrigger value="contrato">Contrato</TabsTrigger>
              </TabsList>

              {/* TAB: GENERAL */}
              <TabsContent value="general" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Información Básica
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Nombre Completo</p>
                        <p className="font-medium">{user.fullName || 'No especificado'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Email</p>
                        <p className="font-medium flex items-center gap-2">
                          <Mail className="w-4 h-4 text-gray-400" />
                          {user.email}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Rol</p>
                        <Badge className="capitalize">{user.role}</Badge>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Estado del Perfil</p>
                        {user.profileCompleted ? (
                          <Badge className="bg-green-100 text-green-800">Completo</Badge>
                        ) : (
                          <Badge variant="secondary">Incompleto</Badge>
                        )}
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Fecha de Registro</p>
                        <p className="font-medium flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          {formatDate(user.createdAt)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {!user.profileCompleted && (
                  <Card className="border-orange-200 bg-orange-50">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5" />
                        <div>
                          <p className="font-medium text-orange-900">Perfil Incompleto</p>
                          <p className="text-sm text-orange-700 mt-1">
                            Este usuario aún no ha completado su cuestionario de onboarding.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* TAB: PERSONAL */}
              <TabsContent value="personal" className="space-y-4">
                {/* Datos Personales */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Datos Personales
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {user.personalData ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-500">Tipo de Documento</p>
                          <p className="font-medium">{user.personalData.documentType || 'No especificado'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Número de Documento</p>
                          <p className="font-medium">{user.personalData.documentNumber || 'No especificado'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Género</p>
                          <p className="font-medium">{user.personalData.gender || 'No especificado'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Fecha de Nacimiento</p>
                          <p className="font-medium">
                            {formatDate(user.personalData.birthDate)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Teléfono</p>
                          <p className="font-medium flex items-center gap-2">
                            <Phone className="w-4 h-4 text-gray-400" />
                            {user.personalData.phone || 'No especificado'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-4">No hay datos personales registrados</p>
                    )}
                  </CardContent>
                </Card>

                {/* Datos Sociodemográficos */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Datos Sociodemográficos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {user.demographicData ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-500">Identidad de Género</p>
                          <p className="font-medium">{user.demographicData.genderIdentity || 'No especificado'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Orientación Sexual</p>
                          <p className="font-medium">{user.demographicData.sexualOrientation || 'No especificado'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Etnia</p>
                          <p className="font-medium">{user.demographicData.ethnicity || 'No especificado'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Nivel Socioeconómico</p>
                          <p className="font-medium">{user.demographicData.socioeconomicLevel || 'No especificado'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Tiempo de Desplazamiento</p>
                          <p className="font-medium">{user.demographicData.commuteTime || 'No especificado'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Discapacidad</p>
                          <p className="font-medium">{user.demographicData.disability || 'Ninguna'}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-4">No hay datos sociodemográficos registrados</p>
                    )}
                  </CardContent>
                </Card>

                {/* Ubicación */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Ubicación y Contacto
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {user.location ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-gray-500">País</p>
                            <p className="font-medium">{user.location.country || 'No especificado'}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Ciudad</p>
                            <p className="font-medium">{user.location.city || 'No especificado'}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-sm text-gray-500">Dirección</p>
                            <p className="font-medium">{user.location.address || 'No especificado'}</p>
                          </div>
                        </div>

                        {user.location.emergencyContact && (
                          <>
                            <Separator />
                            <div>
                              <p className="text-sm font-semibold mb-3">Contacto de Emergencia</p>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-sm text-gray-500">Nombre</p>
                                  <p className="font-medium">{user.location.emergencyContact.fullName}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-500">Relación</p>
                                  <p className="font-medium">{user.location.emergencyContact.relationship}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-500">Teléfono</p>
                                  <p className="font-medium">{user.location.emergencyContact.phone}</p>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-4">No hay datos de ubicación registrados</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* TAB: PROFESIONAL */}
              <TabsContent value="profesional" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4" />
                      Perfil Profesional
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {user.professionalProfile ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-gray-500">Área de Conocimiento</p>
                            <p className="font-medium">{user.professionalProfile.knowledgeArea || 'No especificado'}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Nivel Académico</p>
                            <p className="font-medium">{user.professionalProfile.academicLevel || 'No especificado'}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Título</p>
                            <p className="font-medium">{user.professionalProfile.degree || 'No especificado'}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Universidad</p>
                            <p className="font-medium">{user.professionalProfile.university || 'No especificado'}</p>
                          </div>
                        </div>

                        {user.professionalProfile.experience && (
                          <>
                            <Separator />
                            <div>
                              <p className="text-sm font-semibold mb-3">Experiencia Laboral</p>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-sm text-gray-500">Años de Experiencia</p>
                                  <p className="font-medium">
                                    {user.professionalProfile.experience.yearsOfExperience || 0} años
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-500">Última Empresa</p>
                                  <p className="font-medium">
                                    {user.professionalProfile.experience.lastCompany || 'No especificado'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-500">Último Cargo</p>
                                  <p className="font-medium">
                                    {user.professionalProfile.experience.lastPosition || 'No especificado'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-500">Sector</p>
                                  <p className="font-medium">
                                    {user.professionalProfile.experience.mostRecentSector || 'No especificado'}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </>
                        )}

                        {user.professionalProfile.languages && user.professionalProfile.languages.length > 0 && (
                          <>
                            <Separator />
                            <div>
                              <p className="text-sm font-semibold mb-3">Idiomas</p>
                              <div className="flex flex-wrap gap-2">
                                {user.professionalProfile.languages.map((lang: any) => (
                                  <Badge key={lang.id} variant="outline">
                                    {lang.language} - {lang.level}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-4">No hay datos profesionales registrados</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* TAB: FAMILIA */}
              <TabsContent value="familia" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Heart className="w-4 h-4" />
                      Familia y Hogar
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {user.family ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-gray-500">Tipo de Familia</p>
                            <p className="font-medium">{user.family.familyType || 'No especificado'}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Número de Convivientes</p>
                            <p className="font-medium">{user.family.numberOfCohabitants || 0}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Número de Hijos</p>
                            <p className="font-medium">{user.family.numberOfChildren || 0}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Tiene Mascotas</p>
                            <p className="font-medium">{user.family.hasPets ? 'Sí' : 'No'}</p>
                          </div>
                        </div>

                        {user.family.children && user.family.children.length > 0 && (
                          <>
                            <Separator />
                            <div>
                              <p className="text-sm font-semibold mb-3">Hijos</p>
                              <div className="space-y-2">
                                {user.family.children.map((child: any) => (
                                  <div key={child.id} className="p-3 bg-gray-50 rounded-lg">
                                    <p className="font-medium">{child.name}</p>
                                    <p className="text-sm text-gray-600">
                                      {child.age} años • {child.genderIdentity}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}

                        {user.family.pets && user.family.pets.length > 0 && (
                          <>
                            <Separator />
                            <div>
                              <p className="text-sm font-semibold mb-3">Mascotas</p>
                              <div className="flex flex-wrap gap-2">
                                {user.family.pets.map((pet: any) => (
                                  <Badge key={pet.id} variant="outline">
                                    {pet.name} ({pet.type})
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-4">No hay datos familiares registrados</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* TAB: CONTRATO */}
              <TabsContent value="contrato" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Información de Contrato
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {user.contractInfo ? (
                      <div className="space-y-6">
                        {user.contractInfo.contract && (
                          <div>
                            <p className="text-sm font-semibold mb-3">Datos del Contrato</p>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-sm text-gray-500">Tipo de Contrato</p>
                                <p className="font-medium">{user.contractInfo.contract.contractType || 'No especificado'}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Tipo de Vinculación</p>
                                <p className="font-medium">{user.contractInfo.contract.linkType || 'No especificado'}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Fecha de Inicio</p>
                                <p className="font-medium">
                                  {formatDate(user.contractInfo.contract.startDate)}
                                </p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Fecha de Fin</p>
                                <p className="font-medium">
                                  {user.contractInfo.contract.endDate
                                    ? formatDate(user.contractInfo.contract.endDate)
                                    : 'Indefinido'}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {user.contractInfo.workConditions && (
                          <>
                            <Separator />
                            <div>
                              <p className="text-sm font-semibold mb-3">Condiciones de Trabajo</p>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-sm text-gray-500">Modalidad</p>
                                  <Badge className="capitalize">
                                    {user.contractInfo.workConditions.workModality || 'No especificado'}
                                  </Badge>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-500">Jornada</p>
                                  <p className="font-medium">{user.contractInfo.workConditions.workday || 'No especificado'}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-500">Salario Básico</p>
                                  <p className="font-medium">
                                    {user.contractInfo.workConditions.baseSalary 
                                      ? `$${user.contractInfo.workConditions.baseSalary.toLocaleString()}`
                                      : 'No especificado'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-500">Horario</p>
                                  <p className="font-medium">{user.contractInfo.workConditions.schedule || 'No especificado'}</p>
                                </div>
                              </div>
                            </div>
                          </>
                        )}

                        {user.contractInfo.assignment && (
                          <>
                            <Separator />
                            <div>
                              <p className="text-sm font-semibold mb-3">Asignación</p>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-sm text-gray-500">Empresa</p>
                                  <p className="font-medium">{user.contractInfo.assignment.company || 'No especificado'}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-500">Área</p>
                                  <p className="font-medium">{user.contractInfo.assignment.area || 'No especificado'}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-500">Cargo</p>
                                  <p className="font-medium">{user.contractInfo.assignment.position || 'No especificado'}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-500">Proyecto</p>
                                  <p className="font-medium">{user.contractInfo.assignment.project || 'No especificado'}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-500">Jefe Directo</p>
                                  <p className="font-medium">{user.contractInfo.assignment.directSupervisor || 'No especificado'}</p>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-4">
                        {user.role === 'colaborador' 
                          ? 'No hay información de contrato registrada'
                          : 'La información de contrato solo aplica para colaboradores'}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="text-center py-12 text-gray-500">
              No se pudo cargar el perfil del usuario
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};