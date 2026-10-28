import { limpioAlAbrir } from '@/lib/limpioAlAbrir';
import { usePuede } from '@/app/auth';
import { zodResolver } from '@hookform/resolvers/zod';
import type { LatLngBoundsExpression } from 'leaflet';
import { MapPin, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { CircleMarker, Tooltip as LTooltip, useMapEvents } from 'react-leaflet';
import { useSearchParams } from 'react-router';
import { z } from 'zod';
import { AjustarVista, BaseMap } from '@/components/map/BaseMap';
import { Badge } from '@/components/shared/Badge';
import { DataTable, type Columna } from '@/components/shared/DataTable';
import { ErrorFormulario, Field, FormActions } from '@/components/shared/Form';
import { aNumero, vacioANull } from '@/lib/formularios';
import { KeyValue, PageHeader, Panel } from '@/components/shared/Layout';
import { ErrorState, LoadingState } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, SheetContent } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Checkbox, Label } from '@/components/ui/misc';
import { usePaises, useUbicacion, useUbicaciones } from '@/hooks/queries';
import { useAccion } from '@/hooks/useAccion';
import { useDebounced, useFiltrosUrl } from '@/hooks/useFiltrosUrl';
import * as api from '@/lib/api/endpoints';
import { numero } from '@/lib/format';
import type { TipoUbicacion, Ubicacion } from '@/lib/types/api';

const TIPOS: Record<string, string> = { ciudad: 'Ciudad', capital: 'Capital', puerto: 'Puerto' };

const esquema = z.object({
  nombre: z.string().trim().min(2, { error: 'Mínimo 2 caracteres' }).max(100),
  departamento: z.string().trim().min(2, { error: 'Mínimo 2 caracteres' }).max(100),
  pais: z.string().trim().min(2, { error: 'Mínimo 2 caracteres' }).max(60),
  codigo_pais: z.string().trim().regex(/^[A-Za-z]{2}$/, { error: 'Dos letras (ISO), por ejemplo CO' }),
  latitud: z.string().trim().refine((v) => aNumero(v) !== null && Math.abs(aNumero(v)!) <= 90, { error: 'Entre -90 y 90' }),
  longitud: z.string().trim().refine((v) => aNumero(v) !== null && Math.abs(aNumero(v)!) <= 180, { error: 'Entre -180 y 180' }),
  tipo: z.enum(['ciudad', 'capital', 'puerto']),
  codigo: z.string().trim().refine((v) => v === '' || /^[A-Za-z0-9-]{3,12}$/.test(v), { error: 'De 3 a 12 caracteres (letras, números o guion)' }),
});
type Valores = z.infer<typeof esquema>;

function ClicEnMapa({ onClic }: { onClic: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClic(e.latlng.lat, e.latlng.lng) });
  return null;
}

function DialogoUbicacionFormulario({ abierto, onAbierto }: { abierto: boolean; onAbierto: (v: boolean) => void }) {
  const form = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: { nombre: '', departamento: '', pais: 'Colombia', codigo_pais: 'CO', latitud: '', longitud: '', tipo: 'ciudad', codigo: '' },
  });
  const a = useAccion({
    fn: (v: Valores) =>
      api.ubicaciones.crear({
        nombre: v.nombre,
        departamento: v.departamento,
        pais: v.pais,
        codigo_pais: v.codigo_pais.toUpperCase(),
        latitud: aNumero(v.latitud)!,
        longitud: aNumero(v.longitud)!,
        tipo: v.tipo,
        codigo: vacioANull(v.codigo)?.toUpperCase() ?? null,
      }),
    exito: (u) => `Ubicación ${u.codigo} agregada al catálogo.`,
    invalida: [['ubicaciones']],
    toastError: false,
    onSuccess: () => {
      onAbierto(false);
      form.reset();
    },
  });
  const e = form.formState.errors;
  const lat = aNumero(useWatch({ control: form.control, name: 'latitud' }));
  const lng = aNumero(useWatch({ control: form.control, name: 'longitud' }));
  return (
    <Dialog open={abierto} onOpenChange={onAbierto}>
      <DialogContent titulo="Agregar ubicación" descripcion="Haga clic en el mapa para tomar las coordenadas." ancho="max-w-3xl">
        <form className="grid gap-4 md:grid-cols-2" onSubmit={form.handleSubmit((v) => a.mutate(v))} noValidate>
          <div className="space-y-3">
            <Field label="Nombre" htmlFor="u-nombre" requerido error={e.nombre?.message}>
              <Input id="u-nombre" {...form.register('nombre')} aria-invalid={!!e.nombre} />
            </Field>
            <Field label="Departamento o región" htmlFor="u-dep" requerido error={e.departamento?.message}>
              <Input id="u-dep" {...form.register('departamento')} aria-invalid={!!e.departamento} />
            </Field>
            <div className="grid grid-cols-[1fr_90px] gap-3">
              <Field label="País" htmlFor="u-pais" requerido error={e.pais?.message}>
                <Input id="u-pais" {...form.register('pais')} />
              </Field>
              <Field label="Código" htmlFor="u-cp" requerido error={e.codigo_pais?.message}>
                <Input id="u-cp" {...form.register('codigo_pais')} className="uppercase" maxLength={2} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitud" htmlFor="u-lat" requerido error={e.latitud?.message}>
                <Input id="u-lat" inputMode="decimal" {...form.register('latitud')} aria-invalid={!!e.latitud} />
              </Field>
              <Field label="Longitud" htmlFor="u-lng" requerido error={e.longitud?.message}>
                <Input id="u-lng" inputMode="decimal" {...form.register('longitud')} aria-invalid={!!e.longitud} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo" htmlFor="u-tipo">
                <NativeSelect id="u-tipo" {...form.register('tipo')}>
                  {Object.entries(TIPOS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Código propio" htmlFor="u-cod" error={e.codigo?.message} ayuda="Opcional; si no, se genera (CO-MTR)">
                <Input id="u-cod" {...form.register('codigo')} className="uppercase" />
              </Field>
            </div>
          </div>
          <div className="h-72 overflow-hidden rounded-md border border-rule md:h-auto">
            <BaseMap className="size-full" etiqueta="Elegir coordenadas" zoom={5}>
              <ClicEnMapa
                onClic={(la, ln) => {
                  form.setValue('latitud', la.toFixed(5), { shouldValidate: true });
                  form.setValue('longitud', ln.toFixed(5), { shouldValidate: true });
                }}
              />
              {lat !== null && lng !== null && <CircleMarker center={[lat, lng]} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: '#2a5cff', fillOpacity: 1 }} />}
            </BaseMap>
          </div>
          <div className="md:col-span-2">
            <ErrorFormulario error={a.error} />
          </div>
          <div className="md:col-span-2">
            <FormActions>
              <Button type="button" variant="ghost" onClick={() => onAbierto(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" cargando={a.isPending}>
                Agregar ubicación
              </Button>
            </FormActions>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditarUbicacion({ u }: { u: Ubicacion }) {
  const [departamento, setDepartamento] = useState(u.departamento);
  const [tipo, setTipo] = useState<TipoUbicacion>(u.tipo as TipoUbicacion);
  const [activo, setActivo] = useState(u.activo);
  const a = useAccion({
    fn: () => api.ubicaciones.actualizar(u.id, { departamento, tipo, activo }),
    exito: 'Ubicación actualizada.',
    invalida: [['ubicaciones']],
    toastError: false,
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        a.mutate();
      }}
    >
      <p className="text-xs font-semibold text-text-2">Editar (solo departamento, tipo y estado)</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Departamento" htmlFor="ed-dep" error={departamento.trim().length < 2 ? 'Mínimo 2 caracteres' : undefined}>
          <Input id="ed-dep" value={departamento} onChange={(e) => setDepartamento(e.target.value)} />
        </Field>
        <Field label="Tipo" htmlFor="ed-tipo">
          <NativeSelect id="ed-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoUbicacion)}>
            {Object.entries(TIPOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="ed-act" checked={activo} onCheckedChange={(c) => setActivo(c === true)} />
        <Label htmlFor="ed-act">Activa (las inactivas no se ofrecen como origen o destino)</Label>
      </div>
      <ErrorFormulario error={a.error} />
      <Button type="submit" variant="primary" cargando={a.isPending} disabled={departamento.trim().length < 2}>
        Guardar cambios
      </Button>
    </form>
  );
}

function FichaUbicacion({ id }: { id: string }) {
  const edita = usePuede('editarUbicaciones');
  const u = useUbicacion(id);
  if (u.error) return <ErrorState error={u.error} />;
  if (!u.data) return <LoadingState />;
  const x = u.data;
  return (
    <div className="space-y-5">
      <KeyValue
        items={[
          { k: 'Código', v: <span className="font-cond font-bold">{x.codigo}</span> },
          { k: 'País', v: `${x.pais} (${x.codigo_pais})` },
          { k: 'Coordenadas', v: `${numero(x.latitud, 4)}, ${numero(x.longitud, 4)}`, ancho: true },
          { k: 'Etiqueta', v: x.etiqueta, ancho: true },
        ]}
      />
      <div className="h-48 overflow-hidden rounded-md border border-rule">
        <BaseMap className="size-full" etiqueta={`Mapa de ${x.nombre}`} centro={[x.latitud, x.longitud]} zoom={9}>
          <CircleMarker center={[x.latitud, x.longitud]} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: '#2a5cff', fillOpacity: 1 }} />
        </BaseMap>
      </div>
      {edita && <EditarUbicacion key={`${x.id}-${x.departamento}-${x.tipo}-${x.activo}`} u={x} />}
    </div>
  );
}

export default function UbicacionesPage() {
  const edita = usePuede('editarUbicaciones');
  const { valores, set } = useFiltrosUrl(['q', 'pais', 'tipo', 'inactivas'] as const);
  const [params, setParams] = useSearchParams();
  const sel = params.get('sel');
  const q = useDebounced(valores.q, 300);
  const paises = usePaises();
  const u = useUbicaciones({ q: q || undefined, pais: valores.pais || undefined, tipo: valores.tipo || undefined, incluir_inactivas: valores.inactivas === 'si', limite: 100 });
  const [nueva, setNueva] = useState(false);
  const abrir = (id: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (id) n.set('sel', id);
        else n.delete('sel');
        return n;
      },
      { replace: true },
    );
  const lista = u.data ?? [];
  const limites: LatLngBoundsExpression | null = lista.length ? lista.map((x) => [x.latitud, x.longitud] as [number, number]) : null;
  const columnas: Columna<Ubicacion>[] = [
    { id: 'codigo', titulo: 'Código', celda: (x) => <span className="font-cond font-bold">{x.codigo}</span>, orden: (x) => x.codigo },
    { id: 'nombre', titulo: 'Nombre', celda: (x) => x.nombre, orden: (x) => x.nombre },
    { id: 'dep', titulo: 'Departamento', celda: (x) => x.departamento, orden: (x) => x.departamento, ocultarBajo: 'md' },
    { id: 'pais', titulo: 'País', celda: (x) => x.pais, orden: (x) => x.pais, ocultarBajo: 'sm' },
    { id: 'tipo', titulo: 'Tipo', celda: (x) => TIPOS[x.tipo] ?? x.tipo, ocultarBajo: 'lg' },
    { id: 'activo', titulo: 'Estado', celda: (x) => (x.activo ? <Badge tono="ok">Activa</Badge> : <Badge tono="muted">Inactiva</Badge>), ocultarBajo: 'lg' },
  ];
  return (
    <>
      <PageHeader
        titulo="Ubicaciones"
        descripcion="Catálogo de lugares (Colombia y capitales de Sudamérica) que se usan como origen, destino y paradas."
        acciones={
          edita && (
            <Button variant="primary" onClick={() => setNueva(true)}>
              <Plus /> Agregar ubicación
            </Button>
          )
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel cuerpo="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-rule p-3">
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-3" />
              <Input value={valores.q} onChange={(e) => set('q', e.target.value)} placeholder="Nombre o código" aria-label="Buscar ubicación" className="pl-8" />
            </div>
            <NativeSelect value={valores.pais} onChange={(e) => set('pais', e.target.value)} className="w-44" aria-label="Filtrar por país">
              <option value="">Todos los países</option>
              {(paises.data ?? []).map((p) => (
                <option key={p.codigo_pais} value={p.codigo_pais}>
                  {p.pais} ({p.total})
                </option>
              ))}
            </NativeSelect>
            <NativeSelect value={valores.tipo} onChange={(e) => set('tipo', e.target.value)} className="w-32" aria-label="Filtrar por tipo">
              <option value="">Todo tipo</option>
              {Object.entries(TIPOS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox checked={valores.inactivas === 'si'} onCheckedChange={(c) => set('inactivas', c === true ? 'si' : '')} /> Incluir inactivas
            </label>
          </div>
          <DataTable
            etiqueta="Ubicaciones"
            filas={u.data}
            columnas={columnas}
            clave={(x) => x.id}
            cargando={u.isLoading}
            error={u.error}
            reintentar={() => u.refetch()}
            onFila={(x) => abrir(x.id)}
            pie={lista.length >= 100 ? 'El servicio devuelve como máximo 100; refine la búsqueda.' : undefined}
          />
        </Panel>
        <Panel titulo="Mapa del catálogo" descripcion={`${lista.length} ubicaciones visibles`} cuerpo="p-0" className="overflow-hidden">
          <div className="h-[520px]">
            <BaseMap className="size-full" etiqueta="Mapa de ubicaciones">
              <AjustarVista limites={limites} clave={`${valores.pais}-${valores.tipo}-${q}-${lista.length}`} maxZoom={8} />
              {lista.map((x) => (
                <CircleMarker
                  key={x.id}
                  center={[x.latitud, x.longitud]}
                  radius={x.tipo === 'capital' ? 7 : 5}
                  pathOptions={{ color: '#fff', weight: 1.5, fillColor: x.activo ? '#2a5cff' : '#6b7890', fillOpacity: 0.95 }}
                  eventHandlers={{ click: () => abrir(x.id) }}
                >
                  <LTooltip>
                    {x.nombre} ({x.codigo})
                  </LTooltip>
                </CircleMarker>
              ))}
            </BaseMap>
          </div>
        </Panel>
      </div>
      <DialogoUbicacion abierto={nueva} onAbierto={setNueva} />
      <Dialog open={!!sel} onOpenChange={(v) => !v && abrir(null)}>
        {sel && (
          <SheetContent titulo={lista.find((x) => x.id === sel)?.nombre ?? 'Ubicación'} descripcion={<span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> Detalle y edición</span>}>
            <FichaUbicacion id={sel} />
          </SheetContent>
        )}
      </Dialog>
    </>
  );
}

/** Cada vez que se abren, estos formularios empiezan limpios. */
const DialogoUbicacion = limpioAlAbrir(DialogoUbicacionFormulario);
