import { ChevronDown, Gauge, Map as MapIcon, Pencil, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { EstadoBadge } from '@/components/shared/Badge';
import { ConfirmDialog, ErrorFormulario } from '@/components/shared/Form';
import { Codigo, KeyValue, PageHeader, Panel } from '@/components/shared/Layout';
import { Plate } from '@/components/shared/Plate';
import { EmptyState, ErrorState, LoadingState, Nota } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown';
import {
  es404,
  useConductores,
  useEnvios,
  useIntervenciones,
  useProgramas,
  useSeguimientoVehiculo,
  useTelemetria,
  useVehiculo,
} from '@/hooks/queries';
import { useAccion } from '@/hooks/useAccion';
import * as api from '@/lib/api/endpoints';
import { COMBUSTIBLES, estadoEnvio, estadoVehiculo, humanizar, prioridad, tipoVehiculo } from '@/lib/dominio';
import { conUnidad, fecha, fechaHora, numero, pesos, relativo } from '@/lib/format';
import type { EstadoVehiculo } from '@/lib/types/api';
import { FichaViaje } from '../seguimiento/FichaViaje';
import { DialogoVehiculo } from './FormVehiculo';

const OPCIONES_ESTADO: { e: EstadoVehiculo; ayuda: string }[] = [
  { e: 'active', ayuda: 'Vuelve a estar disponible para envíos.' },
  { e: 'en_mantenimiento', ayuda: 'Deja de recibir envíos hasta volver a disponible.' },
  { e: 'fuera_de_servicio', ayuda: 'Se retira de la operación.' },
];

function ViajeActual({ vehiculoId }: { vehiculoId: string }) {
  const s = useSeguimientoVehiculo(vehiculoId);
  if (s.error && es404(s.error)) return <p className="text-[13px] text-text-2">El vehículo no está en un viaje ahora mismo.</p>;
  if (s.error) return <ErrorState error={s.error} compacto reintentar={() => s.refetch()} />;
  if (!s.data) return <LoadingState />;
  return (
    <div className="space-y-3">
      <Codigo to={`/envios/${s.data.envio_id}`}>{s.data.codigo_envio}</Codigo>
      <FichaViaje s={s.data} compacta />
    </div>
  );
}

function UltimaTelemetria({ vehiculoId }: { vehiculoId: string }) {
  const t = useTelemetria(vehiculoId, { limite: 1 }, { refetchInterval: 30000 });
  if (t.error) return <ErrorState error={t.error} compacto reintentar={() => t.refetch()} />;
  if (!t.data) return <LoadingState />;
  const l = t.data[0];
  if (!l) return <EmptyState titulo="Sin lecturas de telemetría" compacto>Las lecturas se generan durante los viajes.</EmptyState>;
  return (
    <KeyValue
      items={[
        { k: 'Lectura', v: `${fechaHora(l.tiempo)} (${relativo(l.tiempo)})`, ancho: true },
        { k: 'Posición', v: `${numero(l.latitud, 4)}, ${numero(l.longitud, 4)}` },
        { k: 'Velocidad', v: conUnidad(l.velocidad_kmh, 'km/h') },
        { k: 'Combustible', v: conUnidad(l.nivel_combustible_pct, '%') },
        { k: 'Odómetro', v: conUnidad(l.kilometraje_acumulado_km, 'km', 1) },
        { k: 'Temperatura del motor', v: conUnidad(l.temperatura_motor_c, '°C', 1) },
        { k: 'Horas de motor', v: numero(l.horas_motor, 1) },
      ]}
    />
  );
}

function Mantenimiento({ vehiculoId }: { vehiculoId: string }) {
  const p = useProgramas(vehiculoId);
  const i = useIntervenciones(vehiculoId);
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-semibold text-text-2">Programas preventivos</p>
        {p.error ? (
          <ErrorState error={p.error} compacto />
        ) : !p.data ? (
          <LoadingState />
        ) : p.data.length === 0 ? (
          <p className="text-[13px] text-text-3">Sin programas.</p>
        ) : (
          <ul className="space-y-2">
            {p.data.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2 text-[13px]">
                <span>{humanizar(x.tipo)}</span>
                <span className="flex items-center gap-2 text-xs text-text-2">
                  {x.fecha_vencimiento ? fecha(x.fecha_vencimiento) : x.kilometraje_vencimiento ? `${numero(x.kilometraje_vencimiento)} km` : '—'}
                  <EstadoBadge def={prioridad(x.prioridad)} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold text-text-2">Intervenciones realizadas</p>
        {i.error ? (
          <ErrorState error={i.error} compacto />
        ) : !i.data ? (
          <LoadingState />
        ) : i.data.length === 0 ? (
          <p className="text-[13px] text-text-3">Sin intervenciones.</p>
        ) : (
          <ul className="space-y-2">
            {i.data.slice(0, 6).map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2 text-[13px]">
                <span>{humanizar(x.tipo)}</span>
                <span className="text-xs text-text-2">
                  {fecha(x.realizado_en)}, {pesos(x.costo)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function VehiculoDetallePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const v = useVehiculo(id);
  const conductores = useConductores();
  const envios = useEnvios();
  const [editar, setEditar] = useState(false);
  const [destino, setDestino] = useState<EstadoVehiculo | null>(null);
  const cambiar = useAccion({
    fn: () => api.vehiculos.cambiarEstado(id, destino!),
    exito: (r) => `${r.placa}: ${estadoVehiculo(r.estado).etiqueta.toLowerCase()}.`,
    invalida: [['vehiculos'], ['analitica']],
    toastError: false,
    onSuccess: () => setDestino(null),
  });

  if (v.error) return <ErrorState error={v.error} reintentar={() => v.refetch()} />;
  if (!v.data) return <LoadingState />;
  const x = v.data;
  const conductor = conductores.data?.find((c) => c.vehiculo_id === x.id);
  const suyos = (envios.data ?? []).filter((e) => e.vehiculo_id === x.id).slice(0, 8);

  return (
    <>
      <PageHeader
        migas={[{ etiqueta: 'Vehículos', to: '/flota/vehiculos' }, { etiqueta: x.placa }]}
        titulo={
          <span className="flex flex-wrap items-center gap-3">
            <Plate placa={x.placa} tamano="lg" />
            <span>{tipoVehiculo(x.tipo)}</span>
            <EstadoBadge def={estadoVehiculo(x.estado)} />
          </span>
        }
        acciones={
          <>
            <Button asChild>
              <Link to={`/mapa?v=${x.id}`}>
                <MapIcon /> Ver en el mapa
              </Link>
            </Button>
            <Button asChild>
              <Link to={`/telemetria?vehiculo=${x.id}`}>
                <Gauge /> Telemetría
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  Cambiar estado <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>«En tránsito» lo gestiona el sistema</DropdownMenuLabel>
                {OPCIONES_ESTADO.map((o) => (
                  <DropdownMenuItem key={o.e} disabled={x.estado === o.e} onSelect={() => setDestino(o.e)}>
                    {estadoVehiculo(o.e).etiqueta}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="primary" onClick={() => setEditar(true)}>
              <Pencil /> Editar
            </Button>
          </>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Panel titulo="Viaje actual" descripcion="GET /seguimiento/vehiculo/{id}">
            <ViajeActual vehiculoId={x.id} />
          </Panel>
          <Panel
            titulo="Mantenimiento"
            acciones={
              <Button size="sm" asChild>
                <Link to={`/mantenimiento?vehiculo=${x.id}`}>
                  <Wrench /> Gestionar
                </Link>
              </Button>
            }
          >
            <Mantenimiento vehiculoId={x.id} />
          </Panel>
          <Panel titulo="Envíos recientes de este vehículo" cuerpo="p-0">
            {suyos.length === 0 ? (
              <EmptyState titulo="Sin envíos asignados" compacto />
            ) : (
              <ul className="divide-y divide-rule">
                {suyos.map((e) => (
                  <li key={e.id}>
                    <button type="button" onClick={() => navigate(`/envios/${e.id}`)} className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-surface-2">
                      <span className="text-[13px]">
                        <Codigo>{e.codigo_envio}</Codigo> <span className="text-text-2">{e.origen.split(',')[0]} a {e.destino.split(',')[0]}</span>
                      </span>
                      <EstadoBadge def={{ ...estadoEnvio(e.estado), ayuda: undefined }} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-rule px-4 py-2 text-xs text-text-3">El backend no filtra envíos por vehículo: se filtra la lista completa de envíos.</p>
          </Panel>
        </div>
        <div className="min-w-0 space-y-5">
          <Panel titulo="Ficha técnica">
            <KeyValue
              items={[
                { k: 'Capacidad', v: `${numero(x.capacidad_kg)} kg` },
                { k: 'Volumen', v: x.capacidad_m3 != null ? `${numero(x.capacidad_m3, 1)} m³` : '—' },
                { k: 'Refrigeración', v: x.capacidad_refrigeracion ? 'Sí' : 'No' },
                { k: 'Certificado HAZMAT', v: x.certificado_hazmat ? 'Sí' : 'No' },
                { k: 'Combustible', v: x.tipo_combustible ? (COMBUSTIBLES[x.tipo_combustible] ?? x.tipo_combustible) : '—' },
                { k: 'Tanque', v: conUnidad(x.capacidad_tanque_l, 'L') },
                { k: 'Rendimiento', v: conUnidad(x.consumo_km_por_litro, 'km/L', 2) },
                { k: 'Año', v: x.anio ?? '—' },
                { k: 'Seguro vigente hasta', v: fecha(x.vencimiento_seguro) },
                { k: 'Identificador', v: <span className="break-all text-xs text-text-3">{x.id}</span>, ancho: true },
              ]}
            />
          </Panel>
          <Panel titulo="Conductor">
            {conductor ? (
              <KeyValue
                items={[
                  { k: 'Nombre', v: <Link className="text-primary hover:underline" to={`/flota/conductores/${conductor.id}`}>{conductor.nombre}</Link> },
                  { k: 'Código', v: conductor.codigo_conductor },
                  { k: 'Licencia', v: conductor.categorias_licencia ?? '—' },
                  { k: 'Experiencia', v: `${conductor.anios_experiencia} año(s)` },
                ]}
              />
            ) : (
              <Nota>
                Este vehículo no tiene conductor y no recibirá envíos. Vincúlelo desde la ficha de un conductor en{' '}
                <Link className="font-semibold text-primary hover:underline" to="/flota/conductores">
                  Conductores
                </Link>
                .
              </Nota>
            )}
          </Panel>
          <Panel titulo="Última telemetría">
            <UltimaTelemetria vehiculoId={x.id} />
          </Panel>
        </div>
      </div>
      <DialogoVehiculo abierto={editar} onAbierto={setEditar} vehiculo={x} />
      <ConfirmDialog
        abierto={!!destino}
        onAbierto={(o) => !o && setDestino(null)}
        titulo={`Cambiar ${x.placa} a «${destino ? estadoVehiculo(destino).etiqueta.toLowerCase() : ''}»`}
        confirmar="Cambiar estado"
        onConfirmar={() => cambiar.mutate()}
        cargando={cambiar.isPending}
        peligro={destino === 'fuera_de_servicio'}
      >
        <p>{OPCIONES_ESTADO.find((o) => o.e === destino)?.ayuda}</p>
        {x.estado === 'en_transito' && <p className="text-warn">El vehículo está en un viaje. Cambiar su estado no detiene el viaje en curso.</p>}
        <ErrorFormulario error={cambiar.error} />
      </ConfirmDialog>
    </>
  );
}
