import type { ReactNode } from 'react';
import { config } from '@/lib/config';

/** Fondo y logo de las pantallas sin sesión (inicio de sesión y registro). */
export function MarcoAcceso({ children, ancho = 'max-w-[400px]' }: { children: ReactNode; ancho?: string }) {
  const host = (() => {
    try {
      return new URL(config.gatewayDestino).host;
    } catch {
      return config.gatewayDestino;
    }
  })();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-sidebar px-4 py-10">
      <div className={`w-full ${ancho}`}>
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <svg viewBox="0 0 32 32" className="size-9" aria-hidden>
            <rect width="32" height="32" rx="7" fill="#fff" fillOpacity="0.08" />
            <path d="M7 21.5h3.2V10.5H7zM12.6 21.5h8.6v-2.7h-5.4v-8.3h-3.2z" fill="#fff" />
            <circle cx="24" cy="12" r="3" fill="#5b82ff" />
          </svg>
          <span className="font-cond text-2xl font-bold tracking-wide text-white">LogiTrack</span>
        </div>
        {children}
        <p className="mt-4 text-center text-[11.5px] text-sidebar-text/60">Servidor: {host}</p>
      </div>
    </div>
  );
}
