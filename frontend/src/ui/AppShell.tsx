import type { ComponentType, PropsWithChildren } from 'react';
import {
  Bell,
  Building2,
  CalendarDays,
  ClipboardCheck,
  Clock,
  FileSearch,
  Home,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Search,
  Stethoscope,
  User as UserIcon,
  Users,
  ShieldAlert,
} from 'lucide-react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { homeFor, useAuth } from '../lib/auth';
import type { UserRole } from '../lib/types';
import { FontSizeButton } from './FontSizeButton';
import { Logo } from './kit';

type NavItem = { to: string; label: string; icon: ComponentType<{ className?: string }>; end?: boolean };

const NAV: Record<UserRole, NavItem[]> = {
  PATIENT: [
    { to: '/inicio', label: 'Início', icon: Home },
    { to: '/buscar', label: 'Buscar', icon: Search },
    { to: '/agenda', label: 'Agenda', icon: CalendarDays },
    { to: '/campanhas', label: 'Campanhas', icon: Megaphone },
    { to: '/perfil', label: 'Perfil', icon: UserIcon },
  ],
  PROFESSIONAL: [
    { to: '/medico', label: 'Painel', icon: LayoutDashboard, end: true },
    { to: '/medico/horarios', label: 'Horários', icon: Clock },
    { to: '/medico/servicos', label: 'Serviços', icon: Stethoscope },
    { to: '/medico/cadastro', label: 'Cadastro', icon: ClipboardCheck },
    { to: '/perfil', label: 'Conta', icon: UserIcon },
  ],
  ADMIN: [
    { to: '/admin', label: 'Visão geral', icon: LayoutDashboard, end: true },
    { to: '/admin/medicos', label: 'Médicos', icon: ClipboardCheck },
    { to: '/admin/clinicas', label: 'Clínicas', icon: Building2 },
    { to: '/admin/usuarios', label: 'Usuários', icon: Users },
    { to: '/admin/alertas', label: 'Alertas', icon: ShieldAlert },
    { to: '/admin/campanhas', label: 'Campanhas', icon: Megaphone },
    { to: '/admin/auditoria', label: 'Auditoria', icon: FileSearch },
  ],
};

export function AppShell({ children }: PropsWithChildren) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const items = user ? NAV[user.role] : [];

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-dvh">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-papel focus:p-2">
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-30 border-b-2 border-line bg-papel">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Link to={homeFor(user?.role)} aria-label="LifeHub, início" className="shrink-0">
            <Logo className="logo-full h-9 w-auto" />
            {/* Celular com letra grande: só o símbolo, para caber o menu. */}
            <img src="/assets/lifehub-mark.svg" alt="" className="logo-mark h-10 w-auto" />
          </Link>
          <nav aria-label="Principal" className="ml-4 hidden gap-1 md:flex">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex min-h-11 items-center gap-2 whitespace-nowrap border-b-[3px] px-2.5 font-bold ${isActive ? 'border-azul text-ink' : 'border-transparent text-muted hover:text-ink'}`
                }
                title={item.label}
              >
                <item.icon className="size-4" />
                {/* Menu do admin é longo: em telas médias mostra só o ícone. */}
                {/* Quando falta espaço o nome some da tela, mas continua para o leitor de tela. */}
                <span className={`nav-label ${items.length > 6 ? 'max-xl:sr-only' : ''}`}>{item.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <FontSizeButton />
            {user?.role === 'PATIENT' && (
              <NavLink to="/notificacoes" className="btn btn-ghost px-3" aria-label="Notificações">
                <Bell className="size-5" />
              </NavLink>
            )}
            <button type="button" className="btn btn-ghost px-3" onClick={() => void handleSignOut()}>
              <LogOut className="size-5" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      <main id="conteudo" className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:pb-12">
        {/* Muda a chave a cada tela: o conteúdo entra suave, o menu fica parado. */}
        <div key={location.pathname} className="page-enter">
          {children}
        </div>
      </main>

      <nav
        aria-label="Navegação inferior"
        className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-line bg-papel pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 5)}, minmax(0, 1fr))` }}>
          {items.slice(0, 5).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex min-h-16 flex-col items-center justify-center gap-0.5 border-t-[3px] text-sm font-bold ${isActive ? 'border-azul text-ink' : 'border-transparent text-muted'}`
              }
            >
              <item.icon className="size-5" />
              {/* Barra de baixo do celular: o nome tem teto de tamanho para os 5 itens caberem
                  mesmo com a letra aumentada (o ícone também cresce). */}
              <span className="max-w-full truncate px-0.5 text-[min(0.875rem,14px)]">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
