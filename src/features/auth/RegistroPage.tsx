import { UserPlus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '@/app/auth';
import { ErrorFormulario, Field } from '@/components/shared/Form';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { gateway } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import { NOMBRE_ROL } from '@/lib/auth/permisos';
import type { RegistroCuenta, TipoDocumento } from '@/lib/types/api';
import { MarcoAcceso } from './MarcoAcceso';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Roles que se pueden registrar solos. El administrador no se ofrece: lo crea otro administrador. */
type RolRegistro = 'cliente' | 'operador' | 'gestor_flota';
const ROLES_REGISTRO: RolRegistro[] = ['cliente', 'operador', 'gestor_flota'];

const QUE_HACE: Record<RolRegistro, string> = {
  cliente: 'Empresa o persona que contrata envíos: ve y crea solo lo suyo.',
  operador: 'Atiende el día a día: clientes, envíos, mapa y aduanas.',
  gestor_flota: 'Vehículos, conductores, mantenimiento; cancela y reprograma.',
};

const TIPOS_DOCUMENTO: { valor: TipoDocumento; nombre: string }[] = [
  { valor: 'CC', nombre: 'Cédula de ciudadanía (CC)' },
  { valor: 'CE', nombre: 'Cédula de extranjería (CE)' },
  { valor: 'NIT', nombre: 'NIT' },
  { valor: 'PAS', nombre: 'Pasaporte (PAS)' },
];

/** Campos del formulario (los mismos nombres que usa el backend, para ubicar los errores 422). */
type Campo =
  | 'nombre'
  | 'email'
  | 'password'
  | 'confirmar'
  | 'rol'
  | 'tipo_documento'
  | 'numero_documento'
  | 'telefono'
  | 'direccion'
  | 'codigo_acceso';

const CAMPOS = new Set<string>([
  'nombre',
  'email',
  'password',
  'rol',
  'tipo_documento',
  'numero_documento',
  'telefono',
  'direccion',
  'codigo_acceso',
]);

/** Traduce los mensajes de validación más comunes de FastAPI/Pydantic. */
function traducir(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('field required') || m.includes('missing')) return 'Este campo es obligatorio.';
  if (m.includes('valid email') || m.includes('email address')) return 'Escriba un correo válido.';
  const min = /at least (\d+) character/.exec(m);
  if (min) return `Mínimo ${min[1]} caracteres.`;
  const max = /at most (\d+) character/.exec(m);
  if (max) return `Máximo ${max[1]} caracteres.`;
  if (m.includes('input should be')) return 'Valor no válido.';
  return msg.replace(/^Value error,\s*/i, '');
}

/**
 * Registro público de una cuenta (POST /auth/registro, sin sesión). No se piden ni guardan
 * credenciales de nadie más, y el código de cliente nunca se pide: el backend lo asigna.
 */
export default function RegistroPage() {
  const navigate = useNavigate();
  const { registrarse } = useAuth();
  const [rol, setRol] = useState<RolRegistro>('cliente');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>('CC');
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [codigoAcceso, setCodigoAcceso] = useState('');
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({});
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const esCliente = rol === 'cliente';

  // El registro (POST) no se reintenta solo; por eso, mientras se llena el formulario, se despierta el
  // backend con GET /health (en Render los servicios se duermen tras 15 min sin uso).
  useEffect(() => {
    const control = new AbortController();
    gateway.health({ signal: control.signal }).catch(() => undefined);
    return () => control.abort();
  }, []);

  function validar(): Partial<Record<Campo, string>> {
    const e: Partial<Record<Campo, string>> = {};
    if (nombre.trim().length < 2) e.nombre = 'Escriba su nombre (mínimo 2 caracteres).';
    if (!EMAIL.test(email.trim())) e.email = 'Escriba un correo válido.';
    if (password.length < 8) e.password = 'Mínimo 8 caracteres.';
    if (confirmar !== password) e.confirmar = 'Las contraseñas no coinciden.';
    if (esCliente) {
      if (!numeroDocumento.trim()) e.numero_documento = 'Escriba el número de documento.';
    } else if (!codigoAcceso.trim()) {
      e.codigo_acceso = 'Escriba el código de acceso que le dio el administrador.';
    }
    return e;
  }

  function cuerpo(): RegistroCuenta {
    const base = { nombre: nombre.trim(), email: email.trim().toLowerCase(), password };
    if (esCliente) {
      return {
        rol: 'cliente',
        ...base,
        tipo_documento: tipoDocumento,
        numero_documento: numeroDocumento.trim(),
        ...(telefono.trim() ? { telefono: telefono.trim() } : {}),
        ...(direccion.trim() ? { direccion: direccion.trim() } : {}),
      };
    }
    return { rol, ...base, codigo_acceso: codigoAcceso.trim() };
  }

  /** Ubica cada error del backend bajo su campo; lo que no tenga campo va al aviso general. */
  function mostrarError(err: unknown) {
    if (!(err instanceof ApiError)) {
      setError(err);
      return;
    }
    switch (err.codigo) {
      case 'CORREO_YA_REGISTRADO':
        setErrores({ email: 'Ya existe una cuenta con ese correo. Si ya es cliente, pida al administrador que le cree el acceso.' });
        return;
      case 'CLIENTE_YA_REGISTRADO':
        setErrores({ numero_documento: 'Ese documento ya está registrado como cliente. Si ya es cliente, pida al administrador que le cree el acceso.' });
        return;
      case 'CODIGO_ACCESO_INVALIDO':
        setErrores({ codigo_acceso: 'El código de acceso no es válido. Pídale al administrador un código vigente.' });
        return;
      case 'REGISTRO_PERSONAL_DESHABILITADO':
        setError(new Error('El registro de operadores y gestores de flota está deshabilitado por ahora. Pídale al administrador que le cree la cuenta.'));
        return;
      case 'DEMASIADOS_INTENTOS':
        setError(new Error('Hubo demasiados intentos de registro. Espere unos minutos y vuelva a intentarlo.'));
        return;
    }
    if (err.status === 429) {
      setError(new Error('Hubo demasiados intentos de registro. Espere unos minutos y vuelva a intentarlo.'));
      return;
    }
    if (err.status === 409) {
      setError(new Error('Esa cuenta ya existe. Si ya es cliente, pida al administrador que le cree el acceso.'));
      return;
    }
    if (err.status === 422 && err.validacion.length) {
      const porCampo: Partial<Record<Campo, string>> = {};
      const sueltos: string[] = [];
      for (const v of err.validacion) {
        const nombreCampo = [...(v.loc ?? [])].reverse().find((p) => typeof p === 'string' && CAMPOS.has(p)) as Campo | undefined;
        if (nombreCampo && !porCampo[nombreCampo]) porCampo[nombreCampo] = traducir(v.msg);
        else if (!nombreCampo) sueltos.push(traducir(v.msg));
      }
      setErrores(porCampo);
      if (sueltos.length || !Object.keys(porCampo).length) setError(err);
      return;
    }
    setError(err);
  }

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    if (enviando) return;
    const e = validar();
    setErrores(e);
    setError(null);
    if (Object.keys(e).length) {
      const primero = Object.keys(e)[0];
      document.getElementById(`r-${primero}`)?.focus();
      return;
    }
    setEnviando(true);
    try {
      const usuario = await registrarse(cuerpo());
      if (usuario.rol === 'cliente' && usuario.codigo_cliente != null) {
        toast.success(`Su código de cliente es ${usuario.codigo_cliente}`, {
          id: 'codigo-cliente',
          description: 'Guárdelo: lo identifica ante LogiTrack. También lo ve en Mi cuenta.',
          duration: Infinity,
          closeButton: true,
        });
      } else {
        toast.success(`Bienvenido, ${usuario.nombre}. Su cuenta quedó creada.`);
      }
      navigate('/', { replace: true });
    } catch (err) {
      mostrarError(err);
    } finally {
      setEnviando(false);
    }
  }

  /** Al corregir un campo, su error se borra enseguida. */
  function limpiar(c: Campo) {
    if (errores[c]) setErrores((prev) => ({ ...prev, [c]: undefined }));
  }

  const marca = (c: Campo) => (errores[c] ? { 'aria-invalid': true as const } : {});

  return (
    <MarcoAcceso ancho="max-w-[520px]">
      <form onSubmit={enviar} noValidate className="rounded-lg border border-rule bg-surface p-6 shadow-lg">
        <h1 className="text-lg font-semibold text-text">Crear una cuenta</h1>
        <p className="mt-1 text-[13px] text-text-2">
          {esCliente
            ? 'Regístrese como cliente para cotizar y seguir sus envíos.'
            : 'Necesita el código de acceso que entrega el administrador.'}
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Rol" htmlFor="r-rol" requerido ayuda={QUE_HACE[rol]} error={errores.rol} className="sm:col-span-2">
            <NativeSelect
              id="r-rol"
              value={rol}
              onChange={(e) => {
                setRol(e.target.value as RolRegistro);
                setErrores({});
                setError(null);
              }}
            >
              {ROLES_REGISTRO.map((r) => (
                <option key={r} value={r}>
                  {NOMBRE_ROL[r]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Nombre" htmlFor="r-nombre" requerido error={errores.nombre} className="sm:col-span-2">
            <Input
              id="r-nombre"
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value);
                limpiar('nombre');
              }}
              autoComplete="name"
              autoFocus
              {...marca('nombre')}
            />
          </Field>
          <Field label="Correo" htmlFor="r-email" requerido error={errores.email} className="sm:col-span-2">
            <Input
              id="r-email"
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                limpiar('email');
              }}
              autoComplete="email"
              {...marca('email')}
            />
          </Field>
          <Field label="Contraseña" htmlFor="r-password" requerido error={errores.password} ayuda="Mínimo 8 caracteres.">
            <Input
              id="r-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                limpiar('password');
              }}
              autoComplete="new-password"
              {...marca('password')}
            />
          </Field>
          <Field label="Repita la contraseña" htmlFor="r-confirmar" requerido error={errores.confirmar}>
            <Input
              id="r-confirmar"
              type="password"
              value={confirmar}
              onChange={(e) => {
                setConfirmar(e.target.value);
                limpiar('confirmar');
              }}
              autoComplete="new-password"
              {...marca('confirmar')}
            />
          </Field>

          {esCliente ? (
            <>
              <Field label="Tipo de documento" htmlFor="r-tipo_documento" requerido error={errores.tipo_documento}>
                <NativeSelect
                  id="r-tipo_documento"
                  value={tipoDocumento}
                  onChange={(e) => {
                    setTipoDocumento(e.target.value as TipoDocumento);
                    limpiar('tipo_documento');
                  }}
                  {...marca('tipo_documento')}
                >
                  {TIPOS_DOCUMENTO.map((t) => (
                    <option key={t.valor} value={t.valor}>
                      {t.nombre}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Número de documento" htmlFor="r-numero_documento" requerido error={errores.numero_documento}>
                <Input
                  id="r-numero_documento"
                  value={numeroDocumento}
                  onChange={(e) => {
                    setNumeroDocumento(e.target.value);
                    limpiar('numero_documento');
                  }}
                  autoComplete="off"
                  {...marca('numero_documento')}
                />
              </Field>
              <Field label="Teléfono" htmlFor="r-telefono" error={errores.telefono} ayuda="Opcional.">
                <Input
                  id="r-telefono"
                  type="tel"
                  inputMode="tel"
                  value={telefono}
                  onChange={(e) => {
                    setTelefono(e.target.value);
                    limpiar('telefono');
                  }}
                  autoComplete="tel"
                  {...marca('telefono')}
                />
              </Field>
              <Field label="Dirección" htmlFor="r-direccion" error={errores.direccion} ayuda="Opcional.">
                <Input
                  id="r-direccion"
                  value={direccion}
                  onChange={(e) => {
                    setDireccion(e.target.value);
                    limpiar('direccion');
                  }}
                  autoComplete="street-address"
                  {...marca('direccion')}
                />
              </Field>
            </>
          ) : (
            <Field
              label="Código de acceso (lo entrega el administrador)"
              htmlFor="r-codigo_acceso"
              requerido
              error={errores.codigo_acceso}
              className="sm:col-span-2"
            >
              <Input
                id="r-codigo_acceso"
                value={codigoAcceso}
                onChange={(e) => {
                  setCodigoAcceso(e.target.value);
                  limpiar('codigo_acceso');
                }}
                autoComplete="off"
                spellCheck={false}
                {...marca('codigo_acceso')}
              />
            </Field>
          )}
        </div>

        {error != null && (
          <div className="mt-4">
            <ErrorFormulario error={error} />
          </div>
        )}

        <Button type="submit" variant="primary" size="lg" className="mt-5 w-full" cargando={enviando} disabled={enviando}>
          {!enviando && <UserPlus />} Crear cuenta y entrar
        </Button>
        {enviando && (
          <p role="status" className="mt-2 text-center text-xs text-text-3">
            Si el sistema estaba dormido, puede tardar cerca de un minuto.
          </p>
        )}
        <div className="mt-5 flex items-center justify-center gap-1.5 border-t border-rule pt-4 text-[13px] text-text-2">
          ¿Ya tiene cuenta?
          <Button variant="link" asChild>
            <Link to="/login">Iniciar sesión</Link>
          </Button>
        </div>
      </form>
    </MarcoAcceso>
  );
}
