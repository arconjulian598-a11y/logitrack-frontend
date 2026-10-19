import { usePuede } from '@/app/auth';
import { ApiError } from '@/lib/api/errors';
import type { LatLngBoundsExpression } from 'leaflet';
import { AlertOctagon, ArrowUpRight, FileWarning, Map as MapIcon, PackagePlus, RotateCw, Timer, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import { Marker, Tooltip as LTooltip } from 'react-leaflet';
import { Link, useNavigate } from 'react-router';
import { AjustarVista, BaseMap } from '@/components/map/BaseMap';
import { iconoVehiculo } from '@/components/map/iconos';
import { EstadoBadge } from '@/components/shared/Badge';
import { Cifra, Codigo, PageHeader, Panel } from '@/components/shared/Layout';
import { Plate } from '@/components/shared/Plate';
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import {
  useActividadReciente,
  useDeclaraciones,
  useEnvios,
  useProyeccionMantenimiento,
  useResumen,
  useSeguimientoFlota,
  useVehiculos,
} from '@/hooks/queries';
import { useAccion } from '@/hooks/useAccion';
import * as api from '@/lib/api/endpoints';
import { diasRestantes, estadoEnvio, humanizar, urgencia } from '@/lib/dominio';
import { fechaHora, hora, numero, pesos, porcentaje, relativo } from '@/lib/format';
import type { Envio } from '@/lib/types/api';
import { BarraProgreso } from '../seguimiento/FichaViaje';

function MiniMapa() {
  const flota = useSeguimientoFlota();
  const navigate = useNavigate();
  const puntos = (flota.data ?? []).filter((f) => f.latitud !== null && f.longitud !== null);
  const limites: LatLngBoundsExpression | null = puntos.length
    ? (puntos.map((p) => [p.latitud!, p.longitud!]) as [number, number][])
    : null;
  return (
    <Panel
      titulo="Viajes en curso"
      descripcion={flota.data ? `${puntos.length} vehículo(s) con posición en vivo` : 'Posiciones del seguimiento'}
      acciones={
        <Button size="sm" asChild>
          <Link to="/mapa">
            <MapIcon /> Abrir mapa
          </Link>
        </Button>
      }
      cuerpo="p-0"
      className="overflow-hidden"
    >
      <div className="relative h-[340px]">
        <BaseMap className="size-full" etiqueta="Mapa de viajes en curso">
          <AjustarVista limites={limites} clave={String(puntos.length)} maxZoom={8} />
          {puntos.map((p) => (
            <Marker
              key={p.vehiculo_id}
              position={[p.latitud!, p.longitud!]}
              icon={iconoVehiculo({
                color: p.estado === 'pausada' ? 'var(--danger)' : 'var(--primary)',
                placa: p.placa ?? '',
                historica: false,
                seleccionado: false,
                pausado: p.estado === 'pausada',
              })}
              title={`${p.placa ?? ''} ${p.codigo_envio ?? ''}`}
              eventHandlers={{ click: () => navigate(`/mapa?v=${p.vehiculo_id}`) }}
            >
              <LTooltip direction="top" offset={[0, -14]}>
                {p.codigo_envio}: {numero(p.progreso_pct, 0)} %
              </LTooltip>
            </Marker>
          ))}
        </BaseMap>
        {flota.error && (
          <div className="absolute inset-0 z-[700] grid place-items-center bg-surface/80">
            <ErrorState error={flota.error} reintentar={() => flota.refetch()} compacto />
          </div>
        )}
        {flota.data && puntos.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-[700] flex justify-center">
            <p className="rounded-md border border-rule bg-surface px-3 py-1.5 text-xs text-text-2 shadow-sm">
              Ningún vehículo está en viaje ahora.
            </p>
          </div>
        )}
      </div>
    </Panel>
  );
}

interface Alerta {
  clave: string;
  icono: ReactNode;
  titulo: ReactNode;
  detalle?: ReactNode;
  to: string;
  accion?: ReactNode;
}

function BotonReintentar({ envio }: { envio: Envio }) {
  const a = useAccion({
    fn: () => api.envios.reintentarAsignacion(envio.id),
    exito: (r) => `Reintento enviado: ruta ${r.estado_asignacion ?? 'sin cambio'}`,
    invalida: [['envios']],
  });
  return (
    <Button size="sm" variant="ghost" onClick={() => a.mutate()} cargando={a.isPending} aria-label={`Reintentar asignación de ${envio.codigo_envio}`}>
      <RotateCw /> Reintentar
    </Button>
  );
}

function NecesitaAtencion() {
  const envios = useEnvios();
  const decl = useDeclaraciones();
  const proy = useProyeccionMantenimiento({ dias: 30 });
  const vehiculos = useVehiculos();

  const alertas: Alerta[] = [];
  for (const e of envios.data ?? []) {
    if (e.estado === 'sin_asignacion')
      alertas.push({
        clave: e.id,
        icono: <Timer className="text-warn" />,
        titulo: (
          <>
            <Codigo>{e.codigo_envio}</Codigo> espera vehículo
          </>
        ),
        detalle: e.motivo_sin_asignacion ?? 'Sin vehículo libre compatible; el sistema reintenta solo.',
        to: `/envios/${e.id}`,
        accion: <BotonReintentar envio={e} />,
      });
    if (e.estado === 'con_incidencia' || e.estado === 'retenido_aduana')
      alertas.push({
        clave: e.id,
        icono: <AlertOctagon className="text-danger" />,
        titulo: (
          <>
            <Codigo>{e.codigo_envio}</Codigo> {estadoEnvio(e.estado).etiqueta.toLowerCase()}
          </>
        ),
        detalle: `${e.origen} hacia ${e.destino}`,
        to: `/envios/${e.id}`,
      });
  }
  for (const d of decl.data ?? []) {
    if (d.estado !== 'aprobado')
      alertas.push({
        clave: d.id,
        icono: <FileWarning className="text-danger" />,
        titulo: `Declaración ${d.estado === 'retenido' ? 'retenida' : 'pendiente'}: ${d.pais_origen} a ${d.pais_destino}`,
        detalle: d.motivo_retencion ?? 'Documentación por revisar',
        to: `/aduanas?sel=${d.id}`,
      });
  }
  for (const p of proy.data ?? []) {
    if (p.urgencia === 'vencido' || p.urgencia === 'critico')
      alertas.push({
        clave: `${p.vehiculo_id}-${p.tipo_mantenimiento}`,
        icono: <Wrench className="text-warn" />,
        titulo: (
          <span className="inline-flex items-center gap-1.5">
            <Plate placa={p.placa_vehiculo} tamano="sm" /> {humanizar(p.tipo_mantenimiento)}
          </span>
        ),
        detalle: `${urgencia(p.urgencia).etiqueta}, ${diasRestantes(p.dias_restantes)}`,
        to: `/mantenimiento?vehiculo=${p.vehiculo_id}`,
      });
  }
  for (const v of vehiculos.data ?? []) {
    if (v.estado === 'en_mantenimiento')
      alertas.push({
        clave: `m-${v.id}`,
        icono: <Wrench className="text-warn" />,
        titulo: (
          <span className="inline-flex items-center gap-1.5">
            <Plate placa={v.placa} tamano="sm" /> en mantenimiento
          </span>
        ),
        detalle: 'No recibe envíos hasta registrar la intervención.',
        to: `/flota/vehiculos/${v.id}`,
      });
  }

  const cargando = envios.isLoading || decl.isLoading;
  // Lo que el rol no puede ver (403) no cuenta como fuente caída
  const errores = [envios.error, decl.error, proy.error, vehiculos.error].filter((e) => e && !(e instanceof ApiError && e.sinPermiso));

  return (
    <Panel titulo="Necesita atención" descripcion="Envíos detenidos, aduanas y mantenimiento" cuerpo="p-0" className="flex flex-col">
      {cargando ? (
        <LoadingState />
      ) : alertas.length === 0 && errores.length === 0 ? (
        <EmptyState titulo="Todo en orden" compacto>
          No hay envíos esperando vehículo, retenciones ni mantenimientos vencidos.
        </EmptyState>
      ) : (
        <ul className="scrollbar-thin max-h-[340px] divide-y divide-rule overflow-y-auto">
          {alertas.map((a) => (
            <li key={a.clave} className="flex items-start gap-3 px-4 py-2.5 [&>svg]:mt-0.5">
              <span className="mt-0.5 [&_svg]:size-4">{a.icono}</span>
              <Link to={a.to} className="min-w-0 flex-1 hover:underline">
                <span className="block text-[13px] font-semibold text-text">{a.titulo}</span>
                {a.detalle && <span className="block truncate text-xs text-text-2">{a.detalle}</span>}
              </Link>
              {a.accion}
            </li>
          ))}
        </ul>
      )}
      {errores.length > 0 && (
        <p className="border-t border-rule px-4 py-2 text-xs text-danger">
          {errores.length} fuente(s) no respondieron; la lista puede estar incompleta.
        </p>
      )}
    </Panel>
  );
}

function Cifras() {
  const envios = useEnvios();
  const vehiculos = useVehiculos();
  const admin = usePuede('dashboard');
  const resumen = useResumen({ enabled: admin });
  const lista = envios.data ?? [];
  const c = (e: string) => lista.filter((x) => x.estado === e).length;
  const libres = (vehiculos.data ?? []).filter((v) => v.estado === 'active').length;
  const r = resumen.data;
  return (
    <Panel cuerpo="px-3 py-3">
      <div className="grid grid-cols-2 gap-x-2 gap-y-4 md:grid-cols-3 xl:grid-cols-6">
        {envios.isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)
        ) : (
          <>
            <Cifra valor={c('en_transito')} etiqueta="En tránsito" detalle="envíos ahora" tono="primary" to="/envios?estado=en_transito" />
            <Cifra
              valor={c('sin_asignacion') + c('pendiente')}
              etiqueta="Esperando vehículo"
              detalle="pendientes o sin asignación"
              tono={c('sin_asignacion') ? 'warn' : undefined}
              to="/envios?estado=sin_asignacion"
            />
            <Cifra
              valor={c('retenido_aduana') + c('con_incidencia')}
              etiqueta="Detenidos"
              detalle="aduana o incidencia"
              tono={c('retenido_aduana') + c('con_incidencia') ? 'danger' : undefined}
              to="/envios?estado=retenido_aduana"
            />
            <Cifra valor={`${libres}/${vehiculos.data?.length ?? 0}`} etiqueta="Flota disponible" detalle="vehículos libres" to="/flota/vehiculos" />
            {admin ? (
              <>
                <Cifra
                  valor={r?.tasa_cumplimiento_sla_global_pct != null ? porcentaje(r.tasa_cumplimiento_sla_global_pct, 1) : '—'}
                  etiqueta="Cumplimiento de SLA"
                  detalle={r?.ultima_actualizacion_etl ? `analítica, ${relativo(r.ultima_actualizacion_etl)}` : 'sin datos de analítica'}
                  to="/analitica"
                />
                <Cifra
                  valor={r?.ingresos_mes_actual_cop != null ? pesos(r.ingresos_mes_actual_cop) : '—'}
                  etiqueta="Ingresos del mes"
                  detalle="netos, según la última ETL"
                  to="/analitica"
                />
              </>
            ) : (
              <>
                <Cifra valor={c('programado')} etiqueta="Programados" detalle="salen en una fecha futura" to="/calendario" />
                <Cifra valor={c('entregado')} etiqueta="Entregados" detalle="histórico" tono="ok" to="/envios?estado=entregado" />
              </>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}

function TablaViajes() {
  const flota = useSeguimientoFlota();
  const navigate = useNavigate();
  const puedeCrear = usePuede('crearEnvio');
  if (flota.error) return <ErrorState error={flota.error} reintentar={() => flota.refetch()} compacto />;
  if (flota.isLoading) return <LoadingState />;
  const filas = flota.data ?? [];
  if (!filas.length)
    return (
      <EmptyState
        titulo="No hay viajes en curso"
        compacto
        accion={
          puedeCrear && (
            <Button size="sm" variant="primary" asChild>
              <Link to="/envios/nuevo">
                <PackagePlus /> Crear envío
              </Link>
            </Button>
          )
        }
      />
    );
  return (
    <ul className="divide-y divide-rule">
      {filas.map((f) => (
        <li key={f.envio_id}>
          <button
            type="button"
            onClick={() => navigate(`/envios/${f.envio_id}`)}
            className="grid w-full cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-surface-2"
          >
            <Plate placa={f.placa} tamano="sm" />
            <span className="min-w-0 truncate text-[13px]">
              <Codigo>{f.codigo_envio}</Codigo> <span className="text-text-2">{f.origen?.split(',')[0]} a {f.destino?.split(',')[0]}</span>
            </span>
            <span className="tabular text-xs text-text-2">ETA {hora(f.hora_estimada_llegada)}</span>
            <span className="col-span-3 flex items-center gap-2">
              <BarraProgreso valor={f.progreso_pct} tono={f.estado === 'pausada' ? 'danger' : 'primary'} />
              <span className="tabular w-10 text-right text-[11px] text-text-3">{numero(f.progreso_pct, 0)} %</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Actividad() {
  const a = useActividadReciente(12);
  if (a.error) return <ErrorState error={a.error} reintentar={() => a.refetch()} compacto />;
  if (a.isLoading) return <LoadingState />;
  if (!a.data?.length) return <EmptyState titulo="Sin actividad registrada" compacto>La analítica aún no ha recibido eventos.</EmptyState>;
  return (
    <ol className="divide-y divide-rule">
      {a.data.map((x, i) => (
        <li key={i} className="flex gap-3 px-4 py-2.5">
          <span className="tabular w-12 shrink-0 pt-0.5 text-xs text-text-3">{hora(x.ocurrido_en).slice(0, 5)}</span>
          <div className="min-w-0">
            <p className="text-[13px] text-text">{x.mensaje}</p>
            <p className="text-xs text-text-3">
              {humanizar(x.tipo_evento)}
              {x.envio_id && (
                <>
                  {', '}
                  <Link to={`/envios/${x.envio_id}`} className="text-primary hover:underline">
                    ver envío
                  </Link>
                </>
              )}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function PanelPage() {
  const ahora = new Date().toISOString();
  const puedeCrear = usePuede('crearEnvio');
  const verActividad = usePuede('dashboard');
  return (
    <>
      <PageHeader
        titulo="Panel de operación"
        descripcion={`Estado de la operación al ${fechaHora(ahora)}: las cifras de envíos y flota son en vivo${verActividad ? '; SLA e ingresos vienen de la analítica periódica' : ''}.`}
        acciones={
          <>
            <Button asChild>
              <Link to="/mapa">
                <MapIcon /> Mapa en vivo
              </Link>
            </Button>
            {puedeCrear && (
              <Button variant="primary" asChild>
                <Link to="/envios/nuevo">
                  <PackagePlus /> Nuevo envío
                </Link>
              </Button>
            )}
          </>
        }
      />
      <div className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <MiniMapa />
          <NecesitaAtencion />
        </div>
        <Cifras />
        <div className={verActividad ? 'grid gap-5 lg:grid-cols-2' : 'grid gap-5'}>
          <Panel
            titulo="Progreso de los viajes"
            acciones={
              <Link to="/envios?estado=en_transito" className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary hover:underline">
                Ver envíos <ArrowUpRight className="size-3.5" />
              </Link>
            }
            cuerpo="p-0"
          >
            <TablaViajes />
          </Panel>
          {verActividad && <Panel
            titulo="Actividad reciente"
            acciones={
              <Link to="/analitica" className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary hover:underline">
                Analítica <ArrowUpRight className="size-3.5" />
              </Link>
            }
            cuerpo="p-0"
          >
            <Actividad />
          </Panel>}
        </div>
        <EstadosResumen />
      </div>
    </>
  );
}

function EstadosResumen() {
  const envios = useEnvios();
  if (!envios.data?.length) return null;
  const conteo = new Map<string, number>();
  envios.data.forEach((e) => conteo.set(e.estado, (conteo.get(e.estado) ?? 0) + 1));
  return (
    <Panel titulo="Envíos por estado" descripcion={`${envios.data.length} envíos registrados`}>
      <div className="flex flex-wrap gap-2">
        {[...conteo.entries()].map(([estado, n]) => (
          <Link key={estado} to={`/envios?estado=${estado}`} className="inline-flex items-center gap-1.5 rounded-full hover:opacity-80">
            <EstadoBadge def={{ ...estadoEnvio(estado), ayuda: undefined }} />
            <span className="tabular text-[13px] font-semibold">{n}</span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

