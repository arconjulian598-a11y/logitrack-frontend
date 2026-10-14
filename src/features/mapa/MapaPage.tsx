import type { LatLngBoundsExpression } from 'leaflet';
import { Crosshair, List, Maximize2, RefreshCw, Route as RouteIcon, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Marker, Popup, useMap } from 'react-leaflet';
import { useSearchParams } from 'react-router';
import { AjustarVista, BaseMap, InvalidarTamano } from '@/components/map/BaseMap';
import { CapaRuta } from '@/components/map/CapaRuta';
import { iconoVehiculo } from '@/components/map/iconos';
import { Plate } from '@/components/shared/Plate';
import { ErrorState } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { Switch, Tooltip } from '@/components/ui/misc';
import { useEnvio, useRecorrido, useRutaMaestra, useTrazado } from '@/hooks/queries';
import { config } from '@/lib/config';
import { tipoVehiculo } from '@/lib/dominio';
import { numero, relativo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { FichaVehiculoMapa } from './FichaVehiculoMapa';
import { Leyenda } from './Leyenda';
import { PanelVehiculos } from './PanelVehiculos';
import { useFiltroMapa } from './useFiltroMapa';
import { ESTADOS_MAPA, tienePosicion, type VehiculoMapa } from './posiciones';
import { useVistaFlota } from './useVistaFlota';

function CentrarEn({ lat, lng, clave }: { lat: number | null; lng: number | null; clave: string }) {
  const map = useMap();
  useEffect(() => {
    if (lat !== null && lng !== null) map.flyTo([lat, lng], Math.max(map.getZoom(), 9), { duration: 0.6 });
    // Solo se centra al seleccionar o al pedirlo, no en cada refresco de posición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return null;
}

/** Trazado de cada viaje en curso (opcional): una petición por viaje, se pide una sola vez. */
function TrazadoViaje({ envioId }: { envioId: string }) {
  const t = useTrazado(envioId);
  if (!t.data) return null;
  return <CapaRuta puntos={t.data.puntos} />;
}

export default function MapaPage() {
  const { vista, cargando, errorVehiculos, errorFlota, erroresTelemetria, actualizadoEn, refrescando, refrescar } = useVistaFlota();
  const [params, setParams] = useSearchParams();
  const seleccionId = params.get('v');
  // En teléfonos se abre directamente el mapa; la lista queda a un toque.
  const [panelAbierto, setPanelAbierto] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768);
  const [todosTrazados, setTodosTrazados] = useState(false);
  const [ajuste, setAjuste] = useState(0);
  const [centrado, setCentrado] = useState(0);
  const filtro = useFiltroMapa();

  const visibles = useMemo(() => vista.filter(filtro.aplica), [vista, filtro.aplica]);
  const conPos = visibles.filter(tienePosicion);
  const seleccion = vista.find((v) => v.vehiculo.id === seleccionId) ?? null;

  function seleccionar(v: VehiculoMapa | null) {
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set('v', v.vehiculo.id);
        else n.delete('v');
        return n;
      },
      { replace: true },
    );
    if (v) setCentrado((c) => c + 1);
  }

  const limites: LatLngBoundsExpression | null = conPos.length
    ? (conPos.map((v) => [v.latitud, v.longitud]) as [number, number][])
    : null;

  const sinPosicion = vista.filter((v) => v.fuente === 'sin_datos').length;
  const enVivo = vista.filter((v) => v.fuente === 'en_vivo').length;

  if (errorVehiculos && !vista.length) {
    return (
      <div className="p-6">
        <ErrorState error={errorVehiculos} reintentar={refrescar} />
      </div>
    );
  }

  return (
    <div className="relative flex h-[calc(100dvh-3.5rem)] min-h-[480px]">
      <h1 className="sr-only">Mapa en vivo de la flota</h1>

      <aside
        className={cn(
          'absolute inset-y-0 left-0 z-[800] flex w-full max-w-[360px] flex-col border-r border-rule bg-surface transition-transform duration-200 md:relative md:z-auto',
          !panelAbierto && '-translate-x-full md:hidden',
        )}
        aria-label="Vehículos"
      >
        <PanelVehiculos
          vista={vista}
          visibles={visibles}
          filtro={filtro}
          cargando={cargando}
          seleccionId={seleccionId}
          onSeleccionar={(v) => {
            seleccionar(v);
            if (window.innerWidth < 768) setPanelAbierto(false);
          }}
          onCerrar={() => setPanelAbierto(false)}
        />
      </aside>

      <div className="relative min-w-0 flex-1">
        <BaseMap className="size-full" etiqueta="Mapa de vehículos">
          <InvalidarTamano dep={`${panelAbierto}-${!!seleccion}`} />
          <AjustarVista limites={limites} clave={`${ajuste}-${cargando ? 'c' : 'l'}-${conPos.length > 0}`} maxZoom={9} />
          {seleccion && tienePosicion(seleccion) && (
            <CentrarEn lat={seleccion.latitud} lng={seleccion.longitud} clave={`${seleccion.vehiculo.id}-${centrado}`} />
          )}
          {todosTrazados &&
            vista
              .filter((v) => v.viaje && v.vehiculo.id !== seleccionId)
              .map((v) => <TrazadoViaje key={v.viaje!.envio_id} envioId={v.viaje!.envio_id} />)}
          {seleccion?.viaje && <RutaSeleccionada envioId={seleccion.viaje.envio_id} />}
          {conPos.map((v) => {
            const sel = v.vehiculo.id === seleccionId;
            return (
              <Marker
                key={v.vehiculo.id}
                position={[v.latitud, v.longitud]}
                icon={iconoVehiculo({
                  color: ESTADOS_MAPA[v.estadoMapa].color,
                  placa: v.vehiculo.placa,
                  historica: v.fuente === 'historica',
                  seleccionado: sel,
                  pausado: v.estadoMapa === 'detenido_aduana',
                  mantenimiento: v.estadoMapa === 'mantenimiento',
                })}
                title={`${v.vehiculo.placa}: ${ESTADOS_MAPA[v.estadoMapa].etiqueta}${v.fuente === 'historica' ? ', última posición conocida' : ', en vivo'}`}
                alt={v.vehiculo.placa}
                zIndexOffset={sel ? 1000 : v.fuente === 'en_vivo' ? 500 : 0}
                eventHandlers={{ click: () => seleccionar(v) }}
              >
                <Popup>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Plate placa={v.vehiculo.placa} tamano="sm" />
                      <span className="font-semibold">{tipoVehiculo(v.vehiculo.tipo)}</span>
                    </div>
                    <div>{v.conductor?.nombre ?? 'Sin conductor'}</div>
                    <div className="text-text-2">
                      {ESTADOS_MAPA[v.estadoMapa].etiqueta}
                      {v.velocidadKmh !== null && `, ${numero(v.velocidadKmh)} km/h`}
                      {v.combustiblePct !== null && `, combustible ${numero(v.combustiblePct)} %`}
                    </div>
                    <div className="text-xs text-text-3">
                      {v.fuente === 'en_vivo' ? 'Posición en vivo' : `Última posición conocida ${relativo(v.posicionEn)}`}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </BaseMap>

        {/* Controles superiores */}
        <div className="pointer-events-none absolute inset-x-3 top-3 z-[700] flex flex-wrap items-start justify-between gap-2">
          <div className="pointer-events-auto flex flex-wrap gap-2">
            {!panelAbierto && (
              <Button size="sm" onClick={() => setPanelAbierto(true)} className="shadow-sm">
                <List /> Vehículos ({visibles.length})
              </Button>
            )}
            <div className="flex items-center gap-2 rounded-md border border-rule bg-surface px-2.5 py-1.5 text-xs text-text-2 shadow-sm">
              <span className={cn('size-2 rounded-full', errorFlota ? 'bg-danger' : 'bg-ok', refrescando && 'animate-pulse')} aria-hidden />
              {errorFlota ? (
                <span className="text-danger">Seguimiento sin respuesta</span>
              ) : (
                <span>
                  {enVivo} en vivo, actualizado {actualizadoEn ? relativo(new Date(actualizadoEn).toISOString()) : '—'}; cada{' '}
                  {config.poll.flotaMs / 1000} s
                </span>
              )}
            </div>
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            <label className="flex h-8 items-center gap-2 rounded-md border border-rule bg-surface px-2.5 text-xs font-semibold text-text-2 shadow-sm">
              <RouteIcon className="size-3.5" />
              <span className="hidden sm:inline">Trazados</span>
              <Switch checked={todosTrazados} onCheckedChange={setTodosTrazados} aria-label="Mostrar el trazado de todos los viajes" />
            </label>
            <Tooltip contenido="Ajustar la vista a los vehículos visibles">
              <Button size="icon-sm" onClick={() => setAjuste((a) => a + 1)} aria-label="Ajustar la vista" className="shadow-sm">
                <Maximize2 />
              </Button>
            </Tooltip>
            <Tooltip contenido="Actualizar ahora">
              <Button size="icon-sm" onClick={refrescar} aria-label="Actualizar ahora" className="shadow-sm">
                <RefreshCw className={cn(refrescando && 'animate-spin')} />
              </Button>
            </Tooltip>
          </div>
        </div>

        <Leyenda
          className="absolute bottom-6 left-3 z-[700]"
          avisos={[
            sinPosicion > 0 ? `${sinPosicion} vehículo(s) sin coordenadas registradas: aparecen en la lista, no en el mapa.` : null,
            erroresTelemetria > 0 ? `No se pudo leer la telemetría de ${erroresTelemetria} vehículo(s).` : null,
          ]}
        />

        {!cargando && conPos.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-[650] grid place-items-center p-6">
            <div className="pointer-events-auto max-w-sm rounded-lg border border-rule bg-surface p-4 text-center shadow-lg">
              <Crosshair className="mx-auto mb-2 size-6 text-text-3" />
              <p className="text-sm font-semibold">Ningún vehículo visible tiene coordenadas</p>
              <p className="mt-1 text-[13px] text-text-2">
                Las posiciones vienen del seguimiento de viajes en curso y de la última lectura de telemetría. Cree un envío para iniciar un viaje o ajuste los filtros.
              </p>
            </div>
          </div>
        )}

        {seleccion && (
          <div className="absolute inset-x-0 bottom-0 z-[750] max-h-[62%] overflow-y-auto rounded-t-xl border-t border-rule bg-surface shadow-2xl md:inset-x-auto md:bottom-auto md:right-3 md:top-14 md:max-h-[calc(100%-10.5rem)] md:w-[380px] md:rounded-lg md:border">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-surface px-4 py-2.5">
              <span className="text-xs font-semibold text-text-2">Vehículo seleccionado</span>
              <Button variant="ghost" size="icon-sm" onClick={() => seleccionar(null)} aria-label="Cerrar ficha">
                <X />
              </Button>
            </div>
            <FichaVehiculoMapa v={seleccion} onCentrar={() => setCentrado((c) => c + 1)} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Trazado, paradas y estela del viaje seleccionado (comparte caché con la ficha). */
function RutaSeleccionada({ envioId }: { envioId: string }) {
  const t = useTrazado(envioId);
  const r = useRecorrido(envioId);
  const e = useEnvio(envioId);
  const rm = useRutaMaestra(e.data?.ruta_maestra_id);
  if (!t.data) return null;
  return (
    <CapaRuta
      puntos={t.data.puntos}
      paradas={t.data.paradas}
      origen={t.data.origen}
      destino={t.data.destino}
      estimada={rm.data?.estimada}
      recorrido={(r.data ?? []).map((p) => [p.latitud, p.longitud] as [number, number])}
    />
  );
}
