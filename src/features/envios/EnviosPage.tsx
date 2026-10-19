import { CalendarClock, Globe2, PackagePlus, RefreshCw, Search, Skull, Snowflake, Split } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { EstadoBadge, Tag } from '@/components/shared/Badge';
import { DataTable, type Columna } from '@/components/shared/DataTable';
import { Codigo, PageHeader, Panel } from '@/components/shared/Layout';
import { Plate } from '@/components/shared/Plate';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { usePuede } from '@/app/auth';
import { useClientes, useEnvios } from '@/hooks/queries';
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl';
import { ESTADOS_ENVIO, ESTADOS_ENVIO_LISTA, estadoEnvio } from '@/lib/dominio';
import { fechaHora, hora, num, numero, pesos, relativo } from '@/lib/format';
import type { Envio } from '@/lib/types/api';
import { cn, coincide } from '@/lib/utils';

export function EtiquetasCarga({ e }: { e: Pick<Envio, 'tipo_carga' | 'es_hazmat' | 'es_internacional'> }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {e.tipo_carga === 'refrigerada' && (
        <Tag tono="info" icono={<Snowflake />}>
          Refrigerada
        </Tag>
      )}
      {e.es_hazmat && (
        <Tag tono="danger" icono={<Skull />}>
          HAZMAT
        </Tag>
      )}
      {e.es_internacional && (
        <Tag tono="primary" icono={<Globe2 />}>
          Internacional
        </Tag>
      )}
    </span>
  );
}

/** Partes de un pedido dividido («2 de 3 entregadas») o la fecha de un envío programado. */
export function DetallePedido({ e }: { e: Envio }) {
  if ((e.partes_total ?? 0) > 0)
    return (
      <Tag tono="neutral" icono={<Split />}>
        {e.partes_entregadas ?? 0} de {e.partes_total} partes
      </Tag>
    );
  if (e.estado === 'programado' && e.fecha_programada)
    return (
      <Tag tono="info" icono={<CalendarClock />}>
        {fechaHora(e.fecha_programada)}
      </Tag>
    );
  return null;
}

const CLAVES = ['estado', 'cliente', 'q'] as const;

export default function EnviosPage() {
  const { valores, set, limpiar } = useFiltrosUrl(CLAVES);
  const eligeCliente = usePuede('elegirCliente');
  const puedeCrear = usePuede('crearEnvio');
  const esCliente = !usePuede('operarEnvio') && !eligeCliente;
  // solo_pedidos: un pedido dividido aparece una vez (sus partes se ven en el detalle)
  const envios = useEnvios({
    estado: valores.estado || undefined,
    cliente_id: (eligeCliente && valores.cliente) || undefined,
    solo_pedidos: true,
  });
  const clientes = useClientes({ limite: 200 }, { enabled: eligeCliente });
  const navigate = useNavigate();
  const nombreCliente = useMemo(() => new Map((clientes.data ?? []).map((c) => [c.id, c.nombre])), [clientes.data]);

  const filas = useMemo(
    () =>
      (envios.data ?? []).filter((e) =>
        coincide(valores.q, e.codigo_envio, e.origen, e.destino, e.placa_vehiculo, e.conductor_nombre, e.codigo_ruta, nombreCliente.get(e.cliente_id)),
      ),
    [envios.data, valores.q, nombreCliente],
  );

  const columnas: Columna<Envio>[] = [
    {
      id: 'codigo',
      titulo: 'Envío',
      celda: (e) => (
        <div className="space-y-1">
          <Codigo>{e.codigo_envio}</Codigo>
          <div>
            <DetallePedido e={e} />
          </div>
        </div>
      ),
      orden: (e) => e.codigo_envio,
    },
    {
      id: 'ruta',
      titulo: 'Origen y destino',
      celda: (e) => (
        <div className="min-w-48">
          <div className="truncate">{e.origen}</div>
          <div className="truncate text-xs text-text-2">hacia {e.destino}</div>
        </div>
      ),
      orden: (e) => e.origen,
    },
    {
      id: 'cliente',
      titulo: 'Cliente',
      celda: (e) => (
        <span className="block max-w-44 truncate" title={nombreCliente.get(e.cliente_id)}>
          {nombreCliente.get(e.cliente_id) ?? e.codigo_cliente ?? '—'}
        </span>
      ),
      orden: (e) => nombreCliente.get(e.cliente_id) ?? '',
      ocultarBajo: 'lg',
    },
    { id: 'estado', titulo: 'Estado', celda: (e) => <EstadoBadge def={estadoEnvio(e.estado)} />, orden: (e) => e.estado },
    {
      id: 'carga',
      titulo: 'Carga',
      celda: (e) => (
        <div className="space-y-1">
          <span className="tabular">{numero(e.peso_kg)} kg</span>
          <div>
            <EtiquetasCarga e={e} />
          </div>
        </div>
      ),
      orden: (e) => num(e.peso_kg),
      ocultarBajo: 'md',
    },
    {
      id: 'vehiculo',
      titulo: 'Vehículo',
      celda: (e) =>
        e.placa_vehiculo ? (
          <div>
            <Plate placa={e.placa_vehiculo} tamano="sm" />
            <div className="mt-0.5 max-w-36 truncate text-xs text-text-2">{e.conductor_nombre}</div>
          </div>
        ) : (
          <span className="text-xs text-text-3">{e.estado === 'sin_asignacion' ? 'Esperando' : '—'}</span>
        ),
      orden: (e) => e.placa_vehiculo,
      ocultarBajo: 'sm',
    },
    {
      id: 'monto',
      titulo: 'Precio',
      celda: (e) => <span className="tabular">{e.monto_cop != null ? pesos(e.monto_cop) : '—'}</span>,
      orden: (e) => num(e.monto_cop),
      ocultarBajo: 'xl',
    },
    {
      id: 'eta',
      titulo: 'Llegada estimada',
      celda: (e) => (e.hora_estimada_llegada ? <span title={fechaHora(e.hora_estimada_llegada)}>{hora(e.hora_estimada_llegada)}</span> : '—'),
      orden: (e) => e.hora_estimada_llegada,
      ocultarBajo: 'xl',
    },
    {
      id: 'creado',
      titulo: 'Creado',
      celda: (e) => <span title={fechaHora(e.creado_en)}>{relativo(e.creado_en)}</span>,
      orden: (e) => e.creado_en,
      ocultarBajo: 'lg',
    },
  ];

  return (
    <>
      <PageHeader
        titulo={esCliente ? 'Mis envíos' : 'Envíos'}
        descripcion={
          esCliente
            ? 'Sus pedidos y en qué van. El sistema asigna vehículo y conductor solo. La lista se actualiza cada 10 segundos.'
            : 'Al crear un envío el sistema reserva vehículo y conductor, arranca el viaje y lo entrega solo. La lista se actualiza cada 10 segundos.'
        }
        acciones={
          <>
            <Button onClick={() => envios.refetch()} aria-label="Actualizar lista">
              <RefreshCw className={cn(envios.isFetching && 'animate-spin')} /> Actualizar
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
      <Panel cuerpo="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-rule p-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-3" />
            <Input
              value={valores.q}
              onChange={(e) => set('q', e.target.value)}
              placeholder={eligeCliente ? 'Código, ciudad, placa, conductor o cliente' : 'Código, ciudad, placa o conductor'}
              aria-label="Buscar en los envíos"
              className="pl-8"
            />
          </div>
          <NativeSelect value={valores.estado} onChange={(e) => set('estado', e.target.value)} className="w-48" aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            {ESTADOS_ENVIO_LISTA.map((s) => (
              <option key={s} value={s}>
                {ESTADOS_ENVIO[s]!.etiqueta}
              </option>
            ))}
          </NativeSelect>
          {eligeCliente && (
            <NativeSelect value={valores.cliente} onChange={(e) => set('cliente', e.target.value)} className="w-56" aria-label="Filtrar por cliente">
              <option value="">Todos los clientes</option>
              {(clientes.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </NativeSelect>
          )}
          {(valores.estado || valores.cliente || valores.q) && (
            <Button variant="ghost" size="sm" onClick={limpiar}>
              Limpiar filtros
            </Button>
          )}
        </div>
        <DataTable
          etiqueta="Envíos"
          filas={envios.data ? filas : undefined}
          columnas={eligeCliente ? columnas : columnas.filter((c) => c.id !== 'cliente')}
          clave={(e) => e.id}
          cargando={envios.isLoading}
          error={envios.error}
          reintentar={() => envios.refetch()}
          onFila={(e) => navigate(`/envios/${e.id}`)}
          ordenInicial={{ id: 'creado', dir: 'desc' }}
          vacio={
            <div className="py-10 text-center text-[13px] text-text-2">
              {envios.data?.length ? 'Ningún envío coincide con la búsqueda.' : 'No hay envíos con estos filtros.'}
            </div>
          }
        />
      </Panel>
    </>
  );
}
