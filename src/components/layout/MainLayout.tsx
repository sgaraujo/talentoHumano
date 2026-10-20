import { Suspense } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { PageLoader } from './PageLoader';
import { useAppRole } from '@/hooks/useAppRole';
import { getRoleHome } from '@/models/types/AppRole';

interface MainLayoutProps {
  children: React.ReactNode;
}

/** Se muestra cuando el rol no tiene el módulo de la URL (p. ej. escrita a mano). */
const AccessDenied = ({ home }: { home: string }) => (
  <div className="flex flex-col items-center justify-center text-center min-h-full p-6">
    <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
      <ShieldOff className="w-7 h-7 text-red-500" />
    </div>
    <h1 className="text-xl font-bold text-[#4A4A4A]">No tienes acceso a esta sección</h1>
    <p className="text-sm text-gray-500 mt-1 max-w-sm">
      Tu rol no incluye este módulo. Si crees que es un error, contacta a un administrador.
    </p>
    <Link
      to={home}
      replace
      className="mt-5 inline-flex items-center px-4 py-2 rounded-lg bg-[#008C3C] hover:bg-[#006C2F] text-white text-sm font-medium transition-colors"
    >
      Volver a mi panel
    </Link>
  </div>
);

export const MainLayout = ({ children }: MainLayoutProps) => {
  const { role, loading, canAccess } = useAppRole();
  const { pathname } = useLocation();
  // Mismo criterio que el menú lateral: lo que no aparece en el menú no se abre por URL.
  const allowed = canAccess(pathname);

  return (
    // h-dvh: en celular h-screen queda más alto que la pantalla visible por la barra del navegador.
    <div className="flex flex-col lg:flex-row h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden bg-gray-50">
        {loading ? <PageLoader /> : !allowed ? <AccessDenied home={getRoleHome(role)} /> : (
          /* La página se descarga dentro del layout: el menú sigue visible mientras carga. */
          <Suspense fallback={<PageLoader />}>
            {children}
          </Suspense>
        )}
      </main>
      <p className="hidden lg:block fixed bottom-2 right-3 z-40 text-[10px] text-gray-400 pointer-events-none select-none">
        By Santiago García · Transformación Digital
      </p>
    </div>
  );
};
