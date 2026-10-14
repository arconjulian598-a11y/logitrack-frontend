import { useQuery } from '@tanstack/react-query';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Field } from '@/components/shared/Form';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/shared/Badge';
import { KeyValue, PageHeader, Panel } from '@/components/shared/Layout';
import { ErrorState, LoadingState } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { useEstadoSistema } from '@/hooks/queries';
import * as api from '@/lib/api/endpoints';
import { cambiarGateway, config, normalizarGateway } from '@/lib/config';
import { SERVICIOS } from '@/lib/dominio';
import { cn } from '@/lib/utils';

const ETIQUETA: Record<string, { texto: string; tono: 'ok' | 'danger' | 'warn' | 'muted' }> = {
  ok: { texto: 'Responde', tono: 'ok' },
  con_error: { texto: 'Responde con error', tono: 'warn' },
  sin_respuesta: { texto: 'Sin respuesta', tono: 'danger' },
  sin_configurar: { texto: 'Sin configurar en el gateway', tono: 'muted' },
};

const LIMITACIONES = [
  ['Sin autenticación', 'El backend no exige credenciales ni roles todavía. Esta interfaz no simula un inicio de sesión: cualquiera con acceso al gateway puede operar.'],
  ['Viajes simulados', 'Posición, velocidad, combustible y paradas los produce el simulador de Tracking, acelerado ×120 por defecto. La entrega y su prueba son automáticas.'],
  ['Sin posición «actual» fuera de viaje', 'Solo los vehículos en viaje tienen posición en vivo. Para los demás el mapa usa la última lectura de telemetría registrada.'],
  ['Notificaciones en memoria', 'La bandeja y las preferencias se pierden al reiniciar el servicio de notificaciones. No hay estado de lectura.'],
  ['Analítica periódica', 'Los indicadores se recalculan por ETL cada pocos minutos; «Ejecutar ETL» fuerza el ciclo.'],
  ['Listas sin paginación', 'Las colecciones llegan completas (o con «limite»); la paginación de las tablas es local.'],
  ['Mantenimiento por vehículo', 'Programas e intervenciones solo se consultan por vehículo; la vista global usa la proyección de la analítica.'],
  ['Tarifas por cliente', 'No hay listado de tarifas: se consulta la de cada cliente.'],
  ['Documentos aduaneros', 'Las URL de documentos apuntan a un dominio interno simulado (docs.logitrack.local) y no sirven archivos.'],
  ['ETL concurrente bloquea Analítica', 'Dos ciclos ETL simultáneos (programado y manual) dejan analytics-service sin responder hasta reiniciarlo: se borra una tabla y se esperan llamadas HTTP con la transacción abierta y un driver síncrono.'],
  ['Rutas internas bloqueadas', 'POST /reservas, POST /reservas/liberar, POST /rutas y POST /telemetria son de uso interno y el gateway no las expone.'],
];

/** Cambiar de gateway sin recompilar (p. ej. la URL del túnel de LevantarTunel.ps1). */
function ElegirGateway() {
  const [valor, setValor] = useState<string>(config.gatewayUrl);
  const [error, setError] = useState<string | null>(null);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const url = normalizarGateway(valor);
    if (!url) {
      setError('Escriba una dirección http:// o https:// completa, por ejemplo https://xxxx.trycloudflare.com');
      return;
    }
    cambiarGateway(url === config.gatewayPorDefecto ? null : url);
  };
  return (
    <Panel
      titulo="Gateway de esta interfaz"
      descripcion={config.gatewayPersonalizado ? 'Elegido en este navegador' : 'El de la compilación (VITE_GATEWAY_URL)'}
      acciones={config.gatewayPersonalizado && <Badge tono="warn">Personalizado</Badge>}
    >
      <form onSubmit={enviar} className="space-y-3" noValidate>
        <Field label="Raíz del API Gateway" htmlFor="gateway-url" error={error ?? undefined}>
          <Input
            id="gateway-url"
            type="url"
            inputMode="url"
            value={valor}
            onChange={(e) => {
              setValor(e.target.value);
              setError(null);
            }}
            placeholder="http://localhost:8002"
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary">Usar este gateway</Button>
          {config.gatewayPersonalizado && (
            <Button type="button" onClick={() => cambiarGateway(null)}>
              Volver a {config.gatewayPorDefecto}
            </Button>
          )}
        </div>
        <p className="text-xs text-text-3">
          Se recuerda en este navegador. También puede abrir la interfaz con <code className="whitespace-nowrap">?api=https://…</code>, como hace LevantarTunel.ps1. El gateway
          elegido debe incluir este origen en CORS_ORIGINS.
        </p>
      </form>
    </Panel>
  );
}

export default function SistemaPage() {
  const estado = useEstadoSistema({ refetchInterval: 10000 });
  const health = useQuery({ queryKey: ['gateway', 'health'], queryFn: ({ signal }) => api.gateway.health({ signal }), refetchInterval: 10000 });
  const servicios = Object.entries(SERVICIOS);
  return (
    <>
      <PageHeader
        titulo="Estado del sistema"
        descripcion="Salud del API Gateway y de los nueve microservicios, configuración de esta interfaz y limitaciones conocidas del backend."
        acciones={
          <>
            <Button asChild>
              <a href={`${config.gatewayUrl}/docs`} target="_blank" rel="noreferrer">
                <ExternalLink /> Documentación de la API
              </a>
            </Button>
            <Button
              onClick={() => {
                void estado.refetch();
                void health.refetch();
              }}
            >
              <RefreshCw className={cn((estado.isFetching || health.isFetching) && 'animate-spin')} /> Comprobar ahora
            </Button>
          </>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel
          titulo="Microservicios"
          descripcion={estado.data ? (estado.data.estado_general === 'ok' ? 'Todos responden' : 'Hay servicios degradados') : 'GET /api/v1/estado'}
          acciones={estado.data && <Badge tono={estado.data.estado_general === 'ok' ? 'ok' : 'danger'}>{estado.data.estado_general === 'ok' ? 'Operativo' : 'Degradado'}</Badge>}
          cuerpo="p-0"
        >
          {estado.error ? (
            <ErrorState error={estado.error} reintentar={() => estado.refetch()} />
          ) : !estado.data ? (
            <LoadingState />
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-rule bg-surface-2 text-left text-xs text-text-2">
                  <th scope="col" className="px-4 py-2 font-semibold">Servicio</th>
                  <th scope="col" className="hidden px-4 py-2 font-semibold md:table-cell">Módulos que atiende</th>
                  <th scope="col" className="px-4 py-2 font-semibold">Estado</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">Respuesta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {servicios.map(([clave, s]) => {
                  const e = estado.data.servicios[clave as keyof typeof estado.data.servicios];
                  const et = ETIQUETA[e?.estado ?? 'sin_respuesta']!;
                  return (
                    <tr key={clave}>
                      <td className="px-4 py-2.5">
                        <span className="font-semibold">{s.nombre}</span> <span className="text-xs text-text-3">{clave}</span>
                      </td>
                      <td className="hidden px-4 py-2.5 text-text-2 md:table-cell">{s.modulo}</td>
                      <td className="px-4 py-2.5">
                        <Badge tono={et.tono}>{et.texto}</Badge>
                      </td>
                      <td className="tabular px-4 py-2.5 text-right text-text-2">{e?.ms != null ? `${e.ms} ms` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
        <div className="space-y-5">
          <Panel titulo="API Gateway">
            <KeyValue
              columnas={1}
              items={[
                { k: 'Salud (GET /health)', v: health.error ? <Badge tono="danger">Sin respuesta</Badge> : health.data ? <Badge tono="ok">{health.data.status}</Badge> : 'Comprobando…' },
                { k: 'URL base de la API', v: <code className="text-xs">{config.apiBaseUrl}</code> },
                { k: 'Documentación', v: <a className="text-primary hover:underline" href={`${config.gatewayUrl}/docs`} target="_blank" rel="noreferrer">{config.gatewayUrl}/docs</a> },
                { k: 'Especificación OpenAPI', v: <a className="text-primary hover:underline" href={`${config.gatewayUrl}/openapi.json`} target="_blank" rel="noreferrer">{config.gatewayUrl}/openapi.json</a> },
                { k: 'Origen de esta interfaz', v: <code className="text-xs">{window.location.origin}</code> },
                { k: 'Actualización del mapa', v: `Flota cada ${config.poll.flotaMs / 1000} s, ficha del viaje cada ${config.poll.seguimientoMs / 1000} s` },
              ]}
            />
            <p className="mt-3 text-xs text-text-3">Si el gateway rechaza las peticiones por CORS, agregue este origen a CORS_ORIGINS del gateway y reinícielo.</p>
          </Panel>
          <ElegirGateway />
        </div>
      </div>
      <Panel titulo="Limitaciones conocidas del backend" className="mt-5">
        <dl className="grid gap-x-8 gap-y-4 md:grid-cols-2">
          {LIMITACIONES.map(([t, d]) => (
            <div key={t}>
              <dt className="text-[13px] font-semibold">{t}</dt>
              <dd className="text-[13px] text-text-2">{d}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </>
  );
}
