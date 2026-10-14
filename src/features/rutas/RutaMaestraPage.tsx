import type { LatLngBoundsExpression } from 'leaflet';
import { RefreshCcw } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { AjustarVista, BaseMap } from '@/components/map/BaseMap';
import { CapaRuta } from '@/components/map/CapaRuta';
import { Badge } from '@/components/shared/Badge';
import { ConfirmDialog, ErrorFormulario } from '@/components/shared/Form';
import { KeyValue, PageHeader, Panel } from '@/components/shared/Layout';
import { EmptyState, ErrorState, Limitacion, LoadingState } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { useGeometria, useRutaMaestra } from '@/hooks/queries';
import { useAccion } from '@/hooks/useAccion';
import * as api from '@/lib/api/endpoints';
import { fechaHora, horas, numero } from '@/lib/format';

export default function RutaMaestraPage() {
  const { id = '' } = useParams();
  const r = useRutaMaestra(id);
  const g = useGeometria(id);
  const [confirmar, setConfirmar] = useState(false);
  const recalcular = useAccion({
    fn: () => api.rutasMaestras.recalcular(id),
    exito: (x) => `Ruta recalculada: ${numero(x.distancia_km, 1)} km (${x.estimada ? 'estimada' : 'carretera real'}).`,
    invalida: [['rutasMaestras']],
    toastError: false,
    onSuccess: () => setConfirmar(false),
  });

  if (r.error) return <ErrorState error={r.error} reintentar={() => r.refetch()} />;
  if (!r.data) return <LoadingState />;
  const m = r.data;
  const puntos = g.data?.puntos ?? [];
  const limites: LatLngBoundsExpression | null = puntos.length > 1 ? puntos : null;

  return (
    <>
      <PageHeader
        migas={[{ etiqueta: 'Rutas', to: '/rutas?tab=maestras' }, { etiqueta: m.codigo_ruta }]}
        titulo={<span className="font-cond tracking-wide">{m.codigo_ruta}</span>}
        descripcion={`${m.origen.etiqueta} hacia ${m.destino.etiqueta}`}
        acciones={
          <Button onClick={() => setConfirmar(true)}>
            <RefreshCcw /> Recalcular con el servicio de mapas
          </Button>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        <Panel titulo="Trazado" descripcion={g.data ? `${numero(g.data.num_puntos)} puntos, fuente ${g.data.fuente}` : 'GET /rutas-maestras/{id}/geometria'} cuerpo="p-0" className="overflow-hidden">
          <div className="h-[460px]">
            {g.error ? (
              <ErrorState error={g.error} reintentar={() => g.refetch()} />
            ) : (
              <BaseMap className="size-full" etiqueta={`Trazado de ${m.codigo_ruta}`}>
                <AjustarVista limites={limites} clave={`${id}-${puntos.length}`} />
                {puntos.length > 1 && (
                  <CapaRuta
                    puntos={puntos}
                    paradas={m.paradas ?? []}
                    estimada={m.estimada}
                    origen={{ nombre: m.origen.nombre, latitud: m.origen.latitud, longitud: m.origen.longitud }}
                    destino={{ nombre: m.destino.nombre, latitud: m.destino.latitud, longitud: m.destino.longitud }}
                  />
                )}
              </BaseMap>
            )}
          </div>
          {m.estimada && (
            <div className="border-t border-rule p-3">
              <Limitacion titulo="Trazado estimado">
                El servicio de mapas (OSRM) no respondió cuando se calculó: la línea une origen y destino y la distancia es la recta multiplicada por 1,3.
                Routing reintenta OSRM por su cuenta cada 10 minutos; también puede recalcularla ahora.
              </Limitacion>
            </div>
          )}
        </Panel>
        <div className="space-y-5">
          <Panel titulo="Datos de la ruta">
            <KeyValue
              items={[
                { k: 'Distancia', v: `${numero(m.distancia_km, 1)} km` },
                { k: 'Duración real estimada', v: horas(m.duracion_horas) },
                { k: 'Trazado', v: m.estimada ? <Badge tono="warn">Estimado</Badge> : <Badge tono="ok">Carretera (OSRM)</Badge> },
                { k: 'Fuente', v: m.fuente },
                { k: 'Origen', v: `${m.origen.etiqueta} (${m.origen.codigo})`, ancho: true },
                { k: 'Destino', v: `${m.destino.etiqueta} (${m.destino.codigo})`, ancho: true },
                { k: 'Calculada', v: fechaHora(m.calculada_en) },
                { k: 'Actualizada', v: fechaHora(m.actualizado_en) },
              ]}
            />
          </Panel>
          <Panel titulo="Paradas en la vía" descripcion="Ciudades del catálogo a 20 km o menos de la carretera">
            {m.paradas?.length ? (
              <ol className="space-y-1.5">
                {m.paradas.map((p, i) => (
                  <li key={i} className="flex justify-between gap-2 text-[13px]">
                    <span>{p.nombre ?? 'Parada'}</span>
                    <span className="tabular text-xs text-text-3">km {numero(p.km_desde_origen, 0)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState titulo="Sin paradas intermedias" compacto>
                {m.estimada ? 'Las rutas estimadas no calculan paradas.' : 'Ninguna ciudad del catálogo queda cerca de la vía.'}
              </EmptyState>
            )}
          </Panel>
        </div>
      </div>
      <ConfirmDialog
        abierto={confirmar}
        onAbierto={setConfirmar}
        titulo="Recalcular la ruta maestra"
        confirmar="Recalcular"
        onConfirmar={() => recalcular.mutate()}
        cargando={recalcular.isPending}
      >
        <p>
          Se vuelve a consultar el servicio de mapas y se reemplazan distancia, duración, trazado y paradas. Los envíos futuros entre estas ciudades usarán los
          nuevos datos. Si el servicio de mapas no responde, la operación falla sin cambiar nada.
        </p>
        <ErrorFormulario error={recalcular.error} />
      </ConfirmDialog>
    </>
  );
}
