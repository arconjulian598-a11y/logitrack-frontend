import { AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Label } from '@/components/ui/misc';
import { ApiError, describirError } from '@/lib/api/errors';
import { cn } from '@/lib/utils';

export function Field({
  label,
  htmlFor,
  error,
  ayuda,
  children,
  className,
  requerido,
}: {
  label: ReactNode;
  htmlFor?: string;
  error?: string;
  ayuda?: ReactNode;
  children: ReactNode;
  className?: string;
  requerido?: boolean;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {requerido && (
          <span className="ml-0.5 text-danger" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : (
        ayuda && <p className="text-xs text-text-3">{ayuda}</p>
      )}
    </div>
  );
}

/** Error de la API dentro de un formulario: muestra mensaje, motivos (`errores[]`) y validaciones. */
export function ErrorFormulario({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error instanceof ApiError ? error : null;
  return (
    <div role="alert" className="flex gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px]">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
      <div className="min-w-0 text-text">
        {e?.errores.length ? (
          <>
            <p className="font-semibold">{(e.cuerpo as { detail?: { mensaje?: string } })?.detail?.mensaje ?? 'Datos no válidos'}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-text-2">
              {e.errores.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="whitespace-pre-line">{describirError(error)}</p>
        )}
        {e?.codigo && <p className="mt-1 text-xs text-text-3">Código: {e.codigo}</p>}
      </div>
    </div>
  );
}

/** Confirmación explícita para acciones sensibles o irreversibles. */
export function ConfirmDialog({
  abierto,
  onAbierto,
  titulo,
  children,
  confirmar,
  onConfirmar,
  cargando,
  peligro,
  volver = 'Cancelar',
}: {
  abierto: boolean;
  onAbierto: (v: boolean) => void;
  titulo: string;
  children: ReactNode;
  confirmar: string;
  onConfirmar: () => void;
  cargando?: boolean;
  peligro?: boolean;
  /** Texto del botón que cierra sin hacer nada. */
  volver?: string;
}) {
  return (
    <Dialog open={abierto} onOpenChange={onAbierto}>
      <DialogContent titulo={titulo} ancho="max-w-md">
        <div className="space-y-4 text-[13px] text-text-2">
          {children}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => onAbierto(false)} disabled={cargando}>
              {volver}
            </Button>
            <Button variant={peligro ? 'danger' : 'primary'} onClick={onConfirmar} cargando={cargando}>
              {confirmar}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


export function FormActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2 border-t border-rule pt-4">{children}</div>;
}


