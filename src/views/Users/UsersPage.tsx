import { useState, useMemo } from 'react';
import { useUsers } from '@/hooks/useUsers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Upload, Search, Plus, Loader2, Trash2, Eye,
  UserMinus, Download, X, Building2, FolderOpen, Users,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreateUserDialog } from '@/components/users/CreateUserDialog';
import { EditUserDialog } from '@/components/users/EditUserDialog';
import { DeleteUserDialog } from '@/components/users/DeleteUserDialog';
import { ViewUserProfileDialog } from '@/components/users/ViewUserProfileDialog';
import { RegisterMovementDialog } from '@/components/analytics/RegisterMovementDialog';

const ROLE_LABEL: Record<string, string> = {
  all:           'Todos',
  activo:        'Activos',
  colaborador:   'Colaboradores',
  lider:         'Líderes',
  aspirante:     'Aspirantes',
  excolaborador: 'Ex-colaboradores',
};

export const UsersPage = () => {
  const [searchTerm,    setSearchTerm]    = useState('');
  const [filterRole,    setFilterRole]    = useState<string>('activo');
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [filterProject, setFilterProject] = useState<string>('all');

  const [createDialogOpen,   setCreateDialogOpen]   = useState(false);
  const [editDialogOpen,     setEditDialogOpen]      = useState(false);
  const [deleteDialogOpen,   setDeleteDialogOpen]    = useState(false);
  const [selectedUser,       setSelectedUser]        = useState<any | null>(null);
  const [profileDialogOpen,  setProfileDialogOpen]   = useState(false);
  const [selectedUserId,     setSelectedUserId]      = useState<string | null>(null);
  const [movementDialogOpen, setMovementDialogOpen]  = useState(false);

  const { users, loading, importUsersFromExcel, refreshUsers } = useUsers();

  // ── Derived option lists ────────────────────────────────────────────────────

  const companyOptions = useMemo(() => {
    const map = new Map<string, number>();
    users.forEach((u: any) => {
      const c = u.contractInfo?.assignment?.company?.trim();
      if (c) map.set(c, (map.get(c) ?? 0) + 1);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
  }, [users]);

  const projectOptions = useMemo(() => {
    const map = new Map<string, number>();
    users
      .filter((u: any) => filterCompany === 'all' || u.contractInfo?.assignment?.company?.trim() === filterCompany)
      .forEach((u: any) => {
        const p = u.contractInfo?.assignment?.project?.trim();
        if (p) map.set(p, (map.get(p) ?? 0) + 1);
      });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
  }, [users, filterCompany]);

  // ── Filtered list ───────────────────────────────────────────────────────────

  const filteredUsers = useMemo(() => users.filter((u: any) => {
    // Role / status
    if (filterRole === 'activo') {
      if (u.role === 'excolaborador') return false;
    } else if (filterRole !== 'all') {
      if (u.role !== filterRole) return false;
    }

    // Company
    if (filterCompany !== 'all') {
      if (u.contractInfo?.assignment?.company?.trim() !== filterCompany) return false;
    }

    // Project
    if (filterProject !== 'all') {
      if (u.contractInfo?.assignment?.project?.trim() !== filterProject) return false;
    }

    // Text search
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const hit =
        u.fullName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.personalData?.documentNumber?.toString().includes(q) ||
        u.contractInfo?.assignment?.company?.toLowerCase().includes(q) ||
        u.contractInfo?.assignment?.project?.toLowerCase().includes(q) ||
        u.personalData?.position?.toLowerCase().includes(q) ||
        u.contractInfo?.assignment?.position?.toLowerCase().includes(q);
      if (!hit) return false;
    }

    return true;
  }), [users, filterRole, filterCompany, filterProject, searchTerm]);

  // ── Stats for chips ─────────────────────────────────────────────────────────

  const activeCount = useMemo(() =>
    users.filter((u: any) => u.role !== 'excolaborador').length, [users]);

  const exCount = useMemo(() =>
    users.filter((u: any) => u.role === 'excolaborador').length, [users]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const clearFilters = () => {
    setSearchTerm('');
    setFilterRole('activo');
    setFilterCompany('all');
    setFilterProject('all');
  };

  const hasFilters = searchTerm || filterRole !== 'activo' || filterCompany !== 'all' || filterProject !== 'all';

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const results = await importUsersFromExcel(file);
        const movInfo  = results.movements
          ? `\n\nMovimientos generados:\n  Ingresos: ${results.movements.ingresos}\n  Retiros: ${results.movements.retiros}` : '';
        const projInfo = results.projectsInactivated != null
          ? `\n\nProyectos inactivados: ${results.projectsInactivated}` : '';
        const updatedCount = results.updated?.length || 0;
        alert(`Importación completada:\n  Nuevos: ${results.success.length}\n  Actualizados: ${updatedCount}\n  Errores: ${results.errors.length}${movInfo}${projInfo}${results.errors.length > 0 ? '\n\nErrores:\n' + results.errors.slice(0, 10).map((e: any) => `- ${e.email}: ${e.error}`).join('\n') + (results.errors.length > 10 ? `\n  ... y ${results.errors.length - 10} más` : '') : ''}`);
      } catch {
        alert('Error al importar usuarios');
      }
    }
    e.target.value = '';
  };

  const handleExportExcel = async () => {
    const XLSX = await import('xlsx');
    const rows = filteredUsers.map((u: any) => ({
      'APELLIDOS Y NOMBRES':         u.fullName || '',
      'CORREO CORPORATIVO':          u.location?.corporateEmail || '',
      'CORREO ELECTRONICO PERSONAL': u.location?.personalEmail  || '',
      'Email':                       u.email || '',
      'ROL':                         u.role  || '',
      'CEDULA':                      u.personalData?.documentNumber   || '',
      'TIPO DOCUMENTO':              u.personalData?.documentType     || '',
      'FECHA DE NACIMIENTO':         u.personalData?.birthDate ? new Date(u.personalData.birthDate).toLocaleDateString('es-CO') : '',
      'EDAD':                        u.personalData?.age       || '',
      'GENERO':                      u.personalData?.gender    || '',
      'ESTADO CIVIL':                u.personalData?.maritalStatus || '',
      'TELEFONO PERSONAL':           u.personalData?.phone     || '',
      'CARGO':                       u.personalData?.position  || u.contractInfo?.assignment?.position || '',
      'EMPRESA':                     u.contractInfo?.assignment?.company           || '',
      'PROYECTO':                    u.contractInfo?.assignment?.project           || '',
      'CUENTA ANALITICA':            u.contractInfo?.assignment?.analyticalAccount || '',
      'JEFE INMEDIATO':              u.contractInfo?.assignment?.directSupervisor  || '',
      'PERFIL':                      u.contractInfo?.assignment?.profile           || '',
      'PERFIL CONTABLE':             u.contractInfo?.assignment?.accountingProfile || '',
      'TIPO DE CONTRATO':            u.contractInfo?.contract?.contractType        || '',
      'FECHA DE INGRESO':            u.contractInfo?.contract?.startDate ? new Date(u.contractInfo.contract.startDate).toLocaleDateString('es-CO') : '',
      'MODALIDAD':                   u.contractInfo?.workConditions?.workModality  || '',
      'JORNADA':                     u.contractInfo?.workConditions?.workday       || '',
      'Sueldo':                      u.salaryInfo?.baseSalary          || '',
      'Aux. de transporte':          u.salaryInfo?.transportAllowance  || '',
      'Auxilio Alimentacion':        u.salaryInfo?.mealAllowance       || '',
      'Auxilio Rodamiento':          u.salaryInfo?.vehicleAllowance    || '',
      'Auxilio Herramientas':        u.salaryInfo?.toolsAllowance      || '',
      'Auxilio Comunicacion':        u.salaryInfo?.communicationAllowance || '',
      'KPI Salarial':                u.salaryInfo?.salaryKpi           || '',
      'EPS':                         u.socialSecurity?.eps             || '',
      'AFP':                         u.socialSecurity?.afp             || '',
      'CCF':                         u.socialSecurity?.ccf             || '',
      'CESANTIAS':                   u.socialSecurity?.severanceFund   || '',
      'RIESGO ARL':                  u.socialSecurity?.arlRiskLevel    || '',
      'ENTIDAD BANCARIA':            u.bankingInfo?.bankName           || '',
      'TIPO DE CUENTA':              u.bankingInfo?.accountType        || '',
      'NUMERO DE CUENTA':            u.bankingInfo?.accountNumber      || '',
      'NIVEL ACADEMICO':             u.professionalProfile?.academicLevel || '',
      'PROFESION':                   u.professionalProfile?.degree     || '',
      'DEPARTAMENTO DE RESIDENCIA':  u.location?.state                 || '',
      'CIUDAD DE RESIDENCIA':        u.location?.city                  || '',
      'DIRECCION VIVIENDA':          u.location?.address               || '',
      'FECHA RETIRO':                u.administrativeRecord?.terminationDate ? new Date(u.administrativeRecord.terminationDate).toLocaleDateString('es-CO') : '',
      'MOTIVO':                      u.administrativeRecord?.terminationReason         || '',
      'JUSTIFICACION RETIRO':        u.administrativeRecord?.terminationJustification  || '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Usuarios');
    const label = filterRole !== 'all' ? `_${filterRole}s` : '';
    XLSX.writeFile(wb, `usuarios${label}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-screen">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#4A4A4A]">Usuarios</h1>
        <p className="text-sm text-[#4A4A4A]/70 mt-1">Gestiona los usuarios del sistema</p>
      </div>

      {/* Quick-stats chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        {[
          { label: 'Activos',          value: activeCount, key: 'activo',        color: 'bg-green-50 border-green-200 text-green-700' },
          { label: 'Ex-colaboradores', value: exCount,     key: 'excolaborador', color: 'bg-gray-100 border-gray-200 text-gray-600'  },
        ].map(chip => (
          <button
            key={chip.key}
            onClick={() => setFilterRole(prev => prev === chip.key ? 'activo' : chip.key)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all
              ${filterRole === chip.key
                ? chip.color + ' ring-2 ring-offset-1 ring-current/30'
                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
          >
            <Users className="w-3 h-3" />
            {chip.label}
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold
              ${filterRole === chip.key ? 'bg-white/60' : 'bg-gray-100'}`}>
              {chip.value}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-5 space-y-2">
        {/* Row 1: search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            placeholder="Buscar por nombre, cédula, email, cargo…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10 pr-8 border-gray-200 focus-visible:ring-[#008C3C]"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Row 2: role + company + project */}
        <div className="flex flex-wrap gap-2">
          {/* Role */}
          <Select value={filterRole} onValueChange={v => { setFilterRole(v); }}>
            <SelectTrigger className="w-40 border-gray-200 focus:ring-[#008C3C] shrink-0">
              <SelectValue placeholder="Rol" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="activo">Activos</SelectItem>
              <SelectItem value="colaborador">Colaboradores</SelectItem>
              <SelectItem value="lider">Líderes</SelectItem>
              <SelectItem value="aspirante">Aspirantes</SelectItem>
              <SelectItem value="excolaborador">Ex-colaboradores</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>

          {/* Company */}
          <Select
            value={filterCompany}
            onValueChange={v => { setFilterCompany(v); setFilterProject('all'); }}
          >
            <SelectTrigger className="w-52 border-gray-200 focus:ring-[#008C3C] shrink-0">
              <Building2 className="w-3.5 h-3.5 mr-1.5 text-gray-400 flex-shrink-0" />
              <SelectValue placeholder="Empresa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las empresas</SelectItem>
              {companyOptions.map(([name, count]) => (
                <SelectItem key={name} value={name}>
                  <span className="flex items-center justify-between w-full gap-3">
                    <span className="truncate">{name}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{count}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Project */}
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-52 border-gray-200 focus:ring-[#008C3C] shrink-0">
              <FolderOpen className="w-3.5 h-3.5 mr-1.5 text-gray-400 flex-shrink-0" />
              <SelectValue placeholder="Proyecto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los proyectos</SelectItem>
              {projectOptions.map(([name, count]) => (
                <SelectItem key={name} value={name}>
                  <span className="flex items-center justify-between w-full gap-3">
                    <span className="truncate">{name}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{count}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <button onClick={clearFilters}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors border border-dashed border-gray-200">
              <X className="w-3 h-3" /> Limpiar filtros
            </button>
          )}
        </div>

        {/* Row 3: actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          <label htmlFor="file-upload" className="contents">
            <Button className="cursor-pointer bg-[#1F8FBF] hover:bg-[#1A7AA3] text-white" disabled={loading} asChild>
              <span>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Importar Excel
              </span>
            </Button>
            <input id="file-upload" type="file" accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload} className="hidden" disabled={loading} />
          </label>

          <Button variant="outline" onClick={handleExportExcel}
            disabled={loading || filteredUsers.length === 0}
            className="border-gray-200 text-gray-600 hover:text-[#008C3C] hover:border-[#008C3C]/40">
            <Download className="w-4 h-4 mr-2" />
            Exportar Excel
          </Button>

          <Button variant="outline" onClick={() => setMovementDialogOpen(true)}
            className="border-red-200 text-red-500 hover:bg-red-50">
            <UserMinus className="w-4 h-4 mr-2" />
            Registrar Retiro
          </Button>

          <Button onClick={() => setCreateDialogOpen(true)}
            className="bg-[#008C3C] hover:bg-[#006C2F] text-white ml-auto">
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Usuario
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-[#4A4A4A] text-base">
                {filteredUsers.length} usuario{filteredUsers.length !== 1 ? 's' : ''}
                {filterCompany !== 'all' && <span className="font-normal text-gray-500"> · {filterCompany}</span>}
                {filterProject !== 'all' && <span className="font-normal text-gray-500"> · {filterProject}</span>}
              </CardTitle>
              <CardDescription className="text-[#4A4A4A]/70 text-xs mt-0.5">
                {ROLE_LABEL[filterRole] ?? filterRole}
                {filterCompany !== 'all' && ` · ${filterCompany}`}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#008C3C]" />
              <p className="text-[#4A4A4A]/70 mt-2">Cargando…</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-[#4A4A4A]/70">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Sin resultados para los filtros seleccionados</p>
              {hasFilters && (
                <button onClick={clearFilters}
                  className="mt-2 text-sm text-[#008C3C] hover:underline">
                  Limpiar filtros
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6 sm:mx-0">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs text-[#4A4A4A] font-semibold">Nombre</th>
                    <th className="px-3 py-3 text-left text-xs text-[#4A4A4A] font-semibold hidden sm:table-cell">Email</th>
                    <th className="px-3 py-3 text-left text-xs text-[#4A4A4A] font-semibold">Rol</th>
                    <th className="px-3 py-3 text-left text-xs text-[#4A4A4A] font-semibold hidden lg:table-cell">Empresa</th>
                    <th className="px-3 py-3 text-left text-xs text-[#4A4A4A] font-semibold hidden lg:table-cell">Proyecto</th>
                    <th className="px-3 py-3 text-left text-xs text-[#4A4A4A] font-semibold hidden md:table-cell">Perfil</th>
                    <th className="px-3 py-3 text-right text-xs text-[#4A4A4A] font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filteredUsers.map((user: any) => (
                    <tr key={user.id} className="hover:bg-[#008C3C]/5 transition-colors">
                      <td className="px-3 py-3 text-[#4A4A4A] text-sm">
                        <div className="font-medium">{user.fullName}</div>
                        <div className="text-xs text-[#4A4A4A]/60 sm:hidden">{user.email}</div>
                        <div className="text-xs text-gray-400 lg:hidden mt-0.5">
                          {user.contractInfo?.assignment?.company}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[#4A4A4A]/80 text-sm hidden sm:table-cell">{user.email}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border
                          ${user.role === 'excolaborador'
                            ? 'bg-gray-100 text-gray-500 border-gray-200'
                            : user.role === 'lider'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-[#1F8FBF]/10 text-[#1F8FBF] border-[#1F8FBF]/20'}`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-600 hidden lg:table-cell max-w-[160px]">
                        <span className="truncate block">{user.contractInfo?.assignment?.company || '—'}</span>
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-600 hidden lg:table-cell max-w-[160px]">
                        <span className="truncate block">{user.contractInfo?.assignment?.project || '—'}</span>
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        {user.profileCompleted ? (
                          <span className="text-[#008C3C] text-xs font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-[#008C3C] rounded-full" />Completo
                          </span>
                        ) : (
                          <span className="text-orange-500 text-xs font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-orange-500 rounded-full" />Pendiente
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm"
                            onClick={() => { setSelectedUserId(user.id); setProfileDialogOpen(true); }}
                            title="Ver perfil"
                            className="text-[#1F8FBF] hover:bg-[#1F8FBF]/10 h-8 w-8 p-0">
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm"
                            onClick={() => { setSelectedUser(user); setDeleteDialogOpen(true); }}
                            className="text-red-500 hover:bg-red-50 h-8 w-8 p-0">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateUserDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} onUserCreated={refreshUsers} />
      <EditUserDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} user={selectedUser} onUserUpdated={refreshUsers} />
      <DeleteUserDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} user={selectedUser} onUserDeleted={refreshUsers} />
      <ViewUserProfileDialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen} userId={selectedUserId} />
      <RegisterMovementDialog open={movementDialogOpen} onOpenChange={setMovementDialogOpen} onSuccess={refreshUsers} />
    </div>
  );
};
