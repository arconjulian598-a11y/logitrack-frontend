import { AlertTriangle, CloudOff, Inbox, Loader2, Lock, RotateCw, ServerCrash } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { ApiError, describirError } from '@/lib/api/errors';
import { SERVICIOS } from '@/lib/dominio';
import { cn } from '@/lib/utils';

export function EmptyState({
  titulo,
  children,
  accion,
  icono,
  className,
  compacto,
}: {
  titulo: string;
  children?: ReactNode;
  accion?: ReactNode;
  icono?: ReactNode;
  className?: string;
  compacto?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compacto ? 'gap-1.5 py-6' : 'gap-2 py-12', className)}>
      <div className="text-text-3 [&_svg]:size-6">{icono ?? <Inbox />}</div>
      <p className="text-sm font-semibold text-text">{titulo}</p>
      {children && <div className="max-w-md text-[13px] text-text-2">{children}</div>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}

export function ErrorState({
  error,
  reintentar,
  className,
  compacto,
}: {
  error: unknown;
  reintentar?: () => void;
  className?: string;
  compacto?: boolean;
}) {
  const e = error instanceof ApiError ? error : null;
  const caido = e?.esServicioCaido;
  const red = e?.esDeRed;
  const prohibido = e?.sinPermiso;
  const titulo = prohibido
    ? 'Sin permiso'
    : red
    ? 'Sin conexión con el API Gateway'
    : caido
      ? `Servicio de ${SERVICIOS[e?.servicio ?? '']?.nombre.toLowerCase() ?? e?.servicio ?? 'backend'} no disponible`
      : 'No se pudo cargar la información';
  const Icono = prohibido ? Lock : red ? CloudOff : caido ? ServerCrash : AlertTriangle;
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-2 text-center',
        compacto ? 'py-5' : 'py-10',
        className,
      )}
    >
      <Icono className={cn('size-6', prohibido ? 'text-text-3' : 'text-danger')} aria-hidden />
      <p className="text-sm font-semibold text-text">{titulo}</p>
      <p className="max-w-lg text-[13px] text-text-2">{describirError(error)}</p>
      {e?.requestId && e.status < 500 && !prohibido && (
        <p className="text-xs text-text-3">Referencia de la petición: {e.requestId}</p>
      )}
      {reintentar && !prohibido && (
        <Button size="sm" onClick={reintentar} className="mt-1">
          <RotateCw /> Reintentar
        </Button>
      )}
    </div>
  );
}

export function LoadingState({ texto = 'Cargando…', className }: { texto?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-10 text-[13px] text-text-2', className)} role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {texto}
    </div>
  );
}

export function TableSkeleton({ filas = 6, columnas = 5 }: { filas?: number; columnas?: number }) {
  return (
    <div className="divide-y divide-rule" role="status" aria-label="Cargando">
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3">
          {Array.from({ length: columnas }).map((__, j) => (
            <Skeleton key={j} className={cn('h-4', j === 0 ? 'w-24' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Aviso de una limitación real del backend (no es un error de la interfaz). */
export function Limitacion({ children, titulo = 'Limitación del backend', className }: { children: ReactNode; titulo?: string; className?: string }) {
  return (
    <div className={cn('flex gap-2.5 rounded-md border border-warn/30 bg-warn-soft px-3 py-2.5 text-[13px] text-text', className)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
      <div>
        <p className="font-semibold">{titulo}</p>
        <div className="text-text-2">{children}</div>
      </div>
    </div>
  );
}

export function Nota({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-md border border-rule bg-surface-2 px-3 py-2 text-[13px] text-text-2', className)}>{children}</div>
  );
}

/** Pantalla para una sección que el rol del usuario no puede usar. */
export function SinPermiso({ children }: { children?: ReactNode }) {
  return (
    <EmptyState titulo="No tiene permiso para ver esta sección" icono={<Lock />}>
      {children ?? 'Su rol no incluye esta parte del sistema. Si la necesita, pídale acceso a un administrador.'}
    </EmptyState>
  );
}
