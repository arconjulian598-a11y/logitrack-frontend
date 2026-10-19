import { usePuede } from '@/app/auth';
import { PackagePlus, Pencil, Power } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Badge, EstadoBadge } from '@/components/shared/Badge';
import { ConfirmDialog, ErrorFormulario } from '@/components/shared/Form';
import { Codigo, KeyValue, PageHeader, Panel } from '@/components/shared/Layout';
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { useCliente, useEnvios, useFacturas } from '@/hooks/queries';
import { useAccion } from '@/hooks/useAccion';
import * as api from '@/lib/api/endpoints';
import { estadoEnvio, estadoFactura } from '@/lib/dominio';
import { fechaHora, pesos, relativo } from '@/lib/format';
import { EditorTarifa } from '../facturacion/Tarifa';
import { EditorPreferencia } from '../notificaciones/Preferencia';
import { DialogoCliente } from './FormCliente';

export default function ClienteDetallePage() {
  const admin = usePuede('administrar');
  const { id = '' } = useParams();
  const c = useCliente(id);
  const envios = useEnvios({ cliente_id: id });
  const facturas = useFacturas({ cliente_id: id });
  const navigate = useNavigate();
  const [editar, setEditar] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const activar = useAccion({
    fn: () => api.clientes.actualizar(id, { activo: !c.data!.activo }),
    exito: (x) => (x.activo ? 'Cliente activado.' : 'Cliente desactivado: no podrá crear envíos.'),
    invalida: [['clientes']],
    toastError: false,
    onSuccess: () => setConfirmar(false),
  });

  if (c.error) return <ErrorState error={c.error} reintentar={() => c.refetch()} />;
  if (!c.data) return <LoadingState />;
  const x = c.data;

  return (
    <>
      <PageHeader
        migas={[{ etiqueta: 'Clientes', to: '/clientes' }, { etiqueta: x.nombre }]}
        titulo={
          <span className="flex flex-wrap items-center gap-3">
            {x.nombre} {x.activo ? <Badge tono="ok">Activo</Badge> : <Badge tono="muted">Inactivo</Badge>}
          </span>
        }
        descripcion={`Código ${x.codigo_cliente}${x.numero_documento ? `, ${x.tipo_documento} ${x.numero_documento}` : ''}`}
        acciones={
          <>
            <Button variant={x.activo ? 'danger-outline' : 'secondary'} onClick={() => setConfirmar(true)}>
              <Power /> {x.activo ? 'Desactivar' : 'Activar'}
            </Button>
            <Button onClick={() => setEditar(true)}>
              <Pencil /> Editar
            </Button>
            {x.activo && (
              <Button variant="primary" asChild>
                <Link to="/envios/nuevo">
                  <PackagePlus /> Nuevo envío
                </Link>
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel titulo="Datos de contacto">
          <KeyValue
            items={[
              { k: 'Correo', v: x.email ?? '—' },
              { k: 'Teléfono', v: x.telefono ?? '—' },
              { k: 'Dirección', v: x.direccion ?? '—', ancho: true },
              { k: 'Registrado', v: fechaHora(x.creado_en) },
              { k: 'Histórico', v: x.es_historico ? 'Sí: se creó a partir de envíos anteriores. Complete el documento para regularizarlo.' : 'No', ancho: true },
            ]}
          />
        </Panel>
        {admin && (
          <Panel titulo="Tarifa" descripcion="Modelo de cobro mensual antiguo (Facturación)">
            <EditorTarifa clienteId={x.id} />
          </Panel>
        )}
        <Panel titulo="Envíos del cliente" descripcion={envios.data ? `${envios.data.length} envío(s)` : undefined} cuerpo="p-0">
          {envios.error ? (
            <ErrorState error={envios.error} compacto reintentar={() => envios.refetch()} />
          ) : !envios.data ? (
            <LoadingState />
          ) : envios.data.length === 0 ? (
            <EmptyState titulo="Sin envíos" compacto />
          ) : (
            <ul className="max-h-96 divide-y divide-rule overflow-y-auto">
              {envios.data.map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => navigate(`/envios/${e.id}`)} className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-surface-2">
                    <span className="text-[13px]">
                      <Codigo>{e.codigo_envio}</Codigo> <span className="text-text-2">{e.origen.split(',')[0]} a {e.destino.split(',')[0]}, {relativo(e.creado_en)}</span>
                    </span>
                    <EstadoBadge def={{ ...estadoEnvio(e.estado), ayuda: undefined }} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        {admin && <div className="space-y-5">
          <Panel titulo="Preferencias de notificación">
            <EditorPreferencia clienteId={x.id} />
          </Panel>
          <Panel titulo="Facturas mensuales" cuerpo="p-0">
            {facturas.error ? (
              <ErrorState error={facturas.error} compacto reintentar={() => facturas.refetch()} />
            ) : !facturas.data ? (
              <LoadingState />
            ) : facturas.data.length === 0 ? (
              <EmptyState titulo="Sin facturas" compacto />
            ) : (
              <ul className="divide-y divide-rule">
                {facturas.data.map((f) => (
                  <li key={f.id}>
                    <Link to={`/facturacion?factura=${f.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 text-[13px] hover:bg-surface-2">
                      <span className="font-cond font-bold">{f.periodo}</span>
                      <span className="flex items-center gap-3">
                        <span className="tabular">{pesos(f.monto_total)}</span>
                        <EstadoBadge def={estadoFactura(f.estado)} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>}
      </div>
      <DialogoCliente abierto={editar} onAbierto={setEditar} cliente={x} />
      <ConfirmDialog
        abierto={confirmar}
        onAbierto={setConfirmar}
        titulo={x.activo ? `Desactivar a ${x.nombre}` : `Activar a ${x.nombre}`}
        confirmar={x.activo ? 'Desactivar' : 'Activar'}
        onConfirmar={() => activar.mutate()}
        cargando={activar.isPending}
        peligro={x.activo}
      >
        <p>{x.activo ? 'Un cliente inactivo no puede crear envíos nuevos. Los envíos existentes no cambian.' : 'El cliente podrá volver a crear envíos.'}</p>
        <ErrorFormulario error={activar.error} />
      </ConfirmDialog>
    </>
  );
}
