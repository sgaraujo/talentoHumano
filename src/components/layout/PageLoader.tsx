import { Loader2 } from 'lucide-react';

/** Indicador mientras se descarga una página (React.lazy) o se resuelve la sesión. */
export const PageLoader = ({ fullScreen = false }: { fullScreen?: boolean }) => (
  <div className={`${fullScreen ? 'min-h-dvh' : 'h-full min-h-[50vh]'} flex items-center justify-center`}>
    <Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" aria-label="Cargando" />
  </div>
);
