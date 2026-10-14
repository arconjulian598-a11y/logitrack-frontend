/** Configuración centralizada a partir de variables de entorno de Vite y, opcionalmente, del navegador. */

function texto(valor: string | undefined, porDefecto: string): string {
  const v = valor?.trim();
  return v ? v.replace(/\/+$/, '') : porDefecto;
}

function entero(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

const env = import.meta.env;

/** Misma clave y mismo parámetro `?api=` que usa `web-frontend/` (flujo de LevantarTunel.ps1). */
export const CLAVE_GATEWAY = 'logitrack_api_url';

/** Acepta solo una raíz http(s) sin ruta de API; devuelve null si no es válida. */
export function normalizarGateway(valor: string | null | undefined): string | null {
  const v = valor?.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const ruta = u.pathname.replace(/\/+$/, '').replace(/\/api\/v1$/, '');
    return `${u.origin}${ruta}`;
  } catch {
    return null;
  }
}

function leerAlmacen(): string | null {
  try {
    return localStorage.getItem(CLAVE_GATEWAY);
  } catch {
    return null;
  }
}

/**
 * Gateway elegido en el navegador: `?api=https://xxx.trycloudflare.com` (se recuerda) o el guardado antes.
 * Permite usar la misma compilación en local, por túnel o desplegada, sin recompilar.
 */
function gatewayDelNavegador(): string | null {
  if (typeof window === 'undefined') return null;
  const desdeUrl = normalizarGateway(new URLSearchParams(window.location.search).get('api'));
  if (desdeUrl) {
    try {
      localStorage.setItem(CLAVE_GATEWAY, desdeUrl);
    } catch {
      /* almacenamiento bloqueado: se usa solo en esta carga */
    }
    return desdeUrl;
  }
  return normalizarGateway(leerAlmacen());
}

const gatewayEnv = texto(env.VITE_GATEWAY_URL, 'http://localhost:8002');
const apiEnv = texto(env.VITE_API_BASE_URL, `${gatewayEnv}/api/v1`);
const elegido = gatewayDelNavegador();

/** Guarda (o borra, con null) el gateway elegido y recarga la aplicación con él. */
export function cambiarGateway(url: string | null): void {
  try {
    if (url) localStorage.setItem(CLAVE_GATEWAY, url);
    else localStorage.removeItem(CLAVE_GATEWAY);
  } catch {
    /* sin almacenamiento: se aplica igual vía ?api= */
  }
  const destino = new URL(window.location.href);
  destino.searchParams.delete('api');
  if (url) destino.searchParams.set('api', url);
  window.location.assign(destino.toString());
}

export const config = {
  /** Base de todas las rutas públicas: `http://localhost:8002/api/v1`. */
  apiBaseUrl: elegido ? `${elegido}/api/v1` : apiEnv,
  /** Raíz del gateway, para `/health`, `/docs` y `/openapi.json`. */
  gatewayUrl: elegido ?? gatewayEnv,
  /** Gateway de la compilación (variables VITE_*), para poder volver a él. */
  gatewayPorDefecto: gatewayEnv,
  /** true si el gateway viene de `?api=` o del navegador y no de la compilación. */
  gatewayPersonalizado: elegido !== null && elegido !== gatewayEnv,
  /** Tiempo máximo por petición; ETL usa uno propio más largo. */
  timeoutMs: entero(env.VITE_API_TIMEOUT_MS, 20000),
  mapa: {
    tileUrl: env.VITE_MAP_TILE_URL?.trim() || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    atribucion:
      env.VITE_MAP_ATTRIBUTION?.trim() ||
      '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  poll: {
    /** Ficha de un viaje (`/seguimiento/envio/{id}`): el contrato recomienda 3–5 s. */
    seguimientoMs: entero(env.VITE_POLL_SEGUIMIENTO_MS, 4000),
    /** Mapa general (`/seguimiento/flota`): el contrato recomienda 5 s. */
    flotaMs: entero(env.VITE_POLL_FLOTA_MS, 5000),
    /** Última lectura de telemetría de vehículos sin viaje activo. */
    ultimaPosicionMs: entero(env.VITE_POLL_ULTIMA_POSICION_MS, 60000),
    /** Listas de envíos (el contrato sugiere 10 s). */
    listasMs: 10000,
  },
  zonaHoraria: 'America/Bogota',
} as const;
