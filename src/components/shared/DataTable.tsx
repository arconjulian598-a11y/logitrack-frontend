import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EmptyState, ErrorState, TableSkeleton } from './States';

export interface Columna<T> {
  id: string;
  titulo: ReactNode;
  celda: (fila: T) => ReactNode;
  /** Valor para ordenar; si falta, la columna no es ordenable. */
  orden?: (fila: T) => string | number | null | undefined;
  className?: string;
  /** Oculta la columna por debajo de este ancho para mantener legible la tabla en móvil. */
  ocultarBajo?: 'sm' | 'md' | 'lg' | 'xl';
  alinear?: 'right' | 'center';
}

const OCULTAR = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell' };

interface Props<T> {
  filas: T[] | undefined;
  columnas: Columna<T>[];
  clave: (fila: T) => string;
  cargando?: boolean;
  error?: unknown;
  reintentar?: () => void;
  onFila?: (fila: T) => void;
  vacio?: ReactNode;
  tamPagina?: number;
  ordenInicial?: { id: string; dir: 'asc' | 'desc' };
  etiqueta: string;
  filaClassName?: (fila: T) => string | undefined;
  pie?: ReactNode;
}

/**
 * Tabla con orden y paginación del lado del cliente: las colecciones del gateway son arreglos
 * simples sin paginación (contrato 1.2), así que se pagina lo recibido.
 */
export function DataTable<T>({
  filas,
  columnas,
  clave,
  cargando,
  error,
  reintentar,
  onFila,
  vacio,
  tamPagina = 15,
  ordenInicial,
  etiqueta,
  filaClassName,
  pie,
}: Props<T>) {
  const [orden, setOrden] = useState(ordenInicial);
  const [pagina, setPagina] = useState(0);

  const ordenadas = useMemo(() => {
    if (!filas) return [];
    if (!orden) return filas;
    const col = columnas.find((c) => c.id === orden.id);
    if (!col?.orden) return filas;
    const f = col.orden;
    return [...filas].sort((a, b) => {
      const va = f(a);
      const vb = f(b);
      if (va === vb) return 0;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es');
      return orden.dir === 'asc' ? r : -r;
    });
  }, [filas, orden, columnas]);

  const total = ordenadas.length;
  const paginas = Math.max(1, Math.ceil(total / tamPagina));
  const actual = Math.min(pagina, paginas - 1);
  const visibles = ordenadas.slice(actual * tamPagina, actual * tamPagina + tamPagina);

  if (error && !filas) return <ErrorState error={error} reintentar={reintentar} />;
  if (cargando && !filas) return <TableSkeleton columnas={Math.min(columnas.length, 6)} />;

  function alternar(id: string) {
    setPagina(0);
    setOrden((o) => (o?.id === id ? { id, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { id, dir: 'asc' }));
  }

  return (
    <div className="min-w-0">
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full border-collapse text-[13px]" aria-label={etiqueta}>
          <thead>
            <tr className="border-b border-rule bg-surface-2 text-left">
              {columnas.map((c) => {
                const activa = orden?.id === c.id;
                return (
                  <th
                    key={c.id}
                    scope="col"
                    aria-sort={activa ? (orden!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cn(
                      'whitespace-nowrap px-4 py-2 text-xs font-semibold text-text-2',
                      c.alinear === 'right' && 'text-right',
                      c.alinear === 'center' && 'text-center',
                      c.ocultarBajo && OCULTAR[c.ocultarBajo],
                    )}
                  >
                    {c.orden ? (
                      <button
                        type="button"
                        onClick={() => alternar(c.id)}
                        className={cn('inline-flex cursor-pointer items-center gap-1 hover:text-text', activa && 'text-text')}
                      >
                        {c.titulo}
                        {activa ? (
                          orden!.dir === 'asc' ? (
                            <ArrowUp className="size-3.5" />
                          ) : (
                            <ArrowDown className="size-3.5" />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3.5 opacity-50" />
                        )}
                      </button>
                    ) : (
                      c.titulo
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {visibles.map((f) => (
              <tr
                key={clave(f)}
                onClick={onFila ? () => onFila(f) : undefined}
                onKeyDown={
                  onFila
                    ? (e) => {
                        if (e.key === 'Enter' && e.target === e.currentTarget) onFila(f);
                      }
                    : undefined
                }
                tabIndex={onFila ? 0 : undefined}
                className={cn(
                  'transition-colors',
                  onFila && 'cursor-pointer hover:bg-surface-2 focus-visible:bg-primary-soft focus-visible:outline-none',
                  filaClassName?.(f),
                )}
              >
                {columnas.map((c) => (
                  <td
                    key={c.id}
                    className={cn(
                      'px-4 py-2.5 align-middle text-text',
                      c.alinear === 'right' && 'text-right tabular',
                      c.alinear === 'center' && 'text-center',
                      c.ocultarBajo && OCULTAR[c.ocultarBajo],
                      c.className,
                    )}
                  >
                    {c.celda(f)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total === 0 && (vacio ?? <EmptyState titulo="Sin resultados" />)}
      {(total > tamPagina || pie) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule px-4 py-2 text-xs text-text-2">
          <span className="tabular">
            {total > 0 ? `${actual * tamPagina + 1}–${Math.min(total, (actual + 1) * tamPagina)} de ${total}` : '0 resultados'}
            {pie && <span className="ml-3">{pie}</span>}
          </span>
          {total > tamPagina && (
            <div className="flex items-center gap-1">
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setPagina(Math.max(0, actual - 1))}
                disabled={actual === 0}
                aria-label="Página anterior"
              >
                <ChevronLeft />
              </Button>
              <span className="tabular px-1">
                {actual + 1} / {paginas}
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setPagina(Math.min(paginas - 1, actual + 1))}
                disabled={actual >= paginas - 1}
                aria-label="Página siguiente"
              >
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
