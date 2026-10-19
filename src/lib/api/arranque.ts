/**
 * Arranque en frío del backend desplegado (Render): los servicios se duermen tras 15 minutos sin uso y
 * tardan cerca de un minuto en despertar. Mientras se reintenta, la interfaz muestra «el sistema se
 * está iniciando» en vez de un error definitivo.
 */
let despertando = 0;
const oyentes = new Set<() => void>();

export const ESPERAS_ARRANQUE_MS = [3000, 6000, 12000];

export function suscribirArranque(f: () => void): () => void {
  oyentes.add(f);
  return () => oyentes.delete(f);
}

export function sistemaDespertando(): boolean {
  return despertando > 0;
}

export function marcarDespertando(activo: boolean): void {
  despertando = Math.max(0, despertando + (activo ? 1 : -1));
  for (const f of oyentes) f();
}

export function esperar(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new DOMException('Abortado', 'AbortError'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', alAbortar);
      resolve();
    }, ms);
    function alAbortar() {
      clearTimeout(t);
      reject(signal?.reason ?? new DOMException('Abortado', 'AbortError'));
    }
    signal?.addEventListener('abort', alAbortar, { once: true });
  });
}
