import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Badge } from '@/components/shared/Badge';
import { DataTable, type Columna } from '@/components/shared/DataTable';
import { PageHeader, Panel } from '@/components/shared/Layout';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { useClientes } from '@/hooks/queries';
import { useDebounced, useFiltrosUrl } from '@/hooks/useFiltrosUrl';
import { fecha } from '@/lib/format';
import type { Cliente } from '@/lib/types/api';
import { DialogoCliente } from './FormCliente';

export default function ClientesPage() {
  const { valores, set } = useFiltrosUrl(['q', 'activo', 'limite'] as const);
  const q = useDebounced(valores.q, 300);
  const limite = Number(valores.limite) || 50;
  const clientes = useClientes({ q: q || undefined, activo: valores.activo === '' ? undefined : valores.activo === 'si', limite });
  const [nuevo, setNuevo] = useState(false);
  const navigate = useNavigate();
  const columnas: Columna<Cliente>[] = [
    { id: 'nombre', titulo: 'Cliente', celda: (c) => <span className="font-medium">{c.nombre}</span>, orden: (c) => c.nombre },
    { id: 'codigo', titulo: 'Código', celda: (c) => <span className="font-cond tabular font-bold">{c.codigo_cliente}</span>, orden: (c) => c.codigo_cliente },
    { id: 'doc', titulo: 'Documento', celda: (c) => (c.numero_documento ? `${c.tipo_documento} ${c.numero_documento}` : '—'), ocultarBajo: 'md' },
    { id: 'contacto', titulo: 'Contacto', celda: (c) => <span className="text-text-2">{c.email ?? c.telefono ?? '—'}</span>, ocultarBajo: 'lg' },
    {
      id: 'estado',
      titulo: 'Estado',
      celda: (c) => (
        <span className="flex gap-1">
          {c.activo ? <Badge tono="ok">Activo</Badge> : <Badge tono="muted">Inactivo</Badge>}
          {c.es_historico && <Badge tono="neutral" punto={false}>Histórico</Badge>}
        </span>
      ),
      orden: (c) => (c.activo ? 1 : 0),
    },
    { id: 'creado', titulo: 'Registrado', celda: (c) => fecha(c.creado_en), orden: (c) => c.creado_en, ocultarBajo: 'xl' },
  ];
  return (
    <>
      <PageHeader
        titulo="Clientes"
        descripcion="Un envío solo puede crearse para un cliente existente y activo. Desde la ficha se gestionan su tarifa y sus preferencias de notificación."
        acciones={
          <Button variant="primary" onClick={() => setNuevo(true)}>
            <Plus /> Registrar cliente
          </Button>
        }
      />
      <Panel cuerpo="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-rule p-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-3" />
            <Input value={valores.q} onChange={(e) => set('q', e.target.value)} placeholder="Nombre, documento o código" aria-label="Buscar cliente" className="pl-8" />
          </div>
          <NativeSelect value={valores.activo} onChange={(e) => set('activo', e.target.value)} className="w-40" aria-label="Filtrar por estado">
            <option value="">Activos e inactivos</option>
            <option value="si">Activos</option>
            <option value="no">Inactivos</option>
          </NativeSelect>
          <NativeSelect value={String(limite)} onChange={(e) => set('limite', e.target.value)} className="w-32" aria-label="Máximo de resultados">
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>
                Hasta {n}
              </option>
            ))}
          </NativeSelect>
        </div>
        <DataTable
          etiqueta="Clientes"
          filas={clientes.data}
          columnas={columnas}
          clave={(c) => c.id}
          cargando={clientes.isLoading}
          error={clientes.error}
          reintentar={() => clientes.refetch()}
          onFila={(c) => navigate(`/clientes/${c.id}`)}
          pie={clientes.data && clientes.data.length >= limite ? `Se muestran los primeros ${limite}; refine la búsqueda.` : undefined}
        />
      </Panel>
      <DialogoCliente abierto={nuevo} onAbierto={setNuevo} />
    </>
  );
}
