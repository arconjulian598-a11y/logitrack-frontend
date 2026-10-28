/**
 * Polling del seguimiento de UN envío del cliente (GET /seguimiento/cliente/envio/{id}).
 *
 * - Cada 5 s con el viaje en curso; cada 10 s si se está preparando, pausado o aún sin viaje.
 * - Se detiene con el viaje finalizado/cancelado o el envío en estado final.
 * - Pausa con la pestaña oculta y consulta enseguida al volver.
 * - Nunca solapa peticiones; tras un fallo de red espera 5, 10, 20, 40 y 60 s como máximo, y
 *   conserva lo último recibido (marcado como no actualizado).
 * - 404 / 403 / 401 son definitivos: no se insiste (el 401 ya lleva al inicio de sesión).
 * - Al salir de la pantalla o cerrar sesión se cancelan el temporizador y la petición en curso.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import { ESTADOS_FINALES_ENVIO } from '@/lib/dominio';
import type { SeguimientoCliente } from '@/lib/types/api';

export const ESPERA_EN_CURSO_MS = 5000;
export const ESPERA_SIN_MOVIMIENTO_MS = 10000;
export const ESPERA_MAXIMA_ERROR_MS = 60000;

/** ¿El seguimiento ya terminó (no hay nada más que consultar)? */
export function seguimientoTerminado(d: SeguimientoCliente): boolean {
  return d.estado_viaje === 'finalizada' || d.estado_viaje === 'cancelada' || ESTADOS_FINALES_ENVIO.includes(d.estado_envio);
}

/** Milisegundos hasta la próxima consulta, o null para no volver a consultar. */
export function esperaSiguiente(ultimo: SeguimientoCliente | null, fallosSeguidos: number): number | null {
  if (fallosSeguidos > 0) return Math.min(ESPERA_EN_CURSO_MS * 2 ** (fallosSeguidos - 1), ESPERA_MAXIMA_ERROR_MS);
  if (!ultimo) return ESPERA_EN_CURSO_MS;
  if (seguimientoTerminado(ultimo)) return null;
  return ultimo.estado_viaje === 'en_curso' ? ESPERA_EN_CURSO_MS : ESPERA_SIN_MOVIMIENTO_MS;
}

/** Errores que no se arreglan reintentando (envío ajeno o inexistente, sin permiso, sin sesión, petición inválida). */
export function errorDefinitivo(e: unknown): boolean {
  return e instanceof ApiError && [400, 401, 403, 404, 422].includes(e.status);
}

export interface EstadoSeguimientoCliente {
  data: SeguimientoCliente | null;
  error: unknown;
  /** Fallos transitorios seguidos (red, 502/503/504). */
  fallos: number;
  /** Momento (ms) de la última respuesta correcta. */
  recibidoEn: number | null;
  /** Momento (ms) del próximo intento programado (null = no hay más consultas). */
  proximoEn: number | null;
  consultando: boolean;
  /** Se dejó de consultar (terminado o error definitivo). */
  detenido: boolean;
  /** Posiciones recibidas en esta pantalla con la carga a bordo (para alargar la estela). Nunca estimadas. */
  nuevos: { tiempo: string; latitud: number; longitud: number }[];
}

/** ¿Esta respuesta trae un punto nuevo de la estela (posición real, con la carga a bordo y al día)? */
export function puntoDeEstela(d: SeguimientoCliente): { tiempo: string; latitud: number; longitud: number } | null {
  const p = d.posicion;
  if (!p.disponible || p.latitud == null || p.longitud == null || !p.actualizada_en || p.desactualizada) return null;
  if (d.estado_viaje !== 'en_curso' || d.fase === 'reposicion') return null;
  return { tiempo: p.actualizada_en, latitud: p.latitud, longitud: p.longitud };
}

const INICIAL: EstadoSeguimientoCliente = {
  data: null,
  error: null,
  fallos: 0,
  recibidoEn: null,
  proximoEn: null,
  consultando: false,
  detenido: false,
  nuevos: [],
};

export function useSeguimientoCliente(envioId: string | undefined, habilitado: boolean) {
  const [estado, setEstado] = useState<EstadoSeguimientoCliente>(INICIAL);
  const ahoraRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    setEstado(INICIAL);
    if (!envioId || !habilitado) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let enCurso: AbortController | null = null;
    let terminado = false; // salir de la pantalla, seguimiento terminado o error definitivo
    let fallos = 0;
    let ultimo: SeguimientoCliente | null = null;

    const programar = (ms: number | null) => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (ms === null) {
        terminado = true;
        setEstado((s) => ({ ...s, proximoEn: null, detenido: true }));
        return;
      }
      timer = setTimeout(() => void consultar(), ms);
      setEstado((s) => ({ ...s, proximoEn: Date.now() + ms }));
    };

    const consultar = async () => {
      timer = undefined;
      if (terminado || enCurso) return; // nunca dos peticiones a la vez
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return; // se retoma al volver
      const control = new AbortController();
      enCurso = control;
      setEstado((s) => ({ ...s, consultando: true }));
      try {
        const d = await api.seguimientoCliente.estado(envioId, { signal: control.signal });
        if (control.signal.aborted) return;
        enCurso = null;
        fallos = 0;
        ultimo = d;
        const punto = puntoDeEstela(d);
        setEstado((s) => ({
          ...s,
          data: d,
          error: null,
          fallos: 0,
          recibidoEn: Date.now(),
          consultando: false,
          nuevos: punto && !s.nuevos.some((n) => n.tiempo === punto.tiempo) ? [...s.nuevos, punto] : s.nuevos,
        }));
        programar(esperaSiguiente(d, 0));
      } catch (e) {
        if (control.signal.aborted) return;
        enCurso = null;
        if (errorDefinitivo(e)) {
          terminado = true;
          setEstado((s) => ({ ...s, error: e, consultando: false, proximoEn: null, detenido: true }));
          return;
        }
        fallos += 1;
        setEstado((s) => ({ ...s, error: e, fallos, consultando: false }));
        programar(esperaSiguiente(ultimo, fallos));
      }
    };

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') {
        if (!terminado && !enCurso) {
          if (timer) clearTimeout(timer);
          void consultar();
        }
      } else if (timer) {
        clearTimeout(timer); // en pausa mientras no se ve
        timer = undefined;
        setEstado((s) => ({ ...s, proximoEn: null }));
      }
    };

    ahoraRef.current = () => {
      if (terminado || enCurso) return;
      if (timer) clearTimeout(timer);
      void consultar();
    };

    void consultar();
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    return () => {
      terminado = true;
      if (timer) clearTimeout(timer);
      enCurso?.abort();
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      ahoraRef.current = () => undefined;
    };
  }, [envioId, habilitado]);

  const reintentarAhora = useCallback(() => ahoraRef.current(), []);
  return { ...estado, reintentarAhora };
}
