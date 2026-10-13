// El contenido del manual vive en public/manual.html (HTML autocontenido con su
// propio índice y buscador); aquí solo se incrusta dentro del layout.
export const ManualPage = () => (
  <iframe
    src="/manual.html"
    title="Manual de usuario"
    className="block w-full h-full border-0 bg-[#F7F9F6]"
  />
);
