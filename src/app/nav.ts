import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  CreditCard,
  FileCheck2,
  Gauge,
  LayoutDashboard,
  Map,
  MapPin,
  Navigation,
  Package,
  Receipt,
  Route,
  ServerCog,
  PackagePlus,
  Truck,
  UserRound,
  UsersRound,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { puede, type Accion, type Rol } from '@/lib/auth/permisos';

export interface ItemNav {
  to: string;
  etiqueta: string;
  icono: LucideIcon;
  /** Microservicio que atiende el módulo (para el indicador de salud). */
  servicio?: string;
  /** Roles que ven el módulo (según la matriz de permisos). Sin acción: todos. */
  accion?: Accion | Accion[];
  /** Nombre del módulo para un rol en particular (por ejemplo «Mis envíos» para el cliente). */
  etiquetaPara?: Partial<Record<Rol, string>>;
}

export const NAVEGACION: { grupo: string; items: ItemNav[] }[] = [
  {
    grupo: 'Operación',
    items: [
      { to: '/', etiqueta: 'Panel de operación', icono: LayoutDashboard, accion: 'seguimiento' },
      { to: '/mapa', etiqueta: 'Mapa en vivo', icono: Map, servicio: 'tracking', accion: 'seguimiento' },
      { to: '/envios', etiqueta: 'Envíos', icono: Package, servicio: 'shipment', etiquetaPara: { cliente: 'Mis envíos' } },
      { to: '/seguimiento', etiqueta: 'Seguimiento', icono: Navigation, servicio: 'tracking', accion: 'seguimientoCliente' },
      { to: '/envios/nuevo', etiqueta: 'Nuevo envío', icono: PackagePlus, servicio: 'shipment', accion: 'crearEnvio' },
      { to: '/calendario', etiqueta: 'Calendario', icono: CalendarDays, servicio: 'shipment', accion: 'calendario' },
      { to: '/rutas', etiqueta: 'Rutas y asignaciones', icono: Route, servicio: 'routing', accion: 'verRutas' },
      { to: '/aduanas', etiqueta: 'Aduanas', icono: FileCheck2, servicio: 'customs', accion: 'aduanas' },
    ],
  },
  {
    grupo: 'Flota',
    items: [
      { to: '/flota/vehiculos', etiqueta: 'Vehículos', icono: Truck, servicio: 'fleet', accion: 'verFlota' },
      { to: '/flota/conductores', etiqueta: 'Conductores', icono: UserRound, servicio: 'fleet', accion: 'verFlota' },
      { to: '/telemetria', etiqueta: 'Telemetría', icono: Gauge, servicio: 'tracking', accion: 'seguimiento' },
      { to: '/mantenimiento', etiqueta: 'Mantenimiento', icono: Wrench, servicio: 'maintenance', accion: 'verMantenimiento' },
    ],
  },
  {
    grupo: 'Clientes y cobro',
    items: [
      { to: '/clientes', etiqueta: 'Clientes', icono: Building2, servicio: 'shipment', accion: 'elegirCliente' },
      {
        to: '/cobros',
        etiqueta: 'Cobros y reembolsos',
        icono: CreditCard,
        servicio: 'billing',
        accion: 'verPagos',
        etiquetaPara: { cliente: 'Mis pagos y facturas', operador: 'Pagos' },
      },
      { to: '/facturacion', etiqueta: 'Tarifas y costos', icono: Receipt, servicio: 'billing', accion: 'administrar' },
      { to: '/notificaciones', etiqueta: 'Notificaciones', icono: Bell, servicio: 'notification', accion: 'notificaciones' },
    ],
  },
  {
    grupo: 'Análisis y sistema',
    items: [
      {
        to: '/analitica',
        etiqueta: 'Dashboard e ingresos',
        icono: BarChart3,
        servicio: 'analytics',
        accion: ['dashboard', 'dashboardFlota'],
        etiquetaPara: { gestor_flota: 'Dashboard de flota' },
      },
      { to: '/usuarios', etiqueta: 'Usuarios', icono: UsersRound, servicio: 'shipment', accion: 'administrar' },
      { to: '/ubicaciones', etiqueta: 'Ubicaciones', icono: MapPin, servicio: 'routing', accion: 'verRutas' },
      { to: '/simulaciones', etiqueta: 'Simulaciones de viaje', icono: Activity, servicio: 'tracking', accion: 'seguimiento' },
      { to: '/sistema', etiqueta: 'Estado del sistema', icono: ServerCog, accion: 'administrar' },
    ],
  },
];

function visible(item: ItemNav, rol: Rol | null): boolean {
  if (!item.accion) return true;
  const acciones = Array.isArray(item.accion) ? item.accion : [item.accion];
  return acciones.some((a) => puede(rol, a));
}

/** Menú del rol: solo los módulos que puede usar, con el nombre que le corresponde. */
export function navegacionPara(rol: Rol | null): { grupo: string; items: ItemNav[] }[] {
  const grupos = NAVEGACION.map((g) => ({
    grupo: g.grupo,
    items: g.items
      .filter((it) => visible(it, rol))
      .map((it) => ({ ...it, etiqueta: (rol && it.etiquetaPara?.[rol]) ?? it.etiqueta })),
  })).filter((g) => g.items.length > 0);
  // El cliente tiene pocos módulos: un solo grupo
  if (rol === 'cliente') return [{ grupo: 'Mi cuenta', items: grupos.flatMap((g) => g.items) }];
  return grupos;
}

/** ¿El módulo `to` es el de la pantalla actual? (`/envios/nuevo` no marca también «Envíos»). */
export function moduloActivo(to: string, pathname: string, todos: string[]): boolean {
  if (to === '/') return pathname === '/';
  if (!(pathname === to || pathname.startsWith(to + '/'))) return false;
  // si otro módulo más específico coincide, gana ese
  return !todos.some((otro) => otro !== to && otro.startsWith(to + '/') && (pathname === otro || pathname.startsWith(otro + '/')));
}
