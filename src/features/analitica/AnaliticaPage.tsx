import { ArrowUpRight, DatabaseZap } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartFrame, TooltipContenido } from '@/components/charts/Chart';
import { C, ejeX, ejeY, rejilla } from '@/components/charts/tema';
import { Badge, EstadoBadge } from '@/components/shared/Badge';
import { DataTable, type Columna } from '@/components/shared/DataTable';
import { Cifra, PageHeader, Panel } from '@/components/shared/Layout';
import { Plate } from '@/components/shared/Plate';
import { EmptyState, ErrorState, Limitacion, LoadingState, Nota } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/input';
import {
  useActividadReciente,
  useCostoPorKm,
  useEficienciaCombustible,
  useEntregasDiarias,
  useProyeccionMantenimiento,
  useResumen,
  useUtilizacionFlota,
} from '@/hooks/queries';
import { useAccion } from '@/hooks/useAccion';
import * as api from '@/lib/api/endpoints';
import { clasificacionCombustible, estadoEnvio, humanizar, tipoVehiculo, urgencia } from '@/lib/dominio';
import { fecha, fechaCorta, fechaHora, num, numero, pesos, porcentaje, relativo } from '@/lib/format';
import type { EficienciaCombustible } from '@/lib/types/api';

function Resumen() {
  const r = useResumen();
  if (r.error) return <ErrorState error={r.error} reintentar={() => r.refetch()} compacto />;
  if (!r.data) return <LoadingState />;
  const x = r.data;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-4 xl:grid-cols-6">
      <Cifra valor={x.total_envios_historico} etiqueta="Envíos" detalle="histórico" />
      <Cifra valor={x.envios_en_transito} etiqueta="En tránsito" tono="primary" />
      <Cifra valor={x.envios_entregados_historico} etiqueta="Entregados" tono="ok" />
      <Cifra valor={x.envios_con_incidencia_historico} etiqueta="Con incidencia" tono={x.envios_con_incidencia_historico ? 'danger' : undefined} />
      <Cifra valor={x.envios_internacionales_retenidos} etiqueta="Retenidos en aduana" tono={x.envios_internacionales_retenidos ? 'danger' : undefined} />
      <Cifra valor={x.tasa_cumplimiento_sla_global_pct != null ? porcentaje(x.tasa_cumplimiento_sla_global_pct, 1) : '—'} etiqueta="Cumplimiento de SLA" detalle="global" />
      <Cifra valor={`${x.vehiculos_en_uso}/${x.total_vehiculos}`} etiqueta="Vehículos en uso" />
      <Cifra valor={x.flota_disponible} etiqueta="Flota disponible" />
      <Cifra valor={x.total_conductores} etiqueta="Conductores" />
      <Cifra valor={x.facturacion_periodo_actual != null ? pesos(x.facturacion_periodo_actual) : '—'} etiqueta="Facturación del periodo" />
      <Cifra valor={x.programas_mantenimiento_vencidos} etiqueta="Mantenimientos vencidos" tono={x.programas_mantenimiento_vencidos ? 'warn' : undefined} />
      <Cifra valor={x.ultima_actualizacion_etl ? relativo(x.ultima_actualizacion_etl) : 'Nunca'} etiqueta="Última ETL" detalle={fechaHora(x.ultima_actualizacion_etl)} />
    </div>
  );
}

function Entregas() {
  const [dias, setDias] = useState(30);
  const e = useEntregasDiarias(dias);
  const datos = (e.data ?? []).map((d) => ({
    fecha: d.fecha,
    creados: d.total_creados,
    entregados: d.total_entregados,
    a_tiempo: d.entregados_a_tiempo,
    tarde: d.entregados_tarde,
    sla: num(d.tasa_cumplimiento_sla_pct),
  }));
  const selector = (
    <NativeSelect value={String(dias)} onChange={(x) => setDias(Number(x.target.value))} className="h-7 w-32 text-xs" aria-label="Ventana en días">
      {[7, 30, 90, 365].map((d) => (
        <option key={d} value={d}>
          Últimos {d} días
        </option>
      ))}
    </NativeSelect>
  );
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel>
        {e.error ? (
          <ErrorState error={e.error} reintentar={() => e.refetch()} compacto />
        ) : !e.data ? (
          <LoadingState />
        ) : datos.length === 0 ? (
          <div>
            <div className="flex justify-end">{selector}</div>
            <EmptyState titulo="Sin entregas en la ventana" compacto>
              Los resúmenes diarios se generan con la ETL.
            </EmptyState>
          </div>
        ) : (
          <ChartFrame
            titulo="Envíos creados y entregados por día"
            acciones={selector}
            leyenda={[
              { nombre: 'Creados', color: C.s1 },
              { nombre: 'Entregados', color: C.s2 },
            ]}
            tabla={{
              columnas: ['Fecha', 'Creados', 'Entregados', 'A tiempo', 'Tarde', 'SLA'],
              filas: (e.data ?? []).map((d) => [fecha(d.fecha), d.total_creados, d.total_entregados, d.entregados_a_tiempo, d.entregados_tarde, d.tasa_cumplimiento_sla_pct != null ? porcentaje(d.tasa_cumplimiento_sla_pct, 1) : '—']),
            }}
          >
            <BarChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid {...rejilla} />
              <XAxis dataKey="fecha" {...ejeX} tickFormatter={(f: string) => fechaCorta(f)} minTickGap={16} />
              <YAxis {...ejeY} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'var(--neutral-soft)' }} content={<TooltipContenido etiqueta={(l) => fecha(String(l))} formato={(v) => numero(v)} />} />
              <Bar dataKey="creados" name="Creados" fill={C.s1} radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar dataKey="entregados" name="Entregados" fill={C.s2} radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ChartFrame>
        )}
      </Panel>
      <Panel>
        {datos.filter((d) => d.sla !== null).length === 0 ? (
          <EmptyState titulo="Sin datos de cumplimiento de SLA" compacto>
            El cumplimiento solo se calcula para envíos entregados que tenían fecha límite.
          </EmptyState>
        ) : (
          <ChartFrame
            titulo="Cumplimiento de SLA por día"
            descripcion="Porcentaje de entregas a tiempo entre las que tenían fecha límite"
            tabla={{ columnas: ['Fecha', 'Cumplimiento'], filas: datos.map((d) => [fecha(d.fecha), d.sla != null ? porcentaje(d.sla, 1) : '—']) }}
          >
            <LineChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...rejilla} />
              <XAxis dataKey="fecha" {...ejeX} tickFormatter={(f: string) => fechaCorta(f)} minTickGap={16} />
              <YAxis {...ejeY} domain={[0, 100]} tickFormatter={(v: number) => `${v} %`} />
              <Tooltip cursor={{ stroke: 'var(--rule-strong)' }} content={<TooltipContenido etiqueta={(l) => fecha(String(l))} formato={(v) => porcentaje(v, 1)} />} />
              <Line dataKey="sla" name="Cumplimiento" stroke={C.s1} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }} connectNulls isAnimationActive={false} />
            </LineChart>
          </ChartFrame>
        )}
      </Panel>
    </div>
  );
}

function Flota() {
  const u = useUtilizacionFlota();
  const c = useCostoPorKm();
  const enUso = (u.data ?? []).filter((x) => x.en_uso).length;
  const costos = (c.data ?? []).map((x) => ({ tipo: tipoVehiculo(x.tipo_vehiculo), costo: num(x.costo_promedio_por_km) ?? 0, rutas: x.num_rutas_con_costo }));
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel titulo="Utilización de la flota" descripcion={u.data ? `${enUso} de ${u.data.length} vehículos en uso` : undefined} cuerpo="p-0">
        {u.error ? (
          <ErrorState error={u.error} compacto reintentar={() => u.refetch()} />
        ) : !u.data ? (
          <LoadingState />
        ) : u.data.length === 0 ? (
          <EmptyState titulo="Sin datos de utilización" compacto />
        ) : (
          <ul className="max-h-80 divide-y divide-rule overflow-y-auto">
            {u.data.map((x) => (
              <li key={x.vehiculo_id} className="flex items-center justify-between gap-2 px-4 py-2 text-[13px]">
                <span className="flex items-center gap-2">
                  <Plate placa={x.placa} tamano="sm" vehiculoId={x.vehiculo_id} />
                  <span className="text-text-2">{tipoVehiculo(x.tipo)}</span>
                </span>
                {x.en_uso ? (
                  <span className="flex items-center gap-2">
                    {x.estado_envio_actual && <span className="text-xs text-text-2">{estadoEnvio(x.estado_envio_actual).etiqueta}</span>}
                    <Badge tono="primary">En uso</Badge>
                  </span>
                ) : (
                  <Badge tono="ok">Libre</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel>
        {c.error ? (
          <ErrorState error={c.error} compacto reintentar={() => c.refetch()} />
        ) : !c.data ? (
          <LoadingState />
        ) : costos.length === 0 ? (
          <EmptyState titulo="Sin costos por kilómetro" compacto>
            Se calculan a partir de los costos de rutas entregadas.
          </EmptyState>
        ) : (
          <ChartFrame
            titulo="Costo promedio por kilómetro"
            descripcion="Por tipo de vehículo, en pesos por km"
            tabla={{
              columnas: ['Tipo', 'Costo por km', 'Rutas', 'Distancia total', 'Costo total'],
              filas: (c.data ?? []).map((x) => [tipoVehiculo(x.tipo_vehiculo), pesos(x.costo_promedio_por_km), x.num_rutas_con_costo, `${numero(x.distancia_total_km)} km`, pesos(x.costo_total)]),
            }}
          >
            <BarChart data={costos} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid {...rejilla} />
              <XAxis dataKey="tipo" {...ejeX} />
              <YAxis {...ejeY} width={60} tickFormatter={(v: number) => numero(v)} />
              <Tooltip cursor={{ fill: 'var(--neutral-soft)' }} content={<TooltipContenido formato={(v) => `${pesos(v)} por km`} />} />
              <Bar dataKey="costo" name="Costo por km" fill={C.s1} radius={[4, 4, 0, 0]} maxBarSize={56} />
            </BarChart>
          </ChartFrame>
        )}
      </Panel>
    </div>
  );
}

function Eficiencia() {
  const [limite, setLimite] = useState(50);
  const e = useEficienciaCombustible(limite);
  const columnas: Columna<EficienciaCombustible>[] = [
    { id: 'nombre', titulo: 'Conductor', celda: (x) => <Link className="text-primary hover:underline" to={`/flota/conductores/${x.conductor_id}`}>{x.nombre_conductor}</Link>, orden: (x) => x.nombre_conductor },
    { id: 'placa', titulo: 'Vehículo', celda: (x) => <Plate placa={x.placa_vehiculo} tamano="sm" />, ocultarBajo: 'sm' },
    { id: 'clas', titulo: 'Clasificación', celda: (x) => <EstadoBadge def={clasificacionCombustible(x.clasificacion)} />, orden: (x) => x.clasificacion },
    { id: 'kmpct', titulo: 'Km por punto de combustible', celda: (x) => numero(x.km_por_pct_combustible, 2), orden: (x) => num(x.km_por_pct_combustible), alinear: 'right' },
    { id: 'km', titulo: 'Km analizados', celda: (x) => numero(x.km_recorridos, 1), orden: (x) => num(x.km_recorridos), alinear: 'right', ocultarBajo: 'md' },
    { id: 'pct', titulo: 'Combustible usado %', celda: (x) => numero(x.combustible_consumido_pct, 1), alinear: 'right', ocultarBajo: 'lg' },
    { id: 'lect', titulo: 'Lecturas', celda: (x) => x.lecturas_analizadas, alinear: 'right', ocultarBajo: 'lg' },
  ];
  return (
    <Panel
      titulo="Eficiencia de combustible por conductor"
      descripcion="Kilómetros recorridos por cada punto porcentual de combustible consumido"
      acciones={
        <NativeSelect value={String(limite)} onChange={(x) => setLimite(Number(x.target.value))} className="h-8 w-28" aria-label="Cantidad">
          {[10, 50, 200].map((n) => (
            <option key={n} value={n}>
              Hasta {n}
            </option>
          ))}
        </NativeSelect>
      }
      cuerpo="p-0"
    >
      <DataTable
        etiqueta="Eficiencia de combustible"
        filas={e.data}
        columnas={columnas}
        clave={(x) => x.conductor_id}
        cargando={e.isLoading}
        error={e.error}
        reintentar={() => e.refetch()}
        vacio={<EmptyState titulo="Sin datos de eficiencia" compacto>Se calcula a partir de la telemetría de los viajes.</EmptyState>}
      />
    </Panel>
  );
}

function ProyeccionResumen() {
  const p = useProyeccionMantenimiento({ dias: 30 });
  return (
    <Panel
      titulo="Mantenimientos en los próximos 30 días"
      acciones={
        <Link to="/mantenimiento" className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary hover:underline">
          Mantenimiento <ArrowUpRight className="size-3.5" />
        </Link>
      }
      cuerpo="p-0"
    >
      {p.error ? (
        <ErrorState error={p.error} compacto reintentar={() => p.refetch()} />
      ) : !p.data ? (
        <LoadingState />
      ) : p.data.length === 0 ? (
        <EmptyState titulo="Nada por vencer" compacto />
      ) : (
        <ul className="divide-y divide-rule">
          {p.data.slice(0, 8).map((x) => (
            <li key={`${x.vehiculo_id}-${x.tipo_mantenimiento}`} className="flex items-center justify-between gap-2 px-4 py-2 text-[13px]">
              <span className="flex items-center gap-2">
                <Plate placa={x.placa_vehiculo} tamano="sm" /> {humanizar(x.tipo_mantenimiento)}
              </span>
              <EstadoBadge def={urgencia(x.urgencia)} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Actividad() {
  const [limite, setLimite] = useState(20);
  const a = useActividadReciente(limite);
  return (
    <Panel
      titulo="Actividad reciente"
      acciones={
        <NativeSelect value={String(limite)} onChange={(x) => setLimite(Number(x.target.value))} className="h-8 w-28" aria-label="Cantidad de eventos">
          {[20, 50, 100, 200].map((n) => (
            <option key={n} value={n}>
              Últimos {n}
            </option>
          ))}
        </NativeSelect>
      }
      cuerpo="p-0"
    >
      {a.error ? (
        <ErrorState error={a.error} compacto reintentar={() => a.refetch()} />
      ) : !a.data ? (
        <LoadingState />
      ) : a.data.length === 0 ? (
        <EmptyState titulo="Sin actividad" compacto />
      ) : (
        <ol className="max-h-96 divide-y divide-rule overflow-y-auto">
          {a.data.map((x, i) => (
            <li key={i} className="flex gap-3 px-4 py-2.5 text-[13px]">
              <time className="tabular w-24 shrink-0 text-xs text-text-3" dateTime={x.ocurrido_en} title={fechaHora(x.ocurrido_en)}>
                {relativo(x.ocurrido_en)}
              </time>
              <span className="min-w-0 flex-1">
                {x.mensaje}
                <span className="block text-xs text-text-3">
                  {humanizar(x.tipo_evento)}
                  {x.envio_id && (
                    <>
                      {', '}
                      <Link className="text-primary hover:underline" to={`/envios/${x.envio_id}`}>
                        ver envío
                      </Link>
                    </>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

export default function AnaliticaPage() {
  const [resultado, setResultado] = useState<Record<string, unknown> | null>(null);
  const etl = useAccion({
    fn: () => api.analitica.ejecutarEtl(),
    exito: 'ETL ejecutada: indicadores actualizados.',
    invalida: [['analitica']],
    onSuccess: (r) => setResultado(r),
  });
  return (
    <>
      <PageHeader
        titulo="Analítica"
        descripcion="Indicadores calculados por un proceso ETL periódico a partir de los demás servicios. No son en tiempo real."
        acciones={
          <Button variant="primary" onClick={() => etl.mutate()} cargando={etl.isPending}>
            <DatabaseZap /> Ejecutar ETL ahora
          </Button>
        }
      />
      <Limitacion titulo="Ejecute la ETL una sola vez a la vez" className="mb-5">
        Si dos ciclos coinciden (el programado y uno manual, o dos manuales), el servicio de analítica se bloquea y deja de responder hasta
        reiniciarlo. Es un defecto del backend (analytics-service/app/etl.py), reproducido y documentado en COBERTURA.md.
      </Limitacion>
      {resultado && (
        <Nota className="mb-5">
          <p className="mb-1 font-semibold text-text">Resultado de la ETL</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {Object.entries(resultado).map(([k, v]) => (
              <span key={k}>
                {humanizar(k)}: <strong className="tabular text-text">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</strong>
              </span>
            ))}
          </div>
        </Nota>
      )}
      <div className="space-y-5">
        <Panel titulo="Resumen ejecutivo">
          <Resumen />
        </Panel>
        <Entregas />
        <Flota />
        <Eficiencia />
        <div className="grid gap-5 xl:grid-cols-2">
          <ProyeccionResumen />
          <Actividad />
        </div>
      </div>
    </>
  );
}
