import { Search, X } from 'lucide-react';
import { useMemo } from 'react';
import { Plate } from '@/components/shared/Plate';
import { Skeleton } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/input';
import { tipoVehiculo } from '@/lib/dominio';
import { numero, relativo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ESTADOS_MAPA, type EstadoMapa, type VehiculoMapa } from './posiciones';
import { CLAVES_FILTRO_MAPA, type useFiltroMapa } from './useFiltroMapa';

function EtiquetaFuente({ v }: { v: VehiculoMapa }) {
  if (v.fuente === 'en_vivo')
    return <span className="text-xs font-semibold text-primary">En vivo</span>;
  if (v.fuente === 'historica')
    return <span className="text-xs text-text-2">Última posición {relativo(v.posicionEn)}</span>;
  if (v.fuente === 'registrada')
    return <span className="text-xs text-text-2">En {v.vehiculo.ubicacion_nombre ?? 'su ubicación registrada'}</span>;
  if (v.fuente === 'cargando') return <Skeleton className="h-3 w-20" />;
  return <span className="text-xs text-text-3">Sin coordenadas</span>;
}

export function PanelVehiculos({
  vista,
  visibles,
  filtro,
  cargando,
  seleccionId,
  onSeleccionar,
  onCerrar,
}: {
  vista: VehiculoMapa[];
  visibles: VehiculoMapa[];
  filtro: ReturnType<typeof useFiltroMapa>;
  cargando: boolean;
  seleccionId: string | null;
  onSeleccionar: (v: VehiculoMapa) => void;
  onCerrar: () => void;
}) {
  const { valores, set, limpiar } = filtro;
  const conteo = useMemo(() => {
    const c: Partial<Record<EstadoMapa, number>> = {};
    vista.forEach((v) => (c[v.estadoMapa] = (c[v.estadoMapa] ?? 0) + 1));
    return c;
  }, [vista]);
  const tipos = useMemo(() => [...new Set(vista.map((v) => v.vehiculo.tipo))].sort(), [vista]);
  const ordenados = useMemo(
    () =>
      [...visibles].sort((a, b) => {
        const peso = (x: VehiculoMapa) => (x.fuente === 'en_vivo' ? 0 : x.fuente === 'historica' || x.fuente === 'registrada' ? 1 : 2);
        return peso(a) - peso(b) || a.vehiculo.placa.localeCompare(b.vehiculo.placa);
      }),
    [visibles],
  );
  const hayFiltros = CLAVES_FILTRO_MAPA.some((k) => valores[k]);

  return (
    <>
      <div className="space-y-2.5 border-b border-rule p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">
            Vehículos <span className="tabular font-normal text-text-3">{visibles.length} de {vista.length}</span>
          </h2>
          <Button variant="ghost" size="icon-sm" onClick={onCerrar} aria-label="Ocultar lista de vehículos">
            <X />
          </Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-3" />
          <input
            value={valores.q}
            onChange={(e) => set('q', e.target.value)}
            placeholder="Placa, conductor o código de envío"
            aria-label="Buscar vehículo por placa, conductor o código de envío"
            className="h-9 w-full rounded-md border border-rule-strong bg-surface pl-8 pr-3 text-[13px] placeholder:text-text-3 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NativeSelect value={valores.fuente} onChange={(e) => set('fuente', e.target.value)} aria-label="Filtrar por posición">
            <option value="">Toda posición</option>
            <option value="en_vivo">En vivo</option>
            <option value="registrada">Ubicación registrada</option>
            <option value="historica">Última conocida</option>
            <option value="con_posicion">Con coordenadas</option>
            <option value="sin_datos">Sin coordenadas</option>
          </NativeSelect>
          <NativeSelect value={valores.tipo} onChange={(e) => set('tipo', e.target.value)} aria-label="Filtrar por tipo de vehículo">
            <option value="">Todo tipo</option>
            {tipos.map((t) => (
              <option key={t} value={t}>
                {tipoVehiculo(t)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
          {(Object.keys(ESTADOS_MAPA) as EstadoMapa[]).map((e) => {
            const activo = valores.estado === e;
            const n = conteo[e] ?? 0;
            if (!n && !activo) return null;
            return (
              <button
                key={e}
                type="button"
                aria-pressed={activo}
                onClick={() => set('estado', activo ? '' : e)}
                className={cn(
                  'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors',
                  activo ? 'border-text bg-text text-surface' : 'border-rule bg-surface text-text-2 hover:border-text-3',
                )}
              >
                <span className="size-2 rounded-full" style={{ background: ESTADOS_MAPA[e].color }} aria-hidden />
                {ESTADOS_MAPA[e].etiqueta}
                <span className="tabular opacity-70">{n}</span>
              </button>
            );
          })}
          {hayFiltros && (
            <button type="button" onClick={limpiar} className="h-7 cursor-pointer px-1.5 text-xs font-semibold text-primary hover:underline">
              Limpiar
            </button>
          )}
        </div>
      </div>

      <ul className="scrollbar-thin flex-1 divide-y divide-rule overflow-y-auto" aria-label="Lista de vehículos">
        {cargando &&
          Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="space-y-2 p-3">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-3 w-40" />
            </li>
          ))}
        {!cargando && ordenados.length === 0 && (
          <li className="p-6 text-center text-[13px] text-text-2">
            {vista.length === 0 ? 'La flota no tiene vehículos registrados.' : 'Ningún vehículo coincide con los filtros.'}
          </li>
        )}
        {ordenados.map((v) => {
          const sel = v.vehiculo.id === seleccionId;
          return (
            <li key={v.vehiculo.id}>
              <button
                type="button"
                onClick={() => onSeleccionar(v)}
                aria-current={sel || undefined}
                className={cn(
                  'flex w-full cursor-pointer items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2',
                  sel && 'bg-primary-soft hover:bg-primary-soft',
                )}
              >
                <span
                  className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', (v.fuente === 'historica' || v.fuente === 'registrada') && 'ring-2 ring-offset-1 ring-offset-surface')}
                  style={{ background: ESTADOS_MAPA[v.estadoMapa].color, ['--tw-ring-color' as string]: ESTADOS_MAPA[v.estadoMapa].color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <Plate placa={v.vehiculo.placa} tamano="sm" />
                    <span className="truncate text-xs text-text-2">{tipoVehiculo(v.vehiculo.tipo)}</span>
                    {v.viaje?.codigo_envio && (
                      <span className="font-cond ml-auto shrink-0 text-xs font-bold text-text-2">{v.viaje.codigo_envio}</span>
                    )}
                  </span>
                  <span className="mt-1 block truncate text-[13px] font-medium">{v.conductor?.nombre ?? 'Sin conductor asignado'}</span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="text-xs text-text-2">{ESTADOS_MAPA[v.estadoMapa].etiqueta}</span>
                    <EtiquetaFuente v={v} />
                  </span>
                  {v.viaje && (
                    <span className="mt-1.5 flex items-center gap-2">
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-soft">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, v.viaje.progreso_pct)}%` }} />
                      </span>
                      <span className="tabular text-[11px] text-text-3">{numero(v.viaje.progreso_pct, 0)} %</span>
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
