import { useQueries } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartFrame, TooltipContenido } from '@/components/charts/Chart';
import { C, ejeX, ejeY, rejilla } from '@/components/charts/tema';
import { EstadoBadge } from '@/components/shared/Badge';
import { DataTable, type Columna } from '@/components/shared/DataTable';
import { ConfirmDialog, ErrorFormulario, Field } from '@/components/shared/Form';
import { Cifra, Codigo, KeyValue, PageHeader, Panel } from '@/components/shared/Layout';
import { ClientePicker } from '@/components/shared/Pickers';
import { EmptyState, ErrorState, LoadingState, Nota } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { Dialog, SheetContent } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { es404, qk, useClientes, useCostosRuta, useEnvios, useFactura, useFacturas } from '@/hooks/queries';
import { useAccion } from '@/hooks/useAccion';
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl';
import * as api from '@/lib/api/endpoints';
import { ESTADOS_FACTURA, estadoFactura, MODELOS_TARIFA } from '@/lib/dominio';
import { fechaHora, num, numero, pesos } from '@/lib/format';
import type { Cliente, CostoRuta, Factura } from '@/lib/types/api';
import { EditorTarifa } from './Tarifa';

function periodoActual(): string {
  const f = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit' }).format(new Date());
  return f.slice(0, 7);
}

function DetalleFactura({ id, nombre }: { id: string; nombre: (c: string) => string }) {
  const f = useFactura(id);
  const costos = useCostosRuta();
  const envios = useEnvios({ cliente_id: f.data?.cliente_id });
  if (f.error) return <ErrorState error={f.error} reintentar={() => f.refetch()} />;
  if (!f.data) return <LoadingState />;
  const x = f.data;
  const delCliente = new Set((envios.data ?? []).map((e) => e.id));
  const costosCliente = (costos.data ?? []).filter((c) => delCliente.has(c.envio_id) && c.creado_en.slice(0, 7) === x.periodo);
  return (
    <div className="space-y-5">
      <KeyValue
        items={[
          { k: 'Cliente', v: <Link className="text-primary hover:underline" to={`/clientes/${x.cliente_id}`}>{nombre(x.cliente_id)}</Link>, ancho: true },
          { k: 'Periodo', v: <span className="font-cond font-bold">{x.periodo}</span> },
          { k: 'Estado', v: <EstadoBadge def={estadoFactura(x.estado)} /> },
          { k: 'Monto total', v: <span className="font-cond text-2xl font-bold">{pesos(x.monto_total)}</span>, ancho: true },
          { k: 'Creada', v: fechaHora(x.creado_en) },
          { k: 'Actualizada', v: fechaHora(x.actualizado_en) },
        ]}
      />
      <div>
        <p className="mb-2 text-xs font-semibold text-text-2">Costos operativos del cliente en el periodo</p>
        {costosCliente.length === 0 ? (
          <p className="text-[13px] text-text-3">Sin costos de ruta en este periodo.</p>
        ) : (
          <ul className="divide-y divide-rule rounded-md border border-rule text-[13px]">
            {costosCliente.map((c) => (
              <li key={c.id} className="flex justify-between gap-2 px-3 py-2">
                <Link to={`/envios/${c.envio_id}`} className="text-primary hover:underline">
                  {(envios.data ?? []).find((e) => e.id === c.envio_id)?.codigo_envio ?? 'Envío'}
                </Link>
                <span className="tabular">{pesos(c.costo_total)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-text-3">
          El monto facturado depende de la tarifa del cliente; los costos operativos son el gasto simulado de cada ruta, no el precio cobrado. La factura no trae líneas de detalle.
        </p>
      </div>
    </div>
  );
}

function Facturas({ nombre }: { nombre: (c: string) => string }) {
  const { valores, set } = useFiltrosUrl(['cliente', 'periodo', 'estado', 'factura'] as const);
  const [clienteSel, setClienteSel] = useState<Cliente | null>(null);
  const facturas = useFacturas({ cliente_id: valores.cliente || undefined, periodo: valores.periodo || undefined, estado: valores.estado || undefined });
  const [cerrar, setCerrar] = useState(false);
  const periodo = periodoActual();
  const cierre = useAccion({
    fn: () => api.facturacion.cerrarPeriodo(),
    exito: (r) => `Periodo ${periodo} cerrado: ${r.length} factura(s) del periodo.`,
    invalida: [['facturas'], ['analitica']],
    toastError: false,
    onSuccess: () => setCerrar(false),
  });
  const lista = useMemo(() => facturas.data ?? [], [facturas.data]);
  const total = lista.reduce((s, f) => s + (num(f.monto_total) ?? 0), 0);
  const porPeriodo = useMemo(() => {
    const m = new Map<string, number>();
    lista.forEach((f) => m.set(f.periodo, (m.get(f.periodo) ?? 0) + (num(f.monto_total) ?? 0)));
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([p, v]) => ({ periodo: p, monto: v }));
  }, [lista]);
  const columnas: Columna<Factura>[] = [
    { id: 'periodo', titulo: 'Periodo', celda: (f) => <span className="font-cond font-bold">{f.periodo}</span>, orden: (f) => f.periodo },
    { id: 'cliente', titulo: 'Cliente', celda: (f) => nombre(f.cliente_id), orden: (f) => nombre(f.cliente_id) },
    { id: 'monto', titulo: 'Monto', celda: (f) => pesos(f.monto_total), orden: (f) => num(f.monto_total), alinear: 'right' },
    { id: 'estado', titulo: 'Estado', celda: (f) => <EstadoBadge def={estadoFactura(f.estado)} />, orden: (f) => f.estado },
    { id: 'act', titulo: 'Actualizada', celda: (f) => fechaHora(f.actualizado_en), orden: (f) => f.actualizado_en, ocultarBajo: 'md' },
  ];
  return (
    <div className="space-y-5">
      <Panel cuerpo="px-3 py-3">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Cifra valor={pesos(total)} etiqueta="Total facturado" detalle="según los filtros" />
          <Cifra valor={lista.length} etiqueta="Facturas" />
          <Cifra valor={lista.filter((f) => f.estado === 'abierta').length} etiqueta="Abiertas" tono="primary" />
          <Cifra valor={lista.filter((f) => f.estado === 'cerrada').length} etiqueta="Cerradas" tono="ok" />
        </div>
      </Panel>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel cuerpo="p-0">
          <div className="flex flex-wrap items-end gap-2 border-b border-rule p-3">
            <Field label="Cliente" htmlFor="f-cli" className="w-64">
              <div className="flex gap-1">
                <ClientePicker
                  id="f-cli"
                  soloActivos={false}
                  valor={clienteSel}
                  onCambio={(c) => {
                    setClienteSel(c);
                    set('cliente', c?.id ?? '');
                  }}
                />
              </div>
            </Field>
            <Field label="Periodo" htmlFor="f-per" className="w-40">
              <Input id="f-per" type="month" value={valores.periodo} onChange={(e) => set('periodo', e.target.value)} />
            </Field>
            <Field label="Estado" htmlFor="f-est" className="w-36">
              <NativeSelect id="f-est" value={valores.estado} onChange={(e) => set('estado', e.target.value)}>
                <option value="">Todos</option>
                {Object.entries(ESTADOS_FACTURA).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.etiqueta}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {(valores.cliente || valores.periodo || valores.estado) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setClienteSel(null);
                  set('cliente', '');
                  set('periodo', '');
                  set('estado', '');
                }}
              >
                Limpiar
              </Button>
            )}
            <Button variant="primary" className="ml-auto" onClick={() => setCerrar(true)}>
              <Lock /> Cerrar periodo {periodo}
            </Button>
          </div>
          <DataTable
            etiqueta="Facturas"
            filas={facturas.data}
            columnas={columnas}
            clave={(f) => f.id}
            cargando={facturas.isLoading}
            error={facturas.error}
            reintentar={() => facturas.refetch()}
            onFila={(f) => set('factura', f.id)}
            ordenInicial={{ id: 'periodo', dir: 'desc' }}
            vacio={<EmptyState titulo="Sin facturas" compacto>Las facturas se abren al entregar el primer envío de un cliente en el periodo.</EmptyState>}
          />
        </Panel>
        <Panel>
          {porPeriodo.length === 0 ? (
            <EmptyState titulo="Sin datos para graficar" compacto />
          ) : (
            <ChartFrame
              titulo="Facturación por periodo"
              descripcion="Suma de las facturas filtradas, en pesos"
              tabla={{ columnas: ['Periodo', 'Monto'], filas: porPeriodo.map((p) => [p.periodo, pesos(p.monto)]) }}
            >
              <BarChart data={porPeriodo} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid {...rejilla} />
                <XAxis dataKey="periodo" {...ejeX} />
                <YAxis {...ejeY} width={64} tickFormatter={(v: number) => `${numero(v / 1_000_000, 1)} M`} />
                <Tooltip cursor={{ fill: 'var(--neutral-soft)' }} content={<TooltipContenido formato={(v) => pesos(v)} />} />
                <Bar dataKey="monto" name="Facturado" fill={C.s1} radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ChartFrame>
          )}
        </Panel>
      </div>
      <ConfirmDialog
        abierto={cerrar}
        onAbierto={(v) => {
          if (!v) cierre.reset(); // al volver a abrir no queda el error anterior
          setCerrar(v);
        }}
        titulo={`Cerrar el periodo ${periodo}`}
        confirmar="Cerrar periodo"
        onConfirmar={() => cierre.mutate()}
        cargando={cierre.isPending}
        peligro
      >
        <p>Esta acción afecta a todos los clientes y no se puede deshacer desde la aplicación:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Se generan (o actualizan) las facturas de los clientes con tarifa plana por el valor de su tarifa.</li>
          <li>Todas las facturas abiertas del periodo pasan a «cerrada».</li>
        </ul>
        <ErrorFormulario error={cierre.error} />
      </ConfirmDialog>
      <Dialog open={!!valores.factura} onOpenChange={(v) => !v && set('factura', '')}>
        {valores.factura && (
          <SheetContent titulo="Factura" descripcion="GET /facturas/{id}">
            <DetalleFactura id={valores.factura} nombre={nombre} />
          </SheetContent>
        )}
      </Dialog>
    </div>
  );
}

function Tarifas() {
  const clientes = useClientes({ activo: true, limite: 50 });
  const [sel, setSel] = useState<Cliente | null>(null);
  const lista = clientes.data ?? [];
  // No existe un listado de tarifas: se consulta la tarifa de cada cliente (máximo 50).
  const tarifas = useQueries({
    queries: lista.map((c) => ({
      queryKey: qk.tarifa(c.id),
      queryFn: ({ signal }: { signal: AbortSignal }) => api.facturacion.tarifa(c.id, { signal }),
      retry: (n: number, e: unknown) => !es404(e) && n < 1,
      staleTime: 60_000,
    })),
  });
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Panel titulo="Tarifa por cliente" descripcion="Clientes activos (hasta 50). Clic para editar." cuerpo="p-0">
        {clientes.error ? (
          <ErrorState error={clientes.error} reintentar={() => clientes.refetch()} />
        ) : !clientes.data ? (
          <LoadingState />
        ) : (
          <ul className="divide-y divide-rule">
            {lista.map((c, i) => {
              const t = tarifas[i];
              const def = t?.data ? MODELOS_TARIFA[t.data.modelo] : null;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSel(c)}
                    aria-current={sel?.id === c.id || undefined}
                    className={`flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-left text-[13px] hover:bg-surface-2 ${sel?.id === c.id ? 'bg-primary-soft' : ''}`}
                  >
                    <span className="font-medium">{c.nombre}</span>
                    <span className="text-text-2">
                      {t?.isLoading
                        ? 'Consultando…'
                        : t?.data
                          ? `${def?.etiqueta ?? t.data.modelo}: ${pesos(t.data.valor)}`
                          : t?.error && es404(t.error)
                            ? 'Por defecto (por envío)'
                            : t?.error
                              ? 'No disponible'
                              : '—'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Panel titulo={sel ? `Tarifa de ${sel.nombre}` : 'Editar tarifa'} descripcion="POST /tarifas define o reemplaza el modelo de cobro">
        {sel ? <EditorTarifa key={sel.id} clienteId={sel.id} /> : <EmptyState titulo="Elija un cliente" compacto>Seleccione un cliente de la lista para ver o cambiar su tarifa.</EmptyState>}
        <Nota className="mt-4">
          Modelos disponibles: por kilómetro (distancia de cada envío entregado), por envío (valor fijo por envío, el modelo por defecto) y tarifa plana (valor fijo que se
          factura al cerrar el periodo).
        </Nota>
      </Panel>
    </div>
  );
}

function Costos() {
  const { valores, set } = useFiltrosUrl(['envio'] as const);
  const envios = useEnvios();
  const costos = useCostosRuta({ envio_id: valores.envio || undefined });
  const codigo = useMemo(() => new Map((envios.data ?? []).map((e) => [e.id, e.codigo_envio])), [envios.data]);
  const lista = costos.data ?? [];
  const suma = (k: keyof CostoRuta) => lista.reduce((s, c) => s + (num(c[k]) ?? 0), 0);
  const top = [...lista].sort((a, b) => (num(b.costo_total) ?? 0) - (num(a.costo_total) ?? 0)).slice(0, 12).map((c) => ({ envio: codigo.get(c.envio_id) ?? c.envio_id.slice(0, 6), total: num(c.costo_total) ?? 0 }));
  const columnas: Columna<CostoRuta>[] = [
    { id: 'envio', titulo: 'Envío', celda: (c) => <Codigo to={`/envios/${c.envio_id}`}>{codigo.get(c.envio_id) ?? c.envio_id.slice(0, 8)}</Codigo>, orden: (c) => codigo.get(c.envio_id) },
    { id: 'dist', titulo: 'Distancia', celda: (c) => `${numero(c.distancia_km, 1)} km`, orden: (c) => num(c.distancia_km), alinear: 'right' },
    { id: 'comb', titulo: 'Combustible', celda: (c) => pesos(c.costo_combustible), orden: (c) => num(c.costo_combustible), alinear: 'right', ocultarBajo: 'md' },
    { id: 'peajes', titulo: 'Peajes', celda: (c) => pesos(c.costo_peajes), orden: (c) => num(c.costo_peajes), alinear: 'right', ocultarBajo: 'md' },
    { id: 'horas', titulo: 'Horas de conductor', celda: (c) => numero(c.horas_conductor, 2), orden: (c) => num(c.horas_conductor), alinear: 'right', ocultarBajo: 'lg' },
    { id: 'total', titulo: 'Costo total', celda: (c) => <strong>{pesos(c.costo_total)}</strong>, orden: (c) => num(c.costo_total), alinear: 'right' },
    { id: 'fecha', titulo: 'Calculado', celda: (c) => fechaHora(c.creado_en), orden: (c) => c.creado_en, ocultarBajo: 'xl' },
  ];
  return (
    <div className="space-y-5">
      <Panel cuerpo="px-3 py-3">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Cifra valor={pesos(suma('costo_total'))} etiqueta="Costo total" />
          <Cifra valor={pesos(suma('costo_combustible'))} etiqueta="Combustible" />
          <Cifra valor={pesos(suma('costo_peajes'))} etiqueta="Peajes" />
          <Cifra valor={`${numero(suma('distancia_km'))} km`} etiqueta="Distancia" />
        </div>
      </Panel>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel cuerpo="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-rule p-3">
            <NativeSelect value={valores.envio} onChange={(e) => set('envio', e.target.value)} className="w-64" aria-label="Filtrar por envío">
              <option value="">Todos los envíos</option>
              {(envios.data ?? [])
                .filter((e) => e.estado === 'entregado')
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.codigo_envio}
                  </option>
                ))}
            </NativeSelect>
            <span className="text-xs text-text-3">Costos simulados que Facturación calcula al entregarse cada envío.</span>
          </div>
          <DataTable
            etiqueta="Costos por ruta"
            filas={costos.data}
            columnas={columnas}
            clave={(c) => c.id}
            cargando={costos.isLoading}
            error={costos.error}
            reintentar={() => costos.refetch()}
            ordenInicial={{ id: 'fecha', dir: 'desc' }}
            vacio={<EmptyState titulo="Sin costos calculados" compacto>Aparecen cuando se entregan envíos.</EmptyState>}
          />
        </Panel>
        <Panel>
          {top.length === 0 ? (
            <EmptyState titulo="Sin datos para graficar" compacto />
          ) : (
            <ChartFrame titulo="Envíos más costosos" descripcion="Costo total por envío, en pesos" alto={Math.max(180, top.length * 26)} tabla={{ columnas: ['Envío', 'Costo total'], filas: top.map((t) => [t.envio, pesos(t.total)]) }}>
              <BarChart data={top} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid {...rejilla} horizontal={false} vertical />
                <XAxis type="number" {...ejeX} tickFormatter={(v: number) => `${numero(v / 1000)} mil`} />
                <YAxis type="category" dataKey="envio" {...ejeY} width={96} />
                <Tooltip cursor={{ fill: 'var(--neutral-soft)' }} content={<TooltipContenido formato={(v) => pesos(v)} />} />
                <Bar dataKey="total" name="Costo total" fill={C.s1} radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ChartFrame>
          )}
        </Panel>
      </div>
    </div>
  );
}

export default function FacturacionPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'facturas';
  const clientes = useClientes({ limite: 200 });
  const nombres = useMemo(() => new Map((clientes.data ?? []).map((c) => [c.id, c.nombre])), [clientes.data]);
  const nombre = (id: string) => nombres.get(id) ?? `Cliente ${id.slice(0, 8)}`;
  return (
    <>
      <PageHeader
        titulo="Facturación y costos"
        descripcion="Facturas por periodo, modelo de cobro de cada cliente y costo operativo simulado de cada ruta entregada."
      />
      <Tabs
        value={tab}
        onValueChange={(v) => {
          const n = new URLSearchParams();
          n.set('tab', v);
          setParams(n, { replace: true });
        }}
      >
        <TabsList className="mb-1">
          <TabsTrigger value="facturas">Facturas</TabsTrigger>
          <TabsTrigger value="tarifas">Tarifas</TabsTrigger>
          <TabsTrigger value="costos">Costos por ruta</TabsTrigger>
        </TabsList>
        <TabsContent value="facturas">
          <Facturas nombre={nombre} />
        </TabsContent>
        <TabsContent value="tarifas">
          <Tarifas />
        </TabsContent>
        <TabsContent value="costos">
          <Costos />
        </TabsContent>
      </Tabs>
    </>
  );
}
