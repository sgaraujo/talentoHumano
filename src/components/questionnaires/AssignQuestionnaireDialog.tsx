import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { userService } from '@/services/userService';
import { assignmentService } from '@/services/assignmentService';
import type { Questionnaire } from '@/models/types/Questionnaire';

interface AssignQuestionnaireDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questionnaire: Questionnaire | null;
  onAssigned: () => void;
}

export const AssignQuestionnaireDialog = ({
  open,
  onOpenChange,
  questionnaire,
  onAssigned,
}: AssignQuestionnaireDialogProps) => {
  const [users, setUsers] = useState<any[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<any[]>([]); // ASEGÚRATE DE TENER ESTA LÍNEA
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && questionnaire) {
      loadUsers();
    }
  }, [open, questionnaire]);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredUsers(users);
    } else {
      const filtered = users.filter(user =>
        user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredUsers(filtered);
    }
  }, [searchTerm, users]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const allUsers = await userService.getAll();

      // Filtrar por rol si el cuestionario tiene targetRole específico
      let filtered = allUsers;
      if (questionnaire?.targetRole && questionnaire.targetRole !== 'all') {
        filtered = allUsers.filter(u => u.role === questionnaire.targetRole);
      }

      setUsers(filtered);
      setFilteredUsers(filtered);
    } catch (error: any) {
      toast.error('Error al cargar usuarios', {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleUser = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const toggleAll = () => {
    if (selectedUsers.size === filteredUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(filteredUsers.map(u => u.id)));
    }
  };

  const handleAssign = async () => {
    if (selectedUsers.size === 0) {
      toast.error('Debes seleccionar al menos un usuario');
      return;
    }

    if (!questionnaire) return;

    setLoading(true);

    try {
      const usersToAssign = users.filter(u => selectedUsers.has(u.id));

      console.log('Enviando cuestionario a:', usersToAssign.map(u => u.email));

      const results = await assignmentService.assignToUsers(
        questionnaire.id,
        questionnaire.title,
        usersToAssign,
        questionnaire.allowMultipleCompletions || false,
        true // ✅ resendIfPending
      );

      if (results.success.length > 0) {
        toast.success('Cuestionario asignado', {
          description: `Enviado exitosamente a ${results.success.length} usuario(s).`,
        });
      }

      if (results.errors.length > 0) {
        const errorMessages = results.errors
          .map(e => `${e.email}: ${e.error}`)
          .join('\n');

        toast.warning('Algunos usuarios no recibieron el cuestionario', {
          description: errorMessages,
          duration: 5000,
        });
      }

      setSelectedUsers(new Set());
      setSearchTerm('');
      onAssigned();
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Error al asignar cuestionario', {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  if (!questionnaire) return null;

  const allSelected = filteredUsers.length > 0 && selectedUsers.size === filteredUsers.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Enviar Cuestionario</DialogTitle>
          <DialogDescription>
            {questionnaire.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Búsqueda */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Buscar por nombre o email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Info */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">
              {filteredUsers.length} usuario(s) disponibles
            </span>
            <span className="font-medium text-blue-600">
              {selectedUsers.size} seleccionado(s)
            </span>
          </div>

          {/* Seleccionar todos */}
          {filteredUsers.length > 0 && (
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
              <Checkbox
                checked={allSelected}
                onCheckedChange={toggleAll}
              />
              <label className="text-sm font-medium cursor-pointer" onClick={toggleAll}>
                Seleccionar todos
              </label>
            </div>
          )}

          {/* Lista de usuarios */}
          <div className="flex-1 overflow-y-auto border rounded-lg">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>No hay usuarios disponibles</p>
                {questionnaire.targetRole !== 'all' && (
                  <p className="text-sm mt-2">
                    Este cuestionario está dirigido solo a: {questionnaire.targetRole}
                  </p>
                )}
              </div>
            ) : (
              <div className="divide-y">
                {filteredUsers.map(user => (
                  <div
                    key={user.id}
                    onClick={() => toggleUser(user.id)}
                    className={`
                      flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors
                      ${selectedUsers.has(user.id) ? 'bg-blue-50 hover:bg-blue-100' : ''}
                    `}
                  >
                    <Checkbox
                      checked={selectedUsers.has(user.id)}
                      onCheckedChange={() => toggleUser(user.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{user.fullName}</p>
                      <p className="text-sm text-gray-600 truncate">{user.email}</p>
                    </div>
                    <span className="text-xs px-2 py-1 bg-gray-100 rounded capitalize">
                      {user.role}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleAssign} disabled={loading || selectedUsers.size === 0}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Enviar a {selectedUsers.size} usuario(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};