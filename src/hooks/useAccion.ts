import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { describirError } from '@/lib/api/errors';

interface OpcionesAccion<TVars, TData> {
  fn: (vars: TVars) => Promise<TData>;
  /** Mensaje de éxito: solo se muestra cuando la API confirma la operación. */
  exito?: string | ((data: TData, vars: TVars) => string);
  /** Claves a invalidar al terminar con éxito (prefijos). */
  invalida?: QueryKey[] | ((data: TData, vars: TVars) => QueryKey[]);
  /** Si es false, el error no se muestra como toast (el formulario lo muestra en línea). */
  toastError?: boolean;
  onSuccess?: (data: TData, vars: TVars) => void;
}

/** Mutación con invalidación de caché y avisos coherentes. */
export function useAccion<TVars = void, TData = unknown>(o: OpcionesAccion<TVars, TData>) {
  const qc = useQueryClient();
  return useMutation<TData, Error, TVars>({
    mutationFn: o.fn,
    onSuccess: (data, vars) => {
      const claves = typeof o.invalida === 'function' ? o.invalida(data, vars) : (o.invalida ?? []);
      // Se refresca en segundo plano: la confirmación no espera a otros servicios
      // (si uno está lento o caído, la operación ya quedó hecha y se informa igual).
      claves.forEach((queryKey) => void qc.invalidateQueries({ queryKey }));
      if (o.exito) toast.success(typeof o.exito === 'function' ? o.exito(data, vars) : o.exito);
      o.onSuccess?.(data, vars);
    },
    onError: (e) => {
      if (o.toastError !== false) toast.error(describirError(e));
    },
  });
}
