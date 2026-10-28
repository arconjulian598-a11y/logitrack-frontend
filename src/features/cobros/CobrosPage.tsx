import { HandCoins, RefreshCw, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { usePuede, useRol } from '@/app/auth';
import { Badge, EstadoBadge } from '@/components/shared/Badge';
import { DataTable, type Columna } from '@/components/shared/DataTable';
import { ConfirmDialog, ErrorFormulario, Field } from '@/components/shared/Form';
import { Codigo, PageHeader, Panel } from '@/components/shared/Layout';
import { Nota } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { useClientes, useCotizaciones, useFacturas, useFacturasPedido, usePagos, usePorReembolsar } from '@/hooks/queries';
import { useAccion } from '@/hooks/useAccion';
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl';
import * as api from '@/lib/api/endpoints';
import { estadoFactura, estadoFacturaPedido, estadoPago, MOTIVOS_REEMBOLSO } from '@/lib/dominio';
import { fechaHora, num, numero, pesos, relativo } from '@/lib/format';
import type { CotizacionGuardada, Factura, FacturaPedido, Pago, PagoPorReembolsar } from '@/lib/types/api';
import { cn } from '@/lib/utils';

const CLAVES = ['tab', 'estado', 'cliente', 'desde', 'hasta'] as const;
const LIMITE = 500;

function useNombresCliente(activo: boolean) {
  const clientes = useClientes({ limite: 200 }, { enabled: activo });
  const nombres = useMemo(() => new Map((clientes.data ?? []).map((c) => [c.id, c.nombre])), [clientes.data]);
  return { clientes: clientes.data ?? [], nombres };
}

function FiltroCliente({ valor, onCambio, clientes }: { valor: string; onCambio: (v: string) => void; clientes: { id: string; nombre: string }[] }) {
  return (
    <NativeSelect value={valor} onChange={(e) => onCambio(e.target.value)} className="w-56" aria-label="Filtrar por cliente">
      <option value="">Todos los clientes</option>
      {clientes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nombre}
        </option>
      ))}
    </NativeSelect>
  );
}

/** Enlace al pedido (el pago y la factura son del pedido completo, no de sus partes). */
function Pedido({ codigo, envioId }: { codigo: string | null; envioId: string }) {
  return <Codigo to={`/envios/${envioId}`}>{codigo ?? 'Ver pedido'}</Codigo>;
}

function Pagos({ todos }: { todos: boolean }) {
  const { valores, set } = useFiltrosUrl(CLAVES);
  const { clientes, nombres } = useNombresCliente(todos);
  const q = usePagos({ estado: valores.estado || undefined, cliente_id: (todos && valores.cliente) || undefined, limite: LIMITE });
  const total = useMemo(() => (q.data ?? []).filter((p) => p.estado === 'confirmado').reduce((s, p) => s + (num(p.monto_cop) ?? 0), 0), [q.data]);
  const columnas: Columna<Pago>[] = [
    { id: 'pedido', titulo: 'Pedido', celda: (p) => <Pedido codigo={p.codigo_envio} envioId={p.envio_id} />, orden: (p) => p.codigo_envio },
    ...(todos
      ? [{ id: 'cliente', titulo: 'Cliente', celda: (p: Pago) => nombres.get(p.cliente_id) ?? '—', orden: (p: Pago) => nombres.get(p.cliente_id) ?? '', ocultarBajo: 'md' as const }]
      : []),
    { id: 'monto', titulo: 'Monto', celda: (p) => <span className="tabular font-semibold">{pesos(p.monto_cop)}</span>, orden: (p) => num(p.monto_cop), alinear: 'right' },
    { id: 'estado', titulo: 'Estado', celda: (p) => <EstadoBadge def={estadoPago(p.estado)} />, orden: (p) => p.estado },
    { id: 'ref', titulo: 'Referencia', celda: (p) => <span className="font-mono text-xs">{p.referencia}</span>, ocultarBajo: 'lg' },
    { id: 'confirmado', titulo: 'Pagado', celda: (p) => <span title={fechaHora(p.confirmado_en)}>{relativo(p.confirmado_en)}</span>, orden: (p) => p.confirmado_en ?? p.creado_en, ocultarBajo: 'sm' },
    { id: 'reembolsado', titulo: 'Reembolsado', celda: (p) => fechaHora(p.reembolsado_en, '—'), orden: (p) => p.reembolsado_en, ocultarBajo: 'xl' },
  ];
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-rule p-3">
        <NativeSelect value={valores.estado} onChange={(e) => set('estado', e.target.value)} className="w-48" aria-label="Filtrar por estado del pago">
          <option value="">Todos los estados</option>
          <option value="confirmado">Pagado</option>
          <option value="reembolsado">Reembolsado</option>
          <option value="pendiente">Pendiente</option>
        </NativeSelect>
        {todos && <FiltroCliente valor={valores.cliente} onCambio={(v) => set('cliente', v)} clientes={clientes} />}
        {q.data && (
          <span className="ml-auto text-xs text-text-2">
            {q.data.length} pago(s) · pagado vigente: <strong className="text-text">{pesos(total)}</strong>
          </span>
        )}
      </div>
      <DataTable
        etiqueta="Pagos"
        filas={q.data}
        columnas={columnas}
        clave={(p) => p.id}
        cargando={q.isLoading}
        error={q.error}
        reintentar={() => q.refetch()}
        ordenInicial={{ id: 'confirmado', dir: 'desc' }}
        vacio={<div className="py-10 text-center text-[13px] text-text-2">No hay pagos con estos filtros.</div>}
      />
    </>
  );
}

function FacturasPedido({ todos }: { todos: boolean }) {
  const { valores, set } = useFiltrosUrl(CLAVES);
  const { clientes, nombres } = useNombresCliente(todos);
  const q = useFacturasPedido({
    estado: valores.estado || undefined,
    cliente_id: (todos && valores.cliente) || undefined,
    desde: valores.desde || undefined,
    hasta: valores.hasta || undefined,
    limite: LIMITE,
  });
  const columnas: Columna<FacturaPedido>[] = [
    { id: 'numero', titulo: 'Factura', celda: (f) => <Codigo>{f.numero}</Codigo>, orden: (f) => f.numero },
    { id: 'pedido', titulo: 'Pedido', celda: (f) => <Pedido codigo={f.codigo_envio} envioId={f.envio_id} />, orden: (f) => f.codigo_envio },
    ...(todos
      ? [{ id: 'cliente', titulo: 'Cliente', celda: (f: FacturaPedido) => nombres.get(f.cliente_id) ?? '—', ocultarBajo: 'lg' as const }]
      : []),
    { id: 'concepto', titulo: 'Concepto', celda: (f) => <span className="block max-w-72 truncate" title={f.concepto}>{f.concepto}</span>, ocultarBajo: 'xl' },
    { id: 'monto', titulo: 'Valor', celda: (f) => <span className="tabular font-semibold">{pesos(f.monto_cop)}</span>, orden: (f) => num(f.monto_cop), alinear: 'right' },
    { id: 'estado', titulo: 'Estado', celda: (f) => <EstadoBadge def={estadoFacturaPedido(f.estado)} />, orden: (f) => f.estado },
    { id: 'emitida', titulo: 'Emitida', celda: (f) => fechaHora(f.emitida_en), orden: (f) => f.emitida_en, ocultarBajo: 'sm' },
  ];
  return (
    <>
      <div className="flex flex-wrap items-end gap-2 border-b border-rule p-3">
        <NativeSelect value={valores.estado} onChange={(e) => set('estado', e.target.value)} className="w-44" aria-label="Filtrar por estado de la factura">
          <option value="">Todos los estados</option>
          <option value="emitida">Emitida</option>
          <option value="anulada">Anulada</option>
        </NativeSelect>
        {todos && <FiltroCliente valor={valores.cliente} onCambio={(v) => set('cliente', v)} clientes={clientes} />}
        <label className="flex items-center gap-1.5 text-xs text-text-2">
          Desde
          <Input type="date" value={valores.desde} onChange={(e) => set('desde', e.target.value)} className="w-40" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-text-2">
          Hasta
          <Input type="date" value={valores.hasta} onChange={(e) => set('hasta', e.target.value)} className="w-40" />
        </label>
      </div>
      <DataTable
        etiqueta="Facturas por pedido"
        filas={q.data}
        columnas={columnas}
        clave={(f) => f.id}
        cargando={q.isLoading}
        error={q.error}
        reintentar={() => q.refetch()}
        ordenInicial={{ id: 'emitida', dir: 'desc' }}
        vacio={<div className="py-10 text-center text-[13px] text-text-2">No hay facturas con estos filtros.</div>}
      />
    </>
  );
}

function PorReembolsar() {
  const q = usePorReembolsar();
  const { nombres } = useNombresCliente(true);
  const [elegido, setElegido] = useState<PagoPorReembolsar | null>(null);
  const [nota, setNota] = useState('');
  const a = useAccion({
    fn: (p: PagoPorReembolsar) => api.cobros.reembolsar(p.id, nota.trim() || null),
    exito: (p) => `Pago ${p.referencia} reembolsado (${pesos(p.monto_cop)}). Su factura quedó anulada.`,
    invalida: [['pagos'], ['facturasPedido'], ['analitica']],
    toastError: false,
    onSuccess: () => {
      setElegido(null);
      setNota('');
    },
  });
  const columnas: Columna<PagoPorReembolsar>[] = [
    { id: 'pedido', titulo: 'Pedido', celda: (p) => <Pedido codigo={p.codigo_envio} envioId={p.envio_id} />, orden: (p) => p.codigo_envio },
    { id: 'cliente', titulo: 'Cliente', celda: (p) => nombres.get(p.cliente_id) ?? '—', ocultarBajo: 'lg' },
    { id: 'monto', titulo: 'Monto', celda: (p) => <span className="tabular font-semibold">{pesos(p.monto_cop)}</span>, orden: (p) => num(p.monto_cop), alinear: 'right' },
    {
      id: 'motivo',
      titulo: 'Motivo',
      celda: (p) => (
        <div>
          <Badge tono={p.motivo === 'devuelto' ? 'warn' : 'neutral'}>{MOTIVOS_REEMBOLSO[p.motivo ?? ''] ?? p.motivo ?? '—'}</Badge>
          {p.detalle && <p className="mt-0.5 max-w-64 truncate text-xs text-text-2" title={p.detalle}>{p.detalle}</p>}
        </div>
      ),
    },
    { id: 'solicitado', titulo: 'Solicitado', celda: (p) => <span title={fechaHora(p.solicitado_en)}>{relativo(p.solicitado_en)}</span>, orden: (p) => p.solicitado_en, ocultarBajo: 'sm' },
    {
      id: 'accion',
      titulo: <span className="sr-only">Acción</span>,
      celda: (p) => (
        <Button
          size="sm"
          onClick={() => {
            // cada vez que se abre, empieza limpio
            setNota('');
            a.reset();
            setElegido(p);
          }}
        >
          <RotateCcw /> Reembolsar
        </Button>
      ),
      alinear: 'right',
    },
  ];
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-rule p-3 text-[13px] text-text-2">
        <span className="flex-1">
          Pagos confirmados de pedidos cancelados o devueltos por completo. Un pedido recién cancelado puede tardar unos segundos en aparecer.
        </span>
        <Button size="sm" onClick={() => q.refetch()}>
          <RefreshCw className={cn(q.isFetching && 'animate-spin')} /> Actualizar
        </Button>
      </div>
      <DataTable
        etiqueta="Pagos por reembolsar"
        filas={q.data}
        columnas={columnas}
        clave={(p) => p.id}
        cargando={q.isLoading}
        error={q.error}
        reintentar={() => q.refetch()}
        ordenInicial={{ id: 'solicitado', dir: 'asc' }}
        vacio={<div className="py-10 text-center text-[13px] text-text-2">No hay reembolsos pendientes.</div>}
      />
      <ConfirmDialog
        abierto={!!elegido}
        onAbierto={(v) => {
          if (!v) {
            setElegido(null);
            a.reset();
          }
        }}
        titulo={`Reembolsar ${elegido?.codigo_envio ?? 'el pedido'}`}
        confirmar={`Reembolsar ${pesos(elegido?.monto_cop)}`}
        volver="Volver"
        onConfirmar={() => elegido && a.mutate(elegido)}
        cargando={a.isPending}
      >
        <p>
          El pago pasa a «reembolsado» y su factura a «anulada». Es un reembolso simulado del pedido completo: no se mueve dinero real ni hay reembolso parcial.
        </p>
        <Field label="Nota" htmlFor="nota-reembolso" ayuda="Opcional.">
          <Textarea id="nota-reembolso" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />
        </Field>
        <ErrorFormulario error={a.error} />
      </ConfirmDialog>
    </>
  );
}

function Cotizaciones({ todos }: { todos: boolean }) {
  const { valores, set } = useFiltrosUrl(CLAVES);
  const { clientes, nombres } = useNombresCliente(todos);
  const q = useCotizaciones({ cliente_id: (todos && valores.cliente) || undefined, limite: 200 });
  const columnas: Columna<CotizacionGuardada>[] = [
    { id: 'fecha', titulo: 'Cotizada', celda: (c) => fechaHora(c.creado_en), orden: (c) => c.creado_en },
    {
      id: 'ruta',
      titulo: 'Origen y destino',
      celda: (c) => (
        <div className="min-w-44">
          <div className="truncate">{c.origen ?? '—'}</div>
          <div className="truncate text-xs text-text-2">hacia {c.destino ?? '—'}</div>
        </div>
      ),
    },
    ...(todos ? [{ id: 'cliente', titulo: 'Cliente', celda: (c: CotizacionGuardada) => (c.cliente_id ? (nombres.get(c.cliente_id) ?? '—') : '—'), ocultarBajo: 'lg' as const }] : []),
    { id: 'peso', titulo: 'Peso', celda: (c) => (c.peso_kg != null ? `${numero(c.peso_kg)} kg` : '—'), orden: (c) => num(c.peso_kg), ocultarBajo: 'sm' },
    { id: 'distancia', titulo: 'Distancia', celda: (c) => (c.distancia_km != null ? `${numero(c.distancia_km)} km` : '—'), ocultarBajo: 'md' },
    { id: 'monto', titulo: 'Precio', celda: (c) => <span className="tabular font-semibold">{pesos(c.monto_cop)}</span>, orden: (c) => num(c.monto_cop), alinear: 'right' },
    {
      id: 'envio',
      titulo: 'Pedido',
      celda: (c) => (c.envio_id ? <Codigo to={`/envios/${c.envio_id}`}>Ver pedido</Codigo> : <span className="text-xs text-text-3">No se creó</span>),
    },
  ];
  return (
    <>
      {todos && (
        <div className="flex flex-wrap items-center gap-2 border-b border-rule p-3">
          <FiltroCliente valor={valores.cliente} onCambio={(v) => set('cliente', v)} clientes={clientes} />
        </div>
      )}
      <DataTable
        etiqueta="Cotizaciones"
        filas={q.data}
        columnas={columnas}
        clave={(c) => String(c.id ?? c.cotizacion_id ?? `${c.creado_en}-${c.monto_cop}`)}
        cargando={q.isLoading}
        error={q.error}
        reintentar={() => q.refetch()}
        ordenInicial={{ id: 'fecha', dir: 'desc' }}
        vacio={<div className="py-10 text-center text-[13px] text-text-2">No hay cotizaciones registradas.</div>}
      />
    </>
  );
}

function FacturasMensuales({ todos }: { todos: boolean }) {
  const { nombres } = useNombresCliente(todos);
  const q = useFacturas({});
  const columnas: Columna<Factura>[] = [
    { id: 'periodo', titulo: 'Periodo', celda: (f) => <Codigo>{f.periodo}</Codigo>, orden: (f) => f.periodo },
    ...(todos ? [{ id: 'cliente', titulo: 'Cliente', celda: (f: Factura) => nombres.get(f.cliente_id) ?? '—' }] : []),
    { id: 'monto', titulo: 'Total', celda: (f) => <span className="tabular font-semibold">{pesos(f.monto_total)}</span>, orden: (f) => num(f.monto_total), alinear: 'right' },
    { id: 'estado', titulo: 'Estado', celda: (f) => <EstadoBadge def={estadoFactura(f.estado)} />, orden: (f) => f.estado },
    { id: 'actualizada', titulo: 'Actualizada', celda: (f) => fechaHora(f.actualizado_en), orden: (f) => f.actualizado_en, ocultarBajo: 'sm' },
  ];
  return (
    <>
      <Nota className="m-3">
        Facturación mensual antigua: suma un valor fijo por cada envío entregado. Es una medida aparte del cobro por pedido.
      </Nota>
      <DataTable
        etiqueta="Facturas mensuales"
        filas={q.data}
        columnas={columnas}
        clave={(f) => f.id}
        cargando={q.isLoading}
        error={q.error}
        reintentar={() => q.refetch()}
        ordenInicial={{ id: 'periodo', dir: 'desc' }}
        vacio={<div className="py-10 text-center text-[13px] text-text-2">No hay facturas mensuales.</div>}
      />
    </>
  );
}

export default function CobrosPage() {
  const rol = useRol();
  const { valores, set } = useFiltrosUrl(CLAVES);
  const navigate = useNavigate();
  const verFacturas = usePuede('verFacturas');
  const reembolsa = usePuede('reembolsar');
  const todos = usePuede('elegirCliente'); // operador y administrador ven los pagos de todos los clientes
  const esCliente = rol === 'cliente';
  const tabs = [
    { valor: 'pagos', etiqueta: esCliente ? 'Mis pagos' : 'Pagos', ver: true },
    { valor: 'facturas', etiqueta: esCliente ? 'Mis facturas' : 'Facturas por pedido', ver: verFacturas },
    { valor: 'reembolsos', etiqueta: 'Por reembolsar', ver: reembolsa },
    { valor: 'cotizaciones', etiqueta: 'Cotizaciones', ver: true },
    { valor: 'mensuales', etiqueta: 'Facturas mensuales', ver: verFacturas },
  ].filter((t) => t.ver);
  const tab = tabs.some((t) => t.valor === valores.tab) ? valores.tab : 'pagos';

  return (
    <>
      <PageHeader
        titulo={esCliente ? 'Mis pagos y facturas' : reembolsa ? 'Cobros y reembolsos' : 'Pagos'}
        descripcion={
          <>
            <HandCoins className="mr-1 inline size-4 align-[-3px]" aria-hidden />
            Todos los pagos son simulados: se confirman al aceptar el precio del pedido y no mueven dinero real.
          </>
        }
        acciones={
          esCliente && (
            <Button variant="primary" onClick={() => navigate('/envios/nuevo')}>
              Nuevo envío
            </Button>
          )
        }
      />
      <Panel cuerpo="p-0">
        <Tabs
          value={tab}
          onValueChange={(v) => {
            set('estado', '');
            set('tab', v === 'pagos' ? '' : v);
          }}
        >
          <TabsList className="px-3">
            {tabs.map((t) => (
              <TabsTrigger key={t.valor} value={t.valor}>
                {t.etiqueta}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="pagos">
            <Pagos todos={todos} />
          </TabsContent>
          {verFacturas && (
            <TabsContent value="facturas">
              <FacturasPedido todos={todos} />
            </TabsContent>
          )}
          {reembolsa && (
            <TabsContent value="reembolsos">
              <PorReembolsar />
            </TabsContent>
          )}
          <TabsContent value="cotizaciones">
            <Cotizaciones todos={todos} />
          </TabsContent>
          {verFacturas && (
            <TabsContent value="mensuales">
              <FacturasMensuales todos={todos} />
            </TabsContent>
          )}
        </Tabs>
      </Panel>
    </>
  );
}
