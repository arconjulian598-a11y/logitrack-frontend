import { usePuede } from '@/app/auth';
import { Bell, Mail, MessageSquare, RefreshCw, Search, Smartphone } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Badge, Tag } from '@/components/shared/Badge';
import { Field } from '@/components/shared/Form';
import { PageHeader, Panel } from '@/components/shared/Layout';
import { ClientePicker } from '@/components/shared/Pickers';
import { EmptyState, ErrorState, Limitacion, LoadingState } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { useNotificaciones } from '@/hooks/queries';
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl';
import { CANALES, DESTINATARIOS, humanizar } from '@/lib/dominio';
import { fechaHora, relativo } from '@/lib/format';
import type { Cliente } from '@/lib/types/api';
import { cn, coincide } from '@/lib/utils';
import { EditorPreferencia } from './Preferencia';

const ICONO_CANAL: Record<string, React.ReactNode> = {
  email: <Mail />,
  sms: <MessageSquare />,
  push: <Smartphone />,
};

function Bandeja() {
  const { valores, set, limpiar } = useFiltrosUrl(['q', 'canal', 'destinatario', 'evento', 'limite'] as const);
  const limite = Number(valores.limite) || 50;
  const n = useNotificaciones(limite);
  const lista = useMemo(() => n.data ?? [], [n.data]);
  const eventos = useMemo(() => [...new Set(lista.map((x) => x.evento_origen))].sort(), [lista]);
  const filtradas = lista.filter(
    (x) =>
      coincide(valores.q, x.mensaje, x.evento_origen, JSON.stringify(x.referencia)) &&
      (!valores.canal || x.canal === valores.canal) &&
      (!valores.destinatario || x.destinatario_tipo === valores.destinatario) &&
      (!valores.evento || x.evento_origen === valores.evento),
  );
  const hayFiltros = !!(valores.q || valores.canal || valores.destinatario || valores.evento);

  return (
    <div className="space-y-4">
      <Limitacion titulo="Bandeja simulada y en memoria">
        Las notificaciones no se envían de verdad: el servicio las registra en memoria y se pierden al reiniciarlo. No existen estados de lectura ni filtros en la API
        (solo «limite»): los filtros de abajo se aplican sobre las notificaciones recibidas.
      </Limitacion>
      <Panel cuerpo="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-rule p-3">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-3" />
            <Input value={valores.q} onChange={(e) => set('q', e.target.value)} placeholder="Buscar en el mensaje" aria-label="Buscar notificaciones" className="pl-8" />
          </div>
          <NativeSelect value={valores.canal} onChange={(e) => set('canal', e.target.value)} className="w-36" aria-label="Filtrar por canal">
            <option value="">Todo canal</option>
            {Object.entries(CANALES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={valores.destinatario} onChange={(e) => set('destinatario', e.target.value)} className="w-44" aria-label="Filtrar por destinatario">
            <option value="">Todo destinatario</option>
            {Object.entries(DESTINATARIOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={valores.evento} onChange={(e) => set('evento', e.target.value)} className="w-52" aria-label="Filtrar por evento">
            <option value="">Todo evento</option>
            {eventos.map((e) => (
              <option key={e} value={e}>
                {humanizar(e)}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={String(limite)} onChange={(e) => set('limite', e.target.value)} className="w-32" aria-label="Cantidad a consultar">
            {[20, 50, 100, 200].map((x) => (
              <option key={x} value={x}>
                Últimas {x}
              </option>
            ))}
          </NativeSelect>
          {hayFiltros && (
            <Button size="sm" variant="ghost" onClick={limpiar}>
              Limpiar
            </Button>
          )}
          <Button size="icon-sm" variant="ghost" onClick={() => n.refetch()} aria-label="Actualizar">
            <RefreshCw className={cn(n.isFetching && 'animate-spin')} />
          </Button>
        </div>
        {n.error ? (
          <ErrorState error={n.error} reintentar={() => n.refetch()} />
        ) : !n.data ? (
          <LoadingState />
        ) : filtradas.length === 0 ? (
          <EmptyState titulo={lista.length ? 'Ninguna notificación coincide' : 'La bandeja está vacía'} icono={<Bell />}>
            {lista.length ? 'Ajuste los filtros.' : 'Las notificaciones aparecen cuando cambia el estado de un envío.'}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-rule">
            {filtradas.map((x) => {
              const envioId = typeof x.referencia?.envio_id === 'string' ? x.referencia.envio_id : null;
              return (
                <li key={x.id} className="flex gap-3 px-4 py-3">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-neutral-soft text-text-2 [&_svg]:size-4">{ICONO_CANAL[x.canal] ?? <Bell />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-text">{x.mensaje}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-text-3">
                      <Tag>{CANALES[x.canal] ?? x.canal}</Tag>
                      <Badge tono={x.destinatario_tipo === 'gestor_flota' ? 'warn' : 'neutral'} punto={false}>
                        {DESTINATARIOS[x.destinatario_tipo] ?? humanizar(x.destinatario_tipo)}
                      </Badge>
                      <span title={x.evento_origen}>{humanizar(x.evento_origen)}</span>
                      {envioId && (
                        <Link to={`/envios/${envioId}`} className="font-semibold text-primary hover:underline">
                          Ver envío
                        </Link>
                      )}
                    </div>
                  </div>
                  <time className="shrink-0 text-right text-xs text-text-3" dateTime={x.enviado_en} title={fechaHora(x.enviado_en)}>
                    {relativo(x.enviado_en)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
        {n.data && (
          <p className="border-t border-rule px-4 py-2 text-xs text-text-3">
            {filtradas.length} de {lista.length} notificaciones recibidas. Se actualiza cada 15 segundos.
          </p>
        )}
      </Panel>
    </div>
  );
}

function Preferencias() {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel titulo="Cliente">
        <Field label="Cliente" htmlFor="pref-cli">
          <ClientePicker id="pref-cli" valor={cliente} onCambio={setCliente} soloActivos={false} />
        </Field>
        <p className="mt-3 text-xs text-text-3">
          Si un cliente no tiene preferencia guardada, el servicio responde idioma español y sin canal preferido. Las alertas al gestor de flota siempre van por push.
        </p>
      </Panel>
      <Panel titulo={cliente ? `Preferencias de ${cliente.nombre}` : 'Preferencias'}>
        {cliente ? <EditorPreferencia key={cliente.id} clienteId={cliente.id} /> : <EmptyState titulo="Elija un cliente" compacto />}
      </Panel>
    </div>
  );
}

export default function NotificacionesPage() {
  const prefs = usePuede('preferencias');
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'bandeja';
  return (
    <>
      <PageHeader titulo="Notificaciones" descripcion="Mensajes que el sistema genera por los eventos de los envíos y preferencias de idioma y canal por cliente." />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList className="mb-1">
          <TabsTrigger value="bandeja">Bandeja</TabsTrigger>
          {prefs && <TabsTrigger value="preferencias">Preferencias por cliente</TabsTrigger>}
        </TabsList>
        <TabsContent value="bandeja">
          <Bandeja />
        </TabsContent>
        {prefs && (
          <TabsContent value="preferencias">
            <Preferencias />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}
