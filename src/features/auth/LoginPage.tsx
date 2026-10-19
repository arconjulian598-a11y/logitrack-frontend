import { Loader2, LogIn } from 'lucide-react';
import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { esErrorDeCredenciales, useAuth, useSesion } from '@/app/auth';
import { ErrorFormulario, Field } from '@/components/shared/Form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { sistemaDespertando, suscribirArranque } from '@/lib/api/arranque';
import { motivoCierre } from '@/lib/auth/sesion';
import { MarcoAcceso } from './MarcoAcceso';

function destinoSeguro(volver: string | null): string {
  // Solo rutas internas: nunca se redirige a otro sitio
  return volver && volver.startsWith('/') && !volver.startsWith('//') ? volver : '/';
}

export default function LoginPage() {
  const sesion = useSesion();
  const { entrar } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(() => params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [faltan, setFaltan] = useState(false);
  const despertando = useSyncExternalStore(suscribirArranque, sistemaDespertando, sistemaDespertando);
  const [motivo] = useState(motivoCierre);

  if (sesion) return <Navigate to={destinoSeguro(params.get('volver'))} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    if (!email.trim() || !password) {
      setFaltan(true);
      return;
    }
    setFaltan(false);
    setError(null);
    setEnviando(true);
    try {
      await entrar(email, password);
      navigate(destinoSeguro(params.get('volver')), { replace: true });
    } catch (err) {
      setError(err);
      setPassword('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <MarcoAcceso>
        <form onSubmit={onSubmit} className="rounded-lg border border-rule bg-surface p-6 shadow-lg" noValidate>
          <h1 className="text-lg font-semibold text-text">Iniciar sesión</h1>
          <p className="mt-1 text-[13px] text-text-2">Use la cuenta que le asignó el administrador.</p>

          {motivo === 'salida' && !error && (
            <p role="status" className="mt-4 rounded-md border border-rule bg-surface-2 px-3 py-2 text-[13px] text-text-2">
              Sesión cerrada. Puede entrar con otra cuenta (otro rol).
            </p>
          )}
          {motivo === 'expirada' && !error && (
            <p role="status" className="mt-4 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-[13px] text-text">
              Su sesión terminó. Inicie sesión de nuevo para continuar.
            </p>
          )}

          <div className="mt-5 space-y-4">
            <Field label="Correo" htmlFor="login-email" requerido error={faltan && !email.trim() ? 'Escriba su correo.' : undefined}>
              <Input
                id="login-email"
                type="email"
                autoComplete="username"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={faltan && !email.trim() ? true : undefined}
                autoFocus
              />
            </Field>
            <Field label="Contraseña" htmlFor="login-password" requerido error={faltan && !password ? 'Escriba su contraseña.' : undefined}>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={faltan && !password ? true : undefined}
              />
            </Field>
          </div>

          {error != null && (
            <div className="mt-4">
              {esErrorDeCredenciales(error) ? (
                <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-text">
                  Correo o contraseña incorrectos.
                </p>
              ) : (
                <ErrorFormulario error={error} />
              )}
            </div>
          )}

          {enviando && despertando && (
            <p role="status" className="mt-4 flex items-start gap-2 rounded-md border border-rule bg-surface-2 px-3 py-2 text-[13px] text-text-2">
              <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
              El sistema se está iniciando. La primera vez puede tardar cerca de un minuto.
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="mt-5 w-full"
            cargando={enviando}
            disabled={enviando}
          >
            {!enviando && <LogIn />} Entrar
          </Button>
          <div className="mt-5 flex items-center justify-center gap-1.5 border-t border-rule pt-4 text-[13px] text-text-2">
            ¿No tiene cuenta?
            <Button variant="link" asChild>
              <Link to="/registro">Registrarse</Link>
            </Button>
          </div>
        </form>
    </MarcoAcceso>
  );
}
