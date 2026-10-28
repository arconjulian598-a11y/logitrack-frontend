import { limpioAlAbrir } from '@/lib/limpioAlAbrir';
import { usePuede } from '@/app/auth';
import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarPlus, Cpu, Plus, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { EstadoBadge } from '@/components/shared/Badge';
import { DataTable, type Columna } from '@/components/shared/DataTable';
import { ErrorFormulario, Field, FormActions } from '@/components/shared/Form';
import { aNumero, vacioANull } from '@/lib/formularios';
import { Cifra, PageHeader, Panel } from '@/components/shared/Layout';
import { VehiculoPicker } from '@/components/shared/Pickers';
import { Plate } from '@/components/shared/Plate';
import { EmptyState, ErrorState, LoadingState, Nota } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Switch } from '@/components/ui/misc';
import { useIntervenciones, useProgramas, useProyeccionMantenimiento, useVehiculo, useVehiculos } from '@/hooks/queries';
import { useAccion } from '@/hooks/useAccion';
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl';
import * as api from '@/lib/api/endpoints';
import { diasRestantes, estadoVehiculo, humanizar, PRIORIDADES, prioridad, urgencia } from '@/lib/dominio';
import { desdeInputLocal, fecha, fechaHora, num, numero, pesos, relativo } from '@/lib/format';
import type { Intervencion, ProgramaMantenimiento, ProyeccionMantenimiento } from '@/lib/types/api';

/** Programas que crea Mantenimiento por su cuenta al analizar la telemetría (maintenance-service/app/events.py). */
const AUTOMATICOS: Record<string, string> = {
  revision_temperatura_motor: 'Anomalía: motor sobre 110 °C',
  diagnostico_obd2: 'Anomalía: código OBD-II',
  preventivo_kilometraje: 'Kilometraje desde el último servicio',
};

const TIPOS_SUGERIDOS = ['cambio_aceite', 'revision_frenos', 'cambio_llantas', 'alineacion_balanceo', 'revision_tecnomecanica', 'revision_motor', 'cambio_filtros'];

const esquemaPrograma = z
  .object({
    tipo: z.string().trim().min(3, { error: 'Indique el tipo de mantenimiento' }),
    fecha_vencimiento: z.string(),
    kilometraje_vencimiento: z.string().trim().refine((v) => v === '' || (aNumero(v) ?? -1) > 0, { error: 'Debe ser mayor que 0' }),
    prioridad: z.string(),
  })
  .refine((d) => d.fecha_vencimiento || d.kilometraje_vencimiento, { error: 'Indique una fecha o un kilometraje de vencimiento', path: ['fecha_vencimiento'] });

const esquemaIntervencion = z.object({
  tipo: z.string().trim().min(3, { error: 'Indique qué se hizo' }),
  costo: z.string().trim().refine((v) => v === '' || (aNumero(v) ?? -1) >= 0, { error: 'Debe ser 0 o más' }),
  taller: z.string(),
  kilometraje_en_servicio: z.string().trim().refine((v) => v === '' || (aNumero(v) ?? -1) >= 0, { error: 'Debe ser 0 o más' }),
});

function DialogoProgramaFormulario({ vehiculoId, abierto, onAbierto }: { vehiculoId: string; abierto: boolean; onAbierto: (v: boolean) => void }) {
  const form = useForm({ resolver: zodResolver(esquemaPrograma), defaultValues: { tipo: '', fecha_vencimiento: '', kilometraje_vencimiento: '', prioridad: 'media' } });
  const a = useAccion({
    fn: (v: z.infer<typeof esquemaPrograma>) =>
      api.mantenimiento.crearPrograma({
        vehiculo_id: vehiculoId,
        tipo: v.tipo.trim().toLowerCase().replace(/\s+/g, '_'),
        fecha_vencimiento: desdeInputLocal(v.fecha_vencimiento),
        kilometraje_vencimiento: aNumero(v.kilometraje_vencimiento),
        prioridad: v.prioridad,
      }),
    exito: 'Programa de mantenimiento creado.',
    invalida: [['mantenimiento'], ['analitica']],
    toastError: false,
    onSuccess: () => {
      onAbierto(false);
      form.reset();
    },
  });
  const e = form.formState.errors;
  return (
    <Dialog open={abierto} onOpenChange={onAbierto}>
      <DialogContent titulo="Nuevo programa preventivo" descripcion="Venza por fecha, por kilometraje o por ambos.">
        <form className="space-y-4" onSubmit={form.handleSubmit((v) => a.mutate(v))} noValidate>
          <Field label="Tipo" htmlFor="p-tipo" requerido error={e.tipo?.message}>
            <Input id="p-tipo" list="tipos-mant" {...form.register('tipo')} aria-invalid={!!e.tipo} placeholder="cambio_aceite" />
          </Field>
          <datalist id="tipos-mant">
            {TIPOS_SUGERIDOS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vence el" htmlFor="p-fecha" error={e.fecha_vencimiento?.message} ayuda="Hora de Bogotá">
              <Input id="p-fecha" type="datetime-local" {...form.register('fecha_vencimiento')} />
            </Field>
            <Field label="O al llegar a (km)" htmlFor="p-km" error={e.kilometraje_vencimiento?.message}>
              <Input id="p-km" inputMode="decimal" {...form.register('kilometraje_vencimiento')} />
            </Field>
            <Field label="Prioridad" htmlFor="p-prio">
              <NativeSelect id="p-prio" {...form.register('prioridad')}>
                {Object.entries(PRIORIDADES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.etiqueta}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <ErrorFormulario error={a.error} />
          <FormActions>
            <Button type="button" variant="ghost" onClick={() => onAbierto(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" cargando={a.isPending}>
              Crear programa
            </Button>
          </FormActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoIntervencionFormulario({ vehiculoId, abierto, onAbierto }: { vehiculoId: string; abierto: boolean; onAbierto: (v: boolean) => void }) {
  const form = useForm({ resolver: zodResolver(esquemaIntervencion), defaultValues: { tipo: '', costo: '', taller: '', kilometraje_en_servicio: '' } });
  const v = useVehiculo(vehiculoId);
  const a = useAccion({
    fn: (x: z.infer<typeof esquemaIntervencion>) =>
      api.mantenimiento.crearIntervencion({
        vehiculo_id: vehiculoId,
        tipo: x.tipo.trim().toLowerCase().replace(/\s+/g, '_'),
        costo: aNumero(x.costo),
        taller: vacioANull(x.taller),
        kilometraje_en_servicio: aNumero(x.kilometraje_en_servicio),
      }),
    exito: 'Intervención registrada. Mantenimiento devolvió el vehículo a disponible.',
    invalida: [['mantenimiento'], ['vehiculos'], ['analitica']],
    toastError: false,
    onSuccess: () => {
      onAbierto(false);
      form.reset();
    },
  });
  const e = form.formState.errors;
  return (
    <Dialog open={abierto} onOpenChange={onAbierto}>
      <DialogContent titulo="Registrar intervención" descripcion="Un mantenimiento ya realizado.">
        <form className="space-y-4" onSubmit={form.handleSubmit((x) => a.mutate(x))} noValidate>
          <Field label="Qué se hizo" htmlFor="i-tipo" requerido error={e.tipo?.message}>
            <Input id="i-tipo" list="tipos-mant-i" {...form.register('tipo')} aria-invalid={!!e.tipo} />
          </Field>
          <datalist id="tipos-mant-i">
            {[...TIPOS_SUGERIDOS, ...Object.keys(AUTOMATICOS)].map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Costo (COP)" htmlFor="i-costo" error={e.costo?.message}>
              <Input id="i-costo" inputMode="decimal" {...form.register('costo')} />
            </Field>
            <Field label="Kilometraje en el servicio" htmlFor="i-km" error={e.kilometraje_en_servicio?.message} ayuda="Reinicia el conteo del preventivo por kilometraje.">
              <Input id="i-km" inputMode="decimal" {...form.register('kilometraje_en_servicio')} />
            </Field>
            <Field label="Taller" htmlFor="i-taller" className="sm:col-span-2">
              <Input id="i-taller" {...form.register('taller')} />
            </Field>
          </div>
          <Nota>
            Al registrar la intervención, Mantenimiento cambia el vehículo a «disponible» en Flota
            {v.data && v.data.estado !== 'active' ? ` (hoy está ${estadoVehiculo(v.data.estado).etiqueta.toLowerCase()})` : ''}.
          </Nota>
          <ErrorFormulario error={a.error} />
          <FormActions>
            <Button type="button" variant="ghost" onClick={() => onAbierto(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" cargando={a.isPending}>
              Registrar intervención
            </Button>
          </FormActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PorVehiculo({ vehiculoId }: { vehiculoId: string }) {
  const registra = usePuede('registrarMantenimiento');
  const p = useProgramas(vehiculoId);
  const i = useIntervenciones(vehiculoId);
  const [prog, setProg] = useState(false);
  const [interv, setInterv] = useState(false);
  const colP: Columna<ProgramaMantenimiento>[] = [
    {
      id: 'tipo',
      titulo: 'Programa',
      celda: (x) => (
        <div>
          <div className="font-medium">{humanizar(x.tipo)}</div>
          {AUTOMATICOS[x.tipo] && (
            <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-warn">
              <Cpu className="size-3.5" /> {AUTOMATICOS[x.tipo]}
            </span>
          )}
        </div>
      ),
      orden: (x) => x.tipo,
    },
    { id: 'vence', titulo: 'Vence', celda: (x) => (x.fecha_vencimiento ? fecha(x.fecha_vencimiento) : x.kilometraje_vencimiento ? `${numero(x.kilometraje_vencimiento)} km` : '—'), orden: (x) => x.fecha_vencimiento },
    { id: 'prio', titulo: 'Prioridad', celda: (x) => <EstadoBadge def={prioridad(x.prioridad)} />, orden: (x) => Object.keys(PRIORIDADES).indexOf(x.prioridad) },
    { id: 'act', titulo: 'Actualizado', celda: (x) => relativo(x.actualizado_en), orden: (x) => x.actualizado_en, ocultarBajo: 'md' },
  ];
  const colI: Columna<Intervencion>[] = [
    { id: 'tipo', titulo: 'Intervención', celda: (x) => humanizar(x.tipo), orden: (x) => x.tipo },
    { id: 'fecha', titulo: 'Realizada', celda: (x) => fechaHora(x.realizado_en), orden: (x) => x.realizado_en },
    { id: 'costo', titulo: 'Costo', celda: (x) => pesos(x.costo), orden: (x) => num(x.costo), alinear: 'right' },
    { id: 'taller', titulo: 'Taller', celda: (x) => x.taller ?? '—', ocultarBajo: 'md' },
    { id: 'km', titulo: 'Kilometraje', celda: (x) => (x.kilometraje_en_servicio != null ? `${numero(x.kilometraje_en_servicio)} km` : '—'), alinear: 'right', ocultarBajo: 'lg' },
  ];
  const total = (i.data ?? []).reduce((s, x) => s + (num(x.costo) ?? 0), 0);
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel
        titulo="Programas"
        descripcion="Preventivos planificados y alertas detectadas por telemetría"
        acciones={
          registra && (
            <Button size="sm" onClick={() => setProg(true)}>
              <CalendarPlus /> Nuevo programa
            </Button>
          )
        }
        cuerpo="p-0"
      >
        {p.error ? (
          <ErrorState error={p.error} reintentar={() => p.refetch()} compacto />
        ) : (
          <DataTable etiqueta="Programas de mantenimiento" filas={p.data} columnas={colP} clave={(x) => x.id} cargando={p.isLoading} vacio={<EmptyState titulo="Sin programas" compacto />} />
        )}
      </Panel>
      <Panel
        titulo="Intervenciones realizadas"
        descripcion={i.data?.length ? `${i.data.length} intervención(es), ${pesos(total)} en total` : undefined}
        acciones={
          registra && (
            <Button size="sm" onClick={() => setInterv(true)}>
              <Plus /> Registrar intervención
            </Button>
          )
        }
        cuerpo="p-0"
      >
        {i.error ? (
          <ErrorState error={i.error} reintentar={() => i.refetch()} compacto />
        ) : (
          <DataTable etiqueta="Intervenciones" filas={i.data} columnas={colI} clave={(x) => x.id} cargando={i.isLoading} ordenInicial={{ id: 'fecha', dir: 'desc' }} vacio={<EmptyState titulo="Sin intervenciones registradas" compacto />} />
        )}
      </Panel>
      {registra && <DialogoPrograma vehiculoId={vehiculoId} abierto={prog} onAbierto={setProg} />}
      {registra && <DialogoIntervencion vehiculoId={vehiculoId} abierto={interv} onAbierto={setInterv} />}
    </div>
  );
}

function Proyeccion({ onVehiculo }: { onVehiculo: (id: string) => void }) {
  const [dias, setDias] = useState(90);
  const [todos, setTodos] = useState(false);
  const pr = useProyeccionMantenimiento({ dias, todos });
  const cols: Columna<ProyeccionMantenimiento>[] = [
    { id: 'veh', titulo: 'Vehículo', celda: (x) => <Plate placa={x.placa_vehiculo} tamano="sm" />, orden: (x) => x.placa_vehiculo },
    {
      id: 'tipo',
      titulo: 'Mantenimiento',
      celda: (x) => (
        <span>
          {humanizar(x.tipo_mantenimiento)}
          {AUTOMATICOS[x.tipo_mantenimiento] && <span className="block text-xs text-warn">{AUTOMATICOS[x.tipo_mantenimiento]}</span>}
        </span>
      ),
      orden: (x) => x.tipo_mantenimiento,
    },
    { id: 'urg', titulo: 'Urgencia', celda: (x) => <EstadoBadge def={urgencia(x.urgencia)} />, orden: (x) => ['vencido', 'critico', 'proximo', 'programado', 'sin_datos_suficientes'].indexOf(x.urgencia) },
    { id: 'dias', titulo: 'Vencimiento', celda: (x) => <span className={x.dias_restantes != null && x.dias_restantes < 0 ? 'font-semibold text-danger' : ''}>{diasRestantes(x.dias_restantes)}</span>, orden: (x) => x.dias_restantes },
    { id: 'km', titulo: 'Km restantes', celda: (x) => numero(x.km_restantes), orden: (x) => num(x.km_restantes), alinear: 'right', ocultarBajo: 'md' },
    { id: 'prio', titulo: 'Prioridad', celda: (x) => <EstadoBadge def={prioridad(x.prioridad_configurada)} />, ocultarBajo: 'lg' },
    { id: 'vence', titulo: 'Vence', celda: (x) => fecha(x.fecha_vencimiento), orden: (x) => x.fecha_vencimiento, ocultarBajo: 'lg' },
  ];
  const lista = pr.data ?? [];
  const n = (u: string) => lista.filter((x) => x.urgencia === u).length;
  const anomalias = lista.filter((x) => x.tipo_mantenimiento === 'revision_temperatura_motor' || x.tipo_mantenimiento === 'diagnostico_obd2').length;
  return (
    <>
      <Panel cuerpo="px-3 py-3" className="mb-5">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Cifra valor={n('vencido')} etiqueta="Vencidos" tono={n('vencido') ? 'danger' : undefined} />
          <Cifra valor={n('critico')} etiqueta="Críticos" tono={n('critico') ? 'danger' : undefined} />
          <Cifra valor={n('proximo')} etiqueta="Próximos" tono={n('proximo') ? 'warn' : undefined} />
          <Cifra valor={lista.length - anomalias} etiqueta="Preventivos" detalle="programados o por kilometraje" />
          <Cifra valor={anomalias} etiqueta="Correctivos por anomalía" detalle="detectados por telemetría" tono={anomalias ? 'warn' : undefined} />
        </div>
      </Panel>
      <Panel
        titulo="Próximos mantenimientos de la flota"
        descripcion="Proyección de la analítica (ETL periódica). Clic en una fila para gestionar ese vehículo."
        acciones={
          <div className="flex items-center gap-3">
            <NativeSelect value={String(dias)} onChange={(e) => setDias(Number(e.target.value))} className="h-8 w-36" aria-label="Horizonte en días" disabled={todos}>
              {[7, 30, 90, 180, 365].map((d) => (
                <option key={d} value={d}>
                  Próximos {d} días
                </option>
              ))}
            </NativeSelect>
            <label className="flex items-center gap-2 text-xs font-semibold">
              <Switch checked={todos} onCheckedChange={setTodos} /> Todos
            </label>
          </div>
        }
        cuerpo="p-0"
      >
        <DataTable
          etiqueta="Proyección de mantenimiento"
          filas={pr.data}
          columnas={cols}
          clave={(x) => `${x.vehiculo_id}-${x.tipo_mantenimiento}`}
          cargando={pr.isLoading}
          error={pr.error}
          reintentar={() => pr.refetch()}
          onFila={(x) => onVehiculo(x.vehiculo_id)}
          ordenInicial={{ id: 'urg', dir: 'asc' }}
          vacio={<EmptyState titulo="Sin mantenimientos en el horizonte" compacto>Si acaba de crear programas, ejecute la ETL en Analítica para verlos aquí.</EmptyState>}
        />
      </Panel>
    </>
  );
}

export default function MantenimientoPage() {
  const verProyeccion = usePuede('dashboardFlota');
  const { valores, set } = useFiltrosUrl(['vehiculo'] as const);
  const vehiculos = useVehiculos();
  const navigate = useNavigate();
  const enTaller = (vehiculos.data ?? []).filter((v) => v.estado === 'en_mantenimiento');
  return (
    <>
      <PageHeader
        titulo="Mantenimiento"
        descripcion="Programas preventivos, alertas que Mantenimiento crea a partir de la telemetría e intervenciones realizadas por vehículo."
      />
      {enTaller.length > 0 && (
        <Panel className="mb-5" titulo="Vehículos fuera de operación por mantenimiento">
          <div className="flex flex-wrap gap-2">
            {enTaller.map((v) => (
              <button key={v.id} type="button" onClick={() => set('vehiculo', v.id)} className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-warn/40 bg-warn-soft px-2.5 py-1.5 text-[13px] hover:brightness-95">
                <Plate placa={v.placa} tamano="sm" />
                <Wrench className="size-3.5 text-warn" />
              </button>
            ))}
          </div>
        </Panel>
      )}
      {verProyeccion && <Proyeccion onVehiculo={(id) => set('vehiculo', id)} />}
      <div className="mt-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Por vehículo</h2>
            <p className="text-xs text-text-2">Mantenimiento solo expone programas e intervenciones por vehículo (no hay listado global).</p>
          </div>
          <div className="flex w-full max-w-sm items-center gap-2">
            <VehiculoPicker valorId={valores.vehiculo || null} onCambio={(v) => set('vehiculo', v?.id ?? '')} />
            {valores.vehiculo && (
              <Button size="sm" variant="ghost" onClick={() => navigate(`/flota/vehiculos/${valores.vehiculo}`)}>
                Ficha
              </Button>
            )}
          </div>
        </div>
        {valores.vehiculo ? (
          <PorVehiculo vehiculoId={valores.vehiculo} />
        ) : vehiculos.isLoading ? (
          <LoadingState />
        ) : (
          <Panel>
            <EmptyState titulo="Elija un vehículo">Para ver o registrar programas e intervenciones, seleccione un vehículo.</EmptyState>
          </Panel>
        )}
      </div>
      {vehiculos.error && <ErrorState error={vehiculos.error} />}
    </>
  );
}

/** Cada vez que se abren, estos formularios empiezan limpios. */
const DialogoPrograma = limpioAlAbrir(DialogoProgramaFormulario);
const DialogoIntervencion = limpioAlAbrir(DialogoIntervencionFormulario);
