import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Users,
  FileText,
  TrendingUp,
  Bell,
  Download,
  Archive,
  Settings,
  BookOpen,
  LogOut,
  Bot,
  Search,
  Menu,
  X,
  ChevronLeft
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';

export const Sidebar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Close mobile sidebar on desktop resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setIsOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const menuItems = [
    { icon: Users, label: 'Usuarios', path: '/usuarios' },
    { icon: FileText, label: 'Cuestionarios', path: '/questionarios' },
    { icon: Bell, label: 'Notificaciones', path: '/notificaciones' },
    { icon: TrendingUp, label: 'Rotacion y Talento', path: '/rotacion-talento' },
    { icon: Bot, label: 'Chat IA', path: '/chatbot' },
    { icon: Search, label: 'Busqueda', path: '/busqueda' },
  ];

  const bottomItems = [
    { icon: Download, label: 'Exportador', path: '/exportador' },
    { icon: Archive, label: 'Archivo', path: '/archivo' },
    { icon: Settings, label: 'Configuraciones', path: '/configuraciones' },
    { icon: BookOpen, label: 'Manual de usuario', path: '/manual' },
  ];

  const getInitials = (email: string) => email.charAt(0).toUpperCase();
  const isActive = (path: string) => location.pathname === path;

  const NavItem = ({
    item,
    collapsed,
  }: {
    item: (typeof menuItems)[0];
    collapsed: boolean;
  }) => {
    const Icon = item.icon;
    const active = isActive(item.path);
    return (
      <Link
        to={item.path}
        title={collapsed ? item.label : undefined}
        className={[
          'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative',
          active
            ? 'bg-white/20 text-white shadow-md border border-white/25'
            : 'text-green-100 hover:bg-white/10 hover:text-white',
          collapsed ? 'justify-center' : '',
        ].join(' ')}
      >
        {/* Active left bar */}
        {active && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#7BCB6A] rounded-r-full" />
        )}

        <Icon
          className={[
            'w-5 h-5 flex-shrink-0 transition-colors',
            active
              ? 'text-[#7BCB6A]'
              : 'text-green-200 group-hover:text-[#7BCB6A]',
          ].join(' ')}
        />

        {!collapsed && (
          <span className="text-sm font-medium truncate">{item.label}</span>
        )}

        {/* Tooltip shown when collapsed on desktop */}
        {collapsed && (
          <span className="absolute left-full ml-3 px-2.5 py-1 bg-[#4A4A4A] text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-lg transition-opacity duration-150">
            {item.label}
          </span>
        )}
      </Link>
    );
  };

  // Inline SVG logo that matches Inteegrados branding
  const InteegradosLogo = ({ size = 40 }: { size?: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="iHex" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1F8FBF" />
          <stop offset="50%" stopColor="#008C3C" />
          <stop offset="100%" stopColor="#7BCB6A" />
        </linearGradient>
        <linearGradient id="iBlue" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1F8FBF" />
          <stop offset="100%" stopColor="#5BB3D9" />
        </linearGradient>
        <linearGradient id="iGreen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#008C3C" />
          <stop offset="100%" stopColor="#7BCB6A" />
        </linearGradient>
      </defs>
      {/* Hexagon shield */}
      <path
        d="M50 4 L91 27 L91 73 L50 96 L9 73 L9 27 Z"
        fill="url(#iHex)"
        opacity="0.92"
      />
      {/* Blue leaf (left) */}
      <path
        d="M27 70 Q10 46 25 24 Q41 52 27 70Z"
        fill="url(#iBlue)"
        opacity="0.95"
      />
      {/* Green leaf (right) */}
      <path
        d="M73 70 Q90 46 75 24 Q59 52 73 70Z"
        fill="url(#iGreen)"
        opacity="0.95"
      />
      {/* Three people circles */}
      <circle cx="33" cy="30" r="7.5" fill="white" opacity="0.9" />
      <circle cx="50" cy="23" r="9" fill="white" />
      <circle cx="67" cy="30" r="7.5" fill="white" opacity="0.9" />
    </svg>
  );

  const SidebarContent = ({ collapsed = false }: { collapsed?: boolean }) => (
    <div className="h-screen flex flex-col bg-gradient-to-b from-[#006330] via-[#008C3C] to-[#005528] shadow-2xl">
      {/* Logo + Brand */}
      <div
        className={[
          'flex items-center border-b border-white/10 transition-all duration-300',
          collapsed ? 'justify-center p-4' : 'gap-3 px-5 py-4',
        ].join(' ')}
      >
        <div className="flex-shrink-0">
          <InteegradosLogo size={collapsed ? 36 : 44} />
        </div>
        {!collapsed && (
          <div>
            <h1 className="text-sm font-bold text-white tracking-widest uppercase leading-none">
              Inte
              <span className="text-[#7BCB6A] font-extrabold">e</span>
              grados
            </h1>
            <p className="text-green-300/80 text-xs mt-1 font-medium">
              Gestion de Talento
            </p>
          </div>
        )}
      </div>

      {/* Menu */}
      <ScrollArea className="flex-1 px-2 py-4">
        <nav aria-label="Menu principal">
          <div className="space-y-0.5">
            {menuItems.map((item) => (
              <NavItem key={item.path} item={item} collapsed={collapsed} />
            ))}
          </div>
        </nav>

        <div className="my-4 border-t border-white/10 mx-1" />

        <nav aria-label="Menu secundario">
          <div className="space-y-0.5">
            {bottomItems.map((item) => (
              <NavItem key={item.path} item={item} collapsed={collapsed} />
            ))}
          </div>
        </nav>
      </ScrollArea>

      {/* User profile footer */}
      <div className="border-t border-white/10" />
      <div
        className={[
          'p-3 bg-black/20',
          collapsed ? 'flex justify-center' : '',
        ].join(' ')}
      >
        <div
          className={[
            'flex items-center gap-3',
            collapsed ? 'flex-col gap-2' : '',
          ].join(' ')}
        >
          <Avatar className="border-2 border-[#7BCB6A]/60 flex-shrink-0 w-9 h-9">
            <AvatarFallback className="bg-gradient-to-br from-[#7BCB6A] to-[#008C3C] text-white font-bold text-sm">
              {user?.email && getInitials(user.email)}
            </AvatarFallback>
          </Avatar>

          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate text-white">
                {user?.email?.split('@')[0] || 'Usuario'}
              </p>
              <p className="text-green-300/70 text-xs truncate">{user?.email}</p>
            </div>
          )}

          <button
            onClick={logout}
            className="p-2 text-green-300 hover:bg-red-500/20 hover:text-red-400 rounded-lg transition-colors flex-shrink-0"
            title="Cerrar sesion"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* ── MOBILE hamburger ── */}
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2.5 bg-[#008C3C] text-white rounded-xl shadow-lg border border-[#7BCB6A]/40 hover:bg-[#006C2F] transition-colors"
        aria-label="Abrir menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* ── MOBILE backdrop ── */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* ── MOBILE drawer ── */}
      <div
        className={[
          'lg:hidden fixed top-0 left-0 h-full w-64 z-50 transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="relative h-full">
          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-4 right-3 z-10 p-1.5 text-green-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Cerrar menu"
          >
            <X className="w-4 h-4" />
          </button>
          <SidebarContent collapsed={false} />
        </div>
      </div>

      {/* ── DESKTOP sidebar (collapsible) ── */}
      <div
        className={[
          'hidden lg:block relative flex-shrink-0 transition-all duration-300 ease-in-out',
          isDesktopCollapsed ? 'w-[68px]' : 'w-64',
        ].join(' ')}
      >
        <SidebarContent collapsed={isDesktopCollapsed} />

        {/* Collapse toggle pill */}
        <button
          onClick={() => setIsDesktopCollapsed(!isDesktopCollapsed)}
          className="absolute -right-3 top-20 z-10 w-6 h-6 bg-[#008C3C] border-2 border-[#7BCB6A]/70 text-[#7BCB6A] rounded-full flex items-center justify-center shadow-lg hover:bg-[#7BCB6A] hover:border-[#7BCB6A] hover:text-white transition-all duration-200"
          aria-label={isDesktopCollapsed ? 'Expandir menu' : 'Colapsar menu'}
        >
          <ChevronLeft
            className={[
              'w-3 h-3 transition-transform duration-300',
              isDesktopCollapsed ? 'rotate-180' : '',
            ].join(' ')}
          />
        </button>
      </div>
    </>
  );
};