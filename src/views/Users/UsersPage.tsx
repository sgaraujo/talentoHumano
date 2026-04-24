import { useState } from 'react';
import { useUsers } from '@/hooks/useUsers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Upload, Search, Plus, Loader2, Pencil, Trash2, Eye, UserMinus, RefreshCw, Download, ShieldCheck } from 'lucide-react';
import { collection, getDocs, query, where, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { CreateUserDialog } from '@/components/users/CreateUserDialog';
import { EditUserDialog } from '@/components/users/EditUserDialog';
import { DeleteUserDialog } from '@/components/users/DeleteUserDialog';
import { ViewUserProfileDialog } from '@/components/users/ViewUserProfileDialog';
import { RegisterMovementDialog } from '@/components/analytics/RegisterMovementDialog';

export const UsersPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);

  const { users, stats, loading, importUsersFromExcel, refreshUsers, syncProjectStatuses, reactivateAllProjects } = useUsers();
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const results = await importUsersFromExcel(file);
        const movInfo = results.movements
          ? `\n\nMovimientos generados:\n  Ingresos: ${results.movements.ingresos}\n  Retiros: ${results.movements.retiros}`
          : '';
        const projInfo = results.projectsInactivated != null
          ? `\n\nProyectos inactivados: ${results.projectsInactivated}`
          : '';
        const updatedCount = results.updated?.length || 0;
        alert(`Importacion completada:\n  Nuevos: ${results.success.length}\n  Actualizados: ${updatedCount}\n  Errores: ${results.errors.length}${movInfo}${projInfo}${results.errors.length > 0 ? '\n\nErrores:\n' + results.errors.slice(0, 10).map((e: any) => `- ${e.email}: ${e.error}`).join('\n') + (results.errors.length > 10 ? `\n  ... y ${results.errors.length - 10} mas` : '') : ''}`);
      } catch (error) {
        alert('Error al importar usuarios');
      }
    }
    e.target.value = '';
  };

  const handleEdit = (user: any) => {
    setSelectedUser(user);
    setEditDialogOpen(true);
  };

  const handleDelete = (user: any) => {
    setSelectedUser(user);
    setDeleteDialogOpen(true);
  };

  const handleViewProfile = (userId: string) => {
    setSelectedUserId(userId);
    setProfileDialogOpen(true);
  };

  const handleSyncProjects = async () => {
    try {
      const result = await syncProjectStatuses();
      alert(`Sincronización completada:\n  Proyectos inactivados: ${result.inactivated}\n  Proyectos reactivados: ${result.reactivated}`);
      refreshUsers();
    } catch {
      alert('Error al sincronizar proyectos');
    }
  };

  const handleFixRoles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

      const EXCOL_ESTADOS = new Set(['ANULADO', 'ANULADA', 'RETIRADO', 'RETIRADA']);
      let fixed = 0;
      let errors = 0;

      for (const row of rows) {
        const estado = (row['ESTADO'] || '').toString().trim().toUpperCase();
        const email  = (row['CORREO CORPORATIVO'] || row['CORREO'] || row['EMAIL'] || '').toString().trim().toLowerCase();
        const cedula = (row['NUMERO DE CEDULA'] || row['CEDULA'] || row['NRO CEDULA'] || row['NÚMERO DE CÉDULA'] || '').toString().trim();

        if (!email && !cedula) continue;

        const correctRole = EXCOL_ESTADOS.has(estado) ? 'excolaborador' : 'colaborador';

        try {
          let userDoc: any = null;
          if (cedula) {
            const snap = await getDocs(query(collection(db, 'users'), where('personalData.documentNumber', '==', cedula)));
            if (!snap.empty) userDoc = snap.docs[0];
          }
          if (!userDoc && email) {
            const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
            if (!snap.empty) userDoc = snap.docs[0];
          }
          if (userDoc && userDoc.data().role !== correctRole) {
            await updateDoc(doc(db, 'users', userDoc.id), { role: correctRole, updatedAt: new Date() });
            fixed++;
          }
        } catch {
          errors++;
        }
      }

      const sync = await syncProjectStatuses();
      alert(`Corrección completada:\n  Roles corregidos: ${fixed}\n  Proyectos inactivados: ${sync.inactivated}\n  Proyectos reactivados: ${sync.reactivated}${errors > 0 ? `\n  Errores: ${errors}` : ''}`);
      refreshUsers();
    } catch {
      alert('Error al procesar el archivo');
    }
  };

  const handleReactivateAll = async () => {
    if (!confirm('¿Reactivar TODOS los proyectos inactivos? Esto revertirá la sincronización anterior.')) return;
    try {
      const result = await reactivateAllProjects();
      alert(`Proyectos reactivados: ${result.reactivated}`);
      refreshUsers();
    } catch {
      alert('Error al reactivar proyectos');
    }
  };

  const handleExportExcel = async () => {
    const XLSX = await import('xlsx');
    const rows = filteredUsers.map((u: any) => ({
      'APELLIDOS Y NOMBRES':          u.fullName || '',
      'CORREO CORPORATIVO':           u.location?.corporateEmail || '',
      'CORREO ELECTRONICO PERSONAL':  u.location?.personalEmail  || '',
      'Email':                        u.email || '',
      'ROL':                          u.role  || '',
      'CEDULA':                       u.personalData?.documentNumber   || '',
      'TIPO DOCUMENTO':               u.personalData?.documentType     || '',
      'FECHA DE NACIMIENTO':          u.personalData?.birthDate ? new Date(u.personalData.birthDate).toLocaleDateString('es-CO') : '',
      'EDAD':                         u.personalData?.age       || '',
      'GENERO':                       u.personalData?.gender    || '',
      'ESTADO CIVIL':                 u.personalData?.maritalStatus || '',
      'TELEFONO PERSONAL':            u.personalData?.phone     || '',
      'CARGO':                        u.personalData?.position  || u.contractInfo?.assignment?.position || '',
      'EMPRESA':                      u.contractInfo?.assignment?.company          || '',
      'PROYECTO':                     u.contractInfo?.assignment?.project          || '',
      'CUENTA ANALITICA':             u.contractInfo?.assignment?.analyticalAccount|| '',
      'JEFE INMEDIATO':               u.contractInfo?.assignment?.directSupervisor || '',
      'PERFIL':                       u.contractInfo?.assignment?.profile          || '',
      'PERFIL CONTABLE':              u.contractInfo?.assignment?.accountingProfile|| '',
      'TIPO DE CONTRATO':             u.contractInfo?.contract?.contractType       || '',
      'FECHA DE INGRESO':             u.contractInfo?.contract?.startDate ? new Date(u.contractInfo.contract.startDate).toLocaleDateString('es-CO') : '',
      'MODALIDAD':                    u.contractInfo?.workConditions?.workModality || '',
      'JORNADA':                      u.contractInfo?.workConditions?.workday      || '',
      'Sueldo':                       u.salaryInfo?.baseSalary         || '',
      'Aux. de transporte':           u.salaryInfo?.transportAllowance || '',
      'Auxilio Alimentacion':         u.salaryInfo?.mealAllowance      || '',
      'Auxilio Rodamiento':           u.salaryInfo?.vehicleAllowance   || '',
      'Auxilio Herramientas':         u.salaryInfo?.toolsAllowance     || '',
      'Auxilio Comunicacion':         u.salaryInfo?.communicationAllowance || '',
      'KPI Salarial':                 u.salaryInfo?.salaryKpi          || '',
      'EPS':                          u.socialSecurity?.eps            || '',
      'AFP':                          u.socialSecurity?.afp            || '',
      'CCF':                          u.socialSecurity?.ccf            || '',
      'CESANTIAS':                    u.socialSecurity?.severanceFund  || '',
      'RIESGO ARL':                   u.socialSecurity?.arlRiskLevel   || '',
      'ENTIDAD BANCARIA':             u.bankingInfo?.bankName          || '',
      'TIPO DE CUENTA':               u.bankingInfo?.accountType       || '',
      'NUMERO DE CUENTA':             u.bankingInfo?.accountNumber     || '',
      'NIVEL ACADEMICO':              u.professionalProfile?.academicLevel || '',
      'PROFESION':                    u.professionalProfile?.degree    || '',
      'DEPARTAMENTO DE RESIDENCIA':   u.location?.state                || '',
      'CIUDAD DE RESIDENCIA':         u.location?.city                 || '',
      'DIRECCION VIVIENDA':           u.location?.address              || '',
      'FECHA RETIRO':                 u.administrativeRecord?.terminationDate ? new Date(u.administrativeRecord.terminationDate).toLocaleDateString('es-CO') : '',
      'MOTIVO':                       u.administrativeRecord?.terminationReason || '',
      'JUSTIFICACION RETIRO':         u.administrativeRecord?.terminationJustification || '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Usuarios');
    const label = filterRole !== 'all' ? `_${filterRole}s` : '';
    XLSX.writeFile(wb, `usuarios${label}_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const filteredUsers = users.filter((user: any) => {
    if (filterRole !== 'all' && user.role !== filterRole) return false;
    if (searchTerm && !user.email?.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !user.fullName?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-screen">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#4A4A4A]">Usuarios</h1>
        <p className="text-sm sm:text-base text-[#4A4A4A]/70 mt-1">Gestiona los usuarios del sistema</p>
      </div>

      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#4A4A4A]/50 w-4 h-4" />
          <Input
            placeholder="Buscar usuarios..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 border-[#008C3C]/30 focus:ring-[#008C3C] focus:border-[#008C3C]"
          />
        </div>

        <div className="flex gap-2">
          <label htmlFor="file-upload" className="flex-1 sm:flex-none">
            <Button 
              className="w-full cursor-pointer bg-[#1F8FBF] hover:bg-[#1A7AA3] text-white" 
              disabled={loading} 
              asChild
            >
              <span>
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                <span className="hidden sm:inline">Importar Excel</span>
                <span className="sm:hidden">Importar</span>
              </span>
            </Button>
            <input
              id="file-upload"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
              disabled={loading}
            />
          </label>

          <Button
            variant="outline"
            onClick={handleExportExcel}
            disabled={loading || filteredUsers.length === 0}
            className="flex-1 sm:flex-none border-[#008C3C]/30 text-[#008C3C] hover:bg-[#008C3C]/5"
            title="Descargar Excel con los usuarios visibles"
          >
            <Download className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Exportar Excel</span>
            <span className="sm:hidden">Exportar</span>
          </Button>

          <label htmlFor="fix-roles-upload" className="flex-1 sm:flex-none">
            <Button variant="outline" disabled={loading} asChild
              className="w-full cursor-pointer border-amber-300 text-amber-700 hover:bg-amber-50"
              title="Lee solo ESTADO del Excel y corrige roles sin tocar nada más">
              <span>
                <ShieldCheck className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Corregir Roles</span>
                <span className="sm:hidden">Roles</span>
              </span>
            </Button>
            <input id="fix-roles-upload" type="file" accept=".xlsx,.xls" onChange={handleFixRoles} className="hidden" disabled={loading} />
          </label>

          <Button
            variant="outline"
            onClick={handleReactivateAll}
            disabled={loading}
            className="flex-1 sm:flex-none border-red-300 text-red-600 hover:bg-red-50"
            title="Reactivar todos los proyectos inactivos"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Reactivar Proyectos</span>
            <span className="sm:hidden">Reactivar</span>
          </Button>

          <Button
            variant="outline"
            onClick={handleSyncProjects}
            disabled={loading}
            className="flex-1 sm:flex-none border-[#008C3C]/30 text-[#008C3C] hover:bg-[#008C3C]/5"
            title="Inactiva proyectos donde todos son excolaboradores"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Sincronizar Proyectos</span>
            <span className="sm:hidden">Sincronizar</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => setMovementDialogOpen(true)}
            className="flex-1 sm:flex-none border-red-200 text-red-500 hover:bg-red-50"
          >
            <UserMinus className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Registrar Retiro</span>
            <span className="sm:hidden">Retiro</span>
          </Button>

          <Button
            variant="default"
            onClick={() => setCreateDialogOpen(true)}
            className="flex-1 sm:flex-none bg-[#008C3C] hover:bg-[#006C2F] text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Nuevo Usuario</span>
            <span className="sm:hidden">Nuevo</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {[
          { label: 'Total Registros',  value: stats.total,           role: 'all',            color: '#008C3C', border: 'border-l-[#008C3C]' },
          { label: 'Colaboradores',    value: stats.colaboradores,   role: 'colaborador',    color: '#7BCB6A', border: 'border-l-[#7BCB6A]' },
          { label: 'Aspirantes',       value: stats.aspirantes,      role: 'aspirante',      color: '#1F8FBF', border: 'border-l-[#1F8FBF]' },
          { label: 'Ex-colaboradores', value: stats.excolaboradores, role: 'excolaborador',  color: '#4A4A4A', border: 'border-l-[#4A4A4A]' },
        ].map(card => (
          <Card
            key={card.role}
            onClick={() => setFilterRole(prev => prev === card.role ? 'all' : card.role)}
            className={`border-l-4 ${card.border} shadow-sm hover:shadow-md transition-all cursor-pointer
              ${filterRole === card.role ? 'ring-2 ring-offset-1' : ''}`}
            style={filterRole === card.role ? { outline: `2px solid ${card.color}`, outlineOffset: '2px' } : {}}
          >
            <CardHeader className="pb-2">
              <CardDescription className="text-[#4A4A4A]/70 text-xs sm:text-sm">{card.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl sm:text-3xl font-bold" style={{ color: card.color }}>{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-[#4A4A4A]">
                Lista de Usuarios ({filteredUsers.length})
              </CardTitle>
              <CardDescription className="text-[#4A4A4A]/70">
                {filterRole === 'all' ? 'Todos los usuarios' : `Filtrado: ${filterRole}s`}
              </CardDescription>
            </div>
            {filterRole !== 'all' && (
              <button
                onClick={() => setFilterRole('all')}
                className="text-xs text-gray-400 hover:text-gray-600 underline"
              >
                Quitar filtro
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#008C3C]" />
              <p className="text-[#4A4A4A]/70 mt-2">Cargando...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-[#4A4A4A]/70">
              <p>No hay usuarios registrados</p>
              <p className="text-sm mt-2">Importa un archivo Excel o crea un usuario manualmente</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6 sm:mx-0">
              <div className="inline-block min-w-full align-middle">
                <table className="min-w-full divide-y divide-[#008C3C]/20">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs sm:text-sm text-[#4A4A4A] font-semibold">Nombre</th>
                      <th className="px-3 py-3 text-left text-xs sm:text-sm text-[#4A4A4A] font-semibold hidden sm:table-cell">Email</th>
                      <th className="px-3 py-3 text-left text-xs sm:text-sm text-[#4A4A4A] font-semibold">Rol</th>
                      <th className="px-3 py-3 text-left text-xs sm:text-sm text-[#4A4A4A] font-semibold hidden md:table-cell">Perfil</th>
                      <th className="px-3 py-3 text-right text-xs sm:text-sm text-[#4A4A4A] font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {filteredUsers.map((user: any) => (
                      <tr 
                        key={user.id} 
                        className="hover:bg-[#008C3C]/5 transition-colors"
                      >
                        <td className="px-3 py-3 text-[#4A4A4A] text-sm">
                          <div className="font-medium">{user.fullName}</div>
                          <div className="text-xs text-[#4A4A4A]/60 sm:hidden">{user.email}</div>
                        </td>
                        <td className="px-3 py-3 text-[#4A4A4A]/80 text-sm hidden sm:table-cell">{user.email}</td>
                        <td className="px-3 py-3">
                          <span className="inline-flex px-2 sm:px-3 py-1 bg-[#1F8FBF]/10 text-[#1F8FBF] border border-[#1F8FBF]/20 rounded-full text-xs font-medium">
                            {user.role}
                          </span>
                        </td>
                        <td className="px-3 py-3 hidden md:table-cell">
                          {user.profileCompleted ? (
                            <span className="text-[#008C3C] text-sm font-medium flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-[#008C3C] rounded-full"></span>
                              Completo
                            </span>
                          ) : (
                            <span className="text-orange-600 text-sm font-medium flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-orange-600 rounded-full"></span>
                              Pendiente
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewProfile(user.id)}
                              title="Ver perfil completo"
                              className="text-[#1F8FBF] hover:text-[#1A7AA3] hover:bg-[#1F8FBF]/10 h-8 w-8 p-0"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(user)}
                              className="text-[#008C3C] hover:text-[#006C2F] hover:bg-[#008C3C]/10 h-8 w-8 p-0"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(user)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateUserDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onUserCreated={refreshUsers}
      />

      <EditUserDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        user={selectedUser}
        onUserUpdated={refreshUsers}
      />

      <DeleteUserDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        user={selectedUser}
        onUserDeleted={refreshUsers}
      />

      <ViewUserProfileDialog
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
        userId={selectedUserId}
      />

      <RegisterMovementDialog
        open={movementDialogOpen}
        onOpenChange={setMovementDialogOpen}
        onSuccess={refreshUsers}
      />
    </div>
  );
};