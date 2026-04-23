import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebase';
import { rolesService } from '../services/rolesService';
import type { AppRole } from '../models/types/AppRole';
import { ROLE_MODULES } from '../models/types/AppRole';

interface AppRoleState {
  role: AppRole | null;
  loading: boolean;
  canAccess: (path: string) => boolean;
}

export const useAppRole = (): AppRoleState => {
  const [role, setRole]     = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      if (!user?.email) { setRole(null); setLoading(false); return; }
      try {
        const platformUser = await rolesService.getByEmail(user.email);
        setRole(platformUser?.role ?? 'admin'); // fallback: admin si no tiene registro
      } catch {
        setRole('admin'); // si hay error de permisos, asume admin para no bloquear
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const canAccess = (path: string): boolean => {
    if (!role) return false;
    const modules = ROLE_MODULES[role];
    if (modules.includes('*')) return true;
    return modules.some(m => path.startsWith(m));
  };

  return { role, loading, canAccess };
};
