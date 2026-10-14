import { Crosshair, ExternalLink, Gauge, Package } from 'lucide-react';
import { Link } from 'react-router';
import { EstadoBadge } from '@/components/shared/Badge';
import { KeyValue } from '@/components/shared/Layout';
import { Plate } from '@/components/shared/Plate';
import { ErrorState, Limitacion, LoadingState } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { useEnvio, useRutaMaestra, useSeguimientoEnvio, useUltimasLecturas } from '@/hooks/queries';
import { ApiError } from '@/lib/api/errors';
import { estadoVehiculo, tipoVehiculo } from '@/lib/dominio';
import { conUnidad, fechaHora, numero, relativo } from '@/lib/format';
import { FichaViaje } from '../seguimiento/FichaViaje';
import type { VehiculoMapa } from './posiciones';

function Viaje({ envioId }: { envioId: string }) {
  const s = useSeguimientoEnvio(envioId);
  const e = useEnvio(envioId);
  const rm = useRutaMaestra(e.data?.ruta_maestra_id);
  if (s.isLoading) return <LoadingState texto="Consultando el viaje…" />;
  if (s.error) {
    if (s.error instanceof ApiError && (s.error.status === 404 || s.error.status === 409))
      return <p className="text-[13px] text-text-2">El viaje se está preparando. Se actualizará en unos segundos.</p>;
    return <ErrorState error={s.error} reintentar={() => s.refetch()} compacto />;
  }
  if (!s.data) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[13px]">
        <Link to={`/envios/${envioId}`} className="font-cond inline-flex items-center gap-1 text-[15px] font-bold text-primary hover:underline">
          <Package className="size-4" /> {s.data.codigo_envio}
        </Link>
        <span className="font-cond text-xs font-bold text-text-3">{s.data.codigo_ruta}</span>
      </div>
      {e.data && (
        <p className="text-[13px] text-text-2">
          {e.data.origen} <span className="text-text-3">hacia</span> {e.data.destino}
        </p>
      )}
      {rm.data?.estimada && (
        <Limitacion titulo="Trazado estimado">
          La ruta se calculó sin el servicio de mapas (OSRM): la línea punteada une origen y destino, no sigue la carretera.
        </Limitacion>
      )}
      <FichaViaje s={s.data} compacta />
    </div>
  );
}

function UltimaLectura({ vehiculoId }: { vehiculoId: string }) {
  const [q] = useUltimasLecturas([vehiculoId]);
  const l = q?.data;
  if (q?.isLoading) return <LoadingState texto="Leyendo telemetría…" />;
  if (q?.error) return <ErrorState error={q.error} compacto reintentar={() => q.refetch()} />;
  if (!l)
    return (
      <p className="text-[13px] text-text-2">
        Este vehículo no tiene lecturas de telemetría. El backend solo registra posiciones durante los viajes, así que no hay una posición que mostrar.
      </p>
    );
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-text-2">
        Sin viaje activo. Se muestra la <strong className="text-text">última lectura registrada</strong>, {relativo(l.tiempo)}.
      </p>
      <KeyValue
        columnas={2}
        items={[
          { k: 'Momento de la lectura', v: fechaHora(l.tiempo), ancho: true },
          { k: 'Coordenadas', v: `${numero(l.latitud, 4)}, ${numero(l.longitud, 4)}`, ancho: true },
          { k: 'Velocidad', v: conUnidad(l.velocidad_kmh, 'km/h') },
          { k: 'Combustible', v: conUnidad(l.nivel_combustible_pct, '%') },
          { k: 'Temperatura del motor', v: conUnidad(l.temperatura_motor_c, '°C', 1) },
          { k: 'Temperatura de la carga', v: conUnidad(l.temperatura_carga_c, '°C', 1) },
          { k: 'Odómetro', v: conUnidad(l.kilometraje_acumulado_km, 'km', 1) },
          { k: 'Código OBD-II', v: l.codigo_obd2 ?? 'Sin códigos' },
        ]}
      />
    </div>
  );
}

export function FichaVehiculoMapa({ v, onCentrar }: { v: VehiculoMapa; onCentrar: () => void }) {
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <Plate placa={v.vehiculo.placa} tamano="lg" />
          <p className="text-[13px] text-text-2">
            {tipoVehiculo(v.vehiculo.tipo)}, {numero(v.vehiculo.capacidad_kg)} kg
            {v.vehiculo.capacidad_refrigeracion ? ', refrigerado' : ''}
            {v.vehiculo.certificado_hazmat ? ', HAZMAT' : ''}
          </p>
        </div>
        <EstadoBadge def={estadoVehiculo(v.vehiculo.estado)} />
      </div>

      <div className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-2 text-[13px]">
        <span className="text-text-2">Conductor</span>
        {v.conductor ? (
          <Link to={`/flota/conductores/${v.conductor.id}`} className="font-semibold text-primary hover:underline">
            {v.conductor.nombre}
          </Link>
        ) : (
          <span className="text-text-3">Sin conductor asignado</span>
        )}
      </div>

      {v.viaje ? <Viaje envioId={v.viaje.envio_id} /> : <UltimaLectura vehiculoId={v.vehiculo.id} />}

      <div className="flex flex-wrap gap-2 border-t border-rule pt-3">
        <Button size="sm" onClick={onCentrar} disabled={v.latitud === null}>
          <Crosshair /> Centrar
        </Button>
        <Button size="sm" asChild>
          <Link to={`/flota/vehiculos/${v.vehiculo.id}`}>
            <ExternalLink /> Ficha del vehículo
          </Link>
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <Link to={`/telemetria?vehiculo=${v.vehiculo.id}`}>
            <Gauge /> Telemetría
          </Link>
        </Button>
      </div>
    </div>
  );
}
