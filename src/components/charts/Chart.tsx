import { BarChart3, Table2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

interface ItemTooltip {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  dataKey?: string | number | ((obj: unknown) => unknown);
  payload?: unknown;
}

/** Tooltip con tokens de texto (el color de la serie solo en la muestra). */
export function TooltipContenido({
  active,
  payload,
  label,
  formato,
  etiqueta,
}: {
  active?: boolean;
  payload?: ItemTooltip[];
  label?: string | number;
  formato?: (v: number, nombre: string) => string;
  etiqueta?: (l: string | number | undefined) => ReactNode;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-md border border-rule bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-text">{etiqueta ? etiqueta(label) : label}</p>
      <ul className="space-y-0.5">
        {payload.map((p, i) => (
          <li key={i} className="flex items-center justify-between gap-4 text-text-2">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm" style={{ background: p.color }} aria-hidden />
              {p.name}
            </span>
            <span className="tabular font-semibold text-text">
              {typeof p.value === 'number' && formato ? formato(p.value, String(p.name)) : String(p.value ?? '—')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Leyenda({ items }: { items: { nombre: string; color: string; forma?: 'linea' | 'barra' }[] }) {
  if (items.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-2" aria-label="Leyenda">
      {items.map((it) => (
        <li key={it.nombre} className="flex items-center gap-1.5">
          <span
            className={cn(it.forma === 'linea' ? 'h-0.5 w-3.5' : 'size-2.5 rounded-sm')}
            style={{ background: it.color }}
            aria-hidden
          />
          {it.nombre}
        </li>
      ))}
    </ul>
  );
}

/**
 * Marco de gráfica: título, leyenda HTML, alternancia a tabla (accesibilidad) y alto fijo.
 * `tabla` recibe las filas ya formateadas.
 */
export function ChartFrame({
  titulo,
  descripcion,
  leyenda,
  alto = 240,
  children,
  tabla,
  acciones,
  className,
}: {
  titulo: string;
  descripcion?: ReactNode;
  leyenda?: { nombre: string; color: string; forma?: 'linea' | 'barra' }[];
  alto?: number;
  children: ReactNode;
  tabla?: { columnas: string[]; filas: (string | number)[][] };
  acciones?: ReactNode;
  className?: string;
}) {
  const [verTabla, setVerTabla] = useState(false);
  return (
    <figure className={cn('min-w-0', className)}>
      <figcaption className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-text">{titulo}</p>
          {descripcion && <p className="text-xs text-text-2">{descripcion}</p>}
        </div>
        <div className="flex items-center gap-1">
          {acciones}
          {tabla && (
            <button
              type="button"
              onClick={() => setVerTabla((v) => !v)}
              className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-semibold text-text-2 hover:bg-neutral-soft hover:text-text"
              aria-pressed={verTabla}
            >
              {verTabla ? <BarChart3 className="size-3.5" /> : <Table2 className="size-3.5" />}
              {verTabla ? 'Ver gráfica' : 'Ver tabla'}
            </button>
          )}
        </div>
      </figcaption>
      {leyenda && !verTabla && (
        <div className="mb-2">
          <Leyenda items={leyenda} />
        </div>
      )}
      {verTabla && tabla ? (
        <div className="scrollbar-thin overflow-auto rounded-md border border-rule" style={{ maxHeight: alto + 24 }}>
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-2">
              <tr>
                {tabla.columnas.map((c) => (
                  <th key={c} scope="col" className="px-3 py-1.5 text-left font-semibold text-text-2">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {tabla.filas.map((f, i) => (
                <tr key={i}>
                  {f.map((v, j) => (
                    <td key={j} className="tabular px-3 py-1.5 text-text">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height: alto }} className="min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            {children as React.ReactElement}
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}
