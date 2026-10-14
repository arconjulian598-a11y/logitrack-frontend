import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/**
 * Placa de vehículo con el lenguaje de las placas colombianas (amarilla, letra negra condensada).
 * Es el elemento de identidad de LogiTrack: aparece donde se menciona un vehículo.
 */
export function Plate({
  placa,
  vehiculoId,
  tamano = 'md',
  className,
}: {
  placa: string | null | undefined;
  vehiculoId?: string | null;
  tamano?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  if (!placa) return <span className="text-text-3">—</span>;
  const clases = cn(
    'font-cond inline-flex items-center rounded-[3px] border border-[#111] bg-plate font-bold tracking-wide text-plate-ink tabular',
    tamano === 'sm' && 'h-[18px] px-1 text-[11px] leading-none',
    tamano === 'md' && 'h-[22px] px-1.5 text-[13px] leading-none',
    tamano === 'lg' && 'h-8 px-2.5 text-lg leading-none shadow-[inset_0_0_0_2px_#f5c400,inset_0_0_0_3px_#111]',
    className,
  );
  const texto = placa.length === 6 ? `${placa.slice(0, 3)}${' '}${placa.slice(3)}` : placa;
  if (vehiculoId) {
    return (
      <Link to={`/flota/vehiculos/${vehiculoId}`} className={cn(clases, 'hover:brightness-95')} aria-label={`Vehículo ${placa}`}>
        {texto}
      </Link>
    );
  }
  return (
    <span className={clases} aria-label={`Placa ${placa}`}>
      {texto}
    </span>
  );
}
