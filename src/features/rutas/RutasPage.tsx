import { usePuede } from '@/app/auth';
import { Calculator, PlayCircle, RotateCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Badge, EstadoBadge } from '@/components/shared/Badge';
import { DataTable, type Columna } from '@/components/shared/DataTable';
import { ConfirmDialog, ErrorFormulario, Field, FormActions } from '@/components/shared/Form';
import { Codigo, PageHeader, Panel } from '@/components/shared/Layout';
import { UbicacionPicker } from '@/components/shared/Pickers';
import { Plate } from '@/components/shared/Plate';
import { Nota } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { useConductores, useEnvios, useRutas, useRutasMaestras, useVehiculos } from '@/hooks/queries';
import { useAccion } from '@/hooks/useAccion';
import { useDebounced, useFiltrosUrl } from '@/hooks/useFiltrosUrl';
import * as api from '@/lib/api/endpoints';
import { ESTADOS_RUTA, estadoRuta } from '@/lib/dominio';
import { fechaHora, horas, num, numero, relativo } from '@/lib/format';
import type { Ruta, RutaMaestra, Ubicacion } from '@/lib/types/api';

function RutasEnvio() {
  const { valores, set } = useFiltrosUrl(['estado'] as const);
  const rutas = useRutas({ estado: valores.estado || undefined }, { refetchInterval: 10000 });
  const envios = useEnvios();
  const vehiculos = useVehiculos();
  const conductores = useConductores();
  const navigate = useNavigate();
  const envio = useMemo(() => new Map((envios.data ?? []).map((e) => [e.id, e])), [envios.data]);
  const placa = useMemo(() => new Map((vehiculos.data ?? []).map((v) => [v.id, v.placa])), [vehiculos.data]);
  const conductor = useMemo(() => new Map((conductores.data ?? []).map((c) => [c.id, c.nombre])), [conductores.data]);

  const columnas: Columna<Ruta>[] = [
    { id: 'envio', titulo: 'Envío', celda: (r) => <Codigo>{envio.get(r.envio_id)?.codigo_envio ?? r.envio_id.slice(0, 8)}</Codigo>, orden: (r) => envio.get(r.envio_id)?.codigo_envio },
    { id: 'estado', titulo: 'Estado', celda: (r) => <EstadoBadge def={estadoRuta(r.estado)} />, orden: (r) => r.estado },
    { id: 'maestra', titulo: 'Ruta maestra', celda: (r) => <span className="font-cond font-bold">{r.codigo_ruta ?? '—'}</span>, orden: (r) => r.codigo_ruta, ocultarBajo: 'md' },
    {
      id: 'vehiculo',
      titulo: 'Vehículo y conductor',
      celda: (r) =>
        r.vehiculo_id ? (
          <div>
            <Plate placa={placa.get(r.vehiculo_id) ?? (r.detalle_asignacion?.placa as string | undefined)} tamano="sm" />
            <div className="text-xs text-text-2">{r.conductor_id ? conductor.get(r.conductor_id) : ''}</div>
          </div>
        ) : (
          <span className="text-xs text-text-3">Sin asignar</span>
        ),
      ocultarBajo: 'sm',
    },
    { id: 'dist', titulo: 'Distancia', celda: (r) => (r.distancia_km != null ? `${numero(r.distancia_km, 1)} km` : '—'), orden: (r) => num(r.distancia_km), alinear: 'right', ocultarBajo: 'lg' },
    { id: 'intentos', titulo: 'Intentos', celda: (r) => r.intentos, orden: (r) => r.intentos, alinear: 'right', ocultarBajo: 'lg' },
    { id: 'recalc', titulo: 'Recálculos', celda: (r) => r.veces_recalculada, orden: (r) => r.veces_recalculada, alinear: 'right', ocultarBajo: 'xl' },
    { id: 'act', titulo: 'Actualizada', celda: (r) => relativo(r.actualizado_en), orden: (r) => r.actualizado_en, ocultarBajo: 'md' },
  ];

  return (
    <Panel cuerpo="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-rule p-3">
        <NativeSelect value={valores.estado} onChange={(e) => set('estado', e.target.value)} className="w-52" aria-label="Filtrar por estado de la ruta">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS_RUTA).map(([k, v]) => (
            <option key={k} value={k}>
              {v.etiqueta}
            </option>
          ))}
        </NativeSelect>
        <span className="text-xs text-text-3">Una ruta por envío: guarda la asignación y su estado. La crea y la mueve el sistema.</span>
      </div>
      <DataTable
        etiqueta="Rutas de envío"
        filas={rutas.data}
        columnas={columnas}
        clave={(r) => r.id}
        cargando={rutas.isLoading}
        error={rutas.error}
        reintentar={() => rutas.refetch()}
        onFila={(r) => navigate(`/rutas/${r.id}`)}
        ordenInicial={{ id: 'act', dir: 'desc' }}
        vacio={<div className="py-10 text-center text-[13px] text-text-2">No hay rutas{valores.estado ? ' en este estado' : ''}.</div>}
      />
    </Panel>
  );
}

function CalcularRuta({ abierto, onAbierto }: { abierto: boolean; onAbierto: (v: boolean) => void }) {
  const [o, setO] = useState<Ubicacion | null>(null);
  const [d, setD] = useState<Ubicacion | null>(null);
  const navigate = useNavigate();
  const a = useAccion({
    fn: () => api.rutasMaestras.calcular({ origen_id: o!.id, destino_id: d!.id }),
    exito: (r) => `Ruta ${r.codigo_ruta} lista: ${numero(r.distancia_km, 0)} km.`,
    invalida: [['rutasMaestras']],
    toastError: false,
    onSuccess: (r) => {
      onAbierto(false);
      navigate(`/rutas/maestras/${r.id}`);
    },
  });
  return (
    <Dialog open={abierto} onOpenChange={onAbierto}>
      <DialogContent titulo="Calcular ruta maestra" descripcion="Calcula la ruta por carretera entre dos ubicaciones o devuelve la existente. No crea envíos.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (o && d) a.mutate();
          }}
        >
          <Field label="Origen" htmlFor="rm-o" requerido>
            <UbicacionPicker id="rm-o" valor={o} onCambio={setO} />
          </Field>
          <Field label="Destino" htmlFor="rm-d" requerido error={o && d && o.id === d.id ? 'Origen y destino deben ser distintos' : undefined}>
            <UbicacionPicker id="rm-d" valor={d} onCambio={setD} />
          </Field>
          <ErrorFormulario error={a.error} />
          <FormActions>
            <Button type="button" variant="ghost" onClick={() => onAbierto(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={!o || !d || o.id === d.id} cargando={a.isPending}>
              Calcular ruta
            </Button>
          </FormActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RutasMaestras() {
  const calcula = usePuede('editarUbicaciones'); // calcular rutas maestras: operador y administrador
  const { valores, set } = useFiltrosUrl(['origen', 'destino', 'fuente', 'limite'] as const);
  const origen = useDebounced(valores.origen.trim().toUpperCase(), 300);
  const destino = useDebounced(valores.destino.trim().toUpperCase(), 300);
  const limite = Number(valores.limite) || 50;
  const rm = useRutasMaestras({ origen_codigo: origen || undefined, destino_codigo: destino || undefined, fuente: valores.fuente || undefined, limite });
  const [calcular, setCalcular] = useState(false);
  const navigate = useNavigate();

  const columnas: Columna<RutaMaestra>[] = [
    { id: 'codigo', titulo: 'Ruta', celda: (r) => <Codigo>{r.codigo_ruta}</Codigo>, orden: (r) => r.codigo_ruta },
    {
      id: 'tramo',
      titulo: 'Origen y destino',
      celda: (r) => (
        <div className="min-w-48">
          <div>{r.origen.etiqueta}</div>
          <div className="text-xs text-text-2">hacia {r.destino.etiqueta}</div>
        </div>
      ),
      orden: (r) => r.origen.nombre,
    },
    { id: 'dist', titulo: 'Distancia', celda: (r) => `${numero(r.distancia_km, 1)} km`, orden: (r) => r.distancia_km, alinear: 'right' },
    { id: 'dur', titulo: 'Duración real', celda: (r) => horas(r.duracion_horas), orden: (r) => r.duracion_horas, alinear: 'right', ocultarBajo: 'md' },
    { id: 'paradas', titulo: 'Paradas', celda: (r) => r.paradas?.length ?? 0, alinear: 'right', ocultarBajo: 'lg' },
    {
      id: 'fuente',
      titulo: 'Trazado',
      celda: (r) => (r.estimada ? <Badge tono="warn">Estimado</Badge> : <Badge tono="ok">Carretera (OSRM)</Badge>),
      orden: (r) => r.fuente,
      ocultarBajo: 'sm',
    },
    { id: 'calc', titulo: 'Calculada', celda: (r) => fechaHora(r.calculada_en), orden: (r) => r.calculada_en, ocultarBajo: 'xl' },
  ];

  return (
    <Panel cuerpo="p-0">
      <div className="flex flex-wrap items-end gap-2 border-b border-rule p-3">
        <Field label="Origen (código)" htmlFor="f-o" className="w-36">
          <Input id="f-o" value={valores.origen} onChange={(e) => set('origen', e.target.value)} placeholder="CO-MTR" />
        </Field>
        <Field label="Destino (código)" htmlFor="f-d" className="w-36">
          <Input id="f-d" value={valores.destino} onChange={(e) => set('destino', e.target.value)} placeholder="CO-CTG" />
        </Field>
        <Field label="Trazado" htmlFor="f-f" className="w-40">
          <NativeSelect id="f-f" value={valores.fuente} onChange={(e) => set('fuente', e.target.value)}>
            <option value="">Todos</option>
            <option value="osrm">Carretera (OSRM)</option>
            <option value="estimada">Estimado</option>
          </NativeSelect>
        </Field>
        <Field label="Máximo" htmlFor="f-l" className="w-28">
          <NativeSelect id="f-l" value={String(limite)} onChange={(e) => set('limite', e.target.value)}>
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {calcula && (
          <Button variant="primary" className="ml-auto" onClick={() => setCalcular(true)}>
            <Calculator /> Calcular ruta
          </Button>
        )}
      </div>
      <DataTable
        etiqueta="Rutas maestras"
        filas={rm.data}
        columnas={columnas}
        clave={(r) => r.id}
        cargando={rm.isLoading}
        error={rm.error}
        reintentar={() => rm.refetch()}
        onFila={(r) => navigate(`/rutas/maestras/${r.id}`)}
        vacio={<div className="py-10 text-center text-[13px] text-text-2">No hay rutas maestras con estos filtros.</div>}
      />
      <CalcularRuta abierto={calcular} onAbierto={setCalcular} />
    </Panel>
  );
}

function Asignaciones() {
  const [confirmar, setConfirmar] = useState(false);
  const [resultado, setResultado] = useState<Record<string, unknown> | null>(null);
  const [codigo, setCodigo] = useState('');
  const barrido = useAccion({
    fn: () => api.asignaciones.reintentarTodas(),
    exito: 'Barrido de asignaciones ejecutado.',
    invalida: [['envios'], ['rutas'], ['seguimiento'], ['vehiculos'], ['conductores']],
    onSuccess: (r) => {
      setResultado(r);
      setConfirmar(false);
    },
  });
  const porEnvio = useAccion({
    fn: async () => {
      const t = codigo.trim().toUpperCase();
      const envio = /^ENV/.test(t) ? await api.envios.porCodigo(t.replace(/^ENV-?(\d+)$/, (_, n: string) => `ENV-${n.padStart(8, '0')}`)) : await api.envios.obtener(t.toLowerCase());
      return api.asignaciones.reintentarEnvio(envio.id);
    },
    exito: (r) => `Ruta del envío: ${estadoRuta(r.estado).etiqueta.toLowerCase()}${r.ultimo_error ? `. ${r.ultimo_error}` : ''}`,
    invalida: [['envios'], ['rutas'], ['seguimiento']],
    toastError: false,
  });
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel titulo="Barrido general" descripcion="POST /asignaciones/reintentar">
        <div className="space-y-3 text-[13px] text-text-2">
          <p>
            Reasigna ahora todo lo que está sin asignación, libera las reservas pendientes y publica los eventos atrasados. El sistema ya lo hace solo
            cada pocos minutos; úselo para no esperar.
          </p>
          <Button variant="primary" onClick={() => setConfirmar(true)}>
            <PlayCircle /> Ejecutar barrido
          </Button>
          {resultado && (
            <div>
              <p className="mb-1 text-xs font-semibold text-text-2">Resultado</p>
              <dl className="grid grid-cols-2 gap-2 rounded-md border border-rule bg-surface-2 p-3">
                {Object.entries(resultado).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-text-3">{k.replace(/_/g, ' ')}</dt>
                    <dd className="tabular font-semibold text-text">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
        <ConfirmDialog
          abierto={confirmar}
          onAbierto={setConfirmar}
          titulo="Ejecutar barrido de asignaciones"
          confirmar="Ejecutar"
          onConfirmar={() => barrido.mutate()}
          cargando={barrido.isPending}
        >
          <p>Se intentará asignar vehículo a todos los envíos que esperan. Puede cambiar el estado de varios envíos a la vez.</p>
        </ConfirmDialog>
      </Panel>
      <Panel titulo="Reintentar un envío" descripcion="POST /asignaciones/envio/{envio_id}/reintentar">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (codigo.trim()) porEnvio.mutate();
          }}
        >
          <Field label="Código o id del envío" htmlFor="re-env" ayuda="Por ejemplo ENV-00000012. Devuelve la ruta de asignación del envío.">
            <Input id="re-env" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="ENV-00000012" />
          </Field>
          <ErrorFormulario error={porEnvio.error} />
          <Button type="submit" disabled={!codigo.trim()} cargando={porEnvio.isPending}>
            <RotateCw /> Reintentar asignación
          </Button>
          {porEnvio.data && (
            <Nota>
              Estado de la ruta: <strong>{estadoRuta(porEnvio.data.estado).etiqueta}</strong>, {porEnvio.data.intentos} intento(s).
              {porEnvio.data.ultimo_error && ` ${porEnvio.data.ultimo_error}`}
            </Nota>
          )}
        </form>
      </Panel>
    </div>
  );
}

export default function RutasPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'envio';
  return (
    <>
      <PageHeader
        titulo="Rutas y asignaciones"
        descripcion="Rutas de cada envío (asignación de vehículo y conductor), rutas maestras por carretera y reintentos manuales de asignación."
      />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList className="mb-1">
          <TabsTrigger value="envio">Rutas de envío</TabsTrigger>
          <TabsTrigger value="maestras">Rutas maestras</TabsTrigger>
          <TabsTrigger value="asignaciones">Asignaciones</TabsTrigger>
        </TabsList>
        <TabsContent value="envio">
          <RutasEnvio />
        </TabsContent>
        <TabsContent value="maestras">
          <RutasMaestras />
        </TabsContent>
        <TabsContent value="asignaciones">
          <Asignaciones />
        </TabsContent>
      </Tabs>
    </>
  );
}
