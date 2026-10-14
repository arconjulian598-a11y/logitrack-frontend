import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

function Overlay() {
  return (
    <DialogPrimitive.Overlay className="fixed inset-0 z-[1100] bg-ink/45 backdrop-blur-[1px] data-[state=open]:animate-in" />
  );
}

/** Diálogo centrado (formularios y confirmaciones). */
export function DialogContent({
  titulo,
  descripcion,
  children,
  className,
  ancho = 'max-w-lg',
}: {
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  ancho?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-[1100] flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-rule bg-surface shadow-2xl focus-visible:outline-none',
          ancho,
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-base font-bold text-text">{titulo}</DialogPrimitive.Title>
            {descripcion ? (
              <DialogPrimitive.Description className="mt-1 text-[13px] text-text-2">{descripcion}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{String(titulo)}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close className="-mr-1 rounded-md p-1 text-text-3 hover:bg-neutral-soft hover:text-text" aria-label="Cerrar">
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Panel lateral derecho (fichas y detalle sin salir de la lista). */
export function SheetContent({
  titulo,
  descripcion,
  children,
  acciones,
  className,
}: {
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  children: React.ReactNode;
  acciones?: React.ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-y-0 right-0 z-[1100] flex w-full max-w-xl flex-col border-l border-rule bg-surface shadow-2xl focus-visible:outline-none',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-base font-bold text-text">{titulo}</DialogPrimitive.Title>
            {descripcion ? (
              <DialogPrimitive.Description className="mt-0.5 text-[13px] text-text-2">{descripcion}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">Detalle</DialogPrimitive.Description>
            )}
          </div>
          <div className="flex items-center gap-1">
            {acciones}
            <DialogPrimitive.Close className="rounded-md p-1.5 text-text-3 hover:bg-neutral-soft hover:text-text" aria-label="Cerrar">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
