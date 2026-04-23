import { useState, useEffect, useMemo } from 'react';
import {
  Shield, Search, Loader2, Users,
  Calculator, UserCog, Edit2, Check, X, UserCheck, UserX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { rolesService } from '@/services/rolesService';
import { userService } from '@/services/userService';
import type { PlatformUser, AppRole } from '@/models/types/AppRole';
import type { User } from '@/models/types/User';
import { ROLE_LABELS, ROLE_COLORS, ROLE_MODULES } from '@/models/types/AppRole';

// ── sidebar module labels ────────────────────────────────────────────────────

const MODULE_LABELS: Record<string, string> = {
  '/dashboard':        'Dashboard',
  '/usuarios':         'Usuarios',
  '/empresas':         'Empresas',
  '/proyectos':        'Proyectos',
  '/comunicaciones':   'Comunicaciones',
  '/notificaciones':   'Notificaciones',
  '/rotacion-talento': 'Rotación y Talento',
  '/chatbot':          'Chat IA',
  '/busqueda':         'Búsqueda',
  '/exportador':       'Exportador',
  '/questionarios':    'Cuestionarios',
  '/contabilidad':     'Contabilidad',
};

const ROLE_ICON: Record<AppRole, React.ElementType> = {
  admin:          Shield,
  talento_humano: Users,
  contabilidad:   Calculator,
};

// Row combining a system user with their optional platform role
interface UserRow {
  userId: string;
  email: string;
  fullName: string;
  platformUser?: PlatformUser; // undefined = no role assigned yet
}

// ── component ─────────────────────────────────────────────────────────────────

export const RolesPage = () => {
  const [sysUsers,    setSysUsers]    = useState<User[]>([]);
  const [roleUsers,   setRoleUsers]   = useState<PlatformUser[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [filterRole,  setFilterRole]  = useState<AppRole | 'all' | 'none'>('all');

  // Assign dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [target,     setTarget]     = useState<UserRow | null>(null);
  const [selRole,    setSelRole]     = useState<AppRole>('talento_humano');
  const [saving,     setSaving]      = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [sys, roles] = await Promise.all([
        userService.getAll(),
        rolesService.getAll(),
      ]);
      setSysUsers(sys);
      setRoleUsers(roles);
    } catch (e: any) {
      toast.error('Error al cargar', { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Merge: one row per unique email (deduplicate sysUsers, prefer entry with fullName)
  const rows: UserRow[] = useMemo(() => {
    const roleMap = new Map(roleUsers.map(r => [r.email.toLowerCase(), r]));
    // Deduplicate by email — keep the record with the longest fullName
    const emailMap = new Map<string, User>();
    sysUsers.forEach(u => {
      const key = (u.email || '').toLowerCase();
      if (!key) return;
      const existing = emailMap.get(key);
      if (!existing || (u.fullName?.length ?? 0) > (existing.fullName?.length ?? 0)) {
        emailMap.set(key, u);
      }
    });
    return Array.from(emailMap.values()).map(u => ({
      userId:       u.id,
      email:        u.email,
      fullName:     u.fullName,
      platformUser: roleMap.get(u.email.toLowerCase()),
    }));
  }, [sysUsers, roleUsers]);

  // Stats
  const stats = useMemo(() => {
    const counts: Record<AppRole, number> = { admin: 0, talento_humano: 0, contabilidad: 0 };
    roleUsers.forEach(u => { if (counts[u.role] !== undefined) counts[u.role]++; });
    const noRole = sysUsers.length - roleUsers.length;
    return { counts, noRole };
  }, [sysUsers, roleUsers]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filterRole === 'none'  && r.platformUser) return false;
      if (filterRole !== 'all' && filterRole !== 'none' && r.platformUser?.role !== filterRole) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!r.email.toLowerCase().includes(q) && !r.fullName.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, filterRole]);

  const openAssign = (row: UserRow) => {
    setTarget(row);
    setSelRole(row.platformUser?.role ?? 'talento_humano');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!target) return;
    setSaving(true);
    try {
      await rolesService.upsert(target.email, target.fullName, selRole);
      toast.success(`Rol "${ROLE_LABELS[selRole]}" asignado a ${target.fullName || target.email}`);
      setDialogOpen(false);
      await load();
    } catch (e: any) {
      toast.error('Error', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (row: UserRow) => {
    if (!row.platformUser) return;
    if (!confirm(`¿Quitar acceso de ${row.fullName || row.email}? Solo verá la pantalla de login.`)) return;
    try {
      await rolesService.delete(row.email);
      toast.success('Acceso eliminado');
      await load();
    } catch (e: any) {
      toast.error('Error', { description: e.message });
    }
  };

  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-screen">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#4A4A4A] flex items-center gap-2">
            <Shield className="w-7 h-7 text-[#008C3C]" />
            Roles y Accesos
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Asigna el rol de plataforma a cada colaborador · {sysUsers.length} usuarios
          </p>
        </div>
      </div>

      {/* Role summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {(Object.entries(ROLE_LABELS) as [AppRole, string][]).map(([role, label]) => {
          const Icon = ROLE_ICON[role];
          return (
            <button
              key={role}
              onClick={() => setFilterRole(filterRole === role ? 'all' : role)}
              className={`rounded-xl border shadow-sm p-4 text-left transition-all hover:shadow-md
                ${filterRole === role
                  ? role === 'admin'          ? 'bg-purple-50 border-purple-300 ring-1 ring-purple-300'
                  : role === 'talento_humano' ? 'bg-green-50 border-green-300 ring-1 ring-green-300'
                                             : 'bg-blue-50 border-blue-300 ring-1 ring-blue-300'
                  : 'bg-white border-gray-100'}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                  role === 'admin' ? 'bg-purple-100' :
                  role === 'talento_humano' ? 'bg-green-100' : 'bg-blue-100'
                }`}>
                  <Icon className={`w-3.5 h-3.5 ${
                    role === 'admin' ? 'text-purple-600' :
                    role === 'talento_humano' ? 'text-green-600' : 'text-blue-600'
                  }`} />
                </div>
                <span className="text-xs font-semibold text-[#4A4A4A]">{label}</span>
              </div>
              <p className={`text-2xl font-bold ${
                role === 'admin' ? 'text-purple-600' :
                role === 'talento_humano' ? 'text-green-600' : 'text-blue-600'
              }`}>{stats.counts[role]}</p>
            </button>
          );
        })}

        {/* Sin acceso card */}
        <button
          onClick={() => setFilterRole(filterRole === 'none' ? 'all' : 'none')}
          className={`rounded-xl border shadow-sm p-4 text-left transition-all hover:shadow-md
            ${filterRole === 'none' ? 'bg-gray-100 border-gray-300 ring-1 ring-gray-300' : 'bg-white border-gray-100'}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
              <UserX className="w-3.5 h-3.5 text-gray-400" />
            </div>
            <span className="text-xs font-semibold text-gray-500">Sin acceso</span>
          </div>
          <p className="text-2xl font-bold text-gray-400">{stats.noRole}</p>
        </button>
      </div>

      {/* Filters bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar por nombre o email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 border-gray-200"
          />
        </div>
        {(filterRole !== 'all' || search) && (
          <button
            onClick={() => { setSearch(''); setFilterRole('all'); }}
            className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors"
          >
            <X className="w-3 h-3" /> Limpiar
          </button>
        )}
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} usuarios</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <UserCog className="w-10 h-10 mx-auto mb-3 text-gray-200" />
          <p className="text-gray-400">Sin resultados</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="grid grid-cols-12 px-5 py-2.5 bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            <span className="col-span-4">Colaborador</span>
            <span className="col-span-4">Email</span>
            <span className="col-span-3">Rol de plataforma</span>
            <span className="col-span-1"></span>
          </div>

          <div className="divide-y divide-gray-50">
            {filtered.map(row => {
              const hasRole = !!row.platformUser;
              const role    = row.platformUser?.role;
              const Icon    = role ? ROLE_ICON[role] : null;
              const initial = row.fullName?.charAt(0)?.toUpperCase() || row.email.charAt(0).toUpperCase();

              return (
                <div
                  key={row.userId}
                  className="grid grid-cols-12 px-5 py-3.5 items-center hover:bg-gray-50/60 transition-colors group cursor-pointer"
                  onClick={() => openAssign(row)}
                >
                  {/* Name */}
                  <div className="col-span-4 flex items-center gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                      !hasRole                   ? 'bg-gray-100 text-gray-400' :
                      role === 'admin'           ? 'bg-purple-100 text-purple-600' :
                      role === 'talento_humano'  ? 'bg-green-100 text-green-600' :
                                                   'bg-blue-100 text-blue-600'
                    }`}>
                      {initial}
                    </div>
                    <span className="text-sm font-medium text-[#4A4A4A] truncate">{row.fullName || '—'}</span>
                  </div>

                  {/* Email */}
                  <div className="col-span-4 min-w-0 pr-2">
                    <span className="text-sm text-gray-500 truncate block">{row.email}</span>
                  </div>

                  {/* Role badge */}
                  <div className="col-span-3">
                    {hasRole && role ? (
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${ROLE_COLORS[role]}`}>
                        {Icon && <Icon className="w-3 h-3" />}
                        {ROLE_LABELS[role]}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-gray-400 px-2.5 py-1 rounded-full border border-dashed border-gray-200">
                        <UserX className="w-3 h-3" /> Sin acceso
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="col-span-1 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={e => { e.stopPropagation(); openAssign(row); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#008C3C] hover:bg-[#008C3C]/10 transition-colors"
                      title="Asignar rol"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {hasRole && (
                      <button
                        onClick={e => { e.stopPropagation(); handleRemove(row); }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Quitar acceso"
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Assign Role Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#008C3C]" />
              Asignar rol de plataforma
            </DialogTitle>
          </DialogHeader>

          {target && (
            <div className="space-y-4 py-1">
              {/* User info */}
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                <div className="w-10 h-10 rounded-full bg-[#008C3C]/10 flex items-center justify-center text-sm font-bold text-[#008C3C] flex-shrink-0">
                  {target.fullName?.charAt(0)?.toUpperCase() || target.email.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#4A4A4A] truncate">{target.fullName}</p>
                  <p className="text-xs text-gray-400 truncate">{target.email}</p>
                </div>
              </div>

              {/* Role selector */}
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Rol de acceso *</Label>
                <Select value={selRole} onValueChange={v => setSelRole(v as AppRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(ROLE_LABELS) as [AppRole, string][]).map(([r, label]) => {
                      const Icon = ROLE_ICON[r];
                      return (
                        <SelectItem key={r} value={r}>
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4" /> {label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Access preview */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Tendrá acceso a:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(ROLE_MODULES[selRole][0] === '*'
                    ? Object.values(MODULE_LABELS)
                    : ROLE_MODULES[selRole].map(m => MODULE_LABELS[m] ?? m)
                  ).map(m => (
                    <span key={m} className="inline-flex items-center gap-1 text-[10px] bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-md">
                      <Check className="w-2.5 h-2.5 text-green-500" /> {m}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>
                  <X className="w-4 h-4 mr-1" /> Cancelar
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 bg-[#008C3C] hover:bg-[#006C2F] text-white"
                >
                  {saving
                    ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    : <Check className="w-4 h-4 mr-1" />}
                  Guardar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
