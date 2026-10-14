import type { ReactNode } from 'react';
import { Tooltip } from '@/components/ui/misc';
import type { Tono } from '@/lib/dominio';
import { cn } from '@/lib/utils';

const TONOS: Record<Tono, string> = {
  neutral: 'bg-neutral-soft text-text-2',
  info: 'bg-info-soft text-info',
  primary: 'bg-primary-soft text-primary',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  muted: 'bg-neutral-soft text-text-3',
};

const PUNTOS: Record<Tono, string> = {
  neutral: 'bg-text-3',
  info: 'bg-info',
  primary: 'bg-primary',
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  muted: 'bg-text-3/60',
};

export function Badge({
  tono = 'neutral',
  children,
  punto = true,
  className,
}: {
  tono?: Tono;
  children: ReactNode;
  punto?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-xs font-semibold',
        TONOS[tono],
        className,
      )}
    >
      {punto && <span className={cn('size-1.5 rounded-full', PUNTOS[tono])} aria-hidden />}
      {children}
    </span>
  );
}

/** Insignia de estado a partir del vocabulario de `dominio.ts`. */
export function EstadoBadge({ def }: { def: { etiqueta: string; tono: Tono; ayuda?: string } }) {
  const b = <Badge tono={def.tono}>{def.etiqueta}</Badge>;
  if (!def.ayuda) return b;
  return (
    <Tooltip contenido={def.ayuda}>
      <span tabIndex={0} className="inline-flex rounded-full">
        {b}
      </span>
    </Tooltip>
  );
}

/** Etiqueta pequeña sin punto (tipo de carga, HAZMAT, internacional…). */
export function Tag({ children, tono = 'neutral', icono }: { children: ReactNode; tono?: Tono; icono?: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-sm px-1.5 text-[11px] font-semibold [&_svg]:size-3',
        TONOS[tono],
      )}
    >
      {icono}
      {children}
    </span>
  );
}
