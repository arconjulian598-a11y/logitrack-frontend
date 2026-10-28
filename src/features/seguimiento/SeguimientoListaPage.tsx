import { Navigation } from 'lucide-react';
import { Link } from 'react-router';
import { EstadoBadge } from '@/components/shared/Badge';
import { Codigo, PageHeader, Panel } from '@/components/shared/Layout';
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { useEnvios } from '@/hooks/queries';
import { ESTADOS_FINALES_ENVIO, estadoEnvio } from '@/lib/dominio';
import { fechaHora, hora } from '@/lib/format';
import type { Envio } from '@/lib/types/api';
import { DetallePedido } from '../envios/EnviosPage';

function Fila({ e }: { e: Envio }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-[13px]">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Codigo>{e.codigo_envio}</Codigo>
          <EstadoBadge def={estadoEnvio(e.estado)} />
          <DetallePedido e={e} />
        </div>
        <p className="truncate text-text-2">
          {e.origen} <span className="text-text-3">hacia</span> {e.destino}
        </p>
        {e.hora_estimada_llegada && !ESTADOS_FINALES_ENVIO.includes(e.estado) && (
          <p className="text-xs text-text-3" title={fechaHora(e.hora_estimada_llegada)}>
            Llegada estimada {hora(e.hora_estimada_llegada)}
          </p>
        )}
      </div>
      <Button size="sm" variant="primary" asChild>
        <Link to={`/seguimiento/${e.id}`} aria-label={`Ver seguimiento de ${e.codigo_envio}`}>
          <Navigation /> Ver seguimiento
        </Link>
      </Button>
    </li>
  );
}

/**
 * Envíos del cliente con acceso a su seguimiento. Aquí NO se consulta el seguimiento de cada envío:
 * solo el envío que se abre hace polling.
 */
export default function SeguimientoListaPage() {
  const envios = useEnvios({ solo_pedidos: true });
  const lista = [...(envios.data ?? [])].sort((a, b) => (b.creado_en ?? '').localeCompare(a.creado_en ?? ''));
  const activos = lista.filter((e) => !ESTADOS_FINALES_ENVIO.includes(e.estado));
  const terminados = lista.filter((e) => ESTADOS_FINALES_ENVIO.includes(e.estado)).slice(0, 10);

  return (
    <>
      <PageHeader titulo="Seguimiento" descripcion="Siga en el mapa dónde va cada uno de sus envíos." />
      {envios.error ? (
        <ErrorState error={envios.error} reintentar={() => envios.refetch()} />
      ) : !envios.data ? (
        <LoadingState />
      ) : lista.length === 0 ? (
        <EmptyState
          titulo="Aún no tiene envíos"
          accion={
            <Button variant="primary" asChild>
              <Link to="/envios/nuevo">Crear un envío</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          <Panel titulo="En curso" descripcion={`${activos.length} envío(s) sin terminar`} cuerpo="p-0">
            {activos.length ? (
              <ul className="divide-y divide-rule">
                {activos.map((e) => (
                  <Fila key={e.id} e={e} />
                ))}
              </ul>
            ) : (
              <EmptyState titulo="No tiene envíos en curso" compacto />
            )}
          </Panel>
          {terminados.length > 0 && (
            <Panel titulo="Terminados recientemente" cuerpo="p-0">
              <ul className="divide-y divide-rule">
                {terminados.map((e) => (
                  <Fila key={e.id} e={e} />
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}
    </>
  );
}
