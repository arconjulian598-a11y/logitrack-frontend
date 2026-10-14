import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { EmptyState } from '@/components/shared/States';
import { Button } from '@/components/ui/button';

export function ErrorDeRuta() {
  const e = useRouteError();
  const titulo = isRouteErrorResponse(e) && e.status === 404 ? 'Página no encontrada' : 'La página no se pudo mostrar';
  return (
    <div className="p-8">
      <EmptyState
        titulo={titulo}
        accion={
          <Button asChild variant="primary">
            <Link to="/">Ir al panel de operación</Link>
          </Button>
        }
      >
        {e instanceof Error ? e.message : 'Revise la dirección o vuelva al inicio.'}
      </EmptyState>
    </div>
  );
}

export function NoEncontrada() {
  return (
    <EmptyState
      titulo="Esta página no existe"
      accion={
        <Button asChild variant="primary">
          <Link to="/">Ir al panel de operación</Link>
        </Button>
      }
    >
      La dirección no corresponde a ningún módulo de LogiTrack.
    </EmptyState>
  );
}
