import { MapPin, MapPinOff } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { usePuede } from '@/app/auth';
import { Tag } from '@/components/shared/Badge';
import { ErrorFormulario, Field, FormActions } from '@/components/shared/Form';
import { UbicacionPicker } from '@/components/shared/Pickers';
import { Limitacion } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useAccion } from '@/hooks/useAccion';
import * as api from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import { sinUbicacion } from '@/lib/dominio';
import type { Ubicacion, Vehiculo } from '@/lib/types/api';

/** Datos de la ubicación elegida que se envían tal cual (nadie escribe coordenadas a mano). */
export function datosDeUbicacion(u: Ubicacion) {
  return { ubicacion_id: u.id, nombre: u.nombre, latitud: u.latitud, longitud: u.longitud, codigo_pais: u.codigo_pais };
}

const MOTIVOS_NO_APLICADA: Record<string, string> = {
  UBICACION_MAS_RECIENTE_YA_REGISTRADA: 'El vehículo ya tiene una ubicación más reciente; no se cambió.',
  VEHICULO_RESERVADO_POSICION_YA_REGISTRADA: 'El vehículo ya salió con otra carga; su posición la informa el seguimiento.',
};

/** Etiqueta «Sin ubicación» (o el nombre de su ubicación base). */
export function EtiquetaUbicacion({ v }: { v: Vehiculo }) {
  if (sinUbicacion(v))
    return (
      <Tag tono="warn" icono={<MapPinOff />}>
        Sin ubicación
      </Tag>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[13px]">
      <MapPin className="size-3.5 shrink-0 text-text-3" aria-hidden />
      <span className="truncate">{v.ubicacion_nombre ?? 'Ubicación registrada'}</span>
    </span>
  );
}

/**
 * Fija la ubicación base de un vehículo eligiéndola de la lista de ubicaciones guardadas
 * (PUT /vehiculos/{id}/ubicacion). Solo gestor de flota y administrador.
 */
export function DialogoUbicacionVehiculo({
  vehiculo,
  onCerrar,
}: {
  vehiculo: Vehiculo | null;
  onCerrar: () => void;
}) {
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const a = useAccion({
    fn: (u: Ubicacion) => api.vehiculos.fijarUbicacion(vehiculo!.id, { ...datosDeUbicacion(u), fuente: 'registro_gestor' }),
    invalida: [['vehiculos'], ['seguimiento']],
    toastError: false,
    onSuccess: (r) => {
      if (r.aplicada) {
        toast.success(`${r.vehiculo.placa}: ubicación base en ${r.vehiculo.ubicacion_nombre ?? 'la ubicación elegida'}.`);
        cerrar();
      } else setAviso(MOTIVOS_NO_APLICADA[r.motivo ?? ''] ?? 'El backend no aplicó la ubicación.');
    },
  });
  const enViaje = a.error instanceof ApiError && a.error.codigo === 'VEHICULO_EN_VIAJE';

  function cerrar() {
    setUbicacion(null);
    setAviso(null);
    a.reset();
    onCerrar();
  }

  return (
    <Dialog open={!!vehiculo} onOpenChange={(o) => !o && cerrar()}>
      <DialogContent
        titulo={`Establecer ubicación de ${vehiculo?.placa ?? ''}`}
        descripcion="Elija dónde está el vehículo. Con una ubicación válida aparece en el mapa y se asigna por cercanía."
      >
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (ubicacion && !a.isPending) {
              setAviso(null);
              a.mutate(ubicacion);
            }
          }}
        >
          <Field label="Ubicación base" htmlFor="ubicacion-vehiculo" requerido ayuda="Busque por ciudad o código, por ejemplo CO-MTR.">
            <UbicacionPicker
              id="ubicacion-vehiculo"
              valor={ubicacion}
              limite={20}
              onCambio={(u) => {
                setUbicacion(u);
                setAviso(null);
                if (a.error) a.reset();
              }}
            />
          </Field>
          <div aria-live="polite">
            {enViaje ? (
              <Limitacion titulo="El vehículo está en un viaje">
                Su posición la informa el seguimiento del viaje; no se puede fijar a mano. Podrá hacerlo cuando termine el viaje.
              </Limitacion>
            ) : (
              a.error && <ErrorFormulario error={a.error} />
            )}
            {aviso && <Limitacion titulo="No se cambió la ubicación">{aviso}</Limitacion>}
          </div>
          <FormActions>
            <Button type="button" variant="ghost" onClick={cerrar}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={!ubicacion || enViaje} cargando={a.isPending}>
              <MapPin /> Guardar ubicación
            </Button>
          </FormActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Botón «Establecer ubicación» (solo si el rol puede editar la flota y el vehículo no tiene ubicación). */
export function BotonEstablecerUbicacion({
  vehiculo,
  onAbrir,
  siempre,
  size = 'sm',
}: {
  vehiculo: Vehiculo;
  onAbrir: (v: Vehiculo) => void;
  /** Mostrarlo aunque ya tenga ubicación (para cambiarla). */
  siempre?: boolean;
  size?: 'sm' | 'md';
}) {
  const puede = usePuede('editarFlota');
  if (!puede || (!siempre && !sinUbicacion(vehiculo))) return null;
  return (
    <Button
      size={size}
      onClick={(e) => {
        e.stopPropagation();
        onAbrir(vehiculo);
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <MapPin /> {sinUbicacion(vehiculo) ? 'Establecer ubicación' : 'Cambiar ubicación'}
    </Button>
  );
}
