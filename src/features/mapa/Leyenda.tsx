import { ChevronDown, Info } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ESTADOS_MAPA, type EstadoMapa } from './posiciones';

export function Leyenda({ className, avisos = [] }: { className?: string; avisos?: (string | null)[] }) {
  const [abierta, setAbierta] = useState(false);
  const lista = avisos.filter(Boolean) as string[];
  return (
    <div className={cn('max-w-[280px] rounded-lg border border-rule bg-surface/95 text-xs shadow-sm backdrop-blur', className)}>
      <button
        type="button"
        onClick={() => setAbierta((a) => !a)}
        aria-expanded={abierta}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 font-semibold text-text"
      >
        <span className="flex items-center gap-1.5">
          <Info className="size-3.5 text-text-3" /> Leyenda
        </span>
        <ChevronDown className={cn('size-3.5 transition-transform', !abierta && '-rotate-90')} />
      </button>
      {abierta && (
        <div className="space-y-3 border-t border-rule px-3 py-2.5">
          <div>
            <p className="mb-1.5 text-text-3">Color: estado operativo</p>
            <ul className="grid grid-cols-1 gap-1">
              {(Object.keys(ESTADOS_MAPA) as EstadoMapa[]).map((e) => (
                <li key={e} className="flex items-center gap-2">
                  <span className="size-3 rounded-full border-2 border-white shadow" style={{ background: ESTADOS_MAPA[e].color }} />
                  {ESTADOS_MAPA[e].etiqueta}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1.5 text-text-3">Borde: procedencia de la posición</p>
            <ul className="space-y-1">
              <li className="flex items-center gap-2">
                <span className="size-3 rounded-full border-2 border-white bg-primary shadow" /> En vivo (viaje en curso, cada 5 s)
              </li>
              <li className="flex items-center gap-2">
                <span className="size-3 rounded-full border-2 border-dashed border-primary bg-primary/40" /> Última lectura de telemetría
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-1.5 text-text-3">Ruta del vehículo seleccionado</p>
            <ul className="space-y-1">
              <li className="flex items-center gap-2">
                <span className="h-1 w-5 rounded bg-primary" /> Trazado de la ruta
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1 w-5 rounded border-t-2 border-dashed border-primary" /> Trazado estimado (sin servicio de mapas)
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1 w-5 rounded bg-ok" /> Tramo ya recorrido
              </li>
            </ul>
          </div>
          {lista.length > 0 && (
            <ul className="space-y-1 border-t border-rule pt-2 text-warn">
              {lista.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
