import * as Dialog from '@radix-ui/react-dialog';
import { Menu, Monitor, Moon, Sun, X } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { LoadingState } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown';
import { Tooltip } from '@/components/ui/misc';
import { useEstadoSistema } from '@/hooks/queries';
import { useTema } from '@/hooks/useTema';
import { cn } from '@/lib/utils';
import { BuscadorGlobal } from './BuscadorGlobal';
import { NAVEGACION } from './nav';

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
  const estado = useEstadoSistema();
  const servicios = estado.data?.servicios ?? {};
  return (
    <nav aria-label="Principal" className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-4">
      {NAVEGACION.map((g) => (
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
                    end={it.to === '/'}
                    onClick={onNavegar}
                    className={({ isActive }) =>
                      cn(
                        'group flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium text-sidebar-text transition-colors hover:bg-sidebar-2 hover:text-white',
                        isActive && 'bg-sidebar-2 text-white shadow-[inset_3px_0_0_var(--primary)]',
                      )
                    }
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

export function AppLayout() {
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  const pantallaCompleta = pathname === '/mapa';

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
        <p className="border-t border-white/10 px-5 py-3 text-[11px] leading-snug text-sidebar-text/60">
          Sin autenticación: el backend aún no la exige. Cualquier usuario con acceso al gateway puede operar.
        </p>
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
            <SaludSistema />
            <SelectorTema />
          </div>
        </header>
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
