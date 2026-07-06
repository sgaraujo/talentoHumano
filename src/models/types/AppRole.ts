/** Roles de plataforma — controlan qué módulos ve cada usuario en el back-office */
export type AppRole = 'admin' | 'talento_humano' | 'contabilidad' | 'financiera';

export interface PlatformUser {
  id: string;       // doc ID = email normalizado
  email: string;
  name: string;
  role: AppRole;
  createdAt?: Date;
  updatedAt?: Date;
}

export const ROLE_LABELS: Record<AppRole, string> = {
  admin:          'Administrador',
  talento_humano: 'Talento Humano',
  contabilidad:   'Contabilidad',
  financiera:     'Financiera',
};

export const ROLE_COLORS: Record<AppRole, string> = {
  admin:          'bg-purple-100 text-purple-700 border-purple-200',
  talento_humano: 'bg-green-100 text-green-700 border-green-200',
  contabilidad:   'bg-blue-100 text-blue-700 border-blue-200',
  financiera:     'bg-emerald-100 text-emerald-700 border-emerald-200',
};

/** Módulos que puede ver cada rol */
export const ROLE_MODULES: Record<AppRole, string[]> = {
  admin: ['*'],   // todos
  talento_humano: [
    '/dashboard', '/usuarios', '/empresas', '/proyectos',
    '/comunicaciones', '/boletines', '/whatsapp', '/notificaciones', '/rotacion-talento',
    '/chatbot', '/busqueda', '/exportador', '/questionarios',
    '/archivo', '/configuraciones', '/manual',
  ],
  contabilidad: [
    '/contabilidad',
    '/contabilidad/mensajes',
  ],
  financiera: [
    '/contabilidad',
  ],
};
