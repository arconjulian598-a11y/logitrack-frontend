import { limpioAlAbrir } from '@/lib/limpioAlAbrir';
import { Pencil, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useUsuario } from '@/app/auth';
import { Badge } from '@/components/shared/Badge';
import { DataTable, type Columna } from '@/components/shared/DataTable';
import { ErrorFormulario, Field, FormActions } from '@/components/shared/Form';
import { PageHeader, Panel } from '@/components/shared/Layout';
import { ClientePicker } from '@/components/shared/Pickers';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Label, Switch } from '@/components/ui/misc';
import { useUsuarios } from '@/hooks/queries';
import { useAccion } from '@/hooks/useAccion';
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl';
import * as api from '@/lib/api/endpoints';
import { NOMBRE_ROL, ROLES, type Rol } from '@/lib/auth/permisos';
import type { Usuario } from '@/lib/auth/sesion';
import { fechaHora, relativo } from '@/lib/format';
import type { Cliente } from '@/lib/types/api';
import { coincide } from '@/lib/utils';

const TONO_ROL: Record<Rol, 'neutral' | 'info' | 'primary' | 'warn'> = {
  cliente: 'neutral',
  operador: 'info',
  gestor_flota: 'primary',
  administrador: 'warn',
};

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function DialogoCrearFormulario({ abierto, onAbierto }: { abierto: boolean; onAbierto: (v: boolean) => void }) {
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState<Rol>('operador');
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const a = useAccion({
    fn: () =>
      api.usuarios.crear({
        email: email.trim().toLowerCase(),
        nombre: nombre.trim(),
        password,
        rol,
        ...(rol === 'cliente' && cliente ? { cliente_id: cliente.id } : {}),
      }),
    exito: (u) => `Cuenta de ${u.nombre} creada (${NOMBRE_ROL[u.rol]}).`,
    invalida: [['usuarios']],
    toastError: false,
    onSuccess: () => {
      setEmail('');
      setNombre('');
      setPassword('');
      setCliente(null);
      onAbierto(false);
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!EMAIL.test(email.trim())) err.email = 'Escriba un correo válido.';
    if (nombre.trim().length < 2) err.nombre = 'Escriba el nombre (mínimo 2 caracteres).';
    if (password.length < 8) err.password = 'Mínimo 8 caracteres.';
    if (rol === 'cliente' && !cliente) err.cliente = 'Elija la empresa cliente de esta cuenta.';
    setErrores(err);
    if (Object.keys(err).length === 0) a.mutate();
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        if (!v) {
          a.reset();
          setErrores({});
        }
        onAbierto(v);
      }}
    >
      <DialogContent titulo="Nueva cuenta" descripcion="La persona entra con este correo y contraseña. Una cuenta de cliente solo ve lo de su empresa.">
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <Field label="Nombre" htmlFor="u-nombre" requerido error={errores.nombre}>
            <Input id="u-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" aria-invalid={!!errores.nombre || undefined} autoFocus />
          </Field>
          <Field label="Correo" htmlFor="u-email" requerido error={errores.email}>
            <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" aria-invalid={!!errores.email || undefined} />
          </Field>
          <Field label="Contraseña inicial" htmlFor="u-password" requerido error={errores.password} ayuda="Mínimo 8 caracteres. Compártala por un medio seguro.">
            <Input id="u-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" aria-invalid={!!errores.password || undefined} />
          </Field>
          <Field label="Rol" htmlFor="u-rol" requerido>
            <NativeSelect id="u-rol" value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {NOMBRE_ROL[r]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {rol === 'cliente' && (
            <Field label="Empresa cliente" htmlFor="u-cliente" requerido error={errores.cliente}>
              <ClientePicker id="u-cliente" valor={cliente} onCambio={setCliente} invalido={!!errores.cliente} />
            </Field>
          )}
          <ErrorFormulario error={a.error} />
          <FormActions>
            <Button type="button" variant="ghost" onClick={() => onAbierto(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" cargando={a.isPending}>
              Crear cuenta
            </Button>
          </FormActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoEditarFormulario({ usuario, onCerrar }: { usuario: Usuario | null; onCerrar: () => void }) {
  const yo = useUsuario();
  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [password, setPassword] = useState('');
  const [activo, setActivo] = useState(usuario?.activo ?? true);
  const [error, setError] = useState<string | null>(null);
  const a = useAccion({
    fn: () =>
      api.usuarios.actualizar(usuario!.id, {
        ...(nombre.trim() !== usuario!.nombre ? { nombre: nombre.trim() } : {}),
        ...(password ? { password } : {}),
        ...(activo !== usuario!.activo ? { activo } : {}),
      }),
    exito: (u) => `Cuenta de ${u.nombre} actualizada.`,
    invalida: [['usuarios']],
    toastError: false,
    onSuccess: onCerrar,
  });
  const esYo = usuario?.id === yo.id;

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (nombre.trim().length < 2) return setError('Escriba el nombre (mínimo 2 caracteres).');
    if (password && password.length < 8) return setError('La nueva contraseña debe tener mínimo 8 caracteres.');
    setError(null);
    a.mutate();
  }

  return (
    <Dialog open={!!usuario} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent titulo={`Editar cuenta de ${usuario?.nombre ?? ''}`} descripcion={`${usuario?.email ?? ''} · ${usuario ? NOMBRE_ROL[usuario.rol] : ''}. El correo y el rol no se cambian.`}>
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <Field label="Nombre" htmlFor="e-nombre" requerido>
            <Input id="e-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </Field>
          <Field label="Nueva contraseña" htmlFor="e-password" ayuda="Déjela vacía para no cambiarla.">
            <Input id="e-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <div className="flex items-start gap-3">
            <Switch id="e-activo" checked={activo} onCheckedChange={setActivo} disabled={esYo} />
            <div>
              <Label htmlFor="e-activo">Cuenta activa</Label>
              <p className="text-xs text-text-3">
                {esYo ? 'No puede desactivar su propia cuenta.' : 'Una cuenta desactivada ya no puede iniciar sesión.'}
              </p>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
          <ErrorFormulario error={a.error} />
          <FormActions>
            <Button type="button" variant="ghost" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" cargando={a.isPending}>
              Guardar cambios
            </Button>
          </FormActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const CLAVES = ['rol', 'q'] as const;

export default function UsuariosPage() {
  const { valores, set } = useFiltrosUrl(CLAVES);
  const q = useUsuarios({ rol: valores.rol || undefined, limite: 500 });
  const [crear, setCrear] = useState(false);
  const [editar, setEditar] = useState<Usuario | null>(null);
  const filas = (q.data ?? []).filter((u) => coincide(valores.q, u.nombre, u.email, u.codigo_cliente ? String(u.codigo_cliente) : null));

  const columnas: Columna<Usuario>[] = [
    {
      id: 'nombre',
      titulo: 'Nombre',
      celda: (u) => (
        <div className="min-w-40">
          <div className="font-medium text-text">{u.nombre}</div>
          <div className="text-xs text-text-2">{u.email}</div>
        </div>
      ),
      orden: (u) => u.nombre,
    },
    { id: 'rol', titulo: 'Rol', celda: (u) => <Badge tono={TONO_ROL[u.rol] ?? 'neutral'}>{NOMBRE_ROL[u.rol] ?? u.rol}</Badge>, orden: (u) => u.rol },
    { id: 'cliente', titulo: 'Cliente', celda: (u) => u.codigo_cliente ?? '—', ocultarBajo: 'md' },
    {
      id: 'activo',
      titulo: 'Estado',
      celda: (u) => (u.activo ? <Badge tono="ok">Activa</Badge> : <Badge tono="muted">Desactivada</Badge>),
      orden: (u) => (u.activo ? 1 : 0),
    },
    {
      id: 'acceso',
      titulo: 'Último acceso',
      celda: (u) => (u.ultimo_acceso ? <span title={fechaHora(u.ultimo_acceso)}>{relativo(u.ultimo_acceso)}</span> : 'Nunca'),
      orden: (u) => u.ultimo_acceso,
      ocultarBajo: 'sm',
    },
    {
      id: 'editar',
      titulo: <span className="sr-only">Editar</span>,
      celda: (u) => (
        <Button size="sm" variant="ghost" onClick={() => setEditar(u)} aria-label={`Editar la cuenta de ${u.nombre}`}>
          <Pencil /> Editar
        </Button>
      ),
      alinear: 'right',
    },
  ];

  return (
    <>
      <PageHeader
        titulo="Usuarios"
        descripcion="Cuentas para entrar a LogiTrack. Los clientes pueden registrarse solos; operadores y gestores de flota se registran con un código de acceso del administrador, y los administradores solo se crean aquí."
        acciones={
          <Button variant="primary" onClick={() => setCrear(true)}>
            <UserPlus /> Nueva cuenta
          </Button>
        }
      />
      <Panel cuerpo="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-rule p-3">
          <Input value={valores.q} onChange={(e) => set('q', e.target.value)} placeholder="Nombre, correo o código de cliente" aria-label="Buscar cuentas" className="min-w-56 flex-1" />
          <NativeSelect value={valores.rol} onChange={(e) => set('rol', e.target.value)} className="w-48" aria-label="Filtrar por rol">
            <option value="">Todos los roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {NOMBRE_ROL[r]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <DataTable
          etiqueta="Usuarios"
          filas={q.data ? filas : undefined}
          columnas={columnas}
          clave={(u) => u.id}
          cargando={q.isLoading}
          error={q.error}
          reintentar={() => q.refetch()}
          ordenInicial={{ id: 'nombre', dir: 'asc' }}
          vacio={<div className="py-10 text-center text-[13px] text-text-2">No hay cuentas con estos filtros.</div>}
        />
      </Panel>
      <DialogoCrear abierto={crear} onAbierto={setCrear} />
      {editar && <DialogoEditar key={editar.id} usuario={editar} onCerrar={() => setEditar(null)} />}
    </>
  );
}

/** Cada vez que se abren, estos formularios empiezan limpios. */
const DialogoCrear = limpioAlAbrir(DialogoCrearFormulario);
const DialogoEditar = limpioAlAbrir(DialogoEditarFormulario, (p) => !!p.usuario);
