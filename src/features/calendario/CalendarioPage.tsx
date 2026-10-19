import { CalendarDays, RefreshCw, Split } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { usePuede } from '@/app/auth';
import { EstadoBadge, Tag } from '@/components/shared/Badge';
import { Codigo, PageHeader, Panel } from '@/components/shared/Layout';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/input';
import { Checkbox, Label } from '@/components/ui/misc';
import { useProgramados } from '@/hooks/queries';
import { estadoEnvio } from '@/lib/dominio';
import { config } from '@/lib/config';
import { hora, numero, pesos } from '@/lib/format';
import type { Envio } from '@/lib/types/api';
import { cn } from '@/lib/utils';
import { AccionesEnvio } from '../envios/AccionesEnvio';

const RANGOS = [
  { valor: '7', etiqueta: 'Próximos 7 días' },
  { valor: '30', etiqueta: 'Próximos 30 días' },
  { valor: 'todo', etiqueta: 'Todo lo programado' },
] as const;

const DIA = 24 * 3600 * 1000;

/** «2026-10-21» en hora de Colombia, para agrupar por día. */
function diaLocal(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: config.zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

function tituloDia(dia: string): string {
  const hoy = diaLocal(new Date().toISOString());
  const manana = diaLocal(new Date(Date.now() + DIA).toISOString());
  const fecha = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${dia}T12:00:00Z`));
  if (dia === hoy) return `Hoy, ${fecha}`;
  if (dia === manana) return `Mañana, ${fecha}`;
  return fecha.charAt(0).toUpperCase() + fecha.slice(1);
}

export default function CalendarioPage() {
  const gestiona = usePuede('cancelarReprogramar');
  const [rango, setRango] = useState<(typeof RANGOS)[number]['valor']>('30');
  const [activados, setActivados] = useState(false);
  // Se redondea al minuto para que la consulta no cambie en cada render
  const [ahora] = useState(() => Math.floor(Date.now() / 60000) * 60000);
  const filtro = useMemo(() => {
    const f: { desde?: string; hasta?: string; incluir_activados?: boolean; limite: number } = { limite: 500 };
    if (activados) {
      f.incluir_activados = true;
      f.desde = new Date(ahora - 30 * DIA).toISOString();
    }
    if (rango !== 'todo') f.hasta = new Date(ahora + Number(rango) * DIA).toISOString();
    return f;
  }, [rango, activados, ahora]);
  const q = useProgramados(filtro);

  const grupos = useMemo(() => {
    const mapa = new Map<string, Envio[]>();
    for (const e of [...(q.data ?? [])].sort((a, b) => (a.fecha_programada ?? '').localeCompare(b.fecha_programada ?? ''))) {
      if (!e.fecha_programada) continue;
      const d = diaLocal(e.fecha_programada);
      mapa.set(d, [...(mapa.get(d) ?? []), e]);
    }
    return [...mapa.entries()];
  }, [q.data]);

  return (
    <>
      <PageHeader
        titulo="Calendario"
        descripcion={
          gestiona
            ? 'Envíos programados para una fecha futura. Aún no tienen vehículo: a su hora el sistema los asigna solo. Desde aquí puede reprogramarlos o cancelarlos.'
            : 'Envíos programados para una fecha futura (solo lectura). A su hora el sistema los asigna solo.'
        }
        acciones={
          <Button onClick={() => q.refetch()} aria-label="Actualizar calendario">
            <RefreshCw className={cn(q.isFetching && 'animate-spin')} /> Actualizar
          </Button>
        }
      />
      <Panel cuerpo="p-0">
        <div className="flex flex-wrap items-center gap-4 border-b border-rule p-3">
          <NativeSelect value={rango} onChange={(e) => setRango(e.target.value as typeof rango)} className="w-52" aria-label="Rango de fechas">
            {RANGOS.map((r) => (
              <option key={r.valor} value={r.valor}>
                {r.etiqueta}
              </option>
            ))}
          </NativeSelect>
          <div className="flex items-center gap-2">
            <Checkbox id="activados" checked={activados} onCheckedChange={(c) => setActivados(c === true)} />
            <Label htmlFor="activados">Incluir los que ya salieron (últimos 30 días)</Label>
          </div>
          {q.data && (
            <span className="ml-auto text-xs text-text-2">
              {q.data.length} {q.data.length === 1 ? 'pedido' : 'pedidos'}
            </span>
          )}
        </div>
        {q.error ? (
          <ErrorState error={q.error} reintentar={() => q.refetch()} />
        ) : !q.data ? (
          <TableSkeleton filas={5} columnas={4} />
        ) : grupos.length === 0 ? (
          <EmptyState titulo="No hay envíos programados en este rango" icono={<CalendarDays />}>
            Al crear un envío se puede elegir una fecha y hora de salida; aparecerá aquí.
          </EmptyState>
        ) : (
          <div className="divide-y divide-rule">
            {grupos.map(([dia, envios]) => (
              <section key={dia} aria-label={tituloDia(dia)}>
                <h2 className="sticky top-14 z-10 bg-surface-2 px-4 py-2 text-xs font-semibold text-text-2">{tituloDia(dia)}</h2>
                <ul className="divide-y divide-rule">
                  {envios.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-[13px]">
                      <span className="w-14 shrink-0 font-cond text-base font-bold tabular-nums text-text">{hora(e.fecha_programada).slice(0, 5)}</span>
                      <div className="min-w-48 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Codigo to={`/envios/${e.id}`}>{e.codigo_envio}</Codigo>
                          <EstadoBadge def={estadoEnvio(e.estado)} />
                          {(e.partes_total ?? 0) > 0 && (
                            <Tag icono={<Split />}>{e.partes_total} partes</Tag>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-text-2">
                          {e.origen} hacia {e.destino} · {numero(e.peso_kg)} kg{e.monto_cop != null ? ` · ${pesos(e.monto_cop)}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <AccionesEnvio envio={e} />
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/envios/${e.id}`}>Ver</Link>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
