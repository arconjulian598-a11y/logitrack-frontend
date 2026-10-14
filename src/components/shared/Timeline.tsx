import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ItemLinea {
  clave: string;
  titulo: ReactNode;
  cuando: ReactNode;
  detalle?: ReactNode;
  tono?: 'primary' | 'ok' | 'warn' | 'danger' | 'neutral';
}

/** Línea de tiempo vertical (el orden importa: es una secuencia real de eventos). */
export function Timeline({ items }: { items: ItemLinea[] }) {
  return (
    <ol className="relative space-y-4 pl-5 before:absolute before:bottom-1.5 before:left-[5px] before:top-1.5 before:w-px before:bg-rule">
      {items.map((it) => (
        <li key={it.clave} className="relative">
          <span
            className={cn(
              'absolute -left-5 top-1 size-[11px] rounded-full border-2 border-surface',
              it.tono === 'primary' && 'bg-primary',
              it.tono === 'ok' && 'bg-ok',
              it.tono === 'warn' && 'bg-warn',
              it.tono === 'danger' && 'bg-danger',
              (!it.tono || it.tono === 'neutral') && 'bg-text-3',
            )}
            aria-hidden
          />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-[13px] font-semibold text-text">{it.titulo}</p>
            <p className="tabular text-xs text-text-3">{it.cuando}</p>
          </div>
          {it.detalle && <div className="mt-0.5 text-[13px] text-text-2">{it.detalle}</div>}
        </li>
      ))}
    </ol>
  );
}
