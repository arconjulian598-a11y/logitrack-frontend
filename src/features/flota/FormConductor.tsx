import { limpioAlAbrir } from '@/lib/limpioAlAbrir';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { ErrorFormulario, Field, FormActions } from '@/components/shared/Form';
import { aNumero } from '@/lib/formularios';
import { VehiculoPicker } from '@/components/shared/Pickers';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Checkbox, Label } from '@/components/ui/misc';
import { useConductores, useVehiculos } from '@/hooks/queries';
import { useAccion } from '@/hooks/useAccion';
import * as api from '@/lib/api/endpoints';
import { CATEGORIAS_LICENCIA, erroresElegibilidad, REGLAS_ELEGIBILIDAD } from '@/lib/dominio';
import type { Conductor } from '@/lib/types/api';

const esquema = z.object({
  nombre: z.string().trim().min(3, { error: 'Indique el nombre completo' }).max(150),
  licencia_numero: z.string().trim().min(3, { error: 'Indique el número de licencia' }).max(50),
  categorias: z.array(z.string()),
  certificacion_hazmat: z.boolean(),
  anios_experiencia: z.string().trim().refine((v) => /^\d+$/.test(v), { error: 'Número entero de 0 en adelante' }),
  horas_semanales: z.string().trim().refine((v) => v === '' || (aNumero(v) ?? -1) >= 0, { error: 'Debe ser 0 o más' }),
  vehiculo_id: z.string().nullable(),
});
type Valores = z.infer<typeof esquema>;

/** Vista previa de elegibilidad (las reglas las valida igualmente el servidor). */
export function PreviaElegibilidad({
  vehiculoId,
  categorias,
  anios,
  hazmat,
}: {
  vehiculoId: string | null;
  categorias: string;
  anios: number;
  hazmat: boolean;
}) {
  const vs = useVehiculos();
  const v = vs.data?.find((x) => x.id === vehiculoId);
  if (!v) return null;
  const errores = erroresElegibilidad(v, { categorias_licencia: categorias, anios_experiencia: anios, certificacion_hazmat: hazmat });
  const regla = REGLAS_ELEGIBILIDAD[v.tipo];
  return (
    <div className={`flex gap-2 rounded-md border px-3 py-2.5 text-[13px] ${errores.length ? 'border-danger/30 bg-danger-soft' : 'border-ok/30 bg-ok-soft'}`}>
      {errores.length ? <XCircle className="mt-0.5 size-4 shrink-0 text-danger" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />}
      <div>
        <p className="font-semibold">{errores.length ? 'No cumple los requisitos de este vehículo' : 'Cumple los requisitos de este vehículo'}</p>
        {errores.length ? (
          <ul className="mt-1 list-disc pl-4 text-text-2">
            {errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : (
          regla && (
            <p className="text-text-2">
              Licencia {regla.categorias.join(', ')} y {regla.anios} año(s) de experiencia{v.certificado_hazmat ? '; certificación HAZMAT y 3 años' : ''}.
            </p>
          )
        )}
      </div>
    </div>
  );
}

function SelectorCategorias({ valor, onCambio }: { valor: string[]; onCambio: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Categorías de licencia">
      {CATEGORIAS_LICENCIA.map((c) => {
        const activo = valor.includes(c);
        return (
          <button
            key={c}
            type="button"
            aria-pressed={activo}
            onClick={() => onCambio(activo ? valor.filter((x) => x !== c) : [...valor, c].sort())}
            className={`font-cond h-8 min-w-11 cursor-pointer rounded-md border px-2 text-[13px] font-bold ${activo ? 'border-primary bg-primary text-white' : 'border-rule-strong bg-surface text-text-2 hover:border-text-3'}`}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}

function DialogoConductorFormulario({ abierto, onAbierto, conductor }: { abierto: boolean; onAbierto: (v: boolean) => void; conductor?: Conductor }) {
  const edicion = !!conductor;
  const conductores = useConductores();
  const ocupados = new Set((conductores.data ?? []).map((c) => c.vehiculo_id).filter(Boolean));
  const form = useForm<Valores>({
    resolver: zodResolver(esquema),
    values: {
      nombre: conductor?.nombre ?? '',
      licencia_numero: conductor?.licencia_numero ?? '',
      categorias: conductor?.categorias_licencia ? conductor.categorias_licencia.split(',').map((c) => c.trim()) : [],
      certificacion_hazmat: conductor?.certificacion_hazmat ?? false,
      anios_experiencia: String(conductor?.anios_experiencia ?? 0),
      horas_semanales: conductor ? String(Number(conductor.horas_semanales)) : '',
      vehiculo_id: null,
    },
  });
  const w = useWatch({ control: form.control });
  const a = useAccion({
    fn: (v: Valores) => {
      const comunes = {
        nombre: v.nombre,
        categorias_licencia: v.categorias.length ? v.categorias.join(',') : null,
        certificacion_hazmat: v.certificacion_hazmat,
        anios_experiencia: Number(v.anios_experiencia),
        horas_semanales: aNumero(v.horas_semanales) ?? 0,
      };
      return edicion
        ? api.conductores.actualizar(conductor!.id, comunes)
        : api.conductores.crear({ ...comunes, licencia_numero: v.licencia_numero, vehiculo_id: v.vehiculo_id });
    },
    exito: (r) => (edicion ? `Conductor ${r.nombre} actualizado.` : `Conductor ${r.nombre} registrado con código ${r.codigo_conductor}.`),
    invalida: [['conductores'], ['vehiculos']],
    toastError: false,
    onSuccess: () => onAbierto(false),
  });
  const e = form.formState.errors;
  return (
    <Dialog open={abierto} onOpenChange={onAbierto}>
      <DialogContent
        titulo={edicion ? `Editar a ${conductor!.nombre}` : 'Registrar conductor'}
        descripcion={edicion ? 'El número de licencia y el vehículo no se modifican aquí.' : 'El código de conductor lo asigna el sistema.'}
        ancho="max-w-xl"
      >
        <form onSubmit={form.handleSubmit((v) => a.mutate(v))} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" htmlFor="c-nombre" requerido error={e.nombre?.message} className="sm:col-span-2">
              <Input id="c-nombre" {...form.register('nombre')} aria-invalid={!!e.nombre} />
            </Field>
            {!edicion && (
              <Field label="Número de licencia" htmlFor="c-lic" requerido error={e.licencia_numero?.message}>
                <Input id="c-lic" {...form.register('licencia_numero')} aria-invalid={!!e.licencia_numero} placeholder="LIC-123456" />
              </Field>
            )}
            <Field label="Años de experiencia" htmlFor="c-anios" requerido error={e.anios_experiencia?.message}>
              <Input id="c-anios" inputMode="numeric" {...form.register('anios_experiencia')} />
            </Field>
            <Field label="Horas semanales" htmlFor="c-horas" error={e.horas_semanales?.message}>
              <Input id="c-horas" inputMode="decimal" {...form.register('horas_semanales')} />
            </Field>
            <Field label="Categorías de licencia" className="sm:col-span-2" ayuda="Furgoneta: B1/C1 o superior. Camión: B2/C2 o superior. Tractocamión: B3/C3.">
              <Controller control={form.control} name="categorias" render={({ field }) => <SelectorCategorias valor={field.value} onCambio={field.onChange} />} />
            </Field>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Controller
                control={form.control}
                name="certificacion_hazmat"
                render={({ field }) => <Checkbox id="c-haz" checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />}
              />
              <Label htmlFor="c-haz">Certificación HAZMAT</Label>
            </div>
            {!edicion && (
              <Field label="Vehículo" htmlFor="c-veh" className="sm:col-span-2" ayuda="Opcional. El vínculo es permanente: un conductor, un vehículo.">
                <Controller
                  control={form.control}
                  name="vehiculo_id"
                  render={({ field }) => (
                    <VehiculoPicker id="c-veh" valorId={field.value} onCambio={(v) => field.onChange(v?.id ?? null)} filtro={(v) => !ocupados.has(v.id)} />
                  )}
                />
              </Field>
            )}
          </div>
          {!edicion && w.vehiculo_id && (
            <PreviaElegibilidad
              vehiculoId={w.vehiculo_id}
              categorias={(w.categorias ?? []).join(',')}
              anios={Number(w.anios_experiencia) || 0}
              hazmat={!!w.certificacion_hazmat}
            />
          )}
          <ErrorFormulario error={a.error} />
          <FormActions>
            <Button type="button" variant="ghost" onClick={() => onAbierto(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" cargando={a.isPending}>
              {edicion ? 'Guardar cambios' : 'Registrar conductor'}
            </Button>
          </FormActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoVincularFormulario({ abierto, onAbierto, conductor }: { abierto: boolean; onAbierto: (v: boolean) => void; conductor: Conductor }) {
  const conductores = useConductores();
  const ocupados = new Set((conductores.data ?? []).map((c) => c.vehiculo_id).filter(Boolean));
  const [vehiculoId, setVehiculoId] = useState<string | null>(null);
  const a = useAccion({
    fn: () => api.conductores.vincularVehiculo(conductor.id, vehiculoId!),
    exito: 'Vehículo vinculado de forma permanente.',
    invalida: [['conductores'], ['vehiculos']],
    toastError: false,
    onSuccess: () => onAbierto(false),
  });
  return (
    <Dialog open={abierto} onOpenChange={onAbierto}>
      <DialogContent titulo={`Vincular vehículo a ${conductor.nombre}`} descripcion="El vínculo es permanente y no se puede deshacer desde la aplicación.">
        <div className="space-y-4">
          <Field label="Vehículo sin conductor" htmlFor="vin-veh">
            <VehiculoPicker id="vin-veh" valorId={vehiculoId} onCambio={(v) => setVehiculoId(v?.id ?? null)} filtro={(v) => !ocupados.has(v.id)} />
          </Field>
          <PreviaElegibilidad
            vehiculoId={vehiculoId}
            categorias={conductor.categorias_licencia ?? ''}
            anios={conductor.anios_experiencia}
            hazmat={conductor.certificacion_hazmat}
          />
          <ErrorFormulario error={a.error} />
          <FormActions>
            <Button variant="ghost" onClick={() => onAbierto(false)}>
              Cancelar
            </Button>
            <Button variant="primary" disabled={!vehiculoId} cargando={a.isPending} onClick={() => a.mutate()}>
              Vincular de forma permanente
            </Button>
          </FormActions>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Cada vez que se abren, estos formularios empiezan limpios. */
export const DialogoConductor = limpioAlAbrir(DialogoConductorFormulario);
export const DialogoVincular = limpioAlAbrir(DialogoVincularFormulario);
