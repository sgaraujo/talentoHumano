import { useState, useEffect, useMemo } from 'react';
import {
  Shield, Search, Loader2, Users,
  Calculator, UserCog, Edit2, Check, X, UserCheck, UserX, Banknote, Crown, Mail,
} from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
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
import type { User, UserRole } from '@/models/types/User';
import { ROLE_LABELS, ROLE_COLORS, ROLE_MODULES } from '@/models/types/AppRole';

// ── module labels ────────────────────────────────────────────────────────────

// ── helpers ───────────────────────────────────────────────────────────────────

function getModuleLabels(role: AppRole): string[] {
  const map: Record<string, string> = {
    '/dashboard':        'Dashboard',
    '/usuarios':         'Usuarios',
    '/empresas':         'Empresas',
    '/proyectos':        'Cuentas analíticas',
    '/comunicaciones':   'Comunicaciones',
    '/notificaciones':   'Notificaciones',
    '/rotacion-talento': 'Rotación y Talento',
    '/chatbot':          'Chat IA',
    '/busqueda':         'Búsqueda',
    '/exportador':       'Exportador',
    '/questionarios':    'Cuestionarios',
    '/contabilidad':     'Contabilidad',
    '/archivo':          'Archivo',
    '/configuraciones':  'Configuraciones',
    '/manual':           'Manual',
  };
  const modules = ROLE_MODULES[role];
  if (modules[0] === '*') return Object.values(map);
  return modules.map(m => map[m] ?? m);
}

async function sendAccessEmail(
  email: string, name: string, role: AppRole, isNewAccess: boolean
): Promise<void> {
  const fn = httpsCallable(functions, 'sendPlatformAccessEmail');
  await fn({
    recipientEmail: email,
    recipientName:  name,
    role,
    roleLabel:  ROLE_LABELS[role],
    modules:    getModuleLabels(role),
    isNewAccess,
  });
}

// ── module labels (UI display) ────────────────────────────────────────────────

const MODULE_LABELS: Record<string, string> = {
  '/dashboard':        'Dashboard',
  '/usuarios':         'Usuarios',
  '/empresas':         'Empresas',
  '/proyectos':        'Cuentas analíticas',
  '/comunicaciones':   'Comunicaciones',
  '/notificaciones':   'Notificaciones',
  '/rotacion-talento': 'Rotación y Talento',
  '/chatbot':          'Chat IA',
  '/busqueda':         'Búsqueda',
  '/exportador':       'Exportador',
  '/questionarios':    'Cuestionarios',
  '/contabilidad':     'Contabilidad',
  '/archivo':          'Archivo',
  '/configuraciones':  'Configuraciones',
  '/manual':           'Manual',
};

const ROLE_ICON: Record<AppRole, React.ElementType> = {
  admin:          Shield,
  talento_humano: Users,
  contabilidad:   Calculator,
  financiera:     Banknote,
};

// color set per platform role (bg avatar, text avatar)
const AVATAR_COLORS: Record<AppRole, string> = {
  admin:          'bg-purple-100 text-purple-600',
  talento_humano: 'bg-green-100 text-green-600',
  contabilidad:   'bg-blue-100 text-blue-600',
  financiera:     'bg-emerald-100 text-emerald-600',
};

const CARD_ACTIVE: Record<AppRole, string> = {
  admin:          'bg-purple-50 border-purple-300 ring-1 ring-purple-300',
  talento_humano: 'bg-green-50 border-green-300 ring-1 ring-green-300',
  contabilidad:   'bg-blue-50 border-blue-300 ring-1 ring-blue-300',
  financiera:     'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-300',
};

const ICON_BG: Record<AppRole, string> = {
  admin:          'bg-purple-100',
  talento_humano: 'bg-green-100',
  contabilidad:   'bg-blue-100',
  financiera:     'bg-emerald-100',
};

const ICON_COLOR: Record<AppRole, string> = {
  admin:          'text-purple-600',
  talento_humano: 'text-green-600',
  contabilidad:   'text-blue-600',
  financiera:     'text-emerald-600',
};

const STAT_NUMBER: Record<AppRole, string> = {
  admin:          'text-purple-600',
  talento_humano: 'text-green-600',
  contabilidad:   'text-blue-600',
  financiera:     'text-emerald-600',
};

// ── row type ─────────────────────────────────────────────────────────────────

interface UserRow {
  userId:       string;
  email:        string;
  fullName:     string;
  userRole:     UserRole;          // HR role (colaborador, lider…)
  platformUser?: PlatformUser;     // platform access role
}

// ── component ─────────────────────────────────────────────────────────────────

export const RolesPage = () => {
  const [sysUsers,   setSysUsers]   = useState<User[]>([]);
  const [roleUsers,  setRoleUsers]  = useState<PlatformUser[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [filterRole, setFilterRole] = useState<AppRole | 'all' | 'none'>('all');

  // Assign dialog
  const [dialogOpen,   setDialogOpen]   = useState(false);
  const [target,       setTarget]       = useState<UserRow | null>(null);
  const [selPlatform,  setSelPlatform]  = useState<AppRole>('talento_humano');
  const [selTeamRole,  setSelTeamRole]  = useState<UserRole>('colaborador');
  const [noPlatform,   setNoPlatform]   = useState(false);
  const [saving,       setSaving]       = useState(false);

  // Bulk email dialog
  const [emailDialogOpen,  setEmailDialogOpen]  = useState(false);
  const [emailTargetRole,  setEmailTargetRole]  = useState<AppRole | 'all'>('all');
  const [sendingBulk,      setSendingBulk]      = useState(false);

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

  const rows: UserRow[] = useMemo(() => {
    // Índice de platform roles por email normalizado
    const roleMap = new Map(roleUsers.map(r => [r.email.toLowerCase().trim(), r]));

    // Mapa final: email normalizado → UserRow
    const result = new Map<string, UserRow>();

    // 1. Cargar desde colección `users` (deduplicando por email)
    const sysMap = new Map<string, User>();
    sysUsers.forEach(u => {
      const key = (u.email || '').toLowerCase().trim();
      if (!key) return;
      const prev = sysMap.get(key);
      if (!prev || (u.fullName?.length ?? 0) > (prev.fullName?.length ?? 0)) {
        sysMap.set(key, u);
      }
    });
    sysMap.forEach((u, key) => {
      result.set(key, {
        userId:       u.id,
        email:        u.email,
        fullName:     u.fullName || '',
        userRole:     u.role ?? 'colaborador',
        platformUser: roleMap.get(key),
      });
    });

    // 2. Agregar usuarios que solo existen en platform_roles (sin entrada en `users`)
    roleMap.forEach((r, key) => {
      if (!result.has(key)) {
        result.set(key, {
          userId:       '',
          email:        r.email,
          fullName:     r.name || r.email,
          userRole:     'colaborador',
          platformUser: r,
        });
      }
    });

    return Array.from(result.values())
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [sysUsers, roleUsers]);

  const stats = useMemo(() => {
    const counts: Record<AppRole, number> = { admin: 0, talento_humano: 0, contabilidad: 0, financiera: 0 };
    roleUsers.forEach(u => { if (counts[u.role] !== undefined) counts[u.role]++; });
    const leaders  = sysUsers.filter(u => u.role === 'lider').length;
    const noRole   = rows.filter(r => !r.platformUser).length;
    return { counts, leaders, noRole };
  }, [sysUsers, roleUsers, rows]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filterRole === 'none'  && r.platformUser) return false;
      if (filterRole !== 'all' && filterRole !== 'none' && r.platformUser?.role !== filterRole) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!r.email.toLowerCase().includes(q) && !r.fullName?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, filterRole]);

  const openAssign = (row: UserRow) => {
    setTarget(row);
    setSelPlatform(row.platformUser?.role ?? 'talento_humano');
    setSelTeamRole(row.userRole ?? 'colaborador');
    setNoPlatform(!row.platformUser);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!target) return;
    setSaving(true);
    try {
      const hadAccess     = !!target.platformUser;
      const prevRole      = target.platformUser?.role;

      // 1. Platform role — siempre upsert por email (idempotente)
      if (noPlatform) {
        if (target.platformUser) await rolesService.delete(target.email);
      } else {
        await rolesService.upsert(
          target.email.toLowerCase().trim(),
          target.fullName,
          selPlatform,
        );
      }

      // 2. Team/HR role — solo si tiene entrada en `users`
      if (target.userId) {
        await userService.update(target.userId, { role: selTeamRole });
      }

      // 3. Enviar correo de bienvenida/actualización si se otorgó o cambió acceso
      if (!noPlatform) {
        const isNew = !hadAccess || prevRole !== selPlatform;
        sendAccessEmail(target.email, target.fullName, selPlatform, !hadAccess)
          .catch(err => toast.error('Correo no enviado', { description: err?.message ?? String(err) }));
        toast.success(`Actualizado: ${target.fullName || target.email}`, {
          description: isNew
            ? `Correo de ${hadAccess ? 'actualización' : 'bienvenida'} enviado a ${target.email}`
            : undefined,
        });
      } else {
        toast.success(`Actualizado: ${target.fullName || target.email}`);
      }

      setDialogOpen(false);
      await load();
    } catch (e: any) {
      toast.error('Error al guardar', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleResendEmail = async (row: UserRow) => {
    if (!row.platformUser) return;
    try {
      await sendAccessEmail(row.email, row.fullName, row.platformUser.role, false);
      toast.success('Correo enviado', { description: `Bienvenida reenviada a ${row.email}` });
    } catch (e: any) {
      toast.error('Error al enviar correo', { description: e.message });
    }
  };

  const emailTargets = useMemo(() =>
    rows.filter(r => r.platformUser && (emailTargetRole === 'all' || r.platformUser.role === emailTargetRole)),
    [rows, emailTargetRole]
  );

  const handleSendBulk = async () => {
    if (emailTargets.length === 0) return;
    setSendingBulk(true);
    let sent = 0;
    let failed = 0;
    await Promise.all(
      emailTargets.map(row =>
        sendAccessEmail(row.email, row.fullName, row.platformUser!.role, false)
          .then(() => { sent++; })
          .catch(() => { failed++; })
      )
    );
    setSendingBulk(false);
    setEmailDialogOpen(false);
    if (sent > 0) toast.success(`${sent} correo${sent > 1 ? 's' : ''} enviado${sent > 1 ? 's' : ''}`);
    if (failed > 0) toast.error(`${failed} correo${failed > 1 ? 's' : ''} fallaron`);
  };

  const handleRemovePlatform = async (row: UserRow) => {
    if (!row.platformUser) return;
    if (!confirm(`¿Quitar acceso de plataforma a ${row.fullName || row.email}?`)) return;
    try {
      await rolesService.delete(row.email);
      toast.success('Acceso de plataforma eliminado');
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
            Asigna rol de plataforma y cargo de equipo · {rows.length} usuarios
          </p>
        </div>
        <Button
          onClick={() => { setEmailTargetRole('all'); setEmailDialogOpen(true); }}
          className="bg-[#008C3C] hover:bg-[#006C2F] text-white flex items-center gap-2"
        >
          <Mail className="w-4 h-4" />
          Enviar correo
        </Button>
      </div>

      {/* Stat cards — platform roles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        {(Object.entries(ROLE_LABELS) as [AppRole, string][]).map(([role, label]) => {
          const Icon = ROLE_ICON[role];
          return (
            <button
              key={role}
              onClick={() => setFilterRole(filterRole === role ? 'all' : role)}
              className={`rounded-xl border shadow-sm p-4 text-left transition-all hover:shadow-md
                ${filterRole === role ? CARD_ACTIVE[role] : 'bg-white border-gray-100'}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${ICON_BG[role]}`}>
                  <Icon className={`w-3.5 h-3.5 ${ICON_COLOR[role]}`} />
                </div>
                <span className="text-xs font-semibold text-[#4A4A4A]">{label}</span>
              </div>
              <p className={`text-2xl font-bold ${STAT_NUMBER[role]}`}>{stats.counts[role]}</p>
            </button>
          );
        })}
      </div>

      {/* Secondary stat row */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {/* Líderes */}
        <div className="rounded-xl border border-amber-100 bg-amber-50 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
              <Crown className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <span className="text-xs font-semibold text-[#4A4A4A]">Líderes de equipo</span>
          </div>
          <p className="text-2xl font-bold text-amber-600">{stats.leaders}</p>
        </div>

        {/* Sin acceso */}
        <button
          onClick={() => setFilterRole(filterRole === 'none' ? 'all' : 'none')}
          className={`rounded-xl border shadow-sm p-4 text-left transition-all hover:shadow-md
            ${filterRole === 'none' ? 'bg-gray-100 border-gray-300 ring-1 ring-gray-300' : 'bg-white border-gray-100'}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
              <UserX className="w-3.5 h-3.5 text-gray-400" />
            </div>
            <span className="text-xs font-semibold text-gray-500">Sin acceso plataforma</span>
          </div>
          <p className="text-2xl font-bold text-gray-400">{stats.noRole}</p>
        </button>
      </div>

      {/* Filters */}
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
            <span className="col-span-3">Colaborador</span>
            <span className="col-span-3">Email</span>
            <span className="col-span-3">Rol plataforma</span>
            <span className="col-span-2">Cargo equipo</span>
            <span className="col-span-1"></span>
          </div>

          <div className="divide-y divide-gray-50">
            {filtered.map(row => {
              const hasRole   = !!row.platformUser;
              const pRole     = row.platformUser?.role;
              const Icon      = pRole ? ROLE_ICON[pRole] : null;
              const initial   = row.fullName?.charAt(0)?.toUpperCase() || row.email.charAt(0).toUpperCase();
              const isLider   = row.userRole === 'lider';

              return (
                <div
                  key={row.userId}
                  className="grid grid-cols-12 px-5 py-3.5 items-center hover:bg-gray-50/60 transition-colors group cursor-pointer"
                  onClick={() => openAssign(row)}
                >
                  {/* Name */}
                  <div className="col-span-3 flex items-center gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold
                      ${hasRole && pRole ? AVATAR_COLORS[pRole] : 'bg-gray-100 text-gray-400'}`}>
                      {initial}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#4A4A4A] truncate">{row.fullName || '—'}</p>
                      {isLider && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-600 font-semibold">
                          <Crown className="w-2.5 h-2.5" /> Líder
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Email */}
                  <div className="col-span-3 min-w-0 pr-2">
                    <span className="text-xs text-gray-500 truncate block">{row.email}</span>
                  </div>

                  {/* Platform role badge */}
                  <div className="col-span-3">
                    {hasRole && pRole ? (
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${ROLE_COLORS[pRole]}`}>
                        {Icon && <Icon className="w-3 h-3" />}
                        {ROLE_LABELS[pRole]}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-gray-400 px-2.5 py-1 rounded-full border border-dashed border-gray-200">
                        <UserX className="w-3 h-3" /> Sin acceso
                      </span>
                    )}
                  </div>

                  {/* Team role badge */}
                  <div className="col-span-2">
                    {isLider ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        <Crown className="w-3 h-3" /> Líder
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400 px-2 py-0.5 rounded-full bg-gray-50 border border-gray-200">
                        <Users className="w-3 h-3" />
                        {row.userRole === 'colaborador' ? 'Colaborador'
                          : row.userRole === 'aspirante' ? 'Aspirante'
                          : row.userRole === 'excolaborador' ? 'Excolaborador'
                          : row.userRole}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="col-span-1 flex items-center justify-end gap-1">
                    <button
                      onClick={e => { e.stopPropagation(); openAssign(row); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#008C3C] hover:bg-[#008C3C]/10 transition-colors"
                      title="Editar"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {hasRole && (
                      <button
                        onClick={e => { e.stopPropagation(); handleResendEmail(row); }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Reenviar correo de bienvenida"
                      >
                        <Mail className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {hasRole && (
                      <button
                        onClick={e => { e.stopPropagation(); handleRemovePlatform(row); }}
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

      {/* ── Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#008C3C]" />
              Editar usuario
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
                  <p className="text-sm font-semibold text-[#4A4A4A] truncate">{target.fullName || '—'}</p>
                  <p className="text-xs text-gray-400 truncate">{target.email}</p>
                </div>
              </div>

              {/* ── Cargo de equipo ── */}
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500 flex items-center gap-1">
                  <Crown className="w-3 h-3 text-amber-500" /> Cargo en el equipo
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {(['colaborador', 'lider'] as UserRole[]).map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setSelTeamRole(r)}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all
                        ${selTeamRole === r
                          ? r === 'lider'
                            ? 'bg-amber-50 border-amber-400 text-amber-700'
                            : 'bg-blue-50 border-blue-400 text-blue-700'
                          : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'}`}
                    >
                      {r === 'lider' ? <Crown className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
                      {r === 'lider' ? 'Líder' : 'Colaborador'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3" />

              {/* ── Acceso a plataforma ── */}
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500 flex items-center gap-1">
                  <Shield className="w-3 h-3 text-[#008C3C]" /> Acceso a la plataforma
                </Label>

                {/* Toggle sin acceso */}
                <button
                  type="button"
                  onClick={() => setNoPlatform(p => !p)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-all
                    ${noPlatform
                      ? 'bg-red-50 border-red-200 text-red-600'
                      : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                >
                  <span className="font-medium">{noPlatform ? 'Sin acceso a la plataforma' : 'Tiene acceso a la plataforma'}</span>
                  <span className={`w-8 h-4 rounded-full flex items-center transition-colors ${noPlatform ? 'bg-red-300' : 'bg-green-400'}`}>
                    <span className={`w-3 h-3 rounded-full bg-white shadow transition-transform mx-0.5 ${noPlatform ? '' : 'translate-x-4'}`} />
                  </span>
                </button>

                {/* Platform role selector */}
                {!noPlatform && (
                  <>
                    <Select value={selPlatform} onValueChange={v => setSelPlatform(v as AppRole)}>
                      <SelectTrigger className="mt-1">
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

                    {/* Access preview */}
                    <div className="bg-gray-50 rounded-lg p-3 mt-1">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                        Verá en la app:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {(ROLE_MODULES[selPlatform][0] === '*'
                          ? Object.values(MODULE_LABELS)
                          : ROLE_MODULES[selPlatform].map(m => MODULE_LABELS[m] ?? m)
                        ).map(m => (
                          <span key={m} className="inline-flex items-center gap-1 text-[10px] bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-md">
                            <Check className="w-2.5 h-2.5 text-green-500" /> {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                )}
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

      {/* ── Bulk email dialog ── */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#008C3C]" />
              Enviar correo de bienvenida
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <p className="text-sm text-gray-500">
              Envía la plantilla de acceso a la plataforma a los usuarios seleccionados.
            </p>

            {/* Role filter */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 flex items-center gap-1">
                <Shield className="w-3 h-3" /> Enviar a
              </Label>
              <Select value={emailTargetRole} onValueChange={v => setEmailTargetRole(v as AppRole | 'all')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los roles con acceso</SelectItem>
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

            {/* Recipients preview */}
            <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 max-h-48 overflow-y-auto">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                {emailTargets.length} destinatario{emailTargets.length !== 1 ? 's' : ''}
              </p>
              {emailTargets.length === 0 ? (
                <p className="text-xs text-gray-400">Sin destinatarios para este filtro</p>
              ) : (
                <div className="space-y-1.5">
                  {emailTargets.map(r => (
                    <div key={r.email} className="flex items-center gap-2">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0
                        ${r.platformUser ? AVATAR_COLORS[r.platformUser.role] : 'bg-gray-100 text-gray-400'}`}>
                        {(r.fullName || r.email).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[#4A4A4A] truncate">{r.fullName || r.email}</p>
                        <p className="text-[10px] text-gray-400 truncate">{r.email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setEmailDialogOpen(false)}>
                <X className="w-4 h-4 mr-1" /> Cancelar
              </Button>
              <Button
                onClick={handleSendBulk}
                disabled={sendingBulk || emailTargets.length === 0}
                className="flex-1 bg-[#008C3C] hover:bg-[#006C2F] text-white"
              >
                {sendingBulk
                  ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  : <Mail className="w-4 h-4 mr-1" />}
                Enviar {emailTargets.length > 0 ? `(${emailTargets.length})` : ''}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
