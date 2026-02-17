import { useState } from 'react';
import { useUsers } from '@/hooks/useUsers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Upload, Search, Plus, Loader2, Pencil, Trash2, Eye } from 'lucide-react';
import { CreateUserDialog } from '@/components/users/CreateUserDialog';
import { EditUserDialog } from '@/components/users/EditUserDialog';
import { DeleteUserDialog } from '@/components/users/DeleteUserDialog';
import { ViewUserProfileDialog } from '@/components/users/ViewUserProfileDialog';

export const UsersPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);

  const { users, stats, loading, importUsersFromExcel, refreshUsers } = useUsers();
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const results = await importUsersFromExcel(file);
        const movInfo = results.movements
          ? `\n\nMovimientos generados:\n  Ingresos: ${results.movements.ingresos}\n  Retiros: ${results.movements.retiros}`
          : '';
        const updatedCount = results.updated?.length || 0;
        alert(`Importacion completada:\n  Nuevos: ${results.success.length}\n  Actualizados: ${updatedCount}\n  Errores: ${results.errors.length}${movInfo}${results.errors.length > 0 ? '\n\nErrores:\n' + results.errors.slice(0, 10).map((e: any) => `- ${e.email}: ${e.error}`).join('\n') + (results.errors.length > 10 ? `\n  ... y ${results.errors.length - 10} mas` : '') : ''}`);
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

  const filteredUsers = users.filter((user: any) =>
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.fullName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#4A4A4A]">Usuarios</h1>
        <p className="text-[#4A4A4A]/70 mt-1">Gestiona los usuarios del sistema</p>
      </div>

      <div className="mb-6 flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#4A4A4A]/50 w-4 h-4" />
          <Input
            placeholder="Buscar usuarios..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 border-[#008C3C]/30 focus:ring-[#008C3C] focus:border-[#008C3C]"
          />
        </div>

        <label htmlFor="file-upload">
          <Button 
            className="cursor-pointer bg-[#1F8FBF] hover:bg-[#1A7AA3] text-white" 
            disabled={loading} 
            asChild
          >
            <span>
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Importar Excel
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
          variant="default" 
          onClick={() => setCreateDialogOpen(true)}
          className="bg-[#008C3C] hover:bg-[#006C2F] text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Usuario
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="border-l-4 border-l-[#008C3C] shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription className="text-[#4A4A4A]/70">Total Registros</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-[#008C3C]">{stats.total}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#7BCB6A] shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription className="text-[#4A4A4A]/70">Colaboradores</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-[#7BCB6A]">{stats.colaboradores}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#1F8FBF] shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription className="text-[#4A4A4A]/70">Aspirantes</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-[#1F8FBF]">{stats.aspirantes}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#4A4A4A] shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription className="text-[#4A4A4A]/70">Ex-colaboradores</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-[#4A4A4A]">{stats.excolaboradores}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-[#4A4A4A]">Lista de Usuarios ({filteredUsers.length})</CardTitle>
          <CardDescription className="text-[#4A4A4A]/70">
            Visualiza y gestiona todos los usuarios del sistema
          </CardDescription>
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
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#008C3C]/20">
                    <th className="text-left p-3 text-[#4A4A4A] font-semibold">Nombre</th>
                    <th className="text-left p-3 text-[#4A4A4A] font-semibold">Email</th>
                    <th className="text-left p-3 text-[#4A4A4A] font-semibold">Rol</th>
                    <th className="text-left p-3 text-[#4A4A4A] font-semibold">Perfil</th>
                    <th className="text-right p-3 text-[#4A4A4A] font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user: any) => (
                    <tr 
                      key={user.id} 
                      className="border-b border-gray-100 hover:bg-[#008C3C]/5 transition-colors"
                    >
                      <td className="p-3 text-[#4A4A4A]">{user.fullName}</td>
                      <td className="p-3 text-[#4A4A4A]/80">{user.email}</td>
                      <td className="p-3">
                        <span className="px-3 py-1 bg-[#1F8FBF]/10 text-[#1F8FBF] border border-[#1F8FBF]/20 rounded-full text-xs font-medium">
                          {user.role}
                        </span>
                      </td>
                      <td className="p-3">
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
                      <td className="p-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewProfile(user.id)}
                            title="Ver perfil completo"
                            className="text-[#1F8FBF] hover:text-[#1A7AA3] hover:bg-[#1F8FBF]/10"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(user)}
                            className="text-[#008C3C] hover:text-[#006C2F] hover:bg-[#008C3C]/10"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(user)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
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
    </div>
  );
};