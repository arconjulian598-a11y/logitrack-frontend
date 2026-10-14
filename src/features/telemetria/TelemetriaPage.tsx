import type { LatLngBoundsExpression } from 'leaflet';
import { RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CircleMarker, Polyline, Tooltip as LTooltip } from 'react-leaflet';
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { AjustarVista, BaseMap } from '@/components/map/BaseMap';
import { ChartFrame, TooltipContenido } from '@/components/charts/Chart';
import { C, ejeX, ejeY, rejilla } from '@/components/charts/tema';
import { DataTable, type Columna } from '@/components/shared/DataTable';
import { Field } from '@/components/shared/Form';
import { Cifra, PageHeader, Panel } from '@/components/shared/Layout';
import { VehiculoPicker } from '@/components/shared/Pickers';
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Switch } from '@/components/ui/misc';
import { useTelemetria } from '@/hooks/queries';
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl';
import { desdeInputLocal, fechaHora, hora, num, numero, relativo } from '@/lib/format';
import type { LecturaTelemetria } from '@/lib/types/api';
import { cn } from '@/lib/utils';

const UMBRAL_MOTOR_C = 110; // maintenance-service: por encima, el vehículo pasa a mantenimiento

interface Metrica {
  clave: keyof LecturaTelemetria;
  titulo: string;
  unidad: string;
  decimales: number;
  referencia?: { y: number; etiqueta: string };
}

const METRICAS: Metrica[] = [
  { clave: 'velocidad_kmh', titulo: 'Velocidad', unidad: 'km/h', decimales: 0 },
  { clave: 'nivel_combustible_pct', titulo: 'Combustible', unidad: '%', decimales: 0 },
  { clave: 'temperatura_motor_c', titulo: 'Temperatura del motor', unidad: '°C', decimales: 1, referencia: { y: UMBRAL_MOTOR_C, etiqueta: `Umbral ${UMBRAL_MOTOR_C} °C` } },
  { clave: 'temperatura_carga_c', titulo: 'Temperatura de la carga', unidad: '°C', decimales: 1 },
  { clave: 'kilometraje_acumulado_km', titulo: 'Odómetro', unidad: 'km', decimales: 0 },
];

function GraficaMetrica({ datos, m }: { datos: LecturaTelemetria[]; m: Metrica }) {
  const serie = datos
    .map((l) => ({ t: l.tiempo, v: num(l[m.clave]) }))
    .filter((p): p is { t: string; v: number } => p.v !== null);
  if (serie.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-rule p-4">
        <p className="text-sm font-bold">{m.titulo}</p>
        <p className="text-xs text-text-3">Sin lecturas de esta métrica en el periodo.</p>
      </div>
    );
  }
  const ultimo = serie[serie.length - 1]!;
  return (
    <ChartFrame
      titulo={m.titulo}
      descripcion={`Última: ${numero(ultimo.v, m.decimales)} ${m.unidad}, ${hora(ultimo.t)}`}
      alto={170}
      tabla={{ columnas: ['Momento', `${m.titulo} (${m.unidad})`], filas: serie.map((p) => [fechaHora(p.t), numero(p.v, m.decimales)]) }}
    >
      <LineChart data={serie} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid {...rejilla} />
        <XAxis dataKey="t" {...ejeX} tickFormatter={(t: string) => hora(t).slice(0, 5)} minTickGap={40} />
        <YAxis {...ejeY} domain={['auto', 'auto']} tickFormatter={(v: number) => numero(v, 0)} />
        {m.referencia && (
          <ReferenceLine y={m.referencia.y} stroke={C.danger} strokeDasharray="4 4" label={{ value: m.referencia.etiqueta, fill: 'var(--text-2)', fontSize: 11, position: 'insideTopRight' }} />
        )}
        <Tooltip
          cursor={{ stroke: 'var(--rule-strong)' }}
          content={<TooltipContenido etiqueta={(l) => fechaHora(String(l))} formato={(v) => `${numero(v, m.decimales)} ${m.unidad}`} />}
        />
        <Line type="monotone" dataKey="v" name={m.titulo} stroke={C.s1} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }} isAnimationActive={false} />
      </LineChart>
    </ChartFrame>
  );
}

function MapaLecturas({ datos }: { datos: LecturaTelemetria[] }) {
  const puntos = datos
    .map((l) => [num(l.latitud), num(l.longitud)] as const)
    .filter((p): p is readonly [number, number] => p[0] !== null && p[1] !== null)
    .map((p) => [p[0], p[1]] as [number, number]);
  const limites: LatLngBoundsExpression | null = puntos.length ? puntos : null;
  const ultimo = puntos[puntos.length - 1];
  return (
    <div className="h-[300px]">
      <BaseMap className="size-full" etiqueta="Posiciones registradas por telemetría">
        <AjustarVista limites={limites} clave={`${puntos.length}-${datos[0]?.id ?? ''}`} maxZoom={11} />
        {puntos.length > 1 && <Polyline positions={puntos} pathOptions={{ color: '#2a5cff', weight: 3, opacity: 0.8 }} />}
        {ultimo && (
          <CircleMarker center={ultimo} radius={7} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#2a5cff', fillOpacity: 1 }}>
            <LTooltip>Lectura más reciente del periodo</LTooltip>
          </CircleMarker>
        )}
      </BaseMap>
    </div>
  );
}

export default function TelemetriaPage() {
  const { valores, set } = useFiltrosUrl(['vehiculo', 'desde', 'hasta', 'limite'] as const);
  const [auto, setAuto] = useState(true);
  const limite = Number(valores.limite) || 200;
  const filtros = { desde: desdeInputLocal(valores.desde) ?? undefined, hasta: desdeInputLocal(valores.hasta) ?? undefined, limite };
  const t = useTelemetria(valores.vehiculo || null, filtros, { refetchInterval: auto ? 15000 : false });
  const cronologico = useMemo(() => [...(t.data ?? [])].reverse(), [t.data]);
  const obd = (t.data ?? []).filter((l) => l.codigo_obd2).length;
  const ultima = t.data?.[0];

  const columnas: Columna<LecturaTelemetria>[] = [
    { id: 't', titulo: 'Momento', celda: (l) => fechaHora(l.tiempo), orden: (l) => l.tiempo },
    { id: 'pos', titulo: 'Posición', celda: (l) => `${numero(l.latitud, 4)}, ${numero(l.longitud, 4)}`, ocultarBajo: 'md' },
    { id: 'vel', titulo: 'Velocidad', celda: (l) => numero(l.velocidad_kmh), orden: (l) => num(l.velocidad_kmh), alinear: 'right' },
    { id: 'comb', titulo: 'Combustible %', celda: (l) => numero(l.nivel_combustible_pct), orden: (l) => num(l.nivel_combustible_pct), alinear: 'right' },
    {
      id: 'motor',
      titulo: 'Motor °C',
      celda: (l) => <span className={cn((num(l.temperatura_motor_c) ?? 0) > UMBRAL_MOTOR_C && 'font-semibold text-danger')}>{numero(l.temperatura_motor_c, 1)}</span>,
      orden: (l) => num(l.temperatura_motor_c),
      alinear: 'right',
      ocultarBajo: 'sm',
    },
    { id: 'carga', titulo: 'Carga °C', celda: (l) => numero(l.temperatura_carga_c, 1), alinear: 'right', ocultarBajo: 'lg' },
    { id: 'odo', titulo: 'Odómetro km', celda: (l) => numero(l.kilometraje_acumulado_km, 1), alinear: 'right', ocultarBajo: 'lg' },
    { id: 'obd', titulo: 'OBD-II', celda: (l) => l.codigo_obd2 ?? '—', ocultarBajo: 'xl' },
  ];

  return (
    <>
      <PageHeader
        titulo="Telemetría"
        descripcion="Lecturas de sensores por vehículo, de la más reciente a la más antigua. Durante los viajes el simulador registra una lectura cada 5 segundos."
      />
      <Panel className="mb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_1fr_1fr_120px_auto]">
          <Field label="Vehículo" htmlFor="t-veh">
            <VehiculoPicker id="t-veh" valorId={valores.vehiculo || null} onCambio={(v) => set('vehiculo', v?.id ?? '')} />
          </Field>
          <Field label="Desde" htmlFor="t-desde">
            <Input id="t-desde" type="datetime-local" value={valores.desde} onChange={(e) => set('desde', e.target.value)} />
          </Field>
          <Field label="Hasta" htmlFor="t-hasta">
            <Input id="t-hasta" type="datetime-local" value={valores.hasta} onChange={(e) => set('hasta', e.target.value)} />
          </Field>
          <Field label="Lecturas" htmlFor="t-lim">
            <NativeSelect id="t-lim" value={String(limite)} onChange={(e) => set('limite', e.target.value)}>
              {[50, 100, 200, 500, 1000].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="flex items-end gap-3 pb-0.5">
            <label className="flex h-9 items-center gap-2 text-[13px] font-semibold">
              <Switch checked={auto} onCheckedChange={setAuto} aria-label="Actualizar cada 15 segundos" /> Cada 15 s
            </label>
            <Button size="icon" onClick={() => t.refetch()} aria-label="Actualizar ahora" disabled={!valores.vehiculo}>
              <RefreshCw className={cn(t.isFetching && 'animate-spin')} />
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-text-3">Las fechas se interpretan en hora de Bogotá. El backend limita a 1000 lecturas por consulta.</p>
      </Panel>

      {!valores.vehiculo ? (
        <Panel>
          <EmptyState titulo="Elija un vehículo">Seleccione un vehículo para ver su histórico de telemetría.</EmptyState>
        </Panel>
      ) : t.error ? (
        <Panel>
          <ErrorState error={t.error} reintentar={() => t.refetch()} />
        </Panel>
      ) : !t.data ? (
        <LoadingState />
      ) : t.data.length === 0 ? (
        <Panel>
          <EmptyState titulo="Sin lecturas en este periodo">El vehículo no registró telemetría en el rango elegido. Las lecturas solo existen durante los viajes.</EmptyState>
        </Panel>
      ) : (
        <div className="space-y-5">
          <Panel cuerpo="px-3 py-3">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Cifra valor={t.data.length} etiqueta="Lecturas" detalle={`máximo ${limite}`} />
              <Cifra valor={ultima ? relativo(ultima.tiempo) : '—'} etiqueta="Última lectura" detalle={ultima ? fechaHora(ultima.tiempo) : undefined} />
              <Cifra
                valor={`${numero(Math.max(...t.data.map((l) => num(l.temperatura_motor_c) ?? 0)), 1)} °C`}
                etiqueta="Motor, máxima"
                tono={t.data.some((l) => (num(l.temperatura_motor_c) ?? 0) > UMBRAL_MOTOR_C) ? 'danger' : undefined}
                detalle={`umbral de mantenimiento ${UMBRAL_MOTOR_C} °C`}
              />
              <Cifra valor={obd} etiqueta="Lecturas con código OBD-II" tono={obd ? 'warn' : undefined} />
            </div>
          </Panel>
          <div className="grid gap-5 xl:grid-cols-2">
            {METRICAS.map((m) => (
              <Panel key={m.clave}>
                <GraficaMetrica datos={cronologico} m={m} />
              </Panel>
            ))}
            <Panel titulo="Posiciones registradas" cuerpo="p-0" className="overflow-hidden">
              <MapaLecturas datos={cronologico} />
            </Panel>
          </div>
          <Panel titulo="Lecturas" cuerpo="p-0">
            <DataTable etiqueta="Lecturas de telemetría" filas={t.data} columnas={columnas} clave={(l) => `${l.id}-${l.tiempo}`} tamPagina={20} ordenInicial={{ id: 't', dir: 'desc' }} />
          </Panel>
        </div>
      )}
    </>
  );
}
