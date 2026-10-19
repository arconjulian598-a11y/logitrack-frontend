import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Globe2, Loader2, Receipt, RefreshCw, XCircle } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { usePuede, useUsuario } from '@/app/auth';
import { ErrorFormulario, Field, FormActions } from '@/components/shared/Form';
import { PageHeader, Panel } from '@/components/shared/Layout';
import { ClientePicker, UbicacionPicker } from '@/components/shared/Pickers';
import { Nota } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Checkbox, Label } from '@/components/ui/misc';
import { usePaises, useViabilidad } from '@/hooks/queries';
import { useDebounced } from '@/hooks/useFiltrosUrl';
import * as api from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import { CAUSAS_VIABILIDAD } from '@/lib/dominio';
import { aNumero } from '@/lib/formularios';
import { desdeInputLocal, num, pesos } from '@/lib/format';
import type { Cliente, Cotizacion, EnvioCrear, Ubicacion, ViabilidadSolicitud } from '@/lib/types/api';
import { useQueryClient } from '@tanstack/react-query';
import { ResultadoCotizacion } from './Cotizacion';

const numeroPositivo = (msg: string) =>
  z
    .string()
    .trim()
    .min(1, { error: msg })
    .refine((v) => (aNumero(v) ?? 0) > 0, { error: 'Debe ser un número mayor que 0' });

function crearEsquema(eligeCliente: boolean) {
  return z
    .object({
      cliente: z.custom<Cliente | null>(),
      origen: z.custom<Ubicacion | null>().refine((v) => !!v, { error: 'Elija el origen' }),
      destino: z.custom<Ubicacion | null>().refine((v) => !!v, { error: 'Elija el destino' }),
      peso_kg: numeroPositivo('Indique el peso'),
      volumen_m3: z
        .string()
        .trim()
        .refine((v) => v === '' || (aNumero(v) ?? -1) >= 0, { error: 'Debe ser un número igual o mayor que 0' }),
      tipo_carga: z.enum(['general', 'refrigerada']),
      es_hazmat: z.boolean(),
      es_divisible: z.boolean(),
      fecha_limite_sla: z.string(),
      fecha_programada: z.string(),
    })
    .refine((d) => !eligeCliente || !!d.cliente, { error: 'Elija un cliente', path: ['cliente'] })
    .refine((d) => !d.origen || !d.destino || d.origen.id !== d.destino.id, {
      error: 'Origen y destino deben ser distintos',
      path: ['destino'],
    })
    .refine(
      (d) => {
        const iso = desdeInputLocal(d.fecha_programada);
        return !iso || new Date(iso).getTime() > Date.now();
      },
      { error: 'La fecha programada debe ser futura', path: ['fecha_programada'] },
    );
}

type Valores = z.input<ReturnType<typeof crearEsquema>>;

/** Cuerpo común de POST /envios/cotizar y POST /envios (el cliente no elige: se crea a su nombre). */
function armarCuerpo(v: Valores, eligeCliente: boolean): EnvioCrear {
  return {
    ...(eligeCliente && v.cliente ? { cliente_id: v.cliente.id } : {}),
    origen_id: v.origen!.id,
    destino_id: v.destino!.id,
    peso_kg: aNumero(v.peso_kg)!,
    volumen_m3: aNumero(v.volumen_m3),
    tipo_carga: v.tipo_carga,
    es_hazmat: v.es_hazmat,
    es_divisible: v.es_divisible,
    fecha_limite_sla: desdeInputLocal(v.fecha_limite_sla),
    fecha_programada: desdeInputLocal(v.fecha_programada),
  };
}

const CODIGOS_FECHA: Record<string, string> = {
  FECHA_PROGRAMADA_PASADA: 'La fecha programada debe ser al menos un minuto en el futuro.',
  FECHA_PROGRAMADA_LEJANA: 'La fecha programada no puede pasar de un año.',
  FECHA_POSTERIOR_AL_SLA: 'La fecha programada no puede ser posterior a la fecha límite de entrega.',
};

function AvisoViabilidad(props: { peso: number | null; volumen: number | null; tipo: 'general' | 'refrigerada'; hazmat: boolean; divisible: boolean }) {
  const { peso, volumen, tipo, hazmat, divisible } = props;
  // Se espera a que el usuario deje de escribir; la clave es texto para que no cambie en cada render
  const clave =
    peso && peso > 0
      ? JSON.stringify({ peso_kg: peso, volumen_m3: volumen && volumen > 0 ? volumen : null, tipo_carga: tipo, es_hazmat: hazmat, es_divisible: divisible })
      : null;
  const claveLista = useDebounced(clave, 400);
  const solicitud = useMemo(() => (claveLista ? (JSON.parse(claveLista) as ViabilidadSolicitud) : null), [claveLista]);
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
  if (v.error) return <Nota>No se pudo comprobar la flota ahora. La cotización la vuelve a revisar.</Nota>;
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
  const qc = useQueryClient();
  const usuario = useUsuario();
  const eligeCliente = usePuede('elegirCliente');
  const puedeVerViabilidad = usePuede('cotizar');
  const paises = usePaises();
  const [paisOrigen, setPaisOrigen] = useState('');
  const [paisDestino, setPaisDestino] = useState('');

  const esquema = useMemo(() => crearEsquema(eligeCliente), [eligeCliente]);
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
      es_divisible: false,
      fecha_limite_sla: '',
      fecha_programada: '',
    },
  });
  const { register, control, handleSubmit, formState, setValue, setError } = form;
  const w = useWatch({ control });

  // Paso 1: cotizar. La cotización vale solo para los datos con que se pidió.
  const [cotizacion, setCotizacion] = useState<{ cuerpo: string; datos: Cotizacion } | null>(null);
  const [cotizando, setCotizando] = useState(false);
  const [errorCotizar, setErrorCotizar] = useState<unknown>(null);
  const [precioCambio, setPrecioCambio] = useState<{ antes: number | null; ahora: number | null } | null>(null);

  // Paso 2: crear. Un solo envío por clic: el bloqueo es inmediato (antes de que React vuelva a pintar).
  const enviando = useRef(false);
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState<unknown>(null);

  const cuerpoActual = useMemo(() => {
    if (!w.origen || !w.destino || !(aNumero(w.peso_kg) ?? 0)) return null;
    return JSON.stringify(armarCuerpo(w as Valores, eligeCliente));
  }, [w, eligeCliente]);
  const vigente = cotizacion && cotizacion.cuerpo === cuerpoActual ? cotizacion.datos : null;
  const desactualizada = cotizacion !== null && !vigente;

  function mostrarErrorDeFecha(e: unknown): boolean {
    if (e instanceof ApiError && e.codigo && CODIGOS_FECHA[e.codigo]) {
      setError('fecha_programada', { message: CODIGOS_FECHA[e.codigo] });
      return true;
    }
    return false;
  }

  async function cotizar(v: Valores) {
    if (cotizando) return;
    const cuerpo = armarCuerpo(v, eligeCliente);
    setCotizando(true);
    setErrorCotizar(null);
    setErrorCrear(null);
    setPrecioCambio(null);
    try {
      const datos = await api.envios.cotizar(cuerpo);
      setCotizacion({ cuerpo: JSON.stringify(cuerpo), datos });
    } catch (e) {
      setCotizacion(null);
      if (!mostrarErrorDeFecha(e)) setErrorCotizar(e);
    } finally {
      setCotizando(false);
    }
  }

  async function crear(v: Valores) {
    if (enviando.current || !vigente || !vigente.puede_crear) return;
    enviando.current = true;
    setCreando(true);
    setErrorCrear(null);
    const cuerpo: EnvioCrear = {
      ...armarCuerpo(v, eligeCliente),
      ...(vigente.facturacion_activa ? { monto_aceptado_cop: num(vigente.monto_cop) } : {}),
    };
    try {
      const envio = await api.envios.crear(cuerpo);
      void qc.invalidateQueries({ queryKey: ['envios'] });
      void qc.invalidateQueries({ queryKey: ['pagos'] });
      toast.success(
        envio.estado === 'programado'
          ? `Pedido ${envio.codigo_envio} programado.`
          : `Pedido ${envio.codigo_envio} creado. El sistema está buscando vehículo.`,
      );
      navigate(`/envios/${envio.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.codigo === 'PRECIO_CAMBIO') {
        // El precio cambió: se vuelve a cotizar y el usuario confirma el nuevo monto (no se cierra el formulario)
        const antes = num(vigente.monto_cop);
        try {
          const datos = await api.envios.cotizar(armarCuerpo(v, eligeCliente));
          setCotizacion({ cuerpo: JSON.stringify(armarCuerpo(v, eligeCliente)), datos });
          setPrecioCambio({ antes, ahora: num(datos.monto_cop) });
        } catch (e2) {
          setCotizacion(null);
          setErrorCotizar(e2);
        }
      } else if (e instanceof ApiError && e.codigo === 'PRECIO_NO_ACEPTADO') {
        setCotizacion(null);
        setErrorCrear(new ApiError({ status: 422, mensaje: 'Primero hay que cotizar y aceptar el precio. Vuelva a cotizar.' }));
      } else if (!mostrarErrorDeFecha(e)) {
        setErrorCrear(e);
      }
    } finally {
      enviando.current = false;
      setCreando(false);
    }
  }

  const internacional = w.origen && w.destino ? w.origen.codigo_pais !== w.destino.codigo_pais : null;
  const indivisible = errorCrear instanceof ApiError && errorCrear.codigo === 'CARGA_INDIVISIBLE_EXCEDE_CAPACIDAD';

  return (
    <>
      <PageHeader
        titulo="Nuevo envío"
        migas={[{ etiqueta: usuario.rol === 'cliente' ? 'Mis envíos' : 'Envíos', to: '/envios' }, { etiqueta: 'Nuevo envío' }]}
        descripcion="Primero se cotiza el precio; al aceptarlo, el pedido se crea y el sistema asigna vehículo y conductor automáticamente."
      />
      <form onSubmit={(e) => void handleSubmit(cotizar)(e)} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Panel titulo="Cliente">
            {eligeCliente ? (
              <Field label="Cliente" htmlFor="cliente" requerido error={formState.errors.cliente?.message} ayuda="Solo clientes activos. Si no existe, regístrelo en Clientes.">
                <Controller
                  control={control}
                  name="cliente"
                  render={({ field }) => <ClientePicker id="cliente" valor={field.value ?? null} onCambio={field.onChange} invalido={!!formState.errors.cliente} />}
                />
              </Field>
            ) : (
              <p className="text-[13px] text-text-2">
                El envío se crea a nombre de su empresa
                {usuario.codigo_cliente ? <span className="font-semibold text-text"> (cliente {usuario.codigo_cliente})</span> : null}.
              </p>
            )}
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
                          <UbicacionPicker id={campo} valor={field.value ?? null} onCambio={field.onChange} pais={pais} invalido={!!formState.errors[campo]} />
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
              <p className="mt-4 flex items-center gap-2 border-t border-rule pt-4 text-[13px] text-text-2">
                <Globe2 className="size-4" />
                {internacional ? 'Envío internacional: Aduanas generará una declaración y puede retenerlo.' : 'Envío nacional.'}
              </p>
            )}
          </Panel>

          <Panel titulo="Carga">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Peso (kg)" htmlFor="peso" requerido error={formState.errors.peso_kg?.message} ayuda="Es el criterio principal de capacidad.">
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
              <Field label="Fecha límite de entrega (SLA)" htmlFor="sla" ayuda="Opcional. Hora de Colombia.">
                <Input id="sla" type="datetime-local" {...register('fecha_limite_sla')} />
              </Field>
              <div className="flex items-start gap-2.5">
                <Controller
                  control={control}
                  name="es_hazmat"
                  render={({ field }) => <Checkbox id="hazmat" checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} className="mt-0.5" />}
                />
                <div>
                  <Label htmlFor="hazmat">Mercancía peligrosa (HAZMAT)</Label>
                  <p className="text-xs text-text-3">Solo vehículos certificados con conductores habilitados.</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Controller
                  control={control}
                  name="es_divisible"
                  render={({ field }) => <Checkbox id="divisible" checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} className="mt-0.5" />}
                />
                <div>
                  <Label htmlFor="divisible">Carga divisible</Label>
                  <p className="text-xs text-text-3">Si no cabe en un vehículo, se reparte en varios (un pedido con varias partes).</p>
                </div>
              </div>
            </div>
          </Panel>

          <Panel titulo="Programación" descripcion="Opcional: déjelo vacío para que salga lo antes posible">
            <Field
              label="Fecha y hora de salida"
              htmlFor="programada"
              error={formState.errors.fecha_programada?.message}
              ayuda="Hora de Colombia. Debe ser futura y a menos de un año. El envío queda «programado» sin reservar vehículo hasta esa hora."
              className="max-w-sm"
            >
              <Input id="programada" type="datetime-local" {...register('fecha_programada')} aria-invalid={!!formState.errors.fecha_programada} />
            </Field>
          </Panel>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {puedeVerViabilidad && (
            <Panel titulo="Comprobación de la flota">
              <AvisoViabilidad
                peso={aNumero(w.peso_kg)}
                volumen={aNumero(w.volumen_m3)}
                tipo={(w.tipo_carga as 'general' | 'refrigerada') ?? 'general'}
                hazmat={!!w.es_hazmat}
                divisible={!!w.es_divisible}
              />
            </Panel>
          )}

          <Panel titulo="Precio">
            {cotizando ? (
              <p role="status" className="flex items-center gap-2 py-4 text-[13px] text-text-2">
                <Loader2 className="size-4 animate-spin" /> Calculando ruta y precio… la primera vez entre dos ciudades puede tardar.
              </p>
            ) : vigente ? (
              <>
                {precioCambio && (
                  <p role="alert" className="mb-3 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-[13px] text-text">
                    El precio cambió de {pesos(precioCambio.antes)} a {pesos(precioCambio.ahora)}. Revíselo y confirme de nuevo.
                  </p>
                )}
                <ResultadoCotizacion c={vigente} />
              </>
            ) : (
              <p className="flex items-start gap-2 text-[13px] text-text-2">
                <Receipt className="mt-0.5 size-4 shrink-0" aria-hidden />
                {desactualizada
                  ? 'Cambió algún dato del envío. Vuelva a cotizar para ver el precio actualizado.'
                  : 'Complete el formulario y pulse «Cotizar precio». Cotizar no crea nada.'}
              </p>
            )}
          </Panel>

          <ErrorFormulario error={errorCotizar ?? errorCrear} />
          {indivisible && !w.es_divisible && (
            <Button type="button" size="sm" variant="secondary" onClick={() => setValue('es_divisible', true)}>
              Marcar la carga como divisible
            </Button>
          )}

          <FormActions>
            <Button type="button" variant="ghost" onClick={() => navigate('/envios')}>
              Cancelar
            </Button>
            {vigente?.puede_crear ? (
              <>
                <Button type="submit" variant="secondary" disabled={creando} cargando={cotizando}>
                  <RefreshCw /> Cotizar de nuevo
                </Button>
                <Button type="button" variant="primary" cargando={creando} onClick={() => void handleSubmit(crear)()}>
                  {creando ? 'Creando…' : vigente.facturacion_activa ? `Aceptar ${pesos(vigente.monto_cop)} y crear` : 'Crear envío'}
                </Button>
              </>
            ) : (
              <Button type="submit" variant="primary" cargando={cotizando}>
                {cotizando ? 'Cotizando…' : 'Cotizar precio'}
              </Button>
            )}
          </FormActions>
          {creando && (
            <p className="text-xs text-text-2">Creando el pedido. Puede tardar unos segundos si la ruta es nueva.</p>
          )}
        </div>
      </form>
    </>
  );
}
