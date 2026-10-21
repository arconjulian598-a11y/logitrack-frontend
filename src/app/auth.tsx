import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { SinPermiso } from '@/components/shared/States';
import { auth } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import { puede, type Accion, type Rol } from '@/lib/auth/permisos';
import type { RegistroCuenta } from '@/lib/types/api';
import {
  actualizarUsuario,
  cerrarSesion,
  iniciarSesion,
  sesionActual,
  suscribirSesion,
  type Sesion,
  type Usuario,
} from '@/lib/auth/sesion';

interface ValorAuth {
  sesion: Sesion | null;
  entrar: (email: string, password: string) => Promise<Usuario>;
  /** POST /auth/registro y entra con la cuenta nueva (el token se guarda igual que en el login). */
  registrarse: (datos: RegistroCuenta) => Promise<Usuario>;
  salir: () => void;
}

const Contexto = createContext<ValorAuth | null>(null);

export function useSesion(): Sesion | null {
  return useSyncExternalStore(suscribirSesion, sesionActual, sesionActual);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const sesion = useSesion();
  const qc = useQueryClient();
  const usuarioAnterior = useRef<string | null>(sesion?.usuario.id ?? null);

  // Al cambiar de usuario (o salir) se borra lo que quedó en caché: un usuario nunca ve datos de otro
  useEffect(() => {
    const id = sesion?.usuario.id ?? null;
    if (usuarioAnterior.current !== id) {
      qc.clear();
      usuarioAnterior.current = id;
    }
  }, [sesion?.usuario.id, qc]);

  // Al abrir la aplicación con un token guardado se confirma con GET /auth/me (rol al día)
  const token = sesion?.token;
  useEffect(() => {
    if (!token) return;
    const control = new AbortController();
    auth
      .yo({ signal: control.signal })
      .then((u) => actualizarUsuario(u))
      .catch(() => {
        /* 401 ya cerró la sesión en el cliente HTTP; otros errores no la cierran */
      });
    return () => control.abort();
  }, [token]);

  // El token vence a las 8 h (expires_in): al vencer se vuelve al inicio de sesión
  const vence = sesion?.vence;
  useEffect(() => {
    if (!vence) return;
    const ms = vence - Date.now();
    if (ms <= 0) {
      cerrarSesion('expirada');
      return;
    }
    const t = setTimeout(() => cerrarSesion('expirada'), Math.min(ms, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [vence]);

  const valor: ValorAuth = {
    sesion,
    entrar: async (email, password) => {
      const r = await auth.login(email.trim(), password);
      iniciarSesion(r);
      return r.usuario;
    },
    registrarse: async (datos) => {
      const r = await auth.registro(datos);
      iniciarSesion(r);
      return r.usuario;
    },
    salir: () => cerrarSesion('salida'),
  };
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAuth(): ValorAuth {
  const v = useContext(Contexto);
  if (!v) throw new Error('useAuth fuera de AuthProvider');
  return v;
}

/** Usuario de la sesión (dentro de las pantallas protegidas siempre existe). */
export function useUsuario(): Usuario {
  const s = useSesion();
  if (!s) throw new Error('Sin sesión');
  return s.usuario;
}

export function useRol(): Rol | null {
  return useSesion()?.usuario.rol ?? null;
}

export function usePuede(accion: Accion): boolean {
  return puede(useRol(), accion);
}

/** Exige sesión: si no hay, lleva al inicio de sesión y recuerda a dónde volver. */
export function RequiereSesion({ children }: { children: ReactNode }) {
  const sesion = useSesion();
  const { pathname, search } = useLocation();
  if (!sesion) {
    const volver = pathname !== '/' ? `?volver=${encodeURIComponent(pathname + search)}` : '';
    return <Navigate to={`/login${volver}`} replace />;
  }
  return <>{children}</>;
}

/** Pantalla solo para ciertos roles (el gateway igual lo impone con 403). */
export function SoloPara({ accion, children }: { accion?: Accion | Accion[]; children: ReactNode }) {
  const rol = useRol();
  const acciones = accion === undefined ? [] : Array.isArray(accion) ? accion : [accion];
  if (acciones.length && !acciones.some((a) => puede(rol, a))) return <SinPermiso />;
  return <>{children}</>;
}

export function esErrorDeCredenciales(e: unknown): boolean {
  return e instanceof ApiError && e.codigo === 'CREDENCIALES_INVALIDAS';
}
