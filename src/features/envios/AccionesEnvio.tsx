import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Ban, CalendarClock, CheckCheck, ChevronDown, PlayCircle, RotateCw, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ConfirmDialog, ErrorFormulario, Field, FormActions } from '@/components/shared/Form';
import { vacioANull } from '@/lib/formularios';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown';
import { Input, Textarea } from '@/components/ui/input';
import { usePuede } from '@/app/auth';
import { useAccion } from '@/hooks/useAccion';
import * as api from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import {
  esParte,
  esPedidoDividido,
  ESTADOS_CANCELABLES,
  ESTADOS_EN_ESPERA,
  ESTADOS_ENTREGABLES,
  estadoEnvio,
  TRANSICIONES_MANUALES,
} from '@/lib/dominio';
import { aInputLocal, desdeInputLocal } from '@/lib/format';
import type { Envio, EstadoManualEnvio } from '@/lib/types/api';

const invalidaEnvio = (id: string) => [
  ['envios'],
  ['seguimiento'],
  ['rutas'],
  ['flota', 'reserva', id],
  ['simulaciones'],
  ['analitica'],
  ['vehiculos'],
  ['conductores'],
  ['pagos'],
];

const MENSAJES_FECHA: Record<string, string> = {
  FECHA_PROGRAMADA_PASADA: 'La fecha debe ser al menos un minuto en el futuro.',
  FECHA_PROGRAMADA_LEJANA: 'La fecha no puede pasar de un año.',
  FECHA_POSTERIOR_AL_SLA: 'La fecha no puede ser posterior a la fecha límite de entrega.',
};

/** Error de cancelar/reprogramar con el detalle que trae el backend (partes en curso, fechas). */
function ErrorPedido({ error }: { error: unknown }) {
  if (error instanceof ApiError && error.codigo === 'NO_SE_PUEDE_CANCELAR') {
    const d = (error.cuerpo as { detail?: { partes_en_curso?: unknown[] } })?.detail;
    const partes = (d?.partes_en_curso ?? []).map((p) =>
      typeof p === 'string' ? p : String((p as { codigo_envio?: string })?.codigo_envio ?? ''),
    );
    return (
      <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-text">
        <p className="font-semibold">No se puede cancelar: una parte ya tiene vehículo en camino.</p>
        {partes.filter(Boolean).length > 0 && <p className="text-text-2">Partes en curso: {partes.filter(Boolean).join(', ')}.</p>}
        <p className="text-text-2">Lo que ya tiene vehículo se devuelve parte por parte («Cambiar estado» → Devolver).</p>
      </div>
    );
  }
  if (error instanceof ApiError && error.codigo && MENSAJES_FECHA[error.codigo]) {
    return (
      <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-text">
        {MENSAJES_FECHA[error.codigo]}
      </p>
    );
  }
  return <ErrorFormulario error={error} />;
}

function DialogoCancelar({ envio, abierto, onAbierto }: { envio: Envio; abierto: boolean; onAbierto: (v: boolean) => void }) {
  const [motivo, setMotivo] = useState('');
  const a = useAccion({
    fn: () => api.envios.cancelar(envio.id, vacioANull(motivo)),
    exito: (e) => `${e.codigo_envio} cancelado.`,
    invalida: invalidaEnvio(envio.id),
    toastError: false,
    onSuccess: () => {
      setMotivo('');
      onAbierto(false);
    },
  });
  const dividido = esPedidoDividido(envio);
  return (
    <ConfirmDialog
      abierto={abierto}
      onAbierto={(v) => {
        if (!v) a.reset();
        onAbierto(v);
      }}
      titulo={`Cancelar ${dividido ? 'el pedido' : 'el envío'} ${envio.codigo_envio}`}
      confirmar="Cancelar pedido"
      volver="Volver"
      onConfirmar={() => a.mutate()}
      cargando={a.isPending}
      peligro
    >
      <p>
        {dividido
          ? `Se cancela el pedido completo con sus ${envio.partes_total} partes. Solo es posible si ninguna parte tiene vehículo en camino.`
          : 'El envío queda cancelado de forma definitiva.'}{' '}
        Si estaba pagado, queda en la lista de reembolsos para que un administrador lo reembolse.
      </p>
      <Field label="Motivo" htmlFor="motivo-cancelar" ayuda="Opcional. Queda en la bitácora.">
        <Textarea id="motivo-cancelar" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} />
      </Field>
      <ErrorPedido error={a.error} />
    </ConfirmDialog>
  );
}

function DialogoReprogramar({ envio, abierto, onAbierto }: { envio: Envio; abierto: boolean; onAbierto: (v: boolean) => void }) {
  const inicial = envio.fecha_programada ? aInputLocal(new Date(envio.fecha_programada)) : '';
  const [fecha, setFecha] = useState(inicial);
  const [motivo, setMotivo] = useState('');
  const [falta, setFalta] = useState(false);
  const a = useAccion({
    fn: () => api.envios.reprogramar(envio.id, { fecha_programada: desdeInputLocal(fecha)!, motivo: vacioANull(motivo) }),
    exito: (e) => `${e.codigo_envio} reprogramado.`,
    invalida: invalidaEnvio(envio.id),
    toastError: false,
    onSuccess: () => {
      setMotivo('');
      onAbierto(false);
    },
  });
  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        if (v) setFecha(inicial);
        else a.reset();
        onAbierto(v);
      }}
    >
      <DialogContent
        titulo={`Reprogramar ${envio.codigo_envio}`}
        descripcion={esPedidoDividido(envio) ? 'La nueva fecha se aplica a todas las partes del pedido.' : 'El envío sigue programado, sin vehículo reservado, hasta la nueva hora.'}
      >
        <form
          className="space-y-4"
          noValidate
          onSubmit={(ev) => {
            ev.preventDefault();
            if (!desdeInputLocal(fecha)) {
              setFalta(true);
              return;
            }
            setFalta(false);
            a.mutate();
          }}
        >
          <Field label="Nueva fecha y hora de salida" htmlFor="nueva-fecha" requerido ayuda="Hora de Colombia." error={falta ? 'Elija la nueva fecha.' : undefined}>
            <Input id="nueva-fecha" type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} aria-invalid={falta || undefined} autoFocus />
          </Field>
          <Field label="Motivo" htmlFor="motivo-reprogramar" ayuda="Opcional.">
            <Textarea id="motivo-reprogramar" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} />
          </Field>
          <ErrorPedido error={a.error} />
          <FormActions>
            <Button type="button" variant="ghost" onClick={() => onAbierto(false)}>
              Volver
            </Button>
            <Button type="submit" variant="primary" cargando={a.isPending}>
              Reprogramar
            </Button>
          </FormActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const esquemaPod = z.object({
  nombre_receptor: z.string().trim().min(2, { error: 'Indique quién recibe' }).max(150, { error: 'Máximo 150 caracteres' }),
  url_firma: z.string().trim(),
  url_foto: z.string().trim(),
});

function DialogoEntrega({ envio, abierto, onAbierto }: { envio: Envio; abierto: boolean; onAbierto: (v: boolean) => void }) {
  const form = useForm({ resolver: zodResolver(esquemaPod), defaultValues: { nombre_receptor: '', url_firma: '', url_foto: '' } });
  const a = useAccion({
    fn: (v: z.infer<typeof esquemaPod>) =>
      api.envios.registrarPruebaEntrega(envio.id, {
        nombre_receptor: v.nombre_receptor,
        url_firma: vacioANull(v.url_firma),
        url_foto: vacioANull(v.url_foto),
      }),
    exito: `Entrega de ${envio.codigo_envio} registrada.`,
    invalida: invalidaEnvio(envio.id),
    toastError: false,
    onSuccess: () => {
      onAbierto(false);
      form.reset();
    },
  });
  const e = form.formState.errors;
  return (
    <Dialog open={abierto} onOpenChange={onAbierto}>
      <DialogContent
        titulo="Registrar entrega manual"
        descripcion="Deja el envío como entregado y libera el vehículo. Normalmente no hace falta: el sistema entrega solo al llegar."
      >
        <form onSubmit={form.handleSubmit((v) => a.mutate(v))} className="space-y-4" noValidate>
          <Field label="Nombre de quien recibe" htmlFor="receptor" requerido error={e.nombre_receptor?.message}>
            <Input id="receptor" {...form.register('nombre_receptor')} aria-invalid={!!e.nombre_receptor} autoFocus />
          </Field>
          <Field label="URL de la firma" htmlFor="firma" ayuda="Opcional. Enlace a una imagen ya almacenada (el backend no recibe archivos).">
            <Input id="firma" type="url" {...form.register('url_firma')} placeholder="https://…" />
          </Field>
          <Field label="URL de la foto" htmlFor="foto" ayuda="Opcional.">
            <Input id="foto" type="url" {...form.register('url_foto')} placeholder="https://…" />
          </Field>
          <ErrorFormulario error={a.error} />
          <FormActions>
            <Button type="button" variant="ghost" onClick={() => onAbierto(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" cargando={a.isPending}>
              Registrar entrega
            </Button>
          </FormActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoEstado({
  envio,
  destino,
  onCerrar,
}: {
  envio: Envio;
  destino: EstadoManualEnvio | null;
  onCerrar: () => void;
}) {
  const [notas, setNotas] = useState('');
  const a = useAccion({
    fn: () => api.envios.cambiarEstado(envio.id, destino!, notas),
    exito: (e) => `${e.codigo_envio} ahora está «${estadoEnvio(e.estado).etiqueta.toLowerCase()}».`,
    invalida: invalidaEnvio(envio.id),
    toastError: false,
    onSuccess: () => {
      setNotas('');
      onCerrar();
    },
  });
  const devolver = destino === 'devuelto';
  return (
    <ConfirmDialog
      abierto={!!destino}
      onAbierto={(v) => !v && onCerrar()}
      titulo={devolver ? `Devolver ${envio.codigo_envio}` : `Marcar ${envio.codigo_envio} como ${destino ? estadoEnvio(destino).etiqueta.toLowerCase() : ''}`}
      confirmar={devolver ? 'Devolver envío' : 'Cambiar estado'}
      onConfirmar={() => a.mutate()}
      cargando={a.isPending}
      peligro={devolver}
    >
      <p>
        {devolver
          ? 'El envío se devuelve de forma definitiva: el viaje se detiene y el vehículo y el conductor quedan libres. No se puede deshacer.'
          : destino === 'con_incidencia'
            ? 'El envío queda marcado con una incidencia. El cliente recibe una notificación.'
            : 'El envío vuelve a estar en tránsito.'}
      </p>
      <Field label="Notas" htmlFor="notas-estado" ayuda="Opcional. Quedan en la bitácora del envío.">
        <Textarea id="notas-estado" value={notas} onChange={(e) => setNotas(e.target.value)} />
      </Field>
      <ErrorFormulario error={a.error} />
    </ConfirmDialog>
  );
}

export function AccionesEnvio({ envio }: { envio: Envio }) {
  const [entrega, setEntrega] = useState(false);
  const [destino, setDestino] = useState<EstadoManualEnvio | null>(null);
  const [cancelar, setCancelar] = useState(false);
  const [reprogramar, setReprogramar] = useState(false);
  const puedeOperar = usePuede('operarEnvio');
  const puedeEntregar = usePuede('pruebaEntrega');
  const puedeCancelar = usePuede('cancelarReprogramar');
  const reintentar = useAccion({
    fn: () => api.envios.reintentarAsignacion(envio.id),
    exito: (r) => (r.estado_asignacion === 'asignada' ? 'Vehículo asignado; el estado se actualizará en segundos.' : `Reintento hecho: ${r.detalle ?? r.estado_asignacion ?? 'sin vehículo libre todavía'}`),
    invalida: invalidaEnvio(envio.id),
  });

  // Pedido dividido: su estado sale de las partes (no se cambia a mano ni se entrega).
  // Parte suelta: no se cancela ni se reprograma (se hace sobre el pedido completo).
  const dividido = esPedidoDividido(envio);
  const parte = esParte(envio);
  const enEspera = puedeOperar && ESTADOS_EN_ESPERA.includes(envio.estado);
  const entregable = puedeEntregar && !dividido && ESTADOS_ENTREGABLES.includes(envio.estado);
  const permitido = (d: EstadoManualEnvio) => TRANSICIONES_MANUALES[d].includes(envio.estado);
  const algunaManual = puedeOperar && !dividido && (['en_transito', 'con_incidencia', 'devuelto'] as const).some(permitido);
  const cancelable = puedeCancelar && !parte && ESTADOS_CANCELABLES.includes(envio.estado);
  const reprogramable = puedeCancelar && !parte && envio.estado === 'programado';

  if (!enEspera && !entregable && !algunaManual && !cancelable && !reprogramable) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {reprogramable && (
        <Button onClick={() => setReprogramar(true)}>
          <CalendarClock /> Reprogramar
        </Button>
      )}
      {cancelable && (
        <Button variant="danger-outline" onClick={() => setCancelar(true)}>
          <Ban /> Cancelar pedido
        </Button>
      )}
      {enEspera && (
        <Button onClick={() => reintentar.mutate()} cargando={reintentar.isPending}>
          <RotateCw /> Reintentar asignación
        </Button>
      )}
      {entregable && (
        <Button onClick={() => setEntrega(true)}>
          <CheckCheck /> Registrar entrega
        </Button>
      )}
      {algunaManual && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              Cambiar estado <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Solo para casos excepcionales</DropdownMenuLabel>
            <DropdownMenuItem disabled={!permitido('en_transito')} onSelect={() => setDestino('en_transito')}>
              <PlayCircle /> En tránsito
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!permitido('con_incidencia')} onSelect={() => setDestino('con_incidencia')}>
              <AlertTriangle /> Con incidencia
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem peligro disabled={!permitido('devuelto')} onSelect={() => setDestino('devuelto')}>
              <Undo2 /> Devolver
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {entregable && <DialogoEntrega envio={envio} abierto={entrega} onAbierto={setEntrega} />}
      {algunaManual && <DialogoEstado envio={envio} destino={destino} onCerrar={() => setDestino(null)} />}
      {cancelable && <DialogoCancelar envio={envio} abierto={cancelar} onAbierto={setCancelar} />}
      {reprogramable && <DialogoReprogramar envio={envio} abierto={reprogramar} onAbierto={setReprogramar} />}
    </div>
  );
}
