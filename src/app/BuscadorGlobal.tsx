import { Loader2, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import * as api from '@/lib/api/endpoints';
import { ApiError, describirError } from '@/lib/api/errors';
import { permitido } from '@/lib/auth/permisos';
import { useRol } from './auth';
import { interpretarBusqueda } from './busqueda';

const RUTA_DE: Record<string, string> = {
  envio: '/envios/codigo/x',
  uuid: '/envios/x',
  ruta: '/rutas-maestras/codigo/x',
  ubicacion: '/ubicaciones/codigo/x',
  placa: '/vehiculos/placa/x',
  codigo10: '/clientes/codigo/x',
};

export function BuscadorGlobal({ onIr }: { onIr?: () => void }) {
  const [texto, setTexto] = useState('');
  const [buscando, setBuscando] = useState(false);
  const navigate = useNavigate();
  const rol = useRol();
  const soloEnvios = rol === 'cliente';

  async function ir(e: FormEvent) {
    e.preventDefault();
    const d = interpretarBusqueda(texto);
    if (d.tipo === 'desconocido') {
      toast.info(
        soloEnvios
          ? 'Escriba el código de un envío (ENV-…).'
          : 'Escriba un código de envío (ENV-…), de ruta (RUT-…), una placa, un código de ubicación (CO-MTR) o un código de cliente o conductor.',
      );
      return;
    }
    const ruta = RUTA_DE[d.tipo];
    const puedeConductor = d.tipo === 'codigo10' && permitido(rol, 'GET', '/conductores/codigo/x');
    if (ruta && !permitido(rol, 'GET', ruta) && !puedeConductor) {
      toast.info(soloEnvios ? 'Solo puede buscar sus envíos (ENV-…).' : 'Su rol no tiene acceso a ese tipo de registro.');
      return;
    }
    setBuscando(true);
    try {
      if (d.tipo === 'envio') navigate(`/envios/${(await api.envios.porCodigo(d.codigo)).id}`);
      else if (d.tipo === 'ruta') navigate(`/rutas/maestras/${(await api.rutasMaestras.porCodigo(d.codigo)).id}`);
      else if (d.tipo === 'ubicacion') navigate(`/ubicaciones?sel=${(await api.ubicaciones.porCodigo(d.codigo)).id}`);
      else if (d.tipo === 'placa') navigate(`/flota/vehiculos/${(await api.vehiculos.porPlaca(d.placa)).id}`);
      else if (d.tipo === 'uuid') navigate(`/envios/${(await api.envios.obtener(d.id)).id}`);
      else if (d.tipo === 'codigo10') {
        let encontrado = false;
        if (permitido(rol, 'GET', '/clientes/codigo/x') && rol !== 'cliente') {
          try {
            navigate(`/clientes/${(await api.clientes.porCodigo(d.codigo)).id}`);
            encontrado = true;
          } catch (err) {
            if (!(err instanceof ApiError && err.status === 404) || !puedeConductor) throw err;
          }
        }
        if (!encontrado) navigate(`/flota/conductores/${(await api.conductores.porCodigo(d.codigo)).id}`);
      }
      setTexto('');
      onIr?.();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) toast.warning(`No se encontró «${texto.trim()}».`);
      else toast.error(describirError(err));
    } finally {
      setBuscando(false);
    }
  }

  return (
    <form onSubmit={ir} role="search" className="relative w-full max-w-sm">
      {buscando ? (
        <Loader2 className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-text-3" />
      ) : (
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-3" />
      )}
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={soloEnvios ? 'Ir a un envío: ENV-…' : 'Ir a ENV-…, RUT-…, placa o código'}
        aria-label="Buscar por código de envío, ruta, placa, ubicación, cliente o conductor"
        className="h-9 w-full rounded-md border border-rule bg-surface-2 pl-8 pr-3 text-[13px] placeholder:text-text-3 focus-visible:border-primary focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
      />
    </form>
  );
}
