import { useState } from 'react';
import { ErrorFormulario, Field } from '@/components/shared/Form';
import { KeyValue } from '@/components/shared/Layout';
import { ErrorState, LoadingState, Nota } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { es404, useTarifa } from '@/hooks/queries';
import { useAccion } from '@/hooks/useAccion';
import * as api from '@/lib/api/endpoints';
import { MODELOS_TARIFA } from '@/lib/dominio';
import { pesos } from '@/lib/format';
import { aNumero } from '@/lib/formularios';
import type { ModeloTarifa, Tarifa } from '@/lib/types/api';
import { cn } from '@/lib/utils';

function FormTarifa({ clienteId, actual, onCancelar, onGuardada }: { clienteId: string; actual: Tarifa | null; onCancelar?: () => void; onGuardada: () => void }) {
  const [modelo, setModelo] = useState<ModeloTarifa>((actual?.modelo as ModeloTarifa) ?? 'por_envio');
  const [valor, setValor] = useState(actual ? String(Number(actual.valor)) : '');
  const a = useAccion({
    fn: () => api.facturacion.definirTarifa({ cliente_id: clienteId, modelo, valor: aNumero(valor)! }),
    exito: 'Tarifa guardada.',
    invalida: [['tarifas', clienteId]],
    toastError: false,
    onSuccess: onGuardada,
  });
  const valido = (aNumero(valor) ?? -1) > 0;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valido) a.mutate();
      }}
    >
      {!actual && <Nota>Este cliente no tiene tarifa configurada: Facturación usa «por envío» con su valor por defecto.</Nota>}
      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold">Modelo de cobro</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(MODELOS_TARIFA) as ModeloTarifa[]).map((m) => (
            <label
              key={m}
              className={cn(
                'cursor-pointer rounded-md border p-3 text-[13px] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40',
                modelo === m ? 'border-primary bg-primary-soft' : 'border-rule hover:border-text-3',
              )}
            >
              <input type="radio" name={`modelo-${clienteId}`} value={m} checked={modelo === m} onChange={() => setModelo(m)} className="sr-only" />
              <span className="block font-semibold">{MODELOS_TARIFA[m]!.etiqueta}</span>
              <span className="block text-xs text-text-2">{MODELOS_TARIFA[m]!.ayuda}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label={`Valor (${MODELOS_TARIFA[modelo]!.unidad})`} htmlFor={`valor-${clienteId}`} error={valor && !valido ? 'Debe ser mayor que 0' : undefined}>
        <Input id={`valor-${clienteId}`} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className="max-w-56" />
      </Field>
      <ErrorFormulario error={a.error} />
      <div className="flex gap-2">
        {onCancelar && (
          <Button type="button" variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={!valido} cargando={a.isPending}>
          Guardar tarifa
        </Button>
      </div>
    </form>
  );
}

/** Consulta y define el modelo de cobro de un cliente (GET/POST /tarifas). */
export function EditorTarifa({ clienteId }: { clienteId: string }) {
  const t = useTarifa(clienteId);
  const [editando, setEditando] = useState(false);
  const sinTarifa = !!t.error && es404(t.error);

  if (t.isLoading) return <LoadingState />;
  if (t.error && !sinTarifa) return <ErrorState error={t.error} compacto reintentar={() => t.refetch()} />;

  if (t.data && !editando) {
    const def = MODELOS_TARIFA[t.data.modelo];
    return (
      <div className="space-y-3">
        <KeyValue
          items={[
            { k: 'Modelo', v: def?.etiqueta ?? t.data.modelo },
            { k: 'Valor', v: <span className="font-cond text-lg font-bold">{pesos(t.data.valor)}</span> },
            { k: 'Cómo se cobra', v: def?.ayuda ?? '—', ancho: true },
          ]}
        />
        <Button size="sm" onClick={() => setEditando(true)}>
          Cambiar tarifa
        </Button>
      </div>
    );
  }
  return (
    <FormTarifa
      key={t.data ? `${t.data.modelo}-${t.data.valor}` : 'nueva'}
      clienteId={clienteId}
      actual={t.data ?? null}
      onCancelar={t.data ? () => setEditando(false) : undefined}
      onGuardada={() => setEditando(false)}
    />
  );
}
