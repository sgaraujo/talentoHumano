import { Suspense } from 'react';
import { Sidebar } from './Sidebar';
import { PageLoader } from './PageLoader';

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout = ({ children }: MainLayoutProps) => {
  return (
    // h-dvh: en celular h-screen queda más alto que la pantalla visible por la barra del navegador.
    <div className="flex flex-col lg:flex-row h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden bg-gray-50">
        {/* La página se descarga dentro del layout: el menú sigue visible mientras carga. */}
        <Suspense fallback={<PageLoader />}>
          {children}
        </Suspense>
      </main>
      <p className="hidden lg:block fixed bottom-2 right-3 z-40 text-[10px] text-gray-400 pointer-events-none select-none">
        By Santiago García · Transformación Digital
      </p>
    </div>
  );
};
