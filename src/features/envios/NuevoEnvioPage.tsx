import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Globe2, Loader2, Route as RouteIcon, XCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { ErrorFormulario, Field, FormActions } from '@/components/shared/Form';
import { aNumero } from '@/lib/formularios';
import { KeyValue, PageHeader, Panel } from '@/components/shared/Layout';
import { ClientePicker, UbicacionPicker } from '@/components/shared/Pickers';
import { Limitacion, Nota } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Checkbox, Label } from '@/components/ui/misc';
import { usePaises, useViabilidad } from '@/hooks/queries';
import { useAccion } from '@/hooks/useAccion';
import { useDebounced } from '@/hooks/useFiltrosUrl';
import * as api from '@/lib/api/endpoints';
import { CAUSAS_VIABILIDAD } from '@/lib/dominio';
import { desdeInputLocal, horas, numero } from '@/lib/format';
import type { Cliente, RutaMaestra, Ubicacion } from '@/lib/types/api';

function nuevaClave(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* contexto sin crypto: se usa la alternativa */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

const numeroPositivo = (msg: string) =>
  z
    .string()
    .trim()
    .min(1, { error: msg })
    .refine((v) => (aNumero(v) ?? 0) > 0, { error: 'Debe ser un número mayor que 0' });

const esquema = z
  .object({
    cliente: z.custom<Cliente | null>().refine((v) => !!v, { error: 'Elija un cliente' }),
    origen: z.custom<Ubicacion | null>().refine((v) => !!v, { error: 'Elija el origen' }),
    destino: z.custom<Ubicacion | null>().refine((v) => !!v, { error: 'Elija el destino' }),
    peso_kg: numeroPositivo('Indique el peso'),
    volumen_m3: z
      .string()
      .trim()
      .refine((v) => v === '' || (aNumero(v) ?? -1) >= 0, { error: 'Debe ser un número igual o mayor que 0' }),
    tipo_carga: z.enum(['general', 'refrigerada']),
    es_hazmat: z.boolean(),
    fecha_limite_sla: z.string(),
  })
  .refine((d) => !d.origen || !d.destino || d.origen.id !== d.destino.id, {
    error: 'Origen y destino deben ser distintos',
    path: ['destino'],
  });

type Valores = z.input<typeof esquema>;

function AvisoViabilidad({ peso, volumen, tipo, hazmat }: { peso: number | null; volumen: number | null; tipo: 'general' | 'refrigerada'; hazmat: boolean }) {
  const solicitud = useDebounced(peso && peso > 0 ? { peso_kg: peso, volumen_m3: volumen && volumen > 0 ? volumen : null, tipo_carga: tipo, es_hazmat: hazmat } : null, 400);
  const v = useViabilidad(solicitud);
  if (!solicitud) return <Nota>Indique el peso para comprobar si la flota puede transportar la carga.</Nota>;
  if (v.isFetching && !v.data)
    return (
      <Nota>
        <span className="inline-flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Comprobando la flota…
        </span>
      </Nota>
    );
  if (v.error) return <Nota>No se pudo comprobar la viabilidad ahora. Puede crear el envío igual: el servidor la vuelve a validar.</Nota>;
  if (!v.data) return null;
  if (!v.data.viable)
    return (
      <div role="status" className="flex gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px]">
        <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />
        <div>
          <p className="font-semibold">Ningún vehículo de la flota puede llevar esta carga</p>
          <p className="text-text-2">{v.data.mensaje ?? CAUSAS_VIABILIDAD[v.data.causa ?? '']}</p>
        </div>
      </div>
    );
  return (
    <div role="status" className="flex gap-2 rounded-md border border-ok/30 bg-ok-soft px-3 py-2.5 text-[13px]">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />
      <div>
        <p className="font-semibold">La flota puede transportar esta carga</p>
        <p className="text-text-2">
          {v.data.compatibles} pareja(s) vehículo y conductor compatibles; {v.data.disponibles_ahora} libre(s) ahora.
          {v.data.disponibles_ahora === 0 && ' El envío quedará esperando hasta que se libere una.'}
        </p>
      </div>
    </div>
  );
}

export default function NuevoEnvioPage() {
  const navigate = useNavigate();
  const paises = usePaises();
  const [paisOrigen, setPaisOrigen] = useState('');
  const [paisDestino, setPaisDestino] = useState('');
  const [previa, setPrevia] = useState<RutaMaestra | null>(null);

  const form = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: {
      cliente: null,
      origen: null,
      destino: null,
      peso_kg: '',
      volumen_m3: '',
      tipo_carga: 'general',
      es_hazmat: false,
      fecha_limite_sla: '',
    },
  });
  const { register, control, handleSubmit, formState } = form;
  const w = useWatch({ control });

  const calcular = useAccion({
    fn: (v: { o: Ubicacion; d: Ubicacion }) => api.rutasMaestras.calcular({ origen_id: v.o.id, destino_id: v.d.id }),
    onSuccess: (r) => setPrevia(r),
    exito: (r) => `Ruta ${r.codigo_ruta}: ${numero(r.distancia_km, 0)} km`,
    invalida: [['rutasMaestras']],
  });

  // Un solo envío por formulario: el botón se bloquea en el primer clic y la clave hace que el
  // servidor devuelva el mismo envío si la petición se repite (doble clic, reintento por red lenta).
  const enviando = useRef(false);
  const [clave] = useState(nuevaClave);

  const crear = useAccion({
    fn: (v: Valores) =>
      api.envios.crear({
        cliente_id: v.cliente!.id,
        origen_id: v.origen!.id,
        destino_id: v.destino!.id,
        peso_kg: aNumero(v.peso_kg)!,
        volumen_m3: aNumero(v.volumen_m3),
        tipo_carga: v.tipo_carga,
        es_hazmat: v.es_hazmat,
        fecha_limite_sla: desdeInputLocal(v.fecha_limite_sla),
      }, clave),
    exito: (e) => `Envío ${e.codigo_envio} creado. El sistema está buscando vehículo.`,
    invalida: [['envios'], ['analitica']],
    toastError: false,
    onSuccess: (e) => navigate(`/envios/${e.id}`),
  });

  const internacional = w.origen && w.destino ? w.origen.codigo_pais !== w.destino.codigo_pais : null;

  return (
    <>
      <PageHeader
        titulo="Nuevo envío"
        migas={[{ etiqueta: 'Envíos', to: '/envios' }, { etiqueta: 'Nuevo envío' }]}
        descripcion="El sistema valida el cliente, calcula la ruta por carretera, comprueba la flota y asigna vehículo y conductor automáticamente."
      />
      <form
        onSubmit={(e) => {
          void handleSubmit((v) => {
            if (enviando.current) return;
            enviando.current = true;
            crear.mutate(v, {
              onSettled: () => {
                enviando.current = false;
              },
            });
          })(e);
        }}
        noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Panel titulo="Cliente">
            <Field label="Cliente" htmlFor="cliente" requerido error={formState.errors.cliente?.message} ayuda="Solo clientes activos. Si no existe, regístrelo en Clientes.">
              <Controller
                control={control}
                name="cliente"
                render={({ field }) => <ClientePicker id="cliente" valor={field.value ?? null} onCambio={field.onChange} invalido={!!formState.errors.cliente} />}
              />
            </Field>
          </Panel>

          <Panel titulo="Origen y destino" descripcion="Ubicaciones del catálogo (Colombia y capitales de Sudamérica)">
            <div className="grid gap-4 sm:grid-cols-2">
              {(['origen', 'destino'] as const).map((campo) => {
                const pais = campo === 'origen' ? paisOrigen : paisDestino;
                const setPais = campo === 'origen' ? setPaisOrigen : setPaisDestino;
                return (
                  <div key={campo} className="space-y-2">
                    <Field label={campo === 'origen' ? 'Origen' : 'Destino'} htmlFor={campo} requerido error={formState.errors[campo]?.message}>
                      <Controller
                        control={control}
                        name={campo}
                        render={({ field }) => (
                          <UbicacionPicker
                            id={campo}
                            valor={field.value ?? null}
                            onCambio={(u) => {
                              field.onChange(u);
                              setPrevia(null);
                            }}
                            pais={pais}
                            invalido={!!formState.errors[campo]}
                          />
                        )}
                      />
                    </Field>
                    <NativeSelect value={pais} onChange={(e) => setPais(e.target.value)} aria-label={`Filtrar ${campo} por país`}>
                      <option value="">Cualquier país</option>
                      {(paises.data ?? []).map((p) => (
                        <option key={p.codigo_pais} value={p.codigo_pais}>
                          {p.pais} ({p.total})
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                );
              })}
            </div>
            {internacional !== null && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
                <p className="flex items-center gap-2 text-[13px] text-text-2">
                  <Globe2 className="size-4" />
                  {internacional
                    ? 'Envío internacional: Aduanas generará una declaración y puede retenerlo.'
                    : 'Envío nacional.'}
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => w.origen && w.destino && calcular.mutate({ o: w.origen as Ubicacion, d: w.destino as Ubicacion })}
                  cargando={calcular.isPending}
                  disabled={!w.origen || !w.destino || w.origen.id === w.destino.id}
                >
                  <RouteIcon /> Previsualizar ruta
                </Button>
              </div>
            )}
            {previa && (
              <div className="mt-4 space-y-3 rounded-md border border-rule bg-surface-2 p-3">
                <KeyValue
                  columnas={3}
                  items={[
                    { k: 'Ruta maestra', v: previa.codigo_ruta },
                    { k: 'Distancia', v: `${numero(previa.distancia_km, 1)} km` },
                    { k: 'Duración real estimada', v: horas(previa.duracion_horas) },
                    { k: 'Paradas en la vía', v: previa.paradas?.length ?? 0 },
                  ]}
                />
                {previa.estimada && (
                  <Limitacion titulo="Ruta estimada">
                    El servicio de mapas no respondió: distancia calculada en línea recta con un factor de corrección.
                  </Limitacion>
                )}
              </div>
            )}
          </Panel>

          <Panel titulo="Carga">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Peso (kg)" htmlFor="peso" requerido error={formState.errors.peso_kg?.message}>
                <Input id="peso" inputMode="decimal" {...register('peso_kg')} aria-invalid={!!formState.errors.peso_kg} placeholder="800" />
              </Field>
              <Field label="Volumen (m³)" htmlFor="volumen" error={formState.errors.volumen_m3?.message} ayuda="Opcional">
                <Input id="volumen" inputMode="decimal" {...register('volumen_m3')} aria-invalid={!!formState.errors.volumen_m3} placeholder="6" />
              </Field>
              <Field label="Tipo de carga" htmlFor="tipo">
                <NativeSelect id="tipo" {...register('tipo_carga')}>
                  <option value="general">General</option>
                  <option value="refrigerada">Refrigerada (solo vehículos con refrigeración)</option>
                </NativeSelect>
              </Field>
              <Field label="Fecha límite de entrega (SLA)" htmlFor="sla" ayuda="Opcional. Hora de Bogotá.">
                <Input id="sla" type="datetime-local" {...register('fecha_limite_sla')} />
              </Field>
              <div className="flex items-start gap-2.5 sm:col-span-2">
                <Controller
                  control={control}
                  name="es_hazmat"
                  render={({ field }) => (
                    <Checkbox id="hazmat" checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} className="mt-0.5" />
                  )}
                />
                <div>
                  <Label htmlFor="hazmat">Mercancía peligrosa (HAZMAT)</Label>
                  <p className="text-xs text-text-3">Solo vehículos certificados con conductores habilitados y 3 años de experiencia.</p>
                </div>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Panel titulo="Comprobación de la flota">
            <AvisoViabilidad
              peso={aNumero(w.peso_kg)}
              volumen={aNumero(w.volumen_m3)}
              tipo={(w.tipo_carga as 'general' | 'refrigerada') ?? 'general'}
              hazmat={!!w.es_hazmat}
            />
          </Panel>
          <ErrorFormulario error={crear.error} />
          <FormActions>
            <Button type="button" variant="ghost" onClick={() => navigate('/envios')}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" cargando={crear.isPending}>
              {crear.isPending ? 'Creando envío…' : 'Crear envío'}
            </Button>
          </FormActions>
          {crear.isPending && (
            <p className="text-xs text-text-2">La primera ruta entre dos ciudades puede tardar unos segundos mientras se consulta el servicio de mapas.</p>
          )}
        </div>
      </form>
    </>
  );
}
