import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

/** Filtros persistidos en la URL (compartibles y estables al recargar). */
export function useFiltrosUrl<K extends string>(claves: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const valores = Object.fromEntries(claves.map((k) => [k, params.get(k) ?? ''])) as Record<K, string>;

  const set = useCallback(
    (k: K, v: string) => {
      setParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          if (v) n.set(k, v);
          else n.delete(k);
          if (k !== 'pagina') n.delete('pagina');
          return n;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const limpiar = useCallback(() => {
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        claves.forEach((k) => n.delete(k));
        n.delete('pagina');
        return n;
      },
      { replace: true },
    );
  }, [setParams, claves]);

  return { valores, set, limpiar };
}

/** Valor con retardo, para no consultar en cada pulsación. */
export function useDebounced<T>(valor: T, ms = 300): T {
  const [v, setV] = useState<T>(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}
