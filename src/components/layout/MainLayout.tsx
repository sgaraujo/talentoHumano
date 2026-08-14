import { Sidebar } from './Sidebar';

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout = ({ children }: MainLayoutProps) => {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        {children}
      </main>
      <p className="fixed bottom-2 right-3 z-40 text-[10px] text-gray-400 pointer-events-none select-none">
        By Santiago García · Transformación Digital
      </p>
    </div>
  );
};