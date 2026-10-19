import { AlertTriangle, CheckCircle2, Info, Split, XCircle } from 'lucide-react';
import { KeyValue } from '@/components/shared/Layout';
import { CAUSAS_VIABILIDAD } from '@/lib/dominio';
import { fechaHora, horas, num, numero, pesos } from '@/lib/format';
import type { Cotizacion, PartePlan } from '@/lib/types/api';

/** Peso de una parte del plan: el backend puede mandar el número solo o un objeto. */
export function pesoDeParte(p: PartePlan): number | null {
  if (typeof p === 'number' || typeof p === 'string') return num(p);
  return num(p.peso_kg ?? p.peso ?? null);
}

function capacidadDeParte(p: PartePlan): number | null {
  if (typeof p === 'number' || typeof p === 'string') return null;
  return num(p.capacidad_vehiculo_kg ?? p.capacidad_kg ?? null);
}

export function PlanDivision({ partes }: { partes: PartePlan[] }) {
  return (
    <div className="rounded-md border border-rule bg-surface-2 p-3">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-text">
        <Split className="size-4 text-primary" aria-hidden /> Plan de división: {partes.length} envíos
      </p>
      <ol className="mt-2 space-y-1 text-[13px] text-text-2">
        {partes.map((p, i) => {
          const cap = capacidadDeParte(p);
          return (
            <li key={i} className="flex justify-between gap-3">
              <span>Parte {typeof p === 'object' && p.parte_numero ? p.parte_numero : i + 1}</span>
              <span className="tabular-nums text-text">
                {numero(pesoDeParte(p), 2)} kg
                {cap !== null && <span className="text-text-3"> · vehículo de {numero(cap, 0)} kg</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-text-3">Cada parte viaja en su propio vehículo. Se cobra el pedido completo, una sola vez.</p>
    </div>
  );
}

/** Resultado de POST /envios/cotizar: precio, ruta, aviso y, si aplica, el plan de división. */
export function ResultadoCotizacion({ c }: { c: Cotizacion }) {
  const v = c.viabilidad;
  const partes = v?.partes ?? [];
  const desglose = c.cotizacion?.desglose;
  return (
    <div className="space-y-3" data-testid="cotizacion">
      {c.puede_crear ? (
        <div className="rounded-md border border-primary/25 bg-primary-soft px-4 py-3">
          <p className="text-xs font-semibold text-text-2">Precio del pedido</p>
          <p className="font-cond text-[28px] font-bold leading-tight tabular-nums text-text" data-testid="monto">
            {c.facturacion_activa && c.monto_cop !== null ? pesos(c.monto_cop) : 'Sin cobro'}
          </p>
          {!c.facturacion_activa && <p className="text-xs text-text-2">El servidor no tiene el cobro activo: no se cobra este pedido.</p>}
          {c.facturacion_activa && <p className="text-xs text-text-2">Pago simulado: no se mueve dinero real.</p>}
        </div>
      ) : (
        <div role="alert" className="flex gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px]">
          <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <div>
            <p className="font-semibold text-text">No se puede crear este envío</p>
            <p className="text-text-2">{v?.mensaje ?? CAUSAS_VIABILIDAD[v?.causa ?? ''] ?? 'La flota no puede transportar esta carga.'}</p>
          </div>
        </div>
      )}

      {c.aviso && (
        <p className="flex gap-2 rounded-md border border-info/30 bg-info-soft px-3 py-2 text-[13px] text-text">
          <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          {c.aviso}
        </p>
      )}

      <KeyValue
        columnas={2}
        items={[
          { k: 'Ruta', v: c.codigo_ruta ?? '—' },
          { k: 'Distancia', v: c.distancia_km !== null ? `${numero(c.distancia_km, 1)} km` : '—' },
          { k: 'Duración estimada', v: horas(c.duracion_horas) },
          { k: 'Tipo', v: c.es_internacional === null ? '—' : c.es_internacional ? 'Internacional' : 'Nacional' },
          ...(c.fecha_programada ? [{ k: 'Programado para', v: fechaHora(c.fecha_programada), ancho: true }] : []),
        ]}
      />

      {partes.length > 0 && <PlanDivision partes={partes} />}

      {v?.requiere_division && !c.es_divisible && v.division_posible && (
        <p className="flex gap-2 text-[13px] text-text-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          Si la carga se puede repartir, marque «Carga divisible» y vuelva a cotizar.
        </p>
      )}

      {desglose && c.puede_crear && c.facturacion_activa && (
        <details className="rounded-md border border-rule px-3 py-2 text-[13px]">
          <summary className="cursor-pointer font-medium text-text-2">Cómo se calculó el precio</summary>
          <KeyValue
            className="mt-3"
            columnas={2}
            items={[
              { k: 'Base', v: pesos(desglose.base_cop) },
              { k: 'Toneladas', v: numero(desglose.toneladas, 3) },
              { k: 'Distancia', v: `${numero(desglose.distancia_km, 1)} km` },
              { k: 'Pesos por ton·km', v: pesos(desglose.cop_por_ton_km) },
              { k: 'Parte variable', v: pesos(desglose.variable_cop) },
              { k: 'Mínimo', v: `${pesos(desglose.minimo_cop)}${desglose.aplico_minimo ? ' (aplicado)' : ''}` },
            ]}
          />
        </details>
      )}

      {c.puede_crear && c.facturacion_activa && (
        <p className="flex items-center gap-1.5 text-xs text-text-2">
          <CheckCircle2 className="size-3.5 text-ok" aria-hidden /> Al aceptar, el pedido se crea con el pago confirmado y su factura.
        </p>
      )}
    </div>
  );
}
