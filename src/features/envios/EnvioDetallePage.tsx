import type { LatLngBoundsExpression } from 'leaflet';
import { ExternalLink, FileCheck2, Receipt, Route as RouteIcon, Timer } from 'lucide-react';
import { Marker } from 'react-leaflet';
import { Link, useParams } from 'react-router';
import { AjustarVista, BaseMap } from '@/components/map/BaseMap';
import { CapaRuta } from '@/components/map/CapaRuta';
import { iconoVehiculo } from '@/components/map/iconos';
import { Badge, EstadoBadge } from '@/components/shared/Badge';
import { Codigo, KeyValue, PageHeader, Panel } from '@/components/shared/Layout';
import { Plate } from '@/components/shared/Plate';
import { EmptyState, ErrorState, Limitacion, LoadingState } from '@/components/shared/States';
import { Timeline } from '@/components/shared/Timeline';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import {
  es404,
  useCliente,
  useCostosRuta,
  useDeclaracionEnvio,
  useEnvio,
  useEnvioEventos,
  useGeometria,
  usePruebaEntrega,
  useRecorrido,
  useReserva,
  useRutaMaestra,
  useRutas,
  useSeguimientoEnvio,
  useSimulacionEventos,
  useTrazado,
} from '@/hooks/queries';
import { ApiError } from '@/lib/api/errors';
import { estadoDeclaracion, estadoEnvio, estadoRuta, ESTADOS_FINALES_ENVIO, humanizar, tipoVehiculo } from '@/lib/dominio';
import { fechaHora, hora, horas, numero, pesos, relativo } from '@/lib/format';
import type { Envio } from '@/lib/types/api';
import { FichaViaje } from '../seguimiento/FichaViaje';
import { AccionesEnvio } from './AccionesEnvio';
import { EtiquetasCarga } from './EnviosPage';
import { Documentos } from '../aduanas/Documentos';

const TONO_EVENTO: Record<string, 'primary' | 'ok' | 'warn' | 'danger' | 'neutral'> = {
  creado: 'neutral',
  asignado: 'primary',
  sin_asignacion: 'warn',
  en_transito: 'primary',
  retenido_aduana: 'danger',
  liberado_aduana: 'ok',
  con_incidencia: 'danger',
  entregado: 'ok',
  devuelto: 'neutral',
};

function intervalo(estado?: string) {
  if (!estado) return false;
  if (estado === 'pendiente') return 2000; // contrato 5.1: consultar cada 2 s mientras está pendiente
  if (ESTADOS_FINALES_ENVIO.includes(estado)) return false;
  return 5000;
}

function MapaEnvio({ envio }: { envio: Envio }) {
  const viajeActivo = !ESTADOS_FINALES_ENVIO.includes(envio.estado);
  const s = useSeguimientoEnvio(envio.id);
  const t = useTrazado(s.data ? envio.id : null);
  const r = useRecorrido(s.data ? envio.id : null, viajeActivo);
  const rm = useRutaMaestra(envio.ruta_maestra_id);
  // Sin viaje todavía: se dibuja el trazado planificado de la ruta maestra (dato real de Routing).
  const g = useGeometria(!t.data && envio.ruta_maestra_id ? envio.ruta_maestra_id : null);

  const puntos = t.data?.puntos ?? g.data?.puntos ?? [];
  const pos = s.data?.posicion;
  const limites: LatLngBoundsExpression | null = puntos.length > 1 ? (puntos.map((p) => [p[0]!, p[1]!]) as [number, number][]) : null;

  const sinViaje = s.error instanceof ApiError && (s.error.status === 404 || s.error.status === 409);

  return (
    <Panel
      titulo="Ruta y posición"
      descripcion={
        s.data
          ? `Viaje ${s.data.estado_viaje === 'en_curso' ? 'en curso' : s.data.estado_viaje}; posición cada 4 s`
          : g.data
            ? 'Trazado planificado de la ruta maestra; el viaje aún no empieza'
            : 'Sin trazado disponible'
      }
      cuerpo="p-0"
      className="overflow-hidden"
    >
      <div className="relative h-[360px]">
        <BaseMap className="size-full" etiqueta={`Mapa del envío ${envio.codigo_envio}`}>
          <AjustarVista limites={limites} clave={`${envio.id}-${puntos.length > 1}`} maxZoom={10} />
          {puntos.length > 1 && (
            <CapaRuta
              puntos={puntos}
              paradas={t.data?.paradas ?? rm.data?.paradas ?? []}
              origen={t.data?.origen ?? (rm.data ? { nombre: rm.data.origen.nombre, latitud: rm.data.origen.latitud, longitud: rm.data.origen.longitud } : null)}
              destino={t.data?.destino ?? (rm.data ? { nombre: rm.data.destino.nombre, latitud: rm.data.destino.latitud, longitud: rm.data.destino.longitud } : null)}
              estimada={rm.data?.estimada}
              recorrido={(r.data ?? []).map((p) => [p.latitud, p.longitud] as [number, number])}
            />
          )}
          {pos?.latitud != null && pos.longitud != null && (
            <Marker
              position={[pos.latitud, pos.longitud]}
              icon={iconoVehiculo({
                color: s.data?.estado_viaje === 'pausada' ? 'var(--danger)' : 'var(--primary)',
                placa: s.data?.vehiculo.placa ?? envio.placa_vehiculo ?? '',
                historica: false,
                seleccionado: true,
                pausado: s.data?.estado_viaje === 'pausada',
              })}
              title={`Vehículo ${s.data?.vehiculo.placa ?? ''}`}
            />
          )}
        </BaseMap>
      </div>
      {rm.data?.estimada && (
        <div className="border-t border-rule p-3">
          <Limitacion titulo="Trazado estimado">
            Esta ruta se calculó sin el servicio de mapas (OSRM): la línea punteada no sigue la carretera. Puede recalcularla desde{' '}
            <Link className="font-semibold text-primary hover:underline" to={`/rutas/maestras/${envio.ruta_maestra_id}`}>
              la ruta maestra
            </Link>
            .
          </Limitacion>
        </div>
      )}
      <div className="border-t border-rule p-4">
        {s.data ? (
          <FichaViaje s={s.data} />
        ) : s.isLoading ? (
          <LoadingState texto="Consultando el viaje…" />
        ) : sinViaje ? (
          <p className="flex items-center gap-2 text-[13px] text-text-2">
            <Timer className="size-4" />
            {envio.estado === 'devuelto'
              ? 'El envío fue devuelto antes de iniciar el viaje.'
              : 'Todavía no hay viaje: el envío está esperando vehículo o el viaje se está preparando.'}
          </p>
        ) : (
          s.error && <ErrorState error={s.error} reintentar={() => s.refetch()} compacto />
        )}
      </div>
    </Panel>
  );
}

function Bitacora({ envioId, estado }: { envioId: string; estado: string }) {
  const ev = useEnvioEventos(envioId, { refetchInterval: intervalo(estado) });
  if (ev.error) return <ErrorState error={ev.error} reintentar={() => ev.refetch()} compacto />;
  if (ev.isLoading) return <LoadingState />;
  if (!ev.data?.length) return <EmptyState titulo="Sin eventos" compacto />;
  return (
    <Timeline
      items={ev.data.map((e) => ({
        clave: e.id,
        titulo: humanizar(e.tipo_evento),
        cuando: fechaHora(e.fecha_hora),
        detalle: e.notas,
        tono: TONO_EVENTO[e.tipo_evento] ?? 'neutral',
      }))}
    />
  );
}

function EventosViaje({ envioId }: { envioId: string }) {
  const ev = useSimulacionEventos(envioId, { refetchInterval: 10000 });
  if (ev.error && es404(ev.error)) return <EmptyState titulo="Este envío no tiene viaje simulado" compacto />;
  if (ev.error) return <ErrorState error={ev.error} reintentar={() => ev.refetch()} compacto />;
  if (ev.isLoading) return <LoadingState />;
  if (!ev.data?.length) return <EmptyState titulo="El viaje aún no registra eventos" compacto />;
  return (
    <Timeline
      items={ev.data.map((e, i) => ({
        clave: `${e.tiempo}-${i}`,
        titulo: humanizar(e.tipo),
        cuando: hora(e.tiempo),
        detalle: [e.descripcion, e.km != null ? `km ${numero(e.km, 1)}` : null, e.combustible_pct != null ? `combustible ${numero(e.combustible_pct)} %` : null]
          .filter(Boolean)
          .join(', '),
        tono: e.tipo.includes('aduana') ? 'danger' : e.tipo === 'llegada' ? 'ok' : e.tipo.includes('recarga') ? 'warn' : 'primary',
      }))}
    />
  );
}

function Asignacion({ envio }: { envio: Envio }) {
  const reserva = useReserva(envio.id);
  const rutas = useRutas({ envio_id: envio.id });
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-semibold text-text-2">Reserva de flota</p>
        {reserva.error && es404(reserva.error) ? (
          <p className="text-[13px] text-text-2">Este envío todavía no tiene reserva de vehículo.</p>
        ) : reserva.error ? (
          <ErrorState error={reserva.error} compacto reintentar={() => reserva.refetch()} />
        ) : reserva.data ? (
          <KeyValue
            items={[
              { k: 'Vehículo', v: <Plate placa={reserva.data.vehiculo.placa} vehiculoId={reserva.data.vehiculo.id} /> },
              {
                k: 'Conductor',
                v: (
                  <Link className="text-primary hover:underline" to={`/flota/conductores/${reserva.data.conductor.id}`}>
                    {reserva.data.conductor.nombre}
                  </Link>
                ),
              },
              { k: 'Estado de la reserva', v: <Badge tono={reserva.data.estado === 'reservada' ? 'primary' : 'muted'}>{reserva.data.estado === 'reservada' ? 'Vigente' : 'Liberada'}</Badge> },
              { k: 'Reservada', v: fechaHora(reserva.data.creado_en) },
              { k: 'Liberada', v: fechaHora(reserva.data.liberado_en) },
            ]}
          />
        ) : (
          <LoadingState />
        )}
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold text-text-2">Rutas de asignación (Routing)</p>
        {rutas.error ? (
          <ErrorState error={rutas.error} compacto reintentar={() => rutas.refetch()} />
        ) : !rutas.data ? (
          <LoadingState />
        ) : rutas.data.length === 0 ? (
          <p className="text-[13px] text-text-2">Routing no registra una solicitud de asignación para este envío.</p>
        ) : (
          <ul className="divide-y divide-rule rounded-md border border-rule">
            {rutas.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[13px]">
                <span className="flex items-center gap-2">
                  <EstadoBadge def={estadoRuta(r.estado)} />
                  <span className="text-text-2">
                    {r.intentos} intento(s), recalculada {r.veces_recalculada} vez(ces)
                  </span>
                </span>
                <Link to={`/rutas/${r.id}`} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                  Ver ruta <ExternalLink className="size-3.5" />
                </Link>
                {r.ultimo_error && <p className="w-full text-xs text-warn">{r.ultimo_error}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Aduana({ envioId }: { envioId: string }) {
  const d = useDeclaracionEnvio(envioId, { refetchInterval: 15000 });
  if (d.error && es404(d.error)) return <EmptyState titulo="Sin declaración aduanera" compacto>Aduanas la genera unos segundos después de crear un envío internacional.</EmptyState>;
  if (d.error) return <ErrorState error={d.error} compacto reintentar={() => d.refetch()} />;
  if (!d.data) return <LoadingState />;
  return (
    <div className="space-y-4">
      <KeyValue
        items={[
          { k: 'Estado', v: <EstadoBadge def={estadoDeclaracion(d.data.estado)} /> },
          { k: 'Países', v: `${d.data.pais_origen} a ${d.data.pais_destino}` },
          { k: 'Motivo de retención', v: d.data.motivo_retencion ?? '—', ancho: true },
          { k: 'Actualizada', v: fechaHora(d.data.actualizado_en) },
        ]}
      />
      <Documentos documentos={d.data.documentos} />
      <Link to={`/aduanas?sel=${d.data.id}`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline">
        <FileCheck2 className="size-4" /> Gestionar en Aduanas
      </Link>
    </div>
  );
}

function Costos({ envioId }: { envioId: string }) {
  const c = useCostosRuta({ envio_id: envioId });
  if (c.error) return <ErrorState error={c.error} compacto reintentar={() => c.refetch()} />;
  if (!c.data) return <LoadingState />;
  if (!c.data.length)
    return (
      <EmptyState titulo="Sin costo calculado" compacto>
        Facturación calcula el costo cuando el envío se entrega.
      </EmptyState>
    );
  return (
    <div className="space-y-3">
      {c.data.map((x) => (
        <KeyValue
          key={x.id}
          columnas={3}
          items={[
            { k: 'Costo total', v: <strong className="font-cond text-lg">{pesos(x.costo_total)}</strong> },
            { k: 'Combustible', v: pesos(x.costo_combustible) },
            { k: 'Peajes', v: pesos(x.costo_peajes) },
            { k: 'Distancia', v: `${numero(x.distancia_km, 1)} km` },
            { k: 'Horas de conductor', v: numero(x.horas_conductor, 2) },
            { k: 'Calculado', v: fechaHora(x.creado_en) },
          ]}
        />
      ))}
      <p className="text-xs text-text-3">Costos simulados por el servicio de facturación.</p>
    </div>
  );
}

function PruebaEntrega({ envio }: { envio: Envio }) {
  const p = usePruebaEntrega(envio.id, { refetchInterval: envio.estado === 'entregado' ? false : 15000 });
  if (p.error && es404(p.error)) return <EmptyState titulo="Aún no hay prueba de entrega" compacto>Se registra sola al llegar el vehículo, o a mano con «Registrar entrega».</EmptyState>;
  if (p.error) return <ErrorState error={p.error} compacto reintentar={() => p.refetch()} />;
  if (!p.data) return <LoadingState />;
  return (
    <div className="space-y-3">
      {p.data.simulada && <Badge tono="info">Entrega simulada automática</Badge>}
      <KeyValue
        items={[
          { k: 'Recibió', v: p.data.nombre_receptor },
          { k: 'Entregado', v: fechaHora(p.data.entregado_en) },
          { k: 'Firma', v: p.data.url_firma ? <a className="text-primary hover:underline" href={p.data.url_firma} target="_blank" rel="noreferrer">Abrir enlace</a> : 'Sin firma' },
          { k: 'Foto', v: p.data.url_foto ? <a className="text-primary hover:underline" href={p.data.url_foto} target="_blank" rel="noreferrer">Abrir enlace</a> : 'Sin foto' },
        ]}
      />
    </div>
  );
}

export default function EnvioDetallePage() {
  const { id = '' } = useParams();
  const q = useEnvio(id, { refetchInterval: (qq) => intervalo(qq.state.data?.estado) });
  const cliente = useCliente(q.data?.cliente_id);

  if (q.error) return <ErrorState error={q.error} reintentar={() => q.refetch()} />;
  if (!q.data) return <LoadingState />;
  const e = q.data;

  return (
    <>
      <PageHeader
        migas={[{ etiqueta: 'Envíos', to: '/envios' }, { etiqueta: e.codigo_envio }]}
        titulo={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-cond tracking-wide">{e.codigo_envio}</span>
            <EstadoBadge def={estadoEnvio(e.estado)} />
          </span>
        }
        descripcion={`${e.origen} hacia ${e.destino}`}
        acciones={<AccionesEnvio envio={e} />}
      />

      {e.estado === 'pendiente' && (
        <Limitacion titulo="Asignación en proceso" className="mb-5 border-info/30 bg-info-soft">
          El sistema está reservando vehículo y conductor. Esta ficha se actualiza cada 2 segundos.
        </Limitacion>
      )}
      {e.estado === 'sin_asignacion' && (
        <Limitacion titulo="Esperando vehículo" className="mb-5">
          {e.motivo_sin_asignacion ?? 'No hay un vehículo con conductor libre que pueda llevar la carga.'} El sistema reintenta solo (cada 30 s, luego con espera creciente
          hasta 10 min) y lo asigna apenas se libere uno.
        </Limitacion>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <div className="min-w-0 space-y-5">
          <MapaEnvio envio={e} />
          <Panel cuerpo="p-0">
            <Tabs defaultValue="bitacora">
              <TabsList className="px-3">
                <TabsTrigger value="bitacora">Bitácora</TabsTrigger>
                <TabsTrigger value="viaje">Eventos del viaje</TabsTrigger>
                <TabsTrigger value="asignacion">Asignación</TabsTrigger>
                {e.es_internacional && <TabsTrigger value="aduana">Aduana</TabsTrigger>}
                <TabsTrigger value="costos">Costos</TabsTrigger>
                <TabsTrigger value="entrega">Prueba de entrega</TabsTrigger>
              </TabsList>
              <div className="px-4 pb-4">
                <TabsContent value="bitacora">
                  <Bitacora envioId={e.id} estado={e.estado} />
                </TabsContent>
                <TabsContent value="viaje">
                  <EventosViaje envioId={e.id} />
                </TabsContent>
                <TabsContent value="asignacion">
                  <Asignacion envio={e} />
                </TabsContent>
                {e.es_internacional && (
                  <TabsContent value="aduana">
                    <Aduana envioId={e.id} />
                  </TabsContent>
                )}
                <TabsContent value="costos">
                  <Costos envioId={e.id} />
                </TabsContent>
                <TabsContent value="entrega">
                  <PruebaEntrega envio={e} />
                </TabsContent>
              </div>
            </Tabs>
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel titulo="Datos del envío">
            <KeyValue
              items={[
                {
                  k: 'Cliente',
                  v: (
                    <Link to={`/clientes/${e.cliente_id}`} className="text-primary hover:underline">
                      {cliente.data?.nombre ?? e.codigo_cliente ?? 'Ver cliente'}
                    </Link>
                  ),
                  ancho: true,
                },
                { k: 'Peso', v: `${numero(e.peso_kg, 2)} kg` },
                { k: 'Volumen', v: e.volumen_m3 != null ? `${numero(e.volumen_m3, 2)} m³` : '—' },
                { k: 'Carga', v: e.tipo_carga === 'refrigerada' || e.es_hazmat || e.es_internacional ? <EtiquetasCarga e={e} /> : 'General, nacional', ancho: true },
                { k: 'Fecha límite (SLA)', v: fechaHora(e.fecha_limite_sla, 'Sin fecha límite') },
                { k: 'Llegada estimada', v: fechaHora(e.hora_estimada_llegada) },
                { k: 'Creado', v: `${fechaHora(e.creado_en)} (${relativo(e.creado_en)})`, ancho: true },
                { k: 'Actualizado', v: fechaHora(e.actualizado_en) },
              ]}
            />
          </Panel>
          <Panel titulo="Vehículo y conductor">
            {e.vehiculo_id ? (
              <KeyValue
                items={[
                  { k: 'Vehículo', v: <Plate placa={e.placa_vehiculo} vehiculoId={e.vehiculo_id} /> },
                  { k: 'Tipo', v: tipoVehiculo(e.tipo_vehiculo) },
                  {
                    k: 'Conductor',
                    v: e.conductor_id ? (
                      <Link to={`/flota/conductores/${e.conductor_id}`} className="text-primary hover:underline">
                        {e.conductor_nombre}
                      </Link>
                    ) : (
                      '—'
                    ),
                  },
                  { k: 'Código de conductor', v: e.codigo_conductor ?? '—' },
                ]}
              />
            ) : (
              <p className="text-[13px] text-text-2">Sin vehículo asignado todavía.</p>
            )}
          </Panel>
          <Panel
            titulo="Ruta"
            acciones={
              e.ruta_maestra_id && (
                <Link to={`/rutas/maestras/${e.ruta_maestra_id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  <RouteIcon className="size-3.5" /> Ruta maestra
                </Link>
              )
            }
          >
            <KeyValue
              items={[
                { k: 'Ruta maestra', v: e.codigo_ruta ? <Codigo to={e.ruta_maestra_id ? `/rutas/maestras/${e.ruta_maestra_id}` : undefined}>{e.codigo_ruta}</Codigo> : '—' },
                { k: 'Distancia', v: e.distancia_km != null ? `${numero(e.distancia_km, 1)} km` : '—' },
                { k: 'Duración real estimada', v: horas(e.duracion_horas) },
                { k: 'Ruta de asignación', v: e.ruta_id ? <Link className="text-primary hover:underline" to={`/rutas/${e.ruta_id}`}>Ver detalle</Link> : '—' },
                { k: 'Países', v: `${e.codigo_pais_origen ?? '—'} a ${e.codigo_pais_destino ?? '—'}` },
              ]}
            />
          </Panel>
          {e.estado === 'entregado' && (
            <Link to={`/facturacion?tab=costos&envio=${e.id}`} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline">
              <Receipt className="size-4" /> Ver en facturación
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
