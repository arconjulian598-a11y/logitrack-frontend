import { usePuede } from '@/app/auth';
import { ClipboardCheck, Map as MapIcon, Plus, Search, ShieldAlert, Snowflake } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { EstadoBadge, Tag } from '@/components/shared/Badge';
import { DataTable, type Columna } from '@/components/shared/DataTable';
import { Cifra, PageHeader, Panel } from '@/components/shared/Layout';
import { Plate } from '@/components/shared/Plate';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { useConductores, useVehiculos } from '@/hooks/queries';
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl';
import { COMBUSTIBLES, ESTADOS_VEHICULO, estadoVehiculo, TIPOS_VEHICULO, tipoVehiculo } from '@/lib/dominio';
import { fecha, num, numero } from '@/lib/format';
import type { Vehiculo } from '@/lib/types/api';
import { coincide } from '@/lib/utils';
import { DialogoVehiculo } from './FormVehiculo';
import { DialogoViabilidad } from './Viabilidad';

const CLAVES = ['q', 'estado', 'tipo', 'capacidad'] as const;

export default function VehiculosPage() {
  const editaFlota = usePuede('editarFlota');
  const { valores, set, limpiar } = useFiltrosUrl(CLAVES);
  const vehiculos = useVehiculos();
  const conductores = useConductores();
  const navigate = useNavigate();
  const [nuevo, setNuevo] = useState(false);
  const [viab, setViab] = useState(false);
  const conductorDe = useMemo(() => new Map((conductores.data ?? []).filter((c) => c.vehiculo_id).map((c) => [c.vehiculo_id!, c])), [conductores.data]);

  const lista = vehiculos.data ?? [];
  const filas = lista.filter(
    (v) =>
      coincide(valores.q, v.placa, conductorDe.get(v.id)?.nombre, v.tipo) &&
      (!valores.estado || v.estado === valores.estado) &&
      (!valores.tipo || v.tipo === valores.tipo) &&
      (!valores.capacidad ||
        (valores.capacidad === 'refrigeracion' && v.capacidad_refrigeracion) ||
        (valores.capacidad === 'hazmat' && v.certificado_hazmat) ||
        (valores.capacidad === 'sin_conductor' && !conductorDe.has(v.id))),
  );
  const n = (e: string) => lista.filter((v) => v.estado === e).length;
  const hoy = new Date().toISOString().slice(0, 10);

  const columnas: Columna<Vehiculo>[] = [
    { id: 'placa', titulo: 'Placa', celda: (v) => <Plate placa={v.placa} />, orden: (v) => v.placa },
    {
      id: 'tipo',
      titulo: 'Tipo',
      celda: (v) => (
        <div className="space-y-1">
          <div>{tipoVehiculo(v.tipo)}</div>
          <div className="flex gap-1">
            {v.capacidad_refrigeracion && (
              <Tag tono="info" icono={<Snowflake />}>
                Frío
              </Tag>
            )}
            {v.certificado_hazmat && (
              <Tag tono="danger" icono={<ShieldAlert />}>
                HAZMAT
              </Tag>
            )}
          </div>
        </div>
      ),
      orden: (v) => v.tipo,
    },
    { id: 'estado', titulo: 'Estado', celda: (v) => <EstadoBadge def={estadoVehiculo(v.estado)} />, orden: (v) => v.estado },
    {
      id: 'conductor',
      titulo: 'Conductor',
      celda: (v) => conductorDe.get(v.id)?.nombre ?? <span className="text-xs text-warn">Sin conductor: no recibe envíos</span>,
      orden: (v) => conductorDe.get(v.id)?.nombre,
      ocultarBajo: 'sm',
    },
    { id: 'kg', titulo: 'Capacidad', celda: (v) => `${numero(v.capacidad_kg)} kg${v.capacidad_m3 != null ? `, ${numero(v.capacidad_m3)} m³` : ''}`, orden: (v) => num(v.capacidad_kg), ocultarBajo: 'md' },
    { id: 'comb', titulo: 'Combustible', celda: (v) => (v.tipo_combustible ? COMBUSTIBLES[v.tipo_combustible] ?? v.tipo_combustible : '—'), ocultarBajo: 'lg' },
    {
      id: 'seguro',
      titulo: 'Seguro hasta',
      celda: (v) => <span className={v.vencimiento_seguro && v.vencimiento_seguro < hoy ? 'font-semibold text-danger' : ''}>{fecha(v.vencimiento_seguro)}</span>,
      orden: (v) => v.vencimiento_seguro,
      ocultarBajo: 'lg',
    },
    { id: 'anio', titulo: 'Año', celda: (v) => v.anio ?? '—', orden: (v) => v.anio, alinear: 'right', ocultarBajo: 'xl' },
  ];

  return (
    <>
      <PageHeader
        titulo="Vehículos"
        descripcion="Flota registrada. Un vehículo sin conductor nunca se asigna a envíos; el estado «en tránsito» lo pone y lo quita el sistema."
        acciones={
          <>
            <Button onClick={() => setViab(true)}>
              <ClipboardCheck /> Comprobar viabilidad
            </Button>
            <Button asChild>
              <Link to="/mapa">
                <MapIcon /> Ver en el mapa
              </Link>
            </Button>
            {editaFlota && (
              <Button variant="primary" onClick={() => setNuevo(true)}>
                <Plus /> Registrar vehículo
              </Button>
            )}
          </>
        }
      />
      <Panel cuerpo="px-3 py-3" className="mb-5">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Cifra valor={lista.length} etiqueta="Vehículos" />
          <Cifra valor={n('active')} etiqueta="Disponibles" tono="ok" />
          <Cifra valor={n('en_transito')} etiqueta="En tránsito" tono="primary" />
          <Cifra valor={n('en_mantenimiento')} etiqueta="En mantenimiento" tono={n('en_mantenimiento') ? 'warn' : undefined} />
          <Cifra valor={lista.filter((v) => !conductorDe.has(v.id)).length} etiqueta="Sin conductor" />
        </div>
      </Panel>
      <Panel cuerpo="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-rule p-3">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-3" />
            <Input value={valores.q} onChange={(e) => set('q', e.target.value)} placeholder="Placa o conductor" aria-label="Buscar vehículo" className="pl-8" />
          </div>
          <NativeSelect value={valores.estado} onChange={(e) => set('estado', e.target.value)} className="w-44" aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            {Object.entries(ESTADOS_VEHICULO).map(([k, v]) => (
              <option key={k} value={k}>
                {v.etiqueta}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={valores.tipo} onChange={(e) => set('tipo', e.target.value)} className="w-40" aria-label="Filtrar por tipo">
            <option value="">Todos los tipos</option>
            {Object.entries(TIPOS_VEHICULO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={valores.capacidad} onChange={(e) => set('capacidad', e.target.value)} className="w-44" aria-label="Filtrar por capacidad especial">
            <option value="">Cualquier capacidad</option>
            <option value="refrigeracion">Con refrigeración</option>
            <option value="hazmat">Certificado HAZMAT</option>
            <option value="sin_conductor">Sin conductor</option>
          </NativeSelect>
          {CLAVES.some((k) => valores[k]) && (
            <Button size="sm" variant="ghost" onClick={limpiar}>
              Limpiar
            </Button>
          )}
        </div>
        <DataTable
          etiqueta="Vehículos"
          filas={vehiculos.data ? filas : undefined}
          columnas={columnas}
          clave={(v) => v.id}
          cargando={vehiculos.isLoading}
          error={vehiculos.error}
          reintentar={() => vehiculos.refetch()}
          onFila={(v) => navigate(`/flota/vehiculos/${v.id}`)}
          ordenInicial={{ id: 'placa', dir: 'asc' }}
          vacio={<div className="py-10 text-center text-[13px] text-text-2">{lista.length ? 'Ningún vehículo coincide con los filtros.' : 'Aún no hay vehículos. Registre el primero.'}</div>}
        />
      </Panel>
      <DialogoVehiculo abierto={nuevo} onAbierto={setNuevo} />
      <DialogoViabilidad abierto={viab} onAbierto={setViab} />
    </>
  );
}
