import { useAppRole } from '@/hooks/useAppRole';

// El contenido del manual vive en public/manual.html (HTML autocontenido con su
// propio índice y buscador); aquí solo se incrusta dentro del layout. El rol va
// en la URL para que el manual muestre solo los módulos de ese rol.
export const ManualPage = () => {
  const { role } = useAppRole();
  return (
    <iframe
      src={`/manual.html${role ? `?rol=${role}` : ''}`}
      title="Manual de usuario"
      className="block w-full h-full border-0 bg-[#F7F9F6]"
    />
  );
};
