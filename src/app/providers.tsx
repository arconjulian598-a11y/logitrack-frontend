import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/misc';
import { ApiError } from '@/lib/api/errors';
import { AuthProvider } from './auth';

function reintentable(fallos: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    // 4xx son respuestas definitivas del backend; solo se reintenta red y 5xx.
    if (error.status >= 400 && error.status < 500) return false;
    // Las lecturas ya se reintentaron 3 veces (3, 6, 12 s) si el backend estaba despertando
    return fallos < 1;
  }
  return fallos < 2;
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache(),
  mutationCache: new MutationCache(),
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      retry: reintentable,
      retryDelay: (n) => Math.min(1000 * 2 ** n, 8000),
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>{children}</AuthProvider>
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{ style: { fontFamily: 'var(--font-sans)', fontSize: '13px' } }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
