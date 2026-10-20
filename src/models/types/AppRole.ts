/** Roles de plataforma — controlan qué módulos ve cada usuario en el back-office */
export type AppRole = 'admin' | 'talento_humano' | 'contabilidad' | 'financiera' | 'revisor_fiscal';

export interface PlatformUser {
  id: string;       // doc ID = email normalizado
  email: string;
  name: string;
  role: AppRole;
  /** Empresas visibles para roles acotados (revisor_fiscal). Vacío = ninguna. */
  companyIds?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export const ROLE_LABELS: Record<AppRole, string> = {
  admin:          'Administrador',
  talento_humano: 'Talento Humano',
  contabilidad:   'Contabilidad',
  financiera:     'Financiera',
  revisor_fiscal: 'Revisor Fiscal',
};

export const ROLE_COLORS: Record<AppRole, string> = {
  admin:          'bg-purple-100 text-purple-700 border-purple-200',
  talento_humano: 'bg-green-100 text-green-700 border-green-200',
  contabilidad:   'bg-blue-100 text-blue-700 border-blue-200',
  financiera:     'bg-emerald-100 text-emerald-700 border-emerald-200',
  revisor_fiscal: 'bg-amber-100 text-amber-700 border-amber-200',
};

/** Módulos que puede ver cada rol */
export const ROLE_MODULES: Record<AppRole, string[]> = {
  admin: ['*'],   // todos
  talento_humano: [
    '/dashboard', '/talento-humano/control', '/offboarding', '/empresas', '/proyectos',
    '/comunicaciones', '/envios-programados', '/boletines', '/whatsapp', '/estadisticas-whatsapp', '/estadisticas-campanas-correo', '/notificaciones', '/rotacion-talento',
    '/exportador', '/questionarios',
    '/archivo', '/configuraciones', '/manual',
  ],
  contabilidad: [
    '/contabilidad',
    '/contabilidad/mensajes',
    '/configuraciones/empresas',
    '/manual',
  ],
  financiera: [
    '/contabilidad',
    '/manual',
  ],
  // Solo lectura del calendario e informe tributario de sus empresas asignadas.
  revisor_fiscal: [
    '/contabilidad',
    '/contabilidad/informe',
    '/manual',
  ],
};

/** Rutas que un rol no ve aunque un prefijo de ROLE_MODULES las incluya. */
export const ROLE_EXCLUDED_MODULES: Partial<Record<AppRole, string[]>> = {
  revisor_fiscal: ['/contabilidad/mensajes'],
};

/** Roles cuyo home es el calendario tributario en lugar del dashboard. */
export const ACCOUNTING_HOME_ROLES: AppRole[] = ['contabilidad', 'financiera', 'revisor_fiscal'];

/**
 * Roles de personas externas (no colaboradores): solo consultan. No cuentan como
 * personal de ninguna empresa ni aparecen como destinatarios de envíos.
 * Mantener sincronizado con EXTERNAL_ROLES de functions/src/index.ts.
 */
export const EXTERNAL_ROLES: AppRole[] = ['revisor_fiscal'];

/** Panel de inicio de cada rol. */
export const getRoleHome = (role: AppRole | null): string =>
  role && ACCOUNTING_HOME_ROLES.includes(role) ? '/contabilidad' : '/dashboard';
