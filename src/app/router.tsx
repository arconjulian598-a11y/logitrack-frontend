import { createBrowserRouter } from 'react-router';
import { AppLayout } from './AppLayout';
import { ErrorDeRuta, NoEncontrada } from './ErroresRuta';

const pagina = (cargar: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await cargar()).default });

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <ErrorDeRuta />,
    children: [
      { index: true, lazy: pagina(() => import('@/features/panel/PanelPage')) },
      { path: 'mapa', lazy: pagina(() => import('@/features/mapa/MapaPage')) },
      { path: 'envios', lazy: pagina(() => import('@/features/envios/EnviosPage')) },
      { path: 'envios/nuevo', lazy: pagina(() => import('@/features/envios/NuevoEnvioPage')) },
      { path: 'envios/:id', lazy: pagina(() => import('@/features/envios/EnvioDetallePage')) },
      { path: 'rutas', lazy: pagina(() => import('@/features/rutas/RutasPage')) },
      { path: 'rutas/maestras/:id', lazy: pagina(() => import('@/features/rutas/RutaMaestraPage')) },
      { path: 'rutas/:id', lazy: pagina(() => import('@/features/rutas/RutaDetallePage')) },
      { path: 'aduanas', lazy: pagina(() => import('@/features/aduanas/AduanasPage')) },
      { path: 'flota/vehiculos', lazy: pagina(() => import('@/features/flota/VehiculosPage')) },
      { path: 'flota/vehiculos/:id', lazy: pagina(() => import('@/features/flota/VehiculoDetallePage')) },
      { path: 'flota/conductores', lazy: pagina(() => import('@/features/flota/ConductoresPage')) },
      { path: 'flota/conductores/:id', lazy: pagina(() => import('@/features/flota/ConductorDetallePage')) },
      { path: 'telemetria', lazy: pagina(() => import('@/features/telemetria/TelemetriaPage')) },
      { path: 'mantenimiento', lazy: pagina(() => import('@/features/mantenimiento/MantenimientoPage')) },
      { path: 'clientes', lazy: pagina(() => import('@/features/clientes/ClientesPage')) },
      { path: 'clientes/:id', lazy: pagina(() => import('@/features/clientes/ClienteDetallePage')) },
      { path: 'facturacion', lazy: pagina(() => import('@/features/facturacion/FacturacionPage')) },
      { path: 'notificaciones', lazy: pagina(() => import('@/features/notificaciones/NotificacionesPage')) },
      { path: 'analitica', lazy: pagina(() => import('@/features/analitica/AnaliticaPage')) },
      { path: 'ubicaciones', lazy: pagina(() => import('@/features/ubicaciones/UbicacionesPage')) },
      { path: 'simulaciones', lazy: pagina(() => import('@/features/simulaciones/SimulacionesPage')) },
      { path: 'sistema', lazy: pagina(() => import('@/features/sistema/SistemaPage')) },
      { path: '*', Component: NoEncontrada },
    ],
  },
]);
