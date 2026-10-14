import { zodResolver } from '@hookform/resolvers/zod';
import { History, Pencil, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import { z } from 'zod';
import { EstadoBadge } from '@/components/shared/Badge';
import { ErrorFormulario, Field, FormActions } from '@/components/shared/Form';
import { aNumero } from '@/lib/formularios';
import { Codigo, KeyValue, PageHeader, Panel } from '@/components/shared/Layout';
import { Plate } from '@/components/shared/Plate';
import { EmptyState, ErrorState, LoadingState, Nota } from '@/components/shared/States';
import { Timeline } from '@/components/shared/Timeline';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { useConductores, useEnvio, useRuta, useRutaHistorial, useVehiculos } from '@/hooks/queries';
import { useAccion } from '@/hooks/useAccion';
import * as api from '@/lib/api/endpoints';
import { estadoRuta } from '@/lib/dominio';
import { aInputLocal, desdeInputLocal, fechaHora, numero } from '@/lib/format';
import type { Ruta } from '@/lib/types/api';

const esquema = z.object({
  motivo_recalculo: z.string().trim().min(3, { error: 'Explique el motivo del recálculo' }),
  distancia_km: z.string().trim().refine((v) => v === '' || (aNumero(v) ?? -1) > 0, { error: 'Debe ser mayor que 0' }),
  hora_estimada_llegada: z.string(),
});

function Recalcular({ ruta, abierto, onAbierto }: { ruta: Ruta; abierto: boolean; onAbierto: (v: boolean) => void }) {
  const form = useForm({
    resolver: zodResolver(esquema),
    defaultValues: {
      motivo_recalculo: '',
      distancia_km: ruta.distancia_km != null ? String(Number(ruta.distancia_km)) : '',
      hora_estimada_llegada: ruta.hora_estimada_llegada ? aInputLocal(new Date(ruta.hora_estimada_llegada)) : '',
    },
  });
  const a = useAccion({
    fn: (v: z.infer<typeof esquema>) =>
      api.rutas.recalcular(ruta.id, {
        motivo_recalculo: v.motivo_recalculo,
        distancia_km: aNumero(v.distancia_km),
        hora_estimada_llegada: desdeInputLocal(v.hora_estimada_llegada),
      }),
    exito: 'Ruta recalculada. El cambio quedó en el historial.',
    invalida: [['rutas']],
    toastError: false,
    onSuccess: () => onAbierto(false),
  });
  const e = form.formState.errors;
  return (
    <Dialog open={abierto} onOpenChange={onAbierto}>
      <DialogContent titulo="Recalcular ruta" descripcion="Uso excepcional del operador. Los valores anteriores se guardan en el historial; las paradas no se modifican.">
        <form className="space-y-4" onSubmit={form.handleSubmit((v) => a.mutate(v))} noValidate>
          <Field label="Motivo" htmlFor="motivo" requerido error={e.motivo_recalculo?.message}>
            <Textarea id="motivo" {...form.register('motivo_recalculo')} aria-invalid={!!e.motivo_recalculo} placeholder="Desvío por cierre de vía en…" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Distancia (km)" htmlFor="dist" error={e.distancia_km?.message}>
              <Input id="dist" inputMode="decimal" {...form.register('distancia_km')} />
            </Field>
            <Field label="Llegada estimada" htmlFor="eta" ayuda="Hora de Bogotá">
              <Input id="eta" type="datetime-local" {...form.register('hora_estimada_llegada')} />
            </Field>
          </div>
          <Nota>Este recálculo actualiza el registro de Routing. No cambia el viaje simulado que Tracking ya está ejecutando.</Nota>
          <ErrorFormulario error={a.error} />
          <FormActions>
            <Button type="button" variant="ghost" onClick={() => onAbierto(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" cargando={a.isPending}>
              Guardar recálculo
            </Button>
          </FormActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function RutaDetallePage() {
  const { id = '' } = useParams();
  const r = useRuta(id);
  const h = useRutaHistorial(id);
  const envio = useEnvio(r.data?.envio_id);
  const vehiculos = useVehiculos();
  const conductores = useConductores();
  const [editar, setEditar] = useState(false);
  const reintentar = useAccion({
    fn: () => api.asignaciones.reintentarEnvio(r.data!.envio_id),
    exito: (x) => `Ruta ${estadoRuta(x.estado).etiqueta.toLowerCase()}.`,
    invalida: [['rutas'], ['envios'], ['seguimiento']],
  });

  if (r.error) return <ErrorState error={r.error} reintentar={() => r.refetch()} />;
  if (!r.data) return <LoadingState />;
  const ruta = r.data;
  const v = vehiculos.data?.find((x) => x.id === ruta.vehiculo_id);
  const c = conductores.data?.find((x) => x.id === ruta.conductor_id);
  const reintentable = ruta.estado === 'sin_asignacion';

  return (
    <>
      <PageHeader
        migas={[{ etiqueta: 'Rutas', to: '/rutas' }, { etiqueta: envio.data?.codigo_envio ?? 'Ruta' }]}
        titulo={
          <span className="flex flex-wrap items-center gap-3">
            Ruta de {envio.data ? <Codigo to={`/envios/${ruta.envio_id}`} className="text-[22px]">{envio.data.codigo_envio}</Codigo> : 'envío'}
            <EstadoBadge def={estadoRuta(ruta.estado)} />
          </span>
        }
        acciones={
          <>
            {reintentable && (
              <Button onClick={() => reintentar.mutate()} cargando={reintentar.isPending}>
                <RotateCw /> Reintentar asignación
              </Button>
            )}
            <Button onClick={() => setEditar(true)}>
              <Pencil /> Recalcular
            </Button>
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel titulo="Asignación">
          <KeyValue
            items={[
              { k: 'Vehículo', v: <Plate placa={v?.placa ?? (ruta.detalle_asignacion?.placa as string | undefined)} vehiculoId={ruta.vehiculo_id} /> },
              { k: 'Conductor', v: c ? <Link className="text-primary hover:underline" to={`/flota/conductores/${c.id}`}>{c.nombre}</Link> : '—' },
              { k: 'Ruta maestra', v: ruta.codigo_ruta ? <Codigo to={ruta.ruta_maestra_id ? `/rutas/maestras/${ruta.ruta_maestra_id}` : undefined}>{ruta.codigo_ruta}</Codigo> : '—' },
              { k: 'Llegada estimada', v: fechaHora(ruta.hora_estimada_llegada) },
              { k: 'Distancia', v: ruta.distancia_km != null ? `${numero(ruta.distancia_km, 1)} km` : '—' },
              { k: 'Distancia planificada', v: ruta.distancia_planificada_km != null ? `${numero(ruta.distancia_planificada_km, 1)} km` : '—' },
              { k: 'Intentos de asignación', v: ruta.intentos },
              { k: 'Próximo reintento', v: fechaHora(ruta.proximo_reintento_en, 'No programado') },
              { k: 'Último error', v: ruta.ultimo_error ?? 'Ninguno', ancho: true },
              { k: 'Creada', v: fechaHora(ruta.creado_en) },
              { k: 'Actualizada', v: fechaHora(ruta.actualizado_en) },
            ]}
          />
        </Panel>
        <Panel titulo="Paradas planificadas">
          {ruta.paradas?.length ? (
            <ol className="space-y-2">
              {ruta.paradas.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-[13px]">
                  <span>
                    <span className="mr-2 text-xs text-text-3">{p.tipo === 'origen' ? 'Origen' : p.tipo === 'destino' ? 'Destino' : 'Parada'}</span>
                    {p.lugar ?? '—'}
                  </span>
                  {typeof p.km_desde_origen === 'number' && <span className="tabular text-xs text-text-3">km {numero(p.km_desde_origen, 0)}</span>}
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState titulo="Sin paradas registradas" compacto />
          )}
        </Panel>
        <Panel titulo="Historial de recálculos" descripcion={`Recalculada ${ruta.veces_recalculada} vez(ces)`} className="lg:col-span-2">
          {h.error ? (
            <ErrorState error={h.error} compacto reintentar={() => h.refetch()} />
          ) : !h.data ? (
            <LoadingState />
          ) : h.data.length === 0 ? (
            <EmptyState titulo="Sin recálculos" icono={<History />} compacto>
              Cuando el operador recalcula la ruta, aquí quedan los valores anteriores.
            </EmptyState>
          ) : (
            <Timeline
              items={h.data.map((x) => ({
                clave: x.id,
                titulo: x.motivo_recalculo ?? 'Recálculo',
                cuando: fechaHora(x.recalculado_en),
                detalle: `Antes: ${x.distancia_km_anterior != null ? `${numero(x.distancia_km_anterior, 1)} km` : 'sin distancia'}, llegada ${fechaHora(x.hora_estimada_llegada_anterior)}`,
                tono: 'warn',
              }))}
            />
          )}
        </Panel>
      </div>
      <Recalcular ruta={ruta} abierto={editar} onAbierto={setEditar} />
    </>
  );
}
