import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, CheckCheck, ChevronDown, PlayCircle, RotateCw, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ConfirmDialog, ErrorFormulario, Field, FormActions } from '@/components/shared/Form';
import { vacioANull } from '@/lib/formularios';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown';
import { Input, Textarea } from '@/components/ui/input';
import { useAccion } from '@/hooks/useAccion';
import * as api from '@/lib/api/endpoints';
import { ESTADOS_EN_ESPERA, ESTADOS_ENTREGABLES, estadoEnvio, TRANSICIONES_MANUALES } from '@/lib/dominio';
import type { Envio, EstadoManualEnvio } from '@/lib/types/api';

const invalidaEnvio = (id: string) => [['envios'], ['seguimiento'], ['rutas'], ['flota', 'reserva', id], ['simulaciones'], ['analitica'], ['vehiculos'], ['conductores']];

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
          ? 'El envío se cancela de forma definitiva: el viaje se detiene y el vehículo y el conductor quedan libres. No se puede deshacer.'
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
  const reintentar = useAccion({
    fn: () => api.envios.reintentarAsignacion(envio.id),
    exito: (r) => (r.estado_asignacion === 'asignada' ? 'Vehículo asignado; el estado se actualizará en segundos.' : `Reintento hecho: ${r.detalle ?? r.estado_asignacion ?? 'sin vehículo libre todavía'}`),
    invalida: invalidaEnvio(envio.id),
  });

  const enEspera = ESTADOS_EN_ESPERA.includes(envio.estado);
  const entregable = ESTADOS_ENTREGABLES.includes(envio.estado);
  const permitido = (d: EstadoManualEnvio) => TRANSICIONES_MANUALES[d].includes(envio.estado);
  const algunaManual = (['en_transito', 'con_incidencia', 'devuelto'] as const).some(permitido);

  return (
    <div className="flex flex-wrap gap-2">
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
              <Undo2 /> Devolver (cancelar)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <DialogoEntrega envio={envio} abierto={entrega} onAbierto={setEntrega} />
      <DialogoEstado envio={envio} destino={destino} onCerrar={() => setDestino(null)} />
    </div>
  );
}
