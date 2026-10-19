import { usePuede } from '@/app/auth';
import { Link2, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { EstadoBadge, Tag } from '@/components/shared/Badge';
import { Codigo, KeyValue, PageHeader, Panel } from '@/components/shared/Layout';
import { Plate } from '@/components/shared/Plate';
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { useConductor, useEficienciaCombustible, useEnvios, useVehiculos } from '@/hooks/queries';
import { clasificacionCombustible, estadoConductor, estadoEnvio, tipoVehiculo } from '@/lib/dominio';
import { numero, relativo } from '@/lib/format';
import { DialogoConductor, DialogoVincular } from './FormConductor';

export default function ConductorDetallePage() {
  const editaFlota = usePuede('editarFlota');
  const verEficiencia = usePuede('dashboard');
  const { id = '' } = useParams();
  const c = useConductor(id);
  const vehiculos = useVehiculos();
  const envios = useEnvios();
  const ef = useEficienciaCombustible(200);
  const [editar, setEditar] = useState(false);
  const [vincular, setVincular] = useState(false);

  if (c.error) return <ErrorState error={c.error} reintentar={() => c.refetch()} />;
  if (!c.data) return <LoadingState />;
  const x = c.data;
  const v = vehiculos.data?.find((y) => y.id === x.vehiculo_id);
  const suyos = (envios.data ?? []).filter((e) => e.conductor_id === x.id);
  const eficiencia = ef.data?.find((e) => e.conductor_id === x.id);

  return (
    <>
      <PageHeader
        migas={[{ etiqueta: 'Conductores', to: '/flota/conductores' }, { etiqueta: x.nombre }]}
        titulo={
          <span className="flex flex-wrap items-center gap-3">
            {x.nombre} <EstadoBadge def={estadoConductor(x.estado)} />
          </span>
        }
        descripcion={`Código ${x.codigo_conductor}, licencia ${x.licencia_numero}`}
        acciones={
          <>
            {editaFlota && !x.vehiculo_id && (
              <Button onClick={() => setVincular(true)}>
                <Link2 /> Vincular vehículo
              </Button>
            )}
            {editaFlota && (
              <Button variant="primary" onClick={() => setEditar(true)}>
                <Pencil /> Editar
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel titulo="Datos del conductor">
          <KeyValue
            items={[
              { k: 'Categorías de licencia', v: <span className="font-cond font-bold">{x.categorias_licencia ?? 'Sin categorías'}</span> },
              { k: 'Certificación HAZMAT', v: x.certificacion_hazmat ? <Tag tono="danger">Certificado</Tag> : 'No' },
              { k: 'Experiencia', v: `${x.anios_experiencia} año(s)` },
              { k: 'Horas semanales', v: numero(x.horas_semanales, 1) },
              { k: 'Número de licencia', v: x.licencia_numero },
              { k: 'Código', v: x.codigo_conductor },
            ]}
          />
        </Panel>
        <Panel titulo="Vehículo asignado">
          {v ? (
            <KeyValue
              items={[
                { k: 'Placa', v: <Plate placa={v.placa} vehiculoId={v.id} /> },
                { k: 'Tipo', v: tipoVehiculo(v.tipo) },
                { k: 'Capacidad', v: `${numero(v.capacidad_kg)} kg` },
                { k: 'Ubicación', v: <Link className="text-primary hover:underline" to={`/mapa?v=${v.id}`}>Ver en el mapa</Link> },
              ]}
            />
          ) : (
            <EmptyState
              titulo="Sin vehículo"
              compacto
              accion={
                editaFlota && (
                  <Button size="sm" onClick={() => setVincular(true)}>
                    <Link2 /> Vincular vehículo
                  </Button>
                )
              }
            >
              Un conductor sin vehículo no participa en las asignaciones.
            </EmptyState>
          )}
        </Panel>
        {verEficiencia && <Panel titulo="Eficiencia de combustible" descripcion="Según la analítica (ETL periódica)">
          {eficiencia ? (
            <KeyValue
              items={[
                { k: 'Clasificación', v: <EstadoBadge def={clasificacionCombustible(eficiencia.clasificacion)} /> },
                { k: 'Kilómetros por punto de combustible', v: numero(eficiencia.km_por_pct_combustible, 2) },
                { k: 'Kilómetros analizados', v: numero(eficiencia.km_recorridos, 1) },
                { k: 'Lecturas analizadas', v: eficiencia.lecturas_analizadas },
                { k: 'Actualizado', v: relativo(eficiencia.actualizado_en) },
              ]}
            />
          ) : (
            <p className="text-[13px] text-text-2">{ef.isLoading ? 'Cargando…' : 'Aún no hay datos de eficiencia para este conductor.'}</p>
          )}
        </Panel>}
        <Panel titulo="Envíos conducidos" descripcion={`${suyos.length} envío(s)`} cuerpo="p-0">
          {suyos.length === 0 ? (
            <EmptyState titulo="Sin envíos" compacto />
          ) : (
            <ul className="max-h-80 divide-y divide-rule overflow-y-auto">
              {suyos.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                  <span>
                    <Codigo to={`/envios/${e.id}`}>{e.codigo_envio}</Codigo> <span className="text-text-2">{e.origen.split(',')[0]} a {e.destino.split(',')[0]}</span>
                  </span>
                  <EstadoBadge def={{ ...estadoEnvio(e.estado), ayuda: undefined }} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      {editaFlota && <DialogoConductor abierto={editar} onAbierto={setEditar} conductor={x} />}
      {editaFlota && <DialogoVincular abierto={vincular} onAbierto={setVincular} conductor={x} />}
    </>
  );
}
