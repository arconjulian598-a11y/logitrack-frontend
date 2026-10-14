import { Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EstadoBadge } from '@/components/shared/Badge';
import { DataTable, type Columna } from '@/components/shared/DataTable';
import { ErrorFormulario, Field } from '@/components/shared/Form';
import { Codigo, KeyValue, PageHeader, Panel } from '@/components/shared/Layout';
import { Plate } from '@/components/shared/Plate';
import { EmptyState, ErrorState, Limitacion, LoadingState } from '@/components/shared/States';
import { Timeline } from '@/components/shared/Timeline';
import { Button } from '@/components/ui/button';
import { Dialog, SheetContent } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { useSimulacion, useSimulacionEventos, useSimulaciones } from '@/hooks/queries';
import { useAccion } from '@/hooks/useAccion';
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl';
import * as api from '@/lib/api/endpoints';
import { ESTADOS_VIAJE, estadoViaje, humanizar } from '@/lib/dominio';
import { conUnidad, fechaHora, hora, numero, relativo } from '@/lib/format';
import type { Simulacion } from '@/lib/types/api';
import { BarraProgreso, FichaViaje } from '../seguimiento/FichaViaje';

function Detalle({ envioId }: { envioId: string }) {
  const s = useSimulacion(envioId, { refetchInterval: 5000 });
  const ev = useSimulacionEventos(envioId, { refetchInterval: 10000 });
  if (s.error) return <ErrorState error={s.error} reintentar={() => s.refetch()} />;
  if (!s.data) return <LoadingState />;
  const x = s.data;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <EstadoBadge def={estadoViaje(x.estado)} />
        <Link to={`/envios/${x.envio_id}`} className="text-[13px] font-semibold text-primary hover:underline">
          Ver envío {x.codigo_envio}
        </Link>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[13px]">
          <span className="font-cond text-xl font-bold">{numero(x.progreso_pct, 1)} %</span>
          <span className="tabular text-text-2">
            {numero(x.km_recorridos, 1)} de {numero(x.distancia_total_km, 1)} km
          </span>
        </div>
        <BarraProgreso valor={x.progreso_pct} />
      </div>
      <KeyValue
        items={[
          { k: 'Vehículo', v: <Plate placa={x.placa} vehiculoId={x.vehiculo_id} tamano="sm" /> },
          { k: 'Conductor', v: x.conductor_nombre ?? '—' },
          { k: 'Origen', v: x.origen ?? '—', ancho: true },
          { k: 'Destino', v: x.destino ?? '—', ancho: true },
          { k: 'Velocidad actual', v: conUnidad(x.velocidad_actual_kmh, 'km/h') },
          { k: 'Velocidad promedio', v: conUnidad(x.velocidad_promedio_kmh, 'km/h') },
          { k: 'Combustible', v: `${numero(x.combustible_pct)} %, ${numero(x.combustible_l, 1)} L${x.combustible_estimado ? ' (estimado)' : ''}` },
          { k: 'Autonomía', v: conUnidad(x.autonomia_km, 'km') },
          { k: 'Recargas', v: `${x.recargas} (${numero(x.litros_recargados, 1)} L)` },
          { k: 'Rendimiento', v: conUnidad(x.consumo_km_por_litro, 'km/L', 2) },
          { k: 'En parada hasta', v: x.en_parada_hasta ? `${hora(x.en_parada_hasta)}${x.motivo_parada ? `, ${x.motivo_parada}` : ''}` : '—' },
          { k: 'Siguiente parada', v: (x.siguiente_parada?.nombre as string | undefined) ?? '—' },
          { k: 'Iniciado', v: fechaHora(x.iniciado_en) },
          { k: 'Llegada estimada', v: fechaHora(x.hora_estimada_llegada) },
          { k: 'Llegó', v: fechaHora(x.llegada_en) },
          { k: 'Última actualización', v: x.ultima_actualizacion ? relativo(x.ultima_actualizacion) : '—' },
          { k: 'Intentos de preparación', v: x.intentos },
          { k: 'Último error', v: x.ultimo_error ?? 'Ninguno', ancho: true },
        ]}
      />
      <div>
        <p className="mb-3 text-xs font-semibold text-text-2">Bitácora del viaje</p>
        {ev.error ? (
          <ErrorState error={ev.error} compacto />
        ) : !ev.data ? (
          <LoadingState />
        ) : ev.data.length === 0 ? (
          <EmptyState titulo="Sin eventos todavía" compacto />
        ) : (
          <Timeline
            items={ev.data.map((e, i) => ({
              clave: `${e.tiempo}-${i}`,
              titulo: humanizar(e.tipo),
              cuando: hora(e.tiempo),
              detalle: [e.descripcion, e.km != null ? `km ${numero(e.km, 1)}` : null].filter(Boolean).join(', '),
              tono: e.tipo.includes('aduana') ? 'danger' : e.tipo === 'llegada' ? 'ok' : 'primary',
            }))}
          />
        )}
      </div>
    </div>
  );
}

function BuscarPorCodigo() {
  const [codigo, setCodigo] = useState('');
  const a = useAccion({
    fn: () => {
      const t = codigo.trim().toUpperCase();
      const norm = /^ENV-?\d+$/.test(t) ? `ENV-${t.replace(/\D/g, '').padStart(8, '0')}` : t;
      return api.seguimiento.porCodigo(norm);
    },
    toastError: false,
  });
  return (
    <Panel titulo="Seguimiento por código de envío" descripcion="GET /seguimiento/codigo/{codigo_envio}">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (codigo.trim()) a.mutate();
        }}
      >
        <Field label="Código" htmlFor="seg-cod" className="w-52">
          <Input id="seg-cod" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="ENV-00000012" />
        </Field>
        <Button type="submit" cargando={a.isPending} disabled={!codigo.trim()}>
          <Search /> Consultar
        </Button>
      </form>
      <div className="mt-4">
        <ErrorFormulario error={a.error} />
        {a.data && (
          <div className="space-y-3">
            <Codigo to={`/envios/${a.data.envio_id}`}>{a.data.codigo_envio}</Codigo>
            <FichaViaje s={a.data} compacta />
          </div>
        )}
      </div>
    </Panel>
  );
}

export default function SimulacionesPage() {
  const { valores, set } = useFiltrosUrl(['estado', 'limite'] as const);
  const [params, setParams] = useSearchParams();
  const sel = params.get('envio');
  const limite = Number(valores.limite) || 50;
  const s = useSimulaciones({ estado: valores.estado || undefined, limite });
  const abrir = (id: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (id) n.set('envio', id);
        else n.delete('envio');
        return n;
      },
      { replace: true },
    );
  const columnas: Columna<Simulacion>[] = [
    { id: 'envio', titulo: 'Envío', celda: (x) => <Codigo>{x.codigo_envio ?? x.envio_id.slice(0, 8)}</Codigo>, orden: (x) => x.codigo_envio },
    { id: 'veh', titulo: 'Vehículo', celda: (x) => <Plate placa={x.placa} tamano="sm" />, orden: (x) => x.placa, ocultarBajo: 'sm' },
    { id: 'estado', titulo: 'Estado', celda: (x) => <EstadoBadge def={estadoViaje(x.estado)} />, orden: (x) => x.estado },
    {
      id: 'prog',
      titulo: 'Progreso',
      celda: (x) => (
        <div className="flex w-32 items-center gap-2">
          <BarraProgreso valor={x.progreso_pct} />
          <span className="tabular text-xs text-text-3">{numero(x.progreso_pct)} %</span>
        </div>
      ),
      orden: (x) => x.progreso_pct,
    },
    { id: 'tramo', titulo: 'Tramo', celda: (x) => <span className="text-text-2">{x.origen?.split(',')[0]} a {x.destino?.split(',')[0]}</span>, ocultarBajo: 'md' },
    { id: 'comb', titulo: 'Combustible', celda: (x) => conUnidad(x.combustible_pct, '%'), alinear: 'right', ocultarBajo: 'lg' },
    { id: 'act', titulo: 'Actualizada', celda: (x) => (x.ultima_actualizacion ? relativo(x.ultima_actualizacion) : '—'), orden: (x) => x.ultima_actualizacion, ocultarBajo: 'lg' },
  ];
  return (
    <>
      <PageHeader titulo="Simulaciones de viaje" descripcion="Estado interno del simulador de Tracking para cada viaje: avance, combustible, paradas, recargas y pausas por aduana." />
      <Limitacion titulo="Los viajes son simulados" className="mb-5">
        Tracking mueve los vehículos cada 5 segundos sobre la ruta, acelerado por el factor de tiempo (por defecto ×120: un viaje de 6 horas dura unos 3 minutos). La
        entrega al llegar es automática.
      </Limitacion>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Panel cuerpo="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-rule p-3">
            <NativeSelect value={valores.estado} onChange={(e) => set('estado', e.target.value)} className="w-48" aria-label="Filtrar por estado">
              <option value="">Todos los estados</option>
              {Object.entries(ESTADOS_VIAJE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.etiqueta}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect value={String(limite)} onChange={(e) => set('limite', e.target.value)} className="w-32" aria-label="Cantidad">
              {[20, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  Hasta {n}
                </option>
              ))}
            </NativeSelect>
          </div>
          <DataTable
            etiqueta="Simulaciones"
            filas={s.data}
            columnas={columnas}
            clave={(x) => x.id}
            cargando={s.isLoading}
            error={s.error}
            reintentar={() => s.refetch()}
            onFila={(x) => abrir(x.envio_id)}
            vacio={<EmptyState titulo="Sin simulaciones" compacto>Se crean al asignarse un envío.</EmptyState>}
          />
        </Panel>
        <BuscarPorCodigo />
      </div>
      <Dialog open={!!sel} onOpenChange={(v) => !v && abrir(null)}>
        {sel && (
          <SheetContent titulo="Simulación del viaje" descripcion="Actualiza cada 5 s">
            <Detalle envioId={sel} />
          </SheetContent>
        )}
      </Dialog>
    </>
  );
}
