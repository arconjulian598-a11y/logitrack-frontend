import { cerrarSesion, token } from '@/lib/auth/sesion';
import { config } from '@/lib/config';
import { ESPERAS_ARRANQUE_MS, esperar, marcarDespertando } from './arranque';
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
  /** Ruta pública (POST /auth/login): sin token y un 401 no cierra la sesión. */
  publica?: boolean;
  /** Reintentar 3, 6 y 12 s si el backend está despertando (por defecto: solo GET). */
  reintentarArranque?: boolean;
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
    if (!resp.ok) {
      // Página de error en HTML (Render o Vercel cuando un servicio está dormido o caído): no se muestra el HTML
      const servicio = resp.headers.get('X-Gateway-Servicio') ?? undefined;
      return {
        detail: {
          codigo: resp.status >= 500 ? 'SERVICIO_NO_DISPONIBLE' : resp.status === 429 ? 'LIMITE_DE_PETICIONES' : 'RESPUESTA_INESPERADA',
          mensaje:
            resp.status >= 500
              ? `El servicio ${servicio ?? 'del backend'} no respondió (error ${resp.status}). Si el sistema estaba dormido, tarda cerca de un minuto en despertar: intente de nuevo.`
              : resp.status === 429
                ? `El servicio ${servicio ?? 'del backend'} está rechazando peticiones por exceso de tráfico (error 429). No es un problema de su cuenta: espere unos minutos e intente de nuevo.`
                : `El servidor respondió un error ${resp.status} inesperado.`,
          ...(servicio ? { servicio } : {}),
        },
      };
    }
    return { detail: texto.slice(0, 300) };
  }
}

/** ¿El fallo parece el backend despertando (Render) o un servicio dormido? */
function esArranque(e: unknown): boolean {
  if (!(e instanceof ApiError)) return false;
  if (e.status === 0) return true; // sin respuesta (el proxy de Render corta sin cabeceras CORS)
  if (e.status === 502 || e.status === 504) return true;
  return e.status === 503 && (!e.codigo || e.codigo === 'SERVICIO_NO_DISPONIBLE');
}

async function unaVez<T>(metodo: string, ruta: string, opts: Opciones): Promise<T> {
  const tieneCuerpo = opts.body !== undefined;
  const limiteMs = opts.timeoutMs ?? config.timeoutMs;
  const t = opts.publica ? null : token();
  let resp: Response;
  try {
    resp = await fetch(construirUrl(ruta, opts.query, opts.raiz), {
      method: metodo,
      headers: {
        Accept: 'application/json',
        ...(tieneCuerpo ? { 'Content-Type': 'application/json' } : {}),
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
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
    const error = crearApiError(resp.status, cuerpo, resp.headers.get('X-Request-ID') ?? undefined);
    // 401: la sesión ya no sirve (falta, inválida o vencida) -> volver al inicio de sesión
    if (resp.status === 401 && !opts.publica) cerrarSesion('expirada');
    throw error;
  }
  return cuerpo as T;
}

/**
 * Llamada al API Gateway con el token de la sesión. Sin cookies (contrato 1.4). Propaga `signal`
 * para que TanStack Query cancele peticiones obsoletas. Lanza `ApiError` con status 0 si no hay
 * conexión. Las lecturas se reintentan con espera creciente si el backend está despertando.
 */
export async function solicitar<T>(metodo: string, ruta: string, opts: Opciones = {}): Promise<T> {
  const reintentar = opts.reintentarArranque ?? metodo === 'GET';
  if (!reintentar) return unaVez<T>(metodo, ruta, opts);
  let avisado = false;
  try {
    for (let intento = 0; ; intento++) {
      try {
        return await unaVez<T>(metodo, ruta, opts);
      } catch (e) {
        if (intento >= ESPERAS_ARRANQUE_MS.length || !esArranque(e)) throw e;
        if (!avisado) {
          avisado = true;
          marcarDespertando(true);
        }
        await esperar(ESPERAS_ARRANQUE_MS[intento] ?? 3000, opts.signal);
      }
    }
  } finally {
    if (avisado) marcarDespertando(false);
  }
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
