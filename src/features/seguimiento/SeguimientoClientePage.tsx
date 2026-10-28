import { AlertTriangle, ArrowLeft, Clock, Info, MapPinOff, Navigation, RefreshCw, Split, Users } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { usePuede } from '@/app/auth';
import { MapaViaje } from '@/components/map/MapaViaje';
import { EstadoBadge } from '@/components/shared/Badge';
import { Codigo, PageHeader, Panel } from '@/components/shared/Layout';
import { EmptyState, ErrorState, LoadingState, SinPermiso } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { usePartes, useRecorridoCliente, useTrazadoCliente } from '@/hooks/queries';
import { ApiError, describirError } from '@/lib/api/errors';
import { estadoEnvio, estadoViaje } from '@/lib/dominio';
import { haceSegundos, horaLocalConSegundos } from '@/lib/format';
import type { PuntoCliente, PuntoGeo, SeguimientoCliente } from '@/lib/types/api';
import { cn } from '@/lib/utils';
import { FichaViaje } from './FichaViaje';
import { esperaSiguiente, seguimientoTerminado, useSeguimientoCliente } from './useSeguimientoCliente';

/** Punto con coordenadas reales del backend (sin coordenadas, no se dibuja). */
function geo(p: PuntoCliente | null | undefined): PuntoGeo | null {
  return p && p.latitud != null && p.longitud != null ? { nombre: p.nombre ?? '', latitud: p.latitud, longitud: p.longitud } : null;
}

function Aviso({ tono, icono, children }: { tono: 'info' | 'warn' | 'danger'; icono: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex gap-2.5 rounded-md border px-3 py-2.5 text-[13px] text-text [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0',
        tono === 'info' && 'border-info/30 bg-info-soft [&>svg]:text-info',
        tono === 'warn' && 'border-warn/30 bg-warn-soft [&>svg]:text-warn',
        tono === 'danger' && 'border-danger/40 bg-danger-soft font-semibold [&>svg]:text-danger',
      )}
    >
      {icono}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Pedido dividido: no hay un mapa del pedido; cada parte tiene su propio seguimiento. */
function PartesDelPedido({ pedidoId }: { pedidoId: string }) {
  const p = usePartes(pedidoId);
  return (
    <Panel
      titulo={
        <span className="flex items-center gap-2">
          <Split className="size-4 text-primary" aria-hidden /> Partes de su pedido
        </span>
      }
      descripcion="Su pedido viaja en varias partes. Abra cada una para seguirla en el mapa."
      cuerpo="p-0"
    >
      {p.error ? (
        <ErrorState error={p.error} reintentar={() => p.refetch()} compacto />
      ) : !p.data ? (
        <LoadingState />
      ) : p.data.length === 0 ? (
        <EmptyState titulo="Todavía no hay partes" compacto />
      ) : (
        <ul className="divide-y divide-rule">
          {p.data.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-[13px]">
              <span className="w-16 shrink-0 font-semibold text-text-2">Parte {x.parte_numero ?? '—'}</span>
              <Codigo>{x.codigo_envio}</Codigo>
              <EstadoBadge def={estadoEnvio(x.estado)} />
              <Button size="sm" asChild className="ml-auto">
                <Link to={`/seguimiento/${x.id}`}>
                  <Navigation /> Ver seguimiento
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Estado de la actualización: cuándo llegó el último dato y si la última consulta falló. */
function LineaActualizacion({
  d,
  error,
  fallos,
  recibidoEn,
  detenido,
  reintentar,
}: {
  d: SeguimientoCliente;
  error: unknown;
  fallos: number;
  recibidoEn: number | null;
  detenido: boolean;
  reintentar: () => void;
}) {
  const marca = d.posicion.disponible ? d.posicion.actualizada_en : null;
  const espera = esperaSiguiente(d, fallos);
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-2">
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3.5" aria-hidden />
          Última actualización:{' '}
          <strong className="tabular font-semibold text-text">
            {marca ? horaLocalConSegundos(marca) : recibidoEn ? horaLocalConSegundos(new Date(recibidoEn).toISOString()) : '—'}
          </strong>
        </span>
        <span>
          {detenido || seguimientoTerminado(d)
            ? 'Seguimiento terminado: ya no se actualiza.'
            : `Se actualiza solo cada ${d.estado_viaje === 'en_curso' ? 5 : 10} s mientras esta pantalla esté visible.`}
        </span>
      </p>
      {error != null && (
        <Aviso tono="warn" icono={<AlertTriangle />}>
          <p className="font-semibold">No se pudo actualizar</p>
          <p className="text-text-2">
            {describirError(error)} Se muestra lo último recibido, que puede no estar al día.
            {espera !== null && ` Próximo intento en ${Math.round(espera / 1000)} s.`}
          </p>
          <Button size="sm" className="mt-2" onClick={reintentar}>
            <RefreshCw /> Reintentar ahora
          </Button>
        </Aviso>
      )}
    </div>
  );
}

/**
 * Seguimiento de UN envío para la cuenta de cliente: mapa con la ruta, la estela, el vehículo en la
 * posición que informa el backend, progreso y hora estimada. No muestra placa, conductor ni combustible.
 */
export default function SeguimientoClientePage() {
  const { id = '' } = useParams();
  const permitido = usePuede('seguimientoCliente');
  const s = useSeguimientoCliente(id, permitido);
  const d = s.data;
  const dividido = !!d?.es_pedido_dividido;
  const conViaje = !!d && d.estado_viaje !== 'sin_viaje' && !dividido;
  const t = useTrazadoCliente(id, !!d?.trazado_disponible && !dividido);
  const r = useRecorridoCliente(id, conViaje);

  // Estela: lo recorrido según el backend + las posiciones reales recibidas después (nunca estimadas)
  const estela = useMemo(() => {
    const base = (r.data ?? []).map((p) => ({ tiempo: p.tiempo, latitud: p.latitud, longitud: p.longitud }));
    const ultimo = base.length ? Date.parse(base[base.length - 1]!.tiempo) : -Infinity;
    const nuevos = s.nuevos.filter((n) => Date.parse(n.tiempo) > ultimo);
    return [...base, ...nuevos].map((p) => [p.latitud, p.longitud] as [number, number]);
  }, [r.data, s.nuevos]);

  if (!permitido) return <SinPermiso />;

  const volver = (
    <Button asChild>
      <Link to="/envios">
        <ArrowLeft /> Mis envíos
      </Link>
    </Button>
  );

  if (!d) {
    if (s.error instanceof ApiError && s.error.status === 404)
      return (
        <EmptyState titulo="Envío no encontrado" icono={<MapPinOff />} accion={volver}>
          Revise el enlace o elija el envío desde su lista.
        </EmptyState>
      );
    if (s.error instanceof ApiError && s.error.status === 403) return <SinPermiso />;
    if (s.error)
      return (
        <div className="mx-auto max-w-xl py-10" aria-live="polite">
          <Aviso tono="warn" icono={<AlertTriangle />}>
            <p className="font-semibold">No se pudo consultar el seguimiento</p>
            <p className="text-text-2">
              {describirError(s.error)} Si el sistema estaba dormido puede tardar cerca de un minuto. Reintentando con espera creciente
              {(() => {
                const ms = esperaSiguiente(null, s.fallos);
                return ms !== null ? ` (próximo intento en ${Math.round(ms / 1000)} s).` : '.';
              })()}
            </p>
            <Button size="sm" className="mt-2" onClick={s.reintentarAhora}>
              <RefreshCw /> Reintentar ahora
            </Button>
          </Aviso>
        </div>
      );
    return <LoadingState texto="Consultando su envío…" />;
  }

  const pos = d.posicion;
  const incidencia = d.estado_envio === 'con_incidencia';
  const sinPosicion = !pos.disponible && ['preparando', 'en_curso', 'pausada'].includes(d.estado_viaje);
  const origen = geo(t.data?.origen) ?? geo(d.origen);
  const destino = geo(t.data?.destino) ?? geo(d.destino);
  const hayAlgoQueDibujar = (t.data?.puntos.length ?? 0) > 1 || !!origen || !!destino || pos.disponible;

  return (
    <>
      <PageHeader
        migas={[{ etiqueta: 'Mis envíos', to: '/envios' }, { etiqueta: 'Seguimiento', to: '/seguimiento' }, { etiqueta: d.codigo_envio ?? 'Envío' }]}
        titulo={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-cond tracking-wide">{d.codigo_envio}</span>
            <EstadoBadge def={estadoEnvio(d.estado_envio)} />
          </span>
        }
        descripcion={`${d.origen?.nombre ?? '—'} hacia ${d.destino?.nombre ?? '—'}`}
        acciones={
          <Button asChild>
            <Link to={`/envios/${d.envio_id}`}>Detalle del envío</Link>
          </Button>
        }
      />

      <div className="space-y-4" aria-live="polite">
        <Aviso tono={incidencia ? 'danger' : 'info'} icono={incidencia ? <AlertTriangle /> : <Info />}>
          <span className="flex flex-wrap items-center gap-2">
            <EstadoBadge def={estadoViaje(d.estado_viaje)} />
            <span>{d.mensaje}</span>
          </span>
        </Aviso>
        <LineaActualizacion d={d} error={s.error} fallos={s.fallos} recibidoEn={s.recibidoEn} detenido={s.detenido} reintentar={s.reintentarAhora} />
        {pos.desactualizada && (
          <Aviso tono="warn" icono={<AlertTriangle />}>
            <strong>Ubicación desactualizada ({haceSegundos(pos.segundos_desde_actualizacion)}).</strong>{' '}
            <span className="text-text-2">El vehículo se muestra en la última posición recibida; no se estima dónde está ahora.</span>
          </Aviso>
        )}
        {sinPosicion && (
          <Aviso tono="info" icono={<MapPinOff />}>
            Todavía no hay ubicación disponible.
          </Aviso>
        )}
        {d.viaja_compartido && (
          <Aviso tono="info" icono={<Users />}>
            Su envío comparte vehículo con otras cargas. La ruta y el avance que ve son solo los de su tramo.
          </Aviso>
        )}
      </div>

      <div className="mt-5 space-y-5">
        {dividido ? (
          <PartesDelPedido pedidoId={d.envio_id} />
        ) : conViaje && hayAlgoQueDibujar ? (
          <Panel titulo="Mapa de su envío" cuerpo="p-0" className="overflow-hidden">
            <MapaViaje
              etiqueta={`Mapa del envío ${d.codigo_envio ?? ''}`}
              clave={d.envio_id}
              className="relative h-[300px] sm:h-[420px]"
              puntos={t.data?.puntos ?? []}
              paradas={d.viaja_compartido ? [] : (t.data?.paradas ?? d.paradas)}
              origen={origen}
              destino={destino}
              recorrido={estela}
              posicion={pos.disponible ? { latitud: pos.latitud, longitud: pos.longitud } : null}
              pausado={d.estado_viaje === 'pausada'}
              desactualizada={pos.desactualizada}
            />
            <div className="border-t border-rule p-4">
              <FichaViaje s={d} paraCliente />
              <p className="mt-3 text-xs text-text-3">
                La ubicación la informa el simulador de seguimiento de LogiTrack (no es un GPS real). La línea verde es lo que ya recorrió con su
                carga.
              </p>
            </div>
          </Panel>
        ) : (
          d.estado_viaje === 'sin_viaje' && (
            <Panel titulo="Mapa de su envío">
              <EmptyState titulo="Aún no hay un viaje que mostrar" icono={<Navigation />} compacto>
                {seguimientoTerminado(d)
                  ? 'Este envío ya no tendrá seguimiento en el mapa.'
                  : 'El mapa aparecerá aquí cuando el vehículo salga. Esta pantalla se actualiza sola.'}
              </EmptyState>
            </Panel>
          )
        )}
      </div>
    </>
  );
}
