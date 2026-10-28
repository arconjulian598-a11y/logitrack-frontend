import { limpioAlAbrir } from '@/lib/limpioAlAbrir';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { ErrorFormulario, Field, FormActions } from '@/components/shared/Form';
import { UbicacionPicker } from '@/components/shared/Pickers';
import { aNumero } from '@/lib/formularios';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Checkbox, Label } from '@/components/ui/misc';
import { useAccion } from '@/hooks/useAccion';
import * as api from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import { COMBUSTIBLES, ESTADOS_VEHICULO, TIPOS_VEHICULO } from '@/lib/dominio';
import { num } from '@/lib/format';
import type { EstadoVehiculo, TipoCombustible, TipoVehiculo, Ubicacion, Vehiculo } from '@/lib/types/api';
import { EtiquetaUbicacion } from './UbicacionVehiculo';

/** Campos de la ubicación base en el cuerpo de POST /vehiculos (un 422 sobre ellos va junto al selector). */
const CAMPOS_UBICACION = new Set(['ubicacion_id', 'ubicacion_nombre', 'latitud', 'longitud', 'codigo_pais']);

/** Errores del alta que se muestran junto a su campo en vez de arriba del formulario. */
function erroresDeCampo(error: unknown): { placa?: string; ubicacion?: string } {
  if (!(error instanceof ApiError)) return {};
  if (error.status === 409) return { placa: 'Ya existe un vehículo con esa placa' };
  if (error.status === 422 && error.validacion.length) {
    const deUbicacion = error.validacion.filter((v) => (v.loc ?? []).some((p) => CAMPOS_UBICACION.has(String(p))));
    if (deUbicacion.length) return { ubicacion: deUbicacion.map((v) => v.msg.replace(/^Value error,\s*/i, '')).join(' ') };
  }
  return {};
}

const decimalOpcional = (min = 0, estricto = true) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || (aNumero(v) !== null && (estricto ? aNumero(v)! > min : aNumero(v)! >= min)), {
      error: estricto ? `Debe ser mayor que ${min}` : `Debe ser ${min} o más`,
    });

const esquema = z.object({
  placa: z
    .string()
    .trim()
    .min(5, { error: 'Placa demasiado corta' })
    .max(10, { error: 'Máximo 10 caracteres' })
    .regex(/^[A-Za-z0-9-]+$/, { error: 'Solo letras, números y guion' }),
  tipo: z.enum(['furgoneta', 'camion', 'tractocamion']),
  capacidad_kg: z.string().trim().refine((v) => (aNumero(v) ?? 0) > 0, { error: 'Indique una capacidad mayor que 0' }),
  capacidad_m3: decimalOpcional(0, false),
  anio: z.string().trim().refine((v) => v === '' || /^(19|20)\d{2}$/.test(v), { error: 'Año de cuatro cifras' }),
  vencimiento_seguro: z.string(),
  estado: z.enum(['active', 'en_transito', 'en_mantenimiento', 'fuera_de_servicio']),
  capacidad_refrigeracion: z.boolean(),
  certificado_hazmat: z.boolean(),
  capacidad_tanque_l: decimalOpcional(),
  consumo_km_por_litro: decimalOpcional(),
  tipo_combustible: z.string(),
});
type Valores = z.infer<typeof esquema>;

function aTexto(v: unknown): string {
  const n = num(v);
  return n === null ? '' : String(n);
}

function DialogoVehiculoFormulario({
  abierto,
  onAbierto,
  vehiculo,
}: {
  abierto: boolean;
  onAbierto: (v: boolean) => void;
  vehiculo?: Vehiculo;
}) {
  const edicion = !!vehiculo;
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const form = useForm<Valores>({
    resolver: zodResolver(esquema),
    values: {
      placa: vehiculo?.placa ?? '',
      tipo: (vehiculo?.tipo as TipoVehiculo) ?? 'camion',
      capacidad_kg: aTexto(vehiculo?.capacidad_kg),
      capacidad_m3: aTexto(vehiculo?.capacidad_m3),
      anio: vehiculo?.anio ? String(vehiculo.anio) : '',
      vencimiento_seguro: vehiculo?.vencimiento_seguro ?? '',
      estado: (vehiculo?.estado as EstadoVehiculo) ?? 'active',
      capacidad_refrigeracion: vehiculo?.capacidad_refrigeracion ?? false,
      certificado_hazmat: vehiculo?.certificado_hazmat ?? false,
      capacidad_tanque_l: aTexto(vehiculo?.capacidad_tanque_l),
      consumo_km_por_litro: aTexto(vehiculo?.consumo_km_por_litro),
      tipo_combustible: vehiculo?.tipo_combustible ?? '',
    },
  });

  const a = useAccion({
    fn: (v: Valores) => {
      const comunes = {
        tipo: v.tipo,
        capacidad_kg: aNumero(v.capacidad_kg)!,
        capacidad_m3: aNumero(v.capacidad_m3),
        anio: v.anio ? Number(v.anio) : null,
        vencimiento_seguro: v.vencimiento_seguro || null,
        capacidad_refrigeracion: v.capacidad_refrigeracion,
        certificado_hazmat: v.certificado_hazmat,
        capacidad_tanque_l: aNumero(v.capacidad_tanque_l),
        consumo_km_por_litro: aNumero(v.consumo_km_por_litro),
        tipo_combustible: (v.tipo_combustible || null) as TipoCombustible | null,
      };
      return edicion
        ? api.vehiculos.actualizar(vehiculo!.id, comunes)
        : api.vehiculos.crear({
            ...comunes,
            placa: v.placa.toUpperCase(),
            estado: v.estado,
            // Se copian tal cual de la ubicación elegida en la lista (nadie escribe coordenadas)
            ubicacion_id: ubicacion!.id,
            ubicacion_nombre: ubicacion!.nombre,
            latitud: ubicacion!.latitud,
            longitud: ubicacion!.longitud,
            codigo_pais: ubicacion!.codigo_pais,
          });
    },
    exito: (r) => (edicion ? `Vehículo ${r.placa} actualizado.` : `Vehículo ${r.placa} registrado.`),
    invalida: [['vehiculos'], ['analitica']],
    toastError: false,
    onSuccess: () => {
      setUbicacion(null);
      onAbierto(false);
    },
  });
  const e = form.formState.errors;
  const enCampo = erroresDeCampo(a.error);
  const errorGeneral = enCampo.placa || enCampo.ubicacion ? null : a.error;
  const { register, control } = form;

  return (
    <Dialog
      open={abierto}
      onOpenChange={(o) => {
        if (!o) {
          setUbicacion(null);
          a.reset();
        }
        onAbierto(o);
      }}
    >
      <DialogContent
        titulo={edicion ? `Editar vehículo ${vehiculo!.placa}` : 'Registrar vehículo'}
        descripcion={edicion ? 'Solo se envían los campos del formulario. La placa no se puede cambiar.' : 'La placa debe ser única en la flota.'}
        ancho="max-w-2xl"
      >
        <form
          onSubmit={form.handleSubmit((v) => {
            if (!edicion && !ubicacion) return;
            a.mutate(v);
          })}
          className="space-y-4"
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Placa" htmlFor="placa" requerido error={e.placa?.message ?? enCampo.placa}>
              <Input
                id="placa"
                {...register('placa', { onChange: () => enCampo.placa && a.reset() })}
                disabled={edicion}
                className="font-cond uppercase tracking-wide"
                aria-invalid={!!e.placa || !!enCampo.placa}
                placeholder="ABC123"
              />
            </Field>
            <Field label="Tipo" htmlFor="tipo" requerido>
              <NativeSelect id="tipo" {...register('tipo')}>
                {Object.entries(TIPOS_VEHICULO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {!edicion ? (
              <Field label="Estado inicial" htmlFor="estado">
                <NativeSelect id="estado" {...register('estado')}>
                  {['active', 'en_mantenimiento', 'fuera_de_servicio'].map((k) => (
                    <option key={k} value={k}>
                      {ESTADOS_VEHICULO[k]!.etiqueta}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : (
              <Field label="Año" htmlFor="anio" error={e.anio?.message}>
                <Input id="anio" inputMode="numeric" {...register('anio')} />
              </Field>
            )}
            <Field label="Capacidad (kg)" htmlFor="kg" requerido error={e.capacidad_kg?.message}>
              <Input id="kg" inputMode="decimal" {...register('capacidad_kg')} aria-invalid={!!e.capacidad_kg} />
            </Field>
            <Field label="Capacidad (m³)" htmlFor="m3" error={e.capacidad_m3?.message}>
              <Input id="m3" inputMode="decimal" {...register('capacidad_m3')} />
            </Field>
            {!edicion && (
              <Field label="Año" htmlFor="anio" error={e.anio?.message}>
                <Input id="anio" inputMode="numeric" {...register('anio')} />
              </Field>
            )}
            <Field label="Vencimiento del seguro" htmlFor="seguro">
              <Input id="seguro" type="date" {...register('vencimiento_seguro')} />
            </Field>
            <Field label="Combustible" htmlFor="comb">
              <NativeSelect id="comb" {...register('tipo_combustible')}>
                <option value="">Sin indicar</option>
                {Object.entries(COMBUSTIBLES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Tanque (litros)" htmlFor="tanque" error={e.capacidad_tanque_l?.message}>
              <Input id="tanque" inputMode="decimal" {...register('capacidad_tanque_l')} />
            </Field>
            <Field label="Rendimiento (km por litro)" htmlFor="rend" error={e.consumo_km_por_litro?.message}>
              <Input id="rend" inputMode="decimal" {...register('consumo_km_por_litro')} />
            </Field>
          </div>
          {edicion ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-[13px]">
              <span className="text-text-2">Ubicación base:</span>
              <EtiquetaUbicacion v={vehiculo!} />
              <span className="text-xs text-text-3">Se cambia con «Establecer ubicación» en la ficha del vehículo.</span>
            </div>
          ) : (
            <Field
              label="Ubicación base"
              htmlFor="ubicacion-base"
              requerido
              error={enCampo.ubicacion}
              ayuda="Dónde está el vehículo hoy. Con ella aparece en el mapa y se asigna por cercanía."
            >
              <UbicacionPicker
                id="ubicacion-base"
                valor={ubicacion}
                limite={20}
                invalido={!!enCampo.ubicacion}
                onCambio={(u) => {
                  setUbicacion(u);
                  if (enCampo.ubicacion) a.reset();
                }}
              />
            </Field>
          )}
          <div className="flex flex-wrap gap-6">
            {(
              [
                ['capacidad_refrigeracion', 'Con refrigeración'],
                ['certificado_hazmat', 'Certificado HAZMAT'],
              ] as const
            ).map(([campo, etiqueta]) => (
              <div key={campo} className="flex items-center gap-2">
                <Controller
                  control={control}
                  name={campo}
                  render={({ field }) => <Checkbox id={campo} checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />}
                />
                <Label htmlFor={campo}>{etiqueta}</Label>
              </div>
            ))}
          </div>
          <div aria-live="polite">
            <ErrorFormulario error={errorGeneral} />
          </div>
          <FormActions>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setUbicacion(null);
                a.reset();
                onAbierto(false);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="primary" cargando={a.isPending} disabled={!edicion && !ubicacion}>
              {edicion ? 'Guardar cambios' : 'Registrar vehículo'}
            </Button>
          </FormActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Cada vez que se abren, estos formularios empiezan limpios. */
export const DialogoVehiculo = limpioAlAbrir(DialogoVehiculoFormulario);
