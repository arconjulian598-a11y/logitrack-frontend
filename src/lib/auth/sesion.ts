/**
 * Sesión del usuario: el token vive en memoria y en sessionStorage (sobrevive a recargar la pestaña,
 * se borra al cerrarla). Nunca en localStorage ni en la URL (instrucciones, sección 2).
 */
import type { Rol } from './permisos';

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  cliente_id: string | null;
  codigo_cliente: number | null;
  activo: boolean;
  ultimo_acceso?: string | null;
  creado_en?: string;
}

export interface Sesion {
  token: string;
  /** Momento (ms) en que vence el token. */
  vence: number;
  usuario: Usuario;
}

/** Por qué terminó la sesión (para explicarlo en la pantalla de inicio). */
export type MotivoCierre = 'salida' | 'expirada' | null;

const CLAVE = 'logitrack_sesion';
let actual: Sesion | null = leer();
let motivo: MotivoCierre = null;
const oyentes = new Set<() => void>();

function leer(): Sesion | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE);
    if (!crudo) return null;
    const s = JSON.parse(crudo) as Sesion;
    if (!s?.token || !s.usuario?.rol || !(s.vence > Date.now())) return null;
    return s;
  } catch {
    return null;
  }
}

function avisar() {
  for (const f of oyentes) f();
}

export function suscribirSesion(f: () => void): () => void {
  oyentes.add(f);
  return () => oyentes.delete(f);
}

/** Instantánea para React (estable entre avisos). El vencimiento lo vigila AuthProvider. */
export function sesionActual(): Sesion | null {
  return actual;
}

export function motivoCierre(): MotivoCierre {
  return motivo;
}

export function token(): string | null {
  return actual && actual.vence > Date.now() ? actual.token : null;
}

export function rolActual(): Rol | null {
  return actual?.usuario.rol ?? null;
}

export function iniciarSesion(datos: { access_token: string; expires_in: number; usuario: Usuario }): void {
  actual = {
    token: datos.access_token,
    vence: Date.now() + Math.max(60, datos.expires_in || 0) * 1000,
    usuario: datos.usuario,
  };
  motivo = null;
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(actual));
  } catch {
    /* sin almacenamiento: la sesión vive solo en memoria */
  }
  avisar();
}

export function actualizarUsuario(usuario: Usuario): void {
  if (!actual) return;
  actual = { ...actual, usuario };
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(actual));
  } catch {
    /* ignorar */
  }
  avisar();
}

export function cerrarSesion(porque: MotivoCierre = 'salida'): void {
  if (!actual && motivo === porque) return;
  actual = null;
  motivo = porque;
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    /* ignorar */
  }
  avisar();
}
