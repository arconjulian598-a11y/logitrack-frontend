import { Clock, Fuel, Gauge, MapPin, PauseCircle } from 'lucide-react';
import { EstadoBadge } from '@/components/shared/Badge';
import { estadoViaje } from '@/lib/dominio';
import { duracion, fechaHora, hora, numero, relativo } from '@/lib/format';
import type { Seguimiento } from '@/lib/types/api';
import { cn } from '@/lib/utils';

export function BarraProgreso({ valor, className, tono = 'primary' }: { valor: number | null | undefined; className?: string; tono?: 'primary' | 'ok' | 'warn' | 'danger' }) {
  const v = Math.max(0, Math.min(100, valor ?? 0));
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-neutral-soft', className)}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-700',
          tono === 'primary' && 'bg-primary',
          tono === 'ok' && 'bg-ok',
          tono === 'warn' && 'bg-warn',
          tono === 'danger' && 'bg-danger',
        )}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

function tonoCombustible(p: number | null): 'ok' | 'warn' | 'danger' {
  if (p === null) return 'ok';
  if (p < 15) return 'danger';
  if (p < 30) return 'warn';
  return 'ok';
}

/** Ficha de un viaje a partir de `GET /seguimiento/envio/{id}` (datos de la simulación de Tracking). */
export function FichaViaje({ s, compacta }: { s: Seguimiento; compacta?: boolean }) {
  const pausado = s.estado_viaje === 'pausada';
  const comb = s.combustible.nivel_pct;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <EstadoBadge def={estadoViaje(s.estado_viaje)} />
        <span className="text-[13px] text-text-2">{s.mensaje}</span>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
          <span className="font-cond tabular text-2xl font-bold">{numero(s.progreso.porcentaje, 1)} %</span>
          <span className="tabular text-text-2">
            {numero(s.progreso.km_recorridos, 1)} de {numero(s.progreso.km_totales, 1)} km
          </span>
        </div>
        <BarraProgreso valor={s.progreso.porcentaje} tono={pausado ? 'danger' : 'primary'} />
        <div className="mt-1 text-xs text-text-3">Faltan {numero(s.progreso.km_restantes, 1)} km</div>
      </div>

      <dl className={cn('grid gap-3 text-[13px]', compacta ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4')}>
        <div>
          <dt className="flex items-center gap-1 text-xs text-text-3">
            <Clock className="size-3.5" /> Llegada estimada
          </dt>
          <dd className="tabular mt-0.5 font-semibold">{s.tiempos.llegada_en ? hora(s.tiempos.llegada_en) : hora(s.tiempos.hora_estimada_llegada)}</dd>
          <dd className="text-xs text-text-3">
            {s.tiempos.llegada_en ? 'Llegó' : s.tiempos.segundos_restantes !== null ? `en ${duracion(s.tiempos.segundos_restantes)}` : '—'}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-xs text-text-3">
            <Gauge className="size-3.5" /> Velocidad
          </dt>
          <dd className="tabular mt-0.5 font-semibold">{numero(s.posicion.velocidad_kmh, 0)} km/h</dd>
          <dd className="text-xs text-text-3">Velocidad simulada del camión</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-xs text-text-3">
            <Fuel className="size-3.5" /> Combustible
          </dt>
          <dd className="tabular mt-0.5 font-semibold">
            {numero(comb, 0)} %{s.combustible.litros !== null && <span className="font-normal text-text-2">, {numero(s.combustible.litros, 0)} L</span>}
          </dd>
          <BarraProgreso valor={comb} tono={tonoCombustible(comb)} className="mt-1" />
          <dd className="mt-1 text-xs text-text-3">
            Autonomía {numero(s.combustible.autonomia_km, 0)} km, {s.combustible.recargas} recarga(s)
            {s.combustible.estimado && ', estimado'}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-xs text-text-3">
            <MapPin className="size-3.5" /> Siguiente parada
          </dt>
          <dd className="mt-0.5 font-semibold">{s.siguiente_parada?.nombre ?? 'Destino'}</dd>
          {typeof s.siguiente_parada?.km_desde_origen === 'number' && (
            <dd className="text-xs text-text-3">km {numero(s.siguiente_parada.km_desde_origen, 0)} desde el origen</dd>
          )}
        </div>
      </dl>

      {s.parada_actual.en_parada && (
        <div className="flex items-center gap-2 rounded-md bg-warn-soft px-3 py-2 text-[13px]">
          <PauseCircle className="size-4 text-warn" />
          Detenido: {s.parada_actual.motivo ?? 'parada'} hasta las {hora(s.parada_actual.hasta)}
        </div>
      )}

      {!compacta && s.paradas.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-text-2">Paradas en la ruta</p>
          <ol className="space-y-1.5">
            {s.paradas.map((p, i) => (
              <li key={i} className="flex items-center gap-2 text-[13px]">
                <span
                  className={cn(
                    'size-2.5 shrink-0 rounded-full border-2',
                    p.estado === 'pasada' && 'border-text-3 bg-text-3',
                    p.estado === 'proxima' && 'border-primary bg-primary',
                    p.estado === 'pendiente' && 'border-text-3 bg-surface',
                  )}
                  aria-hidden
                />
                <span className={cn('flex-1', p.estado === 'pasada' && 'text-text-3')}>{p.nombre ?? 'Parada'}</span>
                <span className="tabular text-xs text-text-3">km {numero(p.km_desde_origen, 0)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="text-xs text-text-3">
        Posición {s.posicion.actualizada_en ? `actualizada ${relativo(s.posicion.actualizada_en)} (${fechaHora(s.posicion.actualizada_en)})` : 'sin actualizar'}.
        Viaje simulado y acelerado ×{numero(s.factor_tiempo, 0)}: la hora de llegada es real; la velocidad es la de un camión real.
      </p>
    </div>
  );
}
