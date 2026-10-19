import { usePuede } from '@/app/auth';
import { Plus, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Badge, EstadoBadge, Tag } from '@/components/shared/Badge';
import { DataTable, type Columna } from '@/components/shared/DataTable';
import { PageHeader, Panel } from '@/components/shared/Layout';
import { Plate } from '@/components/shared/Plate';
import { ErrorState, LoadingState } from '@/components/shared/States';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { useAuditoriaVinculos, useConductores, useVehiculos } from '@/hooks/queries';
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl';
import { ESTADOS_CONDUCTOR, estadoConductor, tipoVehiculo } from '@/lib/dominio';
import { num, numero } from '@/lib/format';
import type { AuditoriaVinculo, Conductor } from '@/lib/types/api';
import { coincide } from '@/lib/utils';
import { DialogoConductor } from './FormConductor';

function Lista() {
  const { valores, set } = useFiltrosUrl(['q', 'estado', 'vinculo'] as const);
  const conductores = useConductores();
  const vehiculos = useVehiculos();
  const navigate = useNavigate();
  const placa = useMemo(() => new Map((vehiculos.data ?? []).map((v) => [v.id, v.placa])), [vehiculos.data]);
  const filas = (conductores.data ?? []).filter(
    (c) =>
      coincide(valores.q, c.nombre, c.codigo_conductor, c.licencia_numero, c.vehiculo_id ? placa.get(c.vehiculo_id) : null) &&
      (!valores.estado || c.estado === valores.estado) &&
      (!valores.vinculo || (valores.vinculo === 'con' ? !!c.vehiculo_id : !c.vehiculo_id)),
  );
  const columnas: Columna<Conductor>[] = [
    { id: 'nombre', titulo: 'Conductor', celda: (c) => <span className="font-medium">{c.nombre}</span>, orden: (c) => c.nombre },
    { id: 'codigo', titulo: 'Código', celda: (c) => <span className="font-cond tabular font-bold">{c.codigo_conductor}</span>, orden: (c) => c.codigo_conductor, ocultarBajo: 'md' },
    { id: 'estado', titulo: 'Estado', celda: (c) => <EstadoBadge def={estadoConductor(c.estado)} />, orden: (c) => c.estado },
    { id: 'vehiculo', titulo: 'Vehículo', celda: (c) => (c.vehiculo_id ? <Plate placa={placa.get(c.vehiculo_id)} tamano="sm" /> : <span className="text-xs text-text-3">Sin vehículo</span>), orden: (c) => (c.vehiculo_id ? placa.get(c.vehiculo_id) : null) },
    {
      id: 'licencia',
      titulo: 'Licencia',
      celda: (c) => (
        <span className="inline-flex flex-wrap items-center gap-1">
          <span className="font-cond font-bold">{c.categorias_licencia ?? '—'}</span>
          {c.certificacion_hazmat && <Tag tono="danger">HAZMAT</Tag>}
        </span>
      ),
      ocultarBajo: 'sm',
    },
    { id: 'exp', titulo: 'Experiencia', celda: (c) => `${c.anios_experiencia} año(s)`, orden: (c) => c.anios_experiencia, alinear: 'right', ocultarBajo: 'lg' },
    { id: 'horas', titulo: 'Horas por semana', celda: (c) => numero(c.horas_semanales, 1), orden: (c) => num(c.horas_semanales), alinear: 'right', ocultarBajo: 'xl' },
  ];
  return (
    <Panel cuerpo="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-rule p-3">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-3" />
          <Input value={valores.q} onChange={(e) => set('q', e.target.value)} placeholder="Nombre, código, licencia o placa" aria-label="Buscar conductor" className="pl-8" />
        </div>
        <NativeSelect value={valores.estado} onChange={(e) => set('estado', e.target.value)} className="w-40" aria-label="Filtrar por estado">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS_CONDUCTOR).map(([k, v]) => (
            <option key={k} value={k}>
              {v.etiqueta}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={valores.vinculo} onChange={(e) => set('vinculo', e.target.value)} className="w-44" aria-label="Filtrar por vehículo">
          <option value="">Con y sin vehículo</option>
          <option value="con">Con vehículo</option>
          <option value="sin">Sin vehículo</option>
        </NativeSelect>
      </div>
      <DataTable
        etiqueta="Conductores"
        filas={conductores.data ? filas : undefined}
        columnas={columnas}
        clave={(c) => c.id}
        cargando={conductores.isLoading}
        error={conductores.error}
        reintentar={() => conductores.refetch()}
        onFila={(c) => navigate(`/flota/conductores/${c.id}`)}
        ordenInicial={{ id: 'nombre', dir: 'asc' }}
      />
    </Panel>
  );
}

function Auditoria() {
  const a = useAuditoriaVinculos();
  if (a.error) return <ErrorState error={a.error} reintentar={() => a.refetch()} />;
  if (!a.data) return <LoadingState />;
  const invalidos = a.data.filter((x) => !x.valido).length;
  const columnas: Columna<AuditoriaVinculo>[] = [
    { id: 'conductor', titulo: 'Conductor', celda: (x) => `${x.nombre} (${x.codigo_conductor})`, orden: (x) => x.nombre },
    { id: 'vehiculo', titulo: 'Vehículo', celda: (x) => <span className="inline-flex items-center gap-2"><Plate placa={x.placa} tamano="sm" /> {tipoVehiculo(x.tipo)}</span>, orden: (x) => x.placa },
    { id: 'valido', titulo: 'Resultado', celda: (x) => (x.valido ? <Badge tono="ok">Cumple</Badge> : <Badge tono="danger">No cumple</Badge>), orden: (x) => (x.valido ? 1 : 0) },
    { id: 'errores', titulo: 'Motivos', celda: (x) => (x.errores.length ? <ul className="list-disc pl-4 text-xs text-text-2">{x.errores.map((e) => <li key={e}>{e}</li>)}</ul> : '—') },
  ];
  return (
    <Panel
      titulo="Auditoría de vínculos conductor y vehículo"
      descripcion={`Revisa cada vínculo existente contra las reglas actuales de licencia, experiencia y HAZMAT. ${invalidos} vínculo(s) no cumplen.`}
      acciones={
        <Button size="sm" onClick={() => a.refetch()} cargando={a.isFetching}>
          <ShieldCheck /> Volver a auditar
        </Button>
      }
      cuerpo="p-0"
    >
      <DataTable etiqueta="Auditoría de vínculos" filas={a.data} columnas={columnas} clave={(x) => String(x.codigo_conductor)} ordenInicial={{ id: 'valido', dir: 'asc' }} />
    </Panel>
  );
}

export default function ConductoresPage() {
  const editaFlota = usePuede('editarFlota');
  const [nuevo, setNuevo] = useState(false);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'lista';
  return (
    <>
      <PageHeader
        titulo="Conductores"
        descripcion="Cada conductor se liga de forma permanente a un vehículo. Al ligarlos se valida licencia, experiencia y certificación HAZMAT."
        acciones={
          editaFlota && (
            <Button variant="primary" onClick={() => setNuevo(true)}>
              <Plus /> Registrar conductor
            </Button>
          )
        }
      />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList className="mb-1">
          <TabsTrigger value="lista">Conductores</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoría de vínculos</TabsTrigger>
        </TabsList>
        <TabsContent value="lista">
          <Lista />
        </TabsContent>
        <TabsContent value="auditoria">
          <Auditoria />
        </TabsContent>
      </Tabs>
      <DialogoConductor abierto={nuevo} onAbierto={setNuevo} />
    </>
  );
}
