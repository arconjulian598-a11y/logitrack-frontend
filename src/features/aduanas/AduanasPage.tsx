import { CheckCircle2, ExternalLink, FileWarning, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EstadoBadge } from '@/components/shared/Badge';
import { DataTable, type Columna } from '@/components/shared/DataTable';
import { ConfirmDialog, ErrorFormulario, Field } from '@/components/shared/Form';
import { Cifra, Codigo, KeyValue, PageHeader, Panel } from '@/components/shared/Layout';
import { Nota } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { Dialog, SheetContent } from '@/components/ui/dialog';
import { NativeSelect, Textarea } from '@/components/ui/input';
import { useDeclaraciones, useEnvio, useEnvios } from '@/hooks/queries';
import { useAccion } from '@/hooks/useAccion';
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl';
import * as api from '@/lib/api/endpoints';
import { ESTADOS_DECLARACION, estadoDeclaracion, estadoEnvio } from '@/lib/dominio';
import { fechaHora, relativo } from '@/lib/format';
import type { DeclaracionAduanera, EstadoDeclaracion } from '@/lib/types/api';
import { Documentos } from './Documentos';

function CambiarEstado({ d }: { d: DeclaracionAduanera }) {
  const [destino, setDestino] = useState<EstadoDeclaracion | null>(null);
  const [motivo, setMotivo] = useState('');
  const a = useAccion({
    fn: () => api.aduanas.cambiarEstado(d.id, destino!, destino === 'aprobado' ? null : motivo),
    exito: (r) => `Declaración ${estadoDeclaracion(r.estado).etiqueta.toLowerCase()}.`,
    invalida: [['aduanas'], ['envios'], ['seguimiento'], ['simulaciones']],
    toastError: false,
    onSuccess: () => {
      setDestino(null);
      setMotivo('');
    },
  });
  const opciones: { e: EstadoDeclaracion; etiqueta: string; icono: React.ReactNode }[] = [
    { e: 'aprobado', etiqueta: 'Aprobar y liberar', icono: <CheckCircle2 /> },
    { e: 'retenido', etiqueta: 'Retener', icono: <ShieldAlert /> },
    { e: 'pendiente', etiqueta: 'Volver a pendiente', icono: <FileWarning /> },
  ];
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-text-2">Cambiar estado</p>
      <div className="flex flex-wrap gap-2">
        {opciones
          .filter((o) => o.e !== d.estado)
          .map((o) => (
            <Button key={o.e} size="sm" variant={o.e === 'aprobado' ? 'primary' : o.e === 'retenido' ? 'danger-outline' : 'secondary'} onClick={() => setDestino(o.e)}>
              {o.icono} {o.etiqueta}
            </Button>
          ))}
      </div>
      <Nota>
        Aprobar saca el envío de «retenido en aduana» y reanuda el viaje. Retener o dejar pendiente pausa el viaje del envío.
      </Nota>
      <ConfirmDialog
        abierto={!!destino}
        onAbierto={(v) => !v && setDestino(null)}
        titulo={destino === 'aprobado' ? 'Aprobar la declaración' : destino === 'retenido' ? 'Retener el envío en aduana' : 'Dejar la declaración pendiente'}
        confirmar={destino === 'aprobado' ? 'Aprobar' : destino === 'retenido' ? 'Retener' : 'Dejar pendiente'}
        onConfirmar={() => a.mutate()}
        cargando={a.isPending}
        peligro={destino === 'retenido'}
      >
        <p>
          {destino === 'aprobado'
            ? 'El envío sale de la retención y el vehículo continúa su viaje.'
            : 'El envío queda «retenido en aduana» y el viaje se pausa hasta que se apruebe.'}
        </p>
        {destino !== 'aprobado' && (
          <Field label="Motivo de la retención" htmlFor="motivo" ayuda="Se guarda en la declaración.">
            <Textarea id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </Field>
        )}
        <ErrorFormulario error={a.error} />
      </ConfirmDialog>
    </div>
  );
}

function FichaDeclaracion({ d }: { d: DeclaracionAduanera }) {
  const envio = useEnvio(d.envio_id);
  return (
    <div className="space-y-5">
      <KeyValue
        items={[
          { k: 'Estado', v: <EstadoBadge def={estadoDeclaracion(d.estado)} /> },
          {
            k: 'Envío',
            v: envio.data ? (
              <span className="flex items-center gap-2">
                <Codigo to={`/envios/${d.envio_id}`}>{envio.data.codigo_envio}</Codigo>
                <EstadoBadge def={estadoEnvio(envio.data.estado)} />
              </span>
            ) : (
              <Link className="text-primary hover:underline" to={`/envios/${d.envio_id}`}>
                Ver envío
              </Link>
            ),
          },
          { k: 'País de origen', v: d.pais_origen },
          { k: 'País de destino', v: d.pais_destino },
          { k: 'Motivo de retención', v: d.motivo_retencion ?? '—', ancho: true },
          { k: 'Creada', v: fechaHora(d.creado_en) },
          { k: 'Actualizada', v: fechaHora(d.actualizado_en) },
        ]}
      />
      <Documentos documentos={d.documentos} />
      <CambiarEstado d={d} />
    </div>
  );
}

export default function AduanasPage() {
  const { valores, set } = useFiltrosUrl(['estado'] as const);
  const [params, setParams] = useSearchParams();
  const sel = params.get('sel');
  const todas = useDeclaraciones();
  const decl = useDeclaraciones({ estado: valores.estado || undefined });
  const envios = useEnvios();
  const codigoEnvio = useMemo(() => new Map((envios.data ?? []).map((e) => [e.id, e])), [envios.data]);
  const seleccion = (todas.data ?? []).find((d) => d.id === sel) ?? null;

  const lista = todas.data ?? [];
  const n = (e: string) => lista.filter((d) => d.estado === e).length;
  const internacionalesSinDecl = (envios.data ?? []).filter((e) => e.es_internacional && !lista.some((d) => d.envio_id === e.id));

  const abrir = (id: string | null) =>
    setParams(
      (p) => {
        const x = new URLSearchParams(p);
        if (id) x.set('sel', id);
        else x.delete('sel');
        return x;
      },
      { replace: true },
    );

  const columnas: Columna<DeclaracionAduanera>[] = [
    {
      id: 'envio',
      titulo: 'Envío',
      celda: (d) => <Codigo>{codigoEnvio.get(d.envio_id)?.codigo_envio ?? d.envio_id.slice(0, 8)}</Codigo>,
      orden: (d) => codigoEnvio.get(d.envio_id)?.codigo_envio,
    },
    { id: 'paises', titulo: 'Países', celda: (d) => `${d.pais_origen} a ${d.pais_destino}`, orden: (d) => d.pais_destino },
    { id: 'estado', titulo: 'Estado', celda: (d) => <EstadoBadge def={estadoDeclaracion(d.estado)} />, orden: (d) => d.estado },
    {
      id: 'docs',
      titulo: 'Documentos',
      celda: (d) => <span className="tabular">{d.documentos?.length ?? 0}</span>,
      alinear: 'right',
      ocultarBajo: 'md',
    },
    { id: 'motivo', titulo: 'Motivo de retención', celda: (d) => <span className="block max-w-72 truncate text-text-2">{d.motivo_retencion ?? '—'}</span>, ocultarBajo: 'lg' },
    { id: 'act', titulo: 'Actualizada', celda: (d) => relativo(d.actualizado_en), orden: (d) => d.actualizado_en, ocultarBajo: 'sm' },
  ];

  return (
    <>
      <PageHeader
        titulo="Aduanas"
        descripcion="Cada envío internacional genera una declaración. Mientras no esté aprobada, el envío queda retenido y su viaje en pausa."
      />
      <Panel cuerpo="px-3 py-3" className="mb-5">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Cifra valor={lista.length} etiqueta="Declaraciones" />
          <Cifra valor={n('pendiente')} etiqueta="Pendientes" tono={n('pendiente') ? 'warn' : undefined} />
          <Cifra valor={n('retenido')} etiqueta="Retenidas" tono={n('retenido') ? 'danger' : undefined} />
          <Cifra
            valor={internacionalesSinDecl.length}
            etiqueta="Internacionales sin declaración"
            detalle="documentación por generar"
            tono={internacionalesSinDecl.length ? 'warn' : undefined}
          />
        </div>
      </Panel>
      <Panel cuerpo="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-rule p-3">
          <NativeSelect value={valores.estado} onChange={(e) => set('estado', e.target.value)} className="w-52" aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            {Object.entries(ESTADOS_DECLARACION).map(([k, v]) => (
              <option key={k} value={k}>
                {v.etiqueta}
              </option>
            ))}
          </NativeSelect>
          <span className="text-xs text-text-3">El filtro lo aplica el servicio de aduanas (parámetro estado).</span>
        </div>
        <DataTable
          etiqueta="Declaraciones aduaneras"
          filas={decl.data}
          columnas={columnas}
          clave={(d) => d.id}
          cargando={decl.isLoading}
          error={decl.error}
          reintentar={() => decl.refetch()}
          onFila={(d) => abrir(d.id)}
          ordenInicial={{ id: 'act', dir: 'desc' }}
          vacio={<div className="py-10 text-center text-[13px] text-text-2">No hay declaraciones{valores.estado ? ' con este estado' : ''}. Se crean al registrar envíos internacionales.</div>}
        />
      </Panel>

      <Dialog open={!!seleccion} onOpenChange={(v) => !v && abrir(null)}>
        {seleccion && (
          <SheetContent
            titulo="Declaración aduanera"
            descripcion={`${seleccion.pais_origen} a ${seleccion.pais_destino}`}
            acciones={
              <Button size="icon-sm" variant="ghost" asChild aria-label="Abrir el envío">
                <Link to={`/envios/${seleccion.envio_id}`}>
                  <ExternalLink />
                </Link>
              </Button>
            }
          >
            <FichaDeclaracion d={seleccion} />
          </SheetContent>
        )}
      </Dialog>
    </>
  );
}
