import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  FileCheck2,
  Gauge,
  LayoutDashboard,
  Map,
  MapPin,
  Package,
  Receipt,
  Route,
  ServerCog,
  Truck,
  UserRound,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export interface ItemNav {
  to: string;
  etiqueta: string;
  icono: LucideIcon;
  /** Microservicio que atiende el módulo (para el indicador de salud). */
  servicio?: string;
}

export const NAVEGACION: { grupo: string; items: ItemNav[] }[] = [
  {
    grupo: 'Operación',
    items: [
      { to: '/', etiqueta: 'Panel de operación', icono: LayoutDashboard },
      { to: '/mapa', etiqueta: 'Mapa en vivo', icono: Map, servicio: 'tracking' },
      { to: '/envios', etiqueta: 'Envíos', icono: Package, servicio: 'shipment' },
      { to: '/rutas', etiqueta: 'Rutas y asignaciones', icono: Route, servicio: 'routing' },
      { to: '/aduanas', etiqueta: 'Aduanas', icono: FileCheck2, servicio: 'customs' },
    ],
  },
  {
    grupo: 'Flota',
    items: [
      { to: '/flota/vehiculos', etiqueta: 'Vehículos', icono: Truck, servicio: 'fleet' },
      { to: '/flota/conductores', etiqueta: 'Conductores', icono: UserRound, servicio: 'fleet' },
      { to: '/telemetria', etiqueta: 'Telemetría', icono: Gauge, servicio: 'tracking' },
      { to: '/mantenimiento', etiqueta: 'Mantenimiento', icono: Wrench, servicio: 'maintenance' },
    ],
  },
  {
    grupo: 'Clientes y cobro',
    items: [
      { to: '/clientes', etiqueta: 'Clientes', icono: Building2, servicio: 'shipment' },
      { to: '/facturacion', etiqueta: 'Facturación y costos', icono: Receipt, servicio: 'billing' },
      { to: '/notificaciones', etiqueta: 'Notificaciones', icono: Bell, servicio: 'notification' },
    ],
  },
  {
    grupo: 'Análisis y sistema',
    items: [
      { to: '/analitica', etiqueta: 'Analítica', icono: BarChart3, servicio: 'analytics' },
      { to: '/ubicaciones', etiqueta: 'Ubicaciones', icono: MapPin, servicio: 'routing' },
      { to: '/simulaciones', etiqueta: 'Simulaciones de viaje', icono: Activity, servicio: 'tracking' },
      { to: '/sistema', etiqueta: 'Estado del sistema', icono: ServerCog },
    ],
  },
];
