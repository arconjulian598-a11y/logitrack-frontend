import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useDebounced } from '@/hooks/useFiltrosUrl';
import { useClientes, useConductores, useUbicaciones, useVehiculos } from '@/hooks/queries';
import { describirError } from '@/lib/api/errors';
import { tipoVehiculo } from '@/lib/dominio';
import type { Cliente, Ubicacion, Vehiculo } from '@/lib/types/api';
import { cn, coincide } from '@/lib/utils';
import { Plate } from './Plate';

interface ComboProps<T> {
  id?: string;
  valor: T | null;
  onCambio: (v: T | null) => void;
  placeholder: string;
  busqueda: string;
  setBusqueda: (q: string) => void;
  opciones: T[] | undefined;
  cargando: boolean;
  error?: unknown;
  clave: (v: T) => string;
  render: (v: T) => ReactNode;
  resumen: (v: T) => ReactNode;
  invalido?: boolean;
  vacio?: string;
  deshabilitado?: boolean;
}

/** Combobox accesible con búsqueda: la búsqueda la resuelve el backend (`?q=`). */
export function Combo<T>({
  id,
  valor,
  onCambio,
  placeholder,
  busqueda,
  setBusqueda,
  opciones,
  cargando,
  error,
  clave,
  render,
  resumen,
  invalido,
  vacio = 'Sin coincidencias',
  deshabilitado,
}: ComboProps<T>) {
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const listaId = useId();
  const lista = opciones ?? [];

  function elegir(v: T) {
    onCambio(v);
    setAbierto(false);
  }

  return (
    <Popover.Root open={abierto} onOpenChange={setAbierto}>
      <Popover.Trigger asChild disabled={deshabilitado}>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={abierto}
          aria-controls={listaId}
          aria-invalid={invalido || undefined}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-rule-strong bg-surface px-3 text-left text-[13px] hover:border-text-3 disabled:opacity-60 aria-[invalid=true]:border-danger',
            !valor && 'text-text-3',
          )}
        >
          <span className="min-w-0 flex-1 truncate">{valor ? resumen(valor) : placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-text-3" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-[1200] w-[var(--radix-popover-trigger-width)] min-w-72 rounded-md border border-rule bg-surface shadow-xl"
        >
          <div className="flex items-center gap-2 border-b border-rule px-3">
            <Search className="size-4 text-text-3" aria-hidden />
            <input
              autoFocus
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setActivo(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActivo((a) => Math.min(a + 1, lista.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActivo((a) => Math.max(a - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  // Mientras la búsqueda no termina, Enter no elige un resultado viejo.
                  if (!lista[activo] || cargando) return;
                  elegir(lista[activo]);
                }
              }}
              placeholder="Buscar…"
              aria-label="Buscar"
              aria-activedescendant={lista[activo] ? `${listaId}-${clave(lista[activo]!)}` : undefined}
              className="h-9 flex-1 bg-transparent text-[13px] outline-none placeholder:text-text-3"
            />
            {cargando && <Loader2 className="size-4 animate-spin text-text-3" role="status" aria-label="Buscando" />}
          </div>
          <ul id={listaId} role="listbox" className="scrollbar-thin max-h-72 overflow-y-auto p-1">
            {error ? (
              <li className="px-2 py-3 text-xs text-danger">{describirError(error)}</li>
            ) : lista.length === 0 && !cargando ? (
              <li className="px-2 py-3 text-xs text-text-3">{vacio}</li>
            ) : (
              lista.map((o, i) => {
                const sel = valor !== null && clave(valor) === clave(o);
                return (
                  <li
                    key={clave(o)}
                    id={`${listaId}-${clave(o)}`}
                    role="option"
                    aria-selected={sel}
                    onMouseEnter={() => setActivo(i)}
                    onClick={() => elegir(o)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[13px]',
                      i === activo && 'bg-neutral-soft',
                    )}
                  >
                    <Check className={cn('size-3.5 shrink-0 text-primary', !sel && 'invisible')} />
                    <div className="min-w-0 flex-1">{render(o)}</div>
                  </li>
                );
              })
            )}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function ClientePicker({
  id,
  valor,
  onCambio,
  soloActivos = true,
  invalido,
}: {
  id?: string;
  valor: Cliente | null;
  onCambio: (c: Cliente | null) => void;
  soloActivos?: boolean;
  invalido?: boolean;
}) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const r = useClientes({ q: dq || undefined, activo: soloActivos ? true : undefined, limite: 30 });
  return (
    <Combo
      id={id}
      valor={valor}
      onCambio={onCambio}
      placeholder="Buscar cliente por nombre, documento o código"
      busqueda={q}
      setBusqueda={setQ}
      opciones={r.data}
      cargando={r.isFetching || q !== dq}
      error={r.error}
      clave={(c) => c.id}
      invalido={invalido}
      vacio="Ningún cliente coincide. Regístrelo en Clientes."
      resumen={(c) => (
        <>
          {c.nombre} <span className="text-text-3">({c.codigo_cliente})</span>
        </>
      )}
      render={(c) => (
        <div>
          <div className="truncate font-medium">{c.nombre}</div>
          <div className="text-xs text-text-3">
            Código {c.codigo_cliente}
            {c.numero_documento ? `, ${c.tipo_documento ?? ''} ${c.numero_documento}` : ''}
          </div>
        </div>
      )}
    />
  );
}

export function UbicacionPicker({
  id,
  valor,
  onCambio,
  pais,
  invalido,
}: {
  id?: string;
  valor: Ubicacion | null;
  onCambio: (u: Ubicacion | null) => void;
  pais?: string;
  invalido?: boolean;
}) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const r = useUbicaciones({ q: dq || undefined, pais: pais || undefined, limite: 25 });
  return (
    <Combo
      id={id}
      valor={valor}
      onCambio={onCambio}
      placeholder="Ciudad o código (ej. CO-MTR)"
      busqueda={q}
      setBusqueda={setQ}
      opciones={r.data}
      cargando={r.isFetching || q !== dq}
      error={r.error}
      clave={(u) => u.id}
      invalido={invalido}
      resumen={(u) => (
        <>
          {u.nombre} <span className="text-text-3">{u.codigo}</span>
        </>
      )}
      render={(u) => (
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate">{u.etiqueta}</span>
          <span className="font-cond shrink-0 text-xs font-bold text-text-3">{u.codigo}</span>
        </div>
      )}
    />
  );
}

/** Selector de vehículo de la flota (la lista completa es pequeña: filtra en cliente). */
export function VehiculoPicker({
  id,
  valorId,
  onCambio,
  invalido,
  filtro,
}: {
  id?: string;
  valorId: string | null;
  onCambio: (v: Vehiculo | null) => void;
  invalido?: boolean;
  filtro?: (v: Vehiculo) => boolean;
}) {
  const [q, setQ] = useState('');
  const vs = useVehiculos();
  const cs = useConductores();
  const conductorDe = new Map((cs.data ?? []).filter((c) => c.vehiculo_id).map((c) => [c.vehiculo_id!, c]));
  const opciones = (vs.data ?? [])
    .filter((v) => (filtro ? filtro(v) : true))
    .filter((v) => coincide(q, v.placa, v.tipo, conductorDe.get(v.id)?.nombre))
    .sort((a, b) => a.placa.localeCompare(b.placa));
  const valor = (vs.data ?? []).find((v) => v.id === valorId) ?? null;
  return (
    <Combo
      id={id}
      valor={valor}
      onCambio={onCambio}
      placeholder="Elegir vehículo por placa o conductor"
      busqueda={q}
      setBusqueda={setQ}
      opciones={opciones}
      cargando={vs.isLoading}
      error={vs.error}
      clave={(v) => v.id}
      invalido={invalido}
      resumen={(v) => (
        <span className="inline-flex items-center gap-2">
          <Plate placa={v.placa} tamano="sm" /> {tipoVehiculo(v.tipo)}
        </span>
      )}
      render={(v) => (
        <div className="flex items-center gap-2">
          <Plate placa={v.placa} tamano="sm" />
          <span className="truncate">{tipoVehiculo(v.tipo)}</span>
          <span className="ml-auto truncate text-xs text-text-3">{conductorDe.get(v.id)?.nombre ?? 'Sin conductor'}</span>
        </div>
      )}
    />
  );
}
