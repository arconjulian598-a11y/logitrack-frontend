import { LogOut } from 'lucide-react';
import { useAuth, usePuede, useSesion, useUsuario } from '@/app/auth';
import { Badge } from '@/components/shared/Badge';
import { KeyValue, PageHeader, Panel } from '@/components/shared/Layout';
import { Button } from '@/components/ui/button';
import { NOMBRE_ROL } from '@/lib/auth/permisos';
import { fechaHora } from '@/lib/format';
import { EditorPreferencia } from '../notificaciones/Preferencia';

export default function CuentaPage() {
  const usuario = useUsuario();
  const sesion = useSesion();
  const { salir } = useAuth();
  const preferencias = usePuede('preferencias') && !!usuario.cliente_id;

  return (
    <>
      <PageHeader titulo="Mi cuenta" descripcion="Datos de su cuenta y de la sesión actual. Para cambiar el correo, el rol o la contraseña, pídaselo a un administrador." />
      <div className="grid max-w-4xl gap-5 lg:grid-cols-2">
        <Panel titulo="Cuenta">
          <KeyValue
            items={[
              { k: 'Nombre', v: usuario.nombre, ancho: true },
              { k: 'Correo', v: usuario.email, ancho: true },
              { k: 'Rol', v: <Badge tono="primary">{NOMBRE_ROL[usuario.rol]}</Badge> },
              ...(usuario.codigo_cliente ? [{ k: 'Código de cliente', v: usuario.codigo_cliente }] : []),
              { k: 'Último acceso', v: fechaHora(usuario.ultimo_acceso ?? null, 'Ahora') },
            ]}
          />
        </Panel>
        <Panel titulo="Sesión">
          <div className="space-y-4">
            <KeyValue items={[{ k: 'Vence', v: sesion ? fechaHora(new Date(sesion.vence).toISOString()) : '—', ancho: true }]} />
            <p className="text-[13px] text-text-2">La sesión se cierra sola al vencer, o al cerrar esta pestaña del navegador.</p>
            <Button onClick={salir}>
              <LogOut /> Cerrar sesión
            </Button>
          </div>
        </Panel>
        {preferencias && (
          <Panel titulo="Preferencias de notificación" className="lg:col-span-2">
            <EditorPreferencia clienteId={usuario.cliente_id!} />
          </Panel>
        )}
      </div>
    </>
  );
}
