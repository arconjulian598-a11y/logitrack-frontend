import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, LogOut, Menu, Monitor, Moon, Sun, UserRound, X } from 'lucide-react';
import { Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { LoadingState } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown';
import { sistemaDespertando, suscribirArranque } from '@/lib/api/arranque';
import { NOMBRE_ROL, puede } from '@/lib/auth/permisos';
import { Tooltip } from '@/components/ui/misc';
import { useEstadoSistema } from '@/hooks/queries';
import { useTema } from '@/hooks/useTema';
import { cn } from '@/lib/utils';
import { useAuth, useRol, useUsuario } from './auth';
import { BuscadorGlobal } from './BuscadorGlobal';
import { moduloActivo, navegacionPara } from './nav';

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-1" aria-label="LogiTrack, inicio">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="7" fill="#fff" fillOpacity="0.08" />
        <path d="M7 21.5h3.2V10.5H7zM12.6 21.5h8.6v-2.7h-5.4v-8.3h-3.2z" fill="#fff" />
        <circle cx="24" cy="12" r="3" fill="#5b82ff" />
      </svg>
      <span className="font-cond text-[19px] font-bold tracking-wide text-white">LogiTrack</span>
    </Link>
  );
}

function Navegacion({ onNavegar }: { onNavegar?: () => void }) {
  const rol = useRol();
  const { pathname } = useLocation();
  const esAdmin = puede(rol, 'administrar');
  const estado = useEstadoSistema({ enabled: esAdmin });
  const servicios = esAdmin ? (estado.data?.servicios ?? {}) : {};
  const grupos = navegacionPara(rol);
  const todos = grupos.flatMap((g) => g.items.map((i) => i.to));
  return (
    <nav aria-label="Principal" className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-4">
      {grupos.map((g) => (
        <div key={g.grupo} className="mt-5 first:mt-3">
          <p className="px-2.5 pb-1.5 text-[11.5px] font-semibold text-sidebar-text/60">{g.grupo}</p>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const s = it.servicio ? servicios[it.servicio as keyof typeof servicios] : undefined;
              const caido = s && s.estado !== 'ok';
              return (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    end
                    onClick={onNavegar}
                    aria-current={moduloActivo(it.to, pathname, todos) ? 'page' : undefined}
                    className={cn(
                      'group flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium text-sidebar-text transition-colors hover:bg-sidebar-2 hover:text-white',
                      moduloActivo(it.to, pathname, todos) && 'bg-sidebar-2 text-white shadow-[inset_3px_0_0_var(--primary)]',
                    )}
                  >
                    <it.icono className="size-[17px] shrink-0 opacity-80" aria-hidden />
                    <span className="flex-1 truncate">{it.etiqueta}</span>
                    {caido && (
                      <span className="size-2 rounded-full bg-danger" title="Servicio sin respuesta" aria-label="Servicio sin respuesta" />
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SaludSistema() {
  const { data, isError } = useEstadoSistema();
  const lista = Object.values(data?.servicios ?? {});
  const ok = lista.filter((s) => s?.estado === 'ok').length;
  const total = lista.length || 9;
  const sinGateway = isError;
  const degradado = !sinGateway && data?.estado_general === 'degradado';
  const texto = sinGateway ? 'Gateway sin conexión' : data ? `${ok}/${total} servicios` : 'Comprobando…';
  return (
    <Tooltip contenido="Salud de los microservicios según GET /estado del gateway. Clic para ver el detalle.">
      <Link
        to="/sistema"
        className={cn(
          'inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-semibold',
          sinGateway || degradado ? 'border-danger/40 bg-danger-soft text-danger' : 'border-rule bg-surface text-text-2',
        )}
      >
        <span className="relative flex size-2">
          {!sinGateway && !degradado && data && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-40" />
          )}
          <span className={cn('relative inline-flex size-2 rounded-full', sinGateway || degradado ? 'bg-danger' : data ? 'bg-ok' : 'bg-text-3')} />
        </span>
        <span className="hidden sm:inline">{texto}</span>
      </Link>
    </Tooltip>
  );
}

function SelectorTema() {
  const { tema, cambiar } = useTema();
  const Icono = tema === 'oscuro' ? Moon : tema === 'claro' ? Sun : Monitor;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Cambiar tema">
          <Icono />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-36">
        <DropdownMenuItem onSelect={() => cambiar('claro')}>
          <Sun /> Claro
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => cambiar('oscuro')}>
          <Moon /> Oscuro
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => cambiar('sistema')}>
          <Monitor /> Según el sistema
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuUsuario() {
  const usuario = useUsuario();
  const { salir } = useAuth();
  const navigate = useNavigate();
  const iniciales = usuario.nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 px-1.5" aria-label={`Cuenta de ${usuario.nombre}`}>
          <span className="flex size-7 items-center justify-center rounded-full bg-primary-soft text-[11.5px] font-bold text-primary">
            {iniciales || <UserRound />}
          </span>
          <span className="hidden max-w-36 flex-col items-start leading-tight md:flex">
            <span className="max-w-36 truncate text-[12.5px] font-semibold text-text">{usuario.nombre}</span>
            <span className="text-[11px] font-medium text-text-3">{NOMBRE_ROL[usuario.rol]}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-52">
        <div className="px-2 py-1.5">
          <p className="truncate text-[13px] font-semibold text-text">{usuario.nombre}</p>
          <p className="truncate text-xs text-text-3">{usuario.email}</p>
        </div>
        <DropdownMenuItem onSelect={() => navigate('/cuenta')}>
          <UserRound /> Mi cuenta
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={salir}>
          <LogOut /> Cerrar sesión (entrar con otra cuenta)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Pie del menú lateral: quién entró y cómo salir (para entrar con otra cuenta u otro rol). */
function SalidaLateral() {
  const usuario = useUsuario();
  const { salir } = useAuth();
  return (
    <div className="border-t border-white/10 px-3 py-3">
      <p className="truncate px-2 text-[13px] font-semibold text-white">{usuario.nombre}</p>
      <p className="truncate px-2 text-[11.5px] text-sidebar-text/70">{NOMBRE_ROL[usuario.rol]}</p>
      <button
        type="button"
        onClick={salir}
        className="mt-2 flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium text-sidebar-text transition-colors hover:bg-sidebar-2 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <LogOut className="size-[17px]" aria-hidden /> Cerrar sesión
      </button>
    </div>
  );
}

/** Aviso mientras el backend desplegado despierta (los servicios se duermen tras 15 min sin uso). */
function AvisoArranque() {
  const despertando = useSyncExternalStore(suscribirArranque, sistemaDespertando, sistemaDespertando);
  if (!despertando) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 border-b border-warn/30 bg-warn-soft px-4 py-2 text-[13px] text-text">
      <Loader2 className="size-4 animate-spin text-warn" aria-hidden />
      El sistema se está iniciando; puede tardar cerca de un minuto. Reintentando…
    </div>
  );
}

export function AppLayout() {
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  const pantallaCompleta = pathname === '/mapa';
  const esAdmin = puede(useRol(), 'administrar');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex h-full">
      <a
        href="#contenido"
        className="sr-only z-[2000] rounded-md bg-primary px-3 py-2 text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Saltar al contenido
      </a>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-sidebar lg:flex">
        <div className="flex h-14 items-center px-4">
          <Logo />
        </div>
        <Navegacion />
        <SalidaLateral />
      </aside>

      <Dialog.Root open={menu} onOpenChange={setMenu}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[1300] bg-ink/50 lg:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-[1300] flex w-72 flex-col bg-sidebar focus-visible:outline-none lg:hidden">
            <Dialog.Title className="sr-only">Menú</Dialog.Title>
            <Dialog.Description className="sr-only">Navegación principal</Dialog.Description>
            <div className="flex h-14 items-center justify-between px-4">
              <Logo />
              <Dialog.Close className="rounded-md p-1.5 text-sidebar-text hover:bg-sidebar-2" aria-label="Cerrar menú">
                <X className="size-5" />
              </Dialog.Close>
            </div>
            <Navegacion onNavegar={() => setMenu(false)} />
            <SalidaLateral />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-[900] flex h-14 shrink-0 items-center gap-3 border-b border-rule bg-surface/95 px-4 backdrop-blur lg:px-6">
          <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setMenu(true)} aria-label="Abrir menú">
            <Menu />
          </Button>
          <BuscadorGlobal />
          <div className="ml-auto flex items-center gap-1.5">
            {esAdmin && <SaludSistema />}
            <SelectorTema />
            <MenuUsuario />
          </div>
        </header>
        <AvisoArranque />
        <main
          id="contenido"
          tabIndex={-1}
          className={cn('min-w-0 flex-1 focus-visible:outline-none', pantallaCompleta ? 'relative' : 'px-4 py-6 lg:px-8')}
        >
          <Suspense fallback={<LoadingState />}>
            <div className={cn(!pantallaCompleta && 'mx-auto max-w-[1440px]', pantallaCompleta && 'h-full')}>
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
