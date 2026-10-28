import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import type { Accion } from '@/lib/auth/permisos';
import { AppLayout } from './AppLayout';
import { RequiereSesion, SoloPara, useRol } from './auth';
import { ErrorDeRuta, NoEncontrada } from './ErroresRuta';

/** Carga diferida de una pantalla; si se indica `accion`, solo la ven los roles que pueden hacerla. */
const pagina =
  (cargar: () => Promise<{ default: ComponentType }>, accion?: Accion | Accion[]) =>
  async () => {
    const Pantalla = (await cargar()).default;
    if (!accion) return { Component: Pantalla };
    return {
      Component: () => (
        <SoloPara accion={accion}>
          <Pantalla />
        </SoloPara>
      ),
    };
  };

/** Inicio: el cliente no tiene panel de operación; va directo a sus envíos. */
function Inicio({ Panel }: { Panel: ComponentType }) {
  const rol = useRol();
  if (rol === 'cliente') return <Navigate to="/envios" replace />;
  return <Panel />;
}

export const router = createBrowserRouter([
  { path: '/login', lazy: pagina(() => import('@/features/auth/LoginPage')) },
  { path: '/registro', lazy: pagina(() => import('@/features/auth/RegistroPage')) },
  {
    path: '/',
    element: (
      <RequiereSesion>
        <AppLayout />
      </RequiereSesion>
    ),
    errorElement: <ErrorDeRuta />,
    children: [
      {
        index: true,
        lazy: async () => {
          const Panel = (await import('@/features/panel/PanelPage')).default;
          return { Component: () => <Inicio Panel={Panel} /> };
        },
      },
      { path: 'mapa', lazy: pagina(() => import('@/features/mapa/MapaPage'), 'seguimiento') },
      { path: 'envios', lazy: pagina(() => import('@/features/envios/EnviosPage')) },
      { path: 'envios/nuevo', lazy: pagina(() => import('@/features/envios/NuevoEnvioPage'), 'crearEnvio') },
      { path: 'envios/:id', lazy: pagina(() => import('@/features/envios/EnvioDetallePage')) },
      { path: 'seguimiento', lazy: pagina(() => import('@/features/seguimiento/SeguimientoListaPage'), 'seguimientoCliente') },
      { path: 'seguimiento/:id', lazy: pagina(() => import('@/features/seguimiento/SeguimientoClientePage'), 'seguimientoCliente') },
      { path: 'calendario', lazy: pagina(() => import('@/features/calendario/CalendarioPage'), 'calendario') },
      { path: 'rutas', lazy: pagina(() => import('@/features/rutas/RutasPage'), 'verRutas') },
      { path: 'rutas/maestras/:id', lazy: pagina(() => import('@/features/rutas/RutaMaestraPage'), 'verRutas') },
      { path: 'rutas/:id', lazy: pagina(() => import('@/features/rutas/RutaDetallePage'), 'verRutas') },
      { path: 'aduanas', lazy: pagina(() => import('@/features/aduanas/AduanasPage'), 'aduanas') },
      { path: 'flota/vehiculos', lazy: pagina(() => import('@/features/flota/VehiculosPage'), 'verFlota') },
      { path: 'flota/vehiculos/:id', lazy: pagina(() => import('@/features/flota/VehiculoDetallePage'), 'verFlota') },
      { path: 'flota/conductores', lazy: pagina(() => import('@/features/flota/ConductoresPage'), 'verFlota') },
      { path: 'flota/conductores/:id', lazy: pagina(() => import('@/features/flota/ConductorDetallePage'), 'verFlota') },
      { path: 'telemetria', lazy: pagina(() => import('@/features/telemetria/TelemetriaPage'), 'seguimiento') },
      { path: 'mantenimiento', lazy: pagina(() => import('@/features/mantenimiento/MantenimientoPage'), 'verMantenimiento') },
      { path: 'clientes', lazy: pagina(() => import('@/features/clientes/ClientesPage'), 'elegirCliente') },
      { path: 'clientes/:id', lazy: pagina(() => import('@/features/clientes/ClienteDetallePage'), 'elegirCliente') },
      { path: 'cobros', lazy: pagina(() => import('@/features/cobros/CobrosPage'), 'verPagos') },
      { path: 'facturacion', lazy: pagina(() => import('@/features/facturacion/FacturacionPage'), 'administrar') },
      { path: 'notificaciones', lazy: pagina(() => import('@/features/notificaciones/NotificacionesPage'), 'notificaciones') },
      { path: 'analitica', lazy: pagina(() => import('@/features/analitica/AnaliticaPage'), ['dashboard', 'dashboardFlota']) },
      { path: 'usuarios', lazy: pagina(() => import('@/features/usuarios/UsuariosPage'), 'administrar') },
      { path: 'ubicaciones', lazy: pagina(() => import('@/features/ubicaciones/UbicacionesPage'), 'verRutas') },
      { path: 'simulaciones', lazy: pagina(() => import('@/features/simulaciones/SimulacionesPage'), 'seguimiento') },
      { path: 'sistema', lazy: pagina(() => import('@/features/sistema/SistemaPage'), 'administrar') },
      { path: 'cuenta', lazy: pagina(() => import('@/features/auth/CuentaPage')) },
      { path: '*', Component: NoEncontrada },
    ],
  },
]);
