import { useState } from 'react';
import { ErrorFormulario, Field } from '@/components/shared/Form';
import { ErrorState, Limitacion, LoadingState } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/input';
import { usePreferencia } from '@/hooks/queries';
import { useAccion } from '@/hooks/useAccion';
import * as api from '@/lib/api/endpoints';
import type { Canal, Idioma, PreferenciaNotificacion } from '@/lib/types/api';

function FormPreferencia({ clienteId, inicial, compacto }: { clienteId: string; inicial: PreferenciaNotificacion; compacto?: boolean }) {
  const [idioma, setIdioma] = useState<Idioma>((inicial.idioma as Idioma) ?? 'es');
  const [canal, setCanal] = useState<'' | Canal>((inicial.canal_preferido as Canal | null) ?? '');
  const a = useAccion({
    fn: () => api.notificaciones.guardarPreferencia(clienteId, { idioma, canal_preferido: canal || null }),
    exito: 'Preferencia guardada.',
    invalida: [['preferencias', clienteId]],
    toastError: false,
  });
  const cambiado = inicial.idioma !== idioma || (inicial.canal_preferido ?? '') !== canal;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        a.mutate();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Idioma" htmlFor={`idioma-${clienteId}`}>
          <NativeSelect id={`idioma-${clienteId}`} value={idioma} onChange={(e) => setIdioma(e.target.value as Idioma)}>
            <option value="es">Español</option>
            <option value="en">Inglés</option>
          </NativeSelect>
        </Field>
        <Field label="Canal preferido" htmlFor={`canal-${clienteId}`} ayuda="Sin preferencia: cada tipo de evento usa su canal fijo.">
          <NativeSelect id={`canal-${clienteId}`} value={canal} onChange={(e) => setCanal(e.target.value as '' | Canal)}>
            <option value="">Sin preferencia</option>
            <option value="email">Correo</option>
            <option value="sms">SMS</option>
            <option value="push">Push</option>
          </NativeSelect>
        </Field>
      </div>
      {!compacto && (
        <Limitacion titulo="Se guarda en memoria">
          El servicio de notificaciones guarda las preferencias en memoria: se pierden si el servicio se reinicia.
        </Limitacion>
      )}
      <ErrorFormulario error={a.error} />
      <Button type="submit" variant="primary" disabled={!cambiado} cargando={a.isPending}>
        Guardar preferencia
      </Button>
    </form>
  );
}

/** Idioma y canal de notificación de un cliente (GET/POST /preferencias/{cliente_id}). */
export function EditorPreferencia({ clienteId, compacto }: { clienteId: string; compacto?: boolean }) {
  const p = usePreferencia(clienteId);
  if (p.isLoading) return <LoadingState />;
  if (p.error) return <ErrorState error={p.error} compacto reintentar={() => p.refetch()} />;
  if (!p.data) return null;
  // La clave reinicia el formulario cuando el servidor devuelve otra preferencia.
  return <FormPreferencia key={`${p.data.idioma}-${p.data.canal_preferido}`} clienteId={clienteId} inicial={p.data} compacto={compacto} />;
}
