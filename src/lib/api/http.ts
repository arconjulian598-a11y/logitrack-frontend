import { config } from '@/lib/config';
import { ApiError, crearApiError } from './errors';

export type Query = Record<string, string | number | boolean | null | undefined>;

export interface Opciones {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  /** Usa la raíz del gateway en vez de `/api/v1` (para `/health`). */
  raiz?: boolean;
  /** Tiempo máximo de esta petición (por defecto `config.timeoutMs`). */
  timeoutMs?: number;
  /** Cabeceras adicionales (por ejemplo `Idempotency-Key`). */
  headers?: Record<string, string>;
}

/** Une la cancelación de TanStack Query con un límite de tiempo. */
function senalConLimite(signal: AbortSignal | undefined, ms: number): AbortSignal | undefined {
  if (typeof AbortSignal.timeout !== 'function') return signal;
  const limite = AbortSignal.timeout(ms);
  if (!signal) return limite;
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, limite]) : signal;
}

export function construirUrl(ruta: string, query?: Query, raiz = false): string {
  const base = raiz ? config.gatewayUrl : config.apiBaseUrl;
  const url = new URL(base + (ruta.startsWith('/') ? ruta : `/${ruta}`));
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

/** Segmento de ruta seguro (ids, códigos, placas). */
export function seg(valor: string | number): string {
  return encodeURIComponent(String(valor).trim());
}

async function leerCuerpo(resp: Response): Promise<unknown> {
  const texto = await resp.text();
  if (!texto) return null;
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    return { detail: texto.slice(0, 300) };
  }
}

/**
 * Llamada al API Gateway. Sin cookies (contrato 1.4). Propaga `signal` para que TanStack Query
 * cancele peticiones obsoletas. Lanza `ApiError` con status 0 si no hay conexión.
 */
export async function solicitar<T>(metodo: string, ruta: string, opts: Opciones = {}): Promise<T> {
  const tieneCuerpo = opts.body !== undefined;
  const limiteMs = opts.timeoutMs ?? config.timeoutMs;
  let resp: Response;
  try {
    resp = await fetch(construirUrl(ruta, opts.query, opts.raiz), {
      method: metodo,
      headers: {
        Accept: 'application/json',
        ...(tieneCuerpo ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.headers ?? {}),
      },
      body: tieneCuerpo ? JSON.stringify(opts.body) : undefined,
      credentials: 'omit',
      signal: senalConLimite(opts.signal, limiteMs),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      throw new ApiError({ status: 0, mensaje: `El API Gateway no respondió en ${Math.round(limiteMs / 1000)} s.` });
    }
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError({ status: 0, mensaje: 'No hay conexión con el API Gateway.' });
  }
  const cuerpo = await leerCuerpo(resp);
  if (!resp.ok) {
    throw crearApiError(resp.status, cuerpo, resp.headers.get('X-Request-ID') ?? undefined);
  }
  return cuerpo as T;
}

export const http = {
  get: <T>(ruta: string, opts?: Omit<Opciones, 'body'>) => solicitar<T>('GET', ruta, opts),
  post: <T>(ruta: string, body?: unknown, opts?: Omit<Opciones, 'body'>) =>
    solicitar<T>('POST', ruta, { ...opts, body: body ?? undefined }),
  patch: <T>(ruta: string, body: unknown, opts?: Omit<Opciones, 'body'>) =>
    solicitar<T>('PATCH', ruta, { ...opts, body }),
  put: <T>(ruta: string, body: unknown, opts?: Omit<Opciones, 'body'>) =>
    solicitar<T>('PUT', ruta, { ...opts, body }),
};
