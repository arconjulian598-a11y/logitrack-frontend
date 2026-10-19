import { ShieldCheck, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@/app/auth';
import { ErrorFormulario, Field } from '@/components/shared/Form';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import * as api from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import { NOMBRE_ROL, ROLES, type Rol } from '@/lib/auth/permisos';
import { MarcoAcceso } from './MarcoAcceso';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const QUE_HACE: Record<Rol, string> = {
  cliente: 'Empresa que contrata envíos: ve y crea solo lo suyo.',
  operador: 'Atiende el día a día: clientes, envíos, mapa y aduanas.',
  gestor_flota: 'Vehículos, conductores, mantenimiento; cancela y reprograma.',
  administrador: 'Control total: usuarios, cobros, reembolsos e ingresos.',
};

/**
 * Registro de una cuenta nueva. El backend no tiene registro público: solo un administrador crea
 * cuentas (POST /usuarios). Por eso un administrador autoriza el registro con su correo y contraseña
 * en este mismo formulario; su sesión se usa una sola vez y no se guarda.
 */
export default function RegistroPage() {
  const navigate = useNavigate();
  const { entrar, salir, sesion } = useAuth();
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [rol, setRol] = useState<Rol>('cliente');
  const [codigoCliente, setCodigoCliente] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);

  function validar(): Record<string, string> {
    const e: Record<string, string> = {};
    if (nombre.trim().length < 2) e.nombre = 'Escriba su nombre (mínimo 2 caracteres).';
    if (!EMAIL.test(email.trim())) e.email = 'Escriba un correo válido.';
    if (password.length < 8) e.password = 'Mínimo 8 caracteres.';
    if (confirmar !== password) e.confirmar = 'Las contraseñas no coinciden.';
    if (rol === 'cliente' && !/^\d{1,12}$/.test(codigoCliente.trim())) e.codigoCliente = 'Escriba el código de su empresa (solo números).';
    if (!EMAIL.test(adminEmail.trim())) e.adminEmail = 'Escriba el correo del administrador.';
    if (!adminPassword) e.adminPassword = 'Escriba la contraseña del administrador.';
    return e;
  }

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    if (enviando) return;
    const e = validar();
    setErrores(e);
    setError(null);
    if (Object.keys(e).length) return;
    setEnviando(true);
    try {
      // 1) El administrador autoriza (su token se usa solo para esta petición)
      let tokenAdmin: string;
      try {
        const r = await api.auth.login(adminEmail.trim(), adminPassword);
        if (r.usuario.rol !== 'administrador') {
          setErrores({ adminEmail: 'Esa cuenta no es de administrador: no puede autorizar registros.' });
          return;
        }
        tokenAdmin = r.access_token;
      } catch (err) {
        if (err instanceof ApiError && err.codigo === 'CREDENCIALES_INVALIDAS') {
          setErrores({ adminPassword: 'Correo o contraseña del administrador incorrectos.' });
          return;
        }
        throw err;
      }
      // 2) Se crea la cuenta
      await api.usuarios.crearConAutorizacion(
        {
          email: email.trim().toLowerCase(),
          nombre: nombre.trim(),
          password,
          rol,
          ...(rol === 'cliente' ? { codigo_cliente: Number(codigoCliente.trim()) } : {}),
        },
        tokenAdmin,
      );
      // 3) Se entra con la cuenta nueva (si había otra sesión abierta, se cierra)
      if (sesion) salir();
      try {
        await entrar(email.trim().toLowerCase(), password);
        navigate('/', { replace: true });
      } catch {
        navigate(`/login?email=${encodeURIComponent(email.trim().toLowerCase())}`, { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setErrores({ email: 'Ya existe una cuenta con ese correo.' });
      else if (err instanceof ApiError && err.status === 422 && rol === 'cliente' && !err.validacion.length)
        setErrores({ codigoCliente: 'No existe un cliente con ese código. Pídalo a LogiTrack.' });
      else setError(err);
    } finally {
      setEnviando(false);
    }
  }

  const campo = (id: string) => (errores[id] ? { 'aria-invalid': true as const } : {});

  return (
    <MarcoAcceso ancho="max-w-[520px]">
      <form onSubmit={enviar} noValidate className="rounded-lg border border-rule bg-surface p-6 shadow-lg">
        <h1 className="text-lg font-semibold text-text">Crear una cuenta</h1>
        <p className="mt-1 text-[13px] text-text-2">Un administrador de LogiTrack debe autorizar el registro.</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" htmlFor="r-nombre" requerido error={errores.nombre} className="sm:col-span-2">
            <Input id="r-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" autoFocus {...campo('nombre')} />
          </Field>
          <Field label="Correo" htmlFor="r-email" requerido error={errores.email} className="sm:col-span-2">
            <Input id="r-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" {...campo('email')} />
          </Field>
          <Field label="Contraseña" htmlFor="r-password" requerido error={errores.password} ayuda="Mínimo 8 caracteres.">
            <Input id="r-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" {...campo('password')} />
          </Field>
          <Field label="Repita la contraseña" htmlFor="r-confirmar" requerido error={errores.confirmar}>
            <Input id="r-confirmar" type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} autoComplete="new-password" {...campo('confirmar')} />
          </Field>
          <Field label="Rol" htmlFor="r-rol" requerido ayuda={QUE_HACE[rol]} className="sm:col-span-2">
            <NativeSelect id="r-rol" value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {NOMBRE_ROL[r]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {rol === 'cliente' && (
            <Field label="Código de su empresa (cliente)" htmlFor="r-codigo" requerido error={errores.codigoCliente} ayuda="El número de cliente que le dio LogiTrack, por ejemplo 1000000001." className="sm:col-span-2">
              <Input id="r-codigo" inputMode="numeric" value={codigoCliente} onChange={(e) => setCodigoCliente(e.target.value)} {...campo('codigoCliente')} />
            </Field>
          )}
        </div>

        <fieldset className="mt-6 rounded-md border border-rule bg-surface-2 p-4">
          <legend className="flex items-center gap-1.5 px-1 text-[13px] font-semibold text-text">
            <ShieldCheck className="size-4 text-primary" aria-hidden /> Autorización del administrador
          </legend>
          <p className="mb-3 text-xs text-text-2">Su sesión se usa solo para crear esta cuenta y no queda abierta.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Correo del administrador" htmlFor="r-admin-email" requerido error={errores.adminEmail}>
              <Input id="r-admin-email" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} autoComplete="off" {...campo('adminEmail')} />
            </Field>
            <Field label="Contraseña del administrador" htmlFor="r-admin-password" requerido error={errores.adminPassword}>
              <Input id="r-admin-password" type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} autoComplete="off" {...campo('adminPassword')} />
            </Field>
          </div>
        </fieldset>

        {error != null && (
          <div className="mt-4">
            <ErrorFormulario error={error} />
          </div>
        )}

        <Button type="submit" variant="primary" size="lg" className="mt-5 w-full" cargando={enviando} disabled={enviando}>
          {!enviando && <UserPlus />} Crear cuenta y entrar
        </Button>
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
