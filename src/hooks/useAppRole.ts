import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebase';
import { rolesService } from '../services/rolesService';
import type { AppRole } from '../models/types/AppRole';
import { ROLE_MODULES, ROLE_EXCLUDED_MODULES } from '../models/types/AppRole';

interface AppRoleState {
  role: AppRole | null;
  loading: boolean;
  canAccess: (path: string) => boolean;
}

// Estado compartido: antes cada componente que usaba el hook (rutas, menú,
// páginas) hacía su propia consulta a Firestore, y en cadena al navegar, lo que
// hacía muy lenta la apertura en celular. Ahora hay una sola consulta por sesión.
const STORAGE_KEY = 'app_role';
let current: { role: AppRole | null; loading: boolean } = { role: null, loading: true };
let resolvedEmail: string | null | undefined; // undefined = auth aún no responde
const listeners = new Set<(state: typeof current) => void>();

const publish = (next: typeof current) => {
  current = next;
  listeners.forEach(listener => listener(current));
};

const readCached = (email: string): AppRole | null => {
  try {
    const cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return cached?.email === email ? cached.role : null;
  } catch { return null; }
};

const writeCached = (email: string, role: AppRole) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ email, role })); } catch { /* sin almacenamiento */ }
};

onAuthStateChanged(auth, async user => {
  const email = user?.email ?? null;
  if (email === resolvedEmail) return;
  resolvedEmail = email;
  if (!email) { publish({ role: null, loading: false }); return; }

  // El último rol conocido permite mostrar la app de inmediato; se revalida abajo.
  const cached = readCached(email);
  if (cached) publish({ role: cached, loading: false });
  else publish({ role: null, loading: true });

  let role: AppRole;
  try {
    const platformUser = await rolesService.getByEmail(email);
    role = platformUser?.role ?? 'admin'; // fallback: admin si no tiene registro
  } catch {
    role = 'admin'; // si hay error de permisos, asume admin para no bloquear
  }
  if (resolvedEmail !== email) return; // cambió la sesión mientras se consultaba
  writeCached(email, role);
  publish({ role, loading: false });
});

export const useAppRole = (): AppRoleState => {
  const [state, setState] = useState(current);

  useEffect(() => {
    listeners.add(setState);
    setState(current);
    return () => { listeners.delete(setState); };
  }, []);

  const canAccess = (path: string): boolean => {
    if (!state.role) return false;
    const modules = ROLE_MODULES[state.role];
    if (modules.includes('*')) return true;
    if (ROLE_EXCLUDED_MODULES[state.role]?.some(m => path.startsWith(m))) return false;
    return modules.some(m => path.startsWith(m));
  };

  return { role: state.role, loading: state.loading, canAccess };
};
