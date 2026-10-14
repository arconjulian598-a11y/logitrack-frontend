import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

export function PageHeader({
  titulo,
  descripcion,
  acciones,
  migas,
  extra,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  migas?: { etiqueta: string; to?: string }[];
  extra?: ReactNode;
}) {
  return (
    <header className="mb-5">
      {migas && migas.length > 0 && (
        <nav aria-label="Ruta de navegación" className="mb-2 flex flex-wrap items-center gap-1 text-[13px] text-text-3">
          {migas.map((m, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              {m.to ? (
                <Link to={m.to} className="hover:text-primary hover:underline">
                  {m.etiqueta}
                </Link>
              ) : (
                <span className="text-text-2">{m.etiqueta}</span>
              )}
              {i < migas.length - 1 && <ChevronRight className="size-3.5" aria-hidden />}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-text">{titulo}</h1>
          {descripcion && <p className="mt-1 max-w-3xl text-[13px] text-text-2">{descripcion}</p>}
        </div>
        {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
      </div>
      {extra && <div className="mt-3">{extra}</div>}
    </header>
  );
}

/** Sección con borde: el bloque estructural de las páginas. */
export function Panel({
  titulo,
  descripcion,
  acciones,
  children,
  className,
  cuerpo = 'p-4',
  id,
}: {
  titulo?: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
  cuerpo?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn('min-w-0 rounded-lg border border-rule bg-surface', className)} aria-label={typeof titulo === 'string' ? titulo : undefined}>
      {(titulo || acciones) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-4 py-3">
          <div className="min-w-0">
            {titulo && <h2 className="text-sm font-bold text-text">{titulo}</h2>}
            {descripcion && <p className="text-xs text-text-2">{descripcion}</p>}
          </div>
          {acciones && <div className="flex items-center gap-1.5">{acciones}</div>}
        </div>
      )}
      <div className={cuerpo}>{children}</div>
    </section>
  );
}

/** Lista de pares etiqueta/valor. */
export function KeyValue({
  items,
  columnas = 2,
  className,
}: {
  items: { k: ReactNode; v: ReactNode; ancho?: boolean }[];
  columnas?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        'grid gap-x-6 gap-y-3',
        columnas === 1 && 'grid-cols-1',
        columnas === 2 && 'grid-cols-1 sm:grid-cols-2',
        columnas === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {items.map((it, i) => (
        <div key={i} className={cn('min-w-0', it.ancho && 'sm:col-span-full')}>
          <dt className="text-xs text-text-3">{it.k}</dt>
          <dd className="mt-0.5 break-words text-[13px] text-text">{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Cifra compacta: número condensado grande con etiqueta debajo. Sin tarjeta propia. */
export function Cifra({
  valor,
  etiqueta,
  detalle,
  tono,
  to,
}: {
  valor: ReactNode;
  etiqueta: ReactNode;
  detalle?: ReactNode;
  tono?: 'danger' | 'warn' | 'ok' | 'primary';
  to?: string;
}) {
  const contenido = (
    <>
      <div
        className={cn(
          'font-cond tabular text-[28px] font-bold leading-none tracking-tight',
          tono === 'danger' && 'text-danger',
          tono === 'warn' && 'text-warn',
          tono === 'ok' && 'text-ok',
          tono === 'primary' && 'text-primary',
          !tono && 'text-text',
        )}
      >
        {valor}
      </div>
      <div className="mt-1.5 text-[13px] font-semibold text-text">{etiqueta}</div>
      {detalle && <div className="text-xs text-text-3">{detalle}</div>}
    </>
  );
  if (to)
    return (
      <Link to={to} className="block min-w-0 rounded-md px-1 py-1 hover:bg-surface-2">
        {contenido}
      </Link>
    );
  return <div className="min-w-0 px-1 py-1">{contenido}</div>;
}

export function Codigo({ children, to, className }: { children: ReactNode; to?: string; className?: string }) {
  const clases = cn('font-cond tabular whitespace-nowrap text-[13.5px] font-bold tracking-wide text-text', className);
  if (to)
    return (
      <Link to={to} className={cn(clases, 'text-primary hover:underline')}>
        {children}
      </Link>
    );
  return <span className={clases}>{children}</span>;
}
