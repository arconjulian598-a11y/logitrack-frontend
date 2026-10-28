/**
 * Matriz de permisos por rol (contrato 9.2). El gateway es quien decide: esta copia solo sirve para
 * no mostrar (ni pedir) lo que el rol no puede usar. Si el backend responde 403, manda el backend.
 */

export type Rol = 'cliente' | 'operador' | 'gestor_flota' | 'administrador';
export const ROLES: Rol[] = ['cliente', 'operador', 'gestor_flota', 'administrador'];

export const NOMBRE_ROL: Record<Rol, string> = {
  cliente: 'Cliente',
  operador: 'Operador',
  gestor_flota: 'Gestor de flota',
  administrador: 'Administrador',
};

type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
const C: Rol = 'cliente';
const O: Rol = 'operador';
const G: Rol = 'gestor_flota';
const A: Rol = 'administrador';
const TODOS: Rol[] = [C, O, G, A];
const ID = '[^/]+';

interface Regla {
  metodos: Metodo[];
  patron: RegExp;
  roles: Rol[];
}

const r = (metodos: string, patron: string, roles: Rol[]): Regla => ({
  metodos: metodos.split(',') as Metodo[],
  patron: new RegExp(`^/${patron}/?$`),
  roles,
});

/** En orden: gana la primera regla cuyo método y ruta coinciden. Lo que no aparece, se prohíbe. */
const REGLAS: Regla[] = [
  r('GET,POST,PATCH', `usuarios(/${ID})?`, [A]),
  r('GET', `clientes(/codigo/${ID}|/${ID})?`, [C, O, A]),
  r('POST,PATCH', `clientes(/${ID})?`, [O, A]),
  r('GET', `ubicaciones(/paises|/codigo/${ID}|/${ID})?`, TODOS),
  r('POST,PATCH', `ubicaciones(/${ID})?`, [O, A]),
  r('POST', 'rutas-maestras/calcular', [O, A]),
  r('POST', `rutas-maestras/${ID}/recalcular`, [O, A]),
  r('GET', `rutas-maestras(/codigo/${ID}|/${ID}|/${ID}/geometria)?`, [O, G, A]),
  r('POST', 'envios/cotizar', [C, O, A]),
  r('GET', 'envios/programados', [O, G, A]),
  r('POST', 'envios', [C, O, A]),
  r('GET', `envios(/codigo/${ID}|/${ID}|/${ID}/eventos|/${ID}/prueba-entrega|/${ID}/partes)?`, TODOS),
  r('POST', `envios/${ID}/reintentar-asignacion`, [O, G, A]),
  r('PATCH', `envios/${ID}/estado`, [O, G, A]),
  r('POST', `envios/${ID}/prueba-entrega`, [O, A]),
  r('POST', `envios/${ID}/cancelar`, [G, A]),
  r('PATCH', `envios/${ID}/reprogramar`, [G, A]),
  r('POST', 'viabilidad', [C, O, A]),
  r('GET', '(vehiculos|conductores)(/.*)?', [O, G, A]),
  r('POST,PATCH,PUT', '(vehiculos|conductores)(/.*)?', [G, A]),
  r('GET', 'reservas(/.*)?', [O, G, A]),
  r('GET', 'rutas(/.*)?', [O, G, A]),
  r('PATCH', `rutas/${ID}/recalcular`, [O, G, A]),
  r('POST', 'asignaciones(/.*)?', [O, G, A]),
  // El cliente sigue SUS envíos solo por esta ruta (va antes de la del personal)
  r('GET', `seguimiento/cliente/envio/${ID}(/trazado|/recorrido)?`, [C]),
  r('GET', '(seguimiento|simulaciones|telemetria)(/.*)?', [O, G, A]),
  r('GET', '(programas|intervenciones)(/.*)?', [O, G, A]),
  r('POST', '(programas|intervenciones)(/.*)?', [G, A]),
  r('GET,PATCH', 'declaraciones(/.*)?', [O, A]),
  r('GET', 'notificaciones(/.*)?', [O, A]),
  r('GET,POST', `preferencias/${ID}`, [C, A]),
  r('GET', 'pagos/por-reembolsar', [A]),
  r('POST', `pagos/${ID}/reembolsar`, [A]),
  r('GET', `pagos(/envio/${ID}|/${ID})?`, [C, O, A]),
  r('GET', `cotizaciones(/${ID})?`, [C, O, A]),
  r('GET', `facturas-pedido(/envio/${ID}|/${ID})?`, [C, A]),
  r('POST', 'facturas/cerrar-periodo', [A]),
  r('GET', `facturas(/${ID})?`, [C, A]),
  r('GET,POST', 'tarifas(/.*)?', [A]),
  r('GET', 'costos-ruta(/.*)?', [A]),
  r('GET', 'dashboard/(utilizacion-flota|proyeccion-mantenimiento)', [G, A]),
  r('GET', 'dashboard(/.*)?', [A]),
  r('POST', 'etl(/.*)?', [A]),
  r('GET', 'estado', [A]),
];

/** ¿Puede este rol llamar a esta ruta (lo que va después de /api/v1)? */
export function permitido(rol: Rol | null | undefined, metodo: string, ruta: string): boolean {
  if (!rol) return false;
  const limpia = '/' + (ruta.split('?')[0] ?? '').replace(/^\/+|\/+$/g, '');
  const m = metodo.toUpperCase() as Metodo;
  for (const regla of REGLAS) {
    if (regla.metodos.includes(m) && regla.patron.test(limpia)) return regla.roles.includes(rol);
  }
  return false;
}

/** Acciones de interfaz, con nombre propio (para menús y botones). */
export const ACCIONES = {
  verClientes: [C, O, A],
  editarClientes: [O, A],
  editarUbicaciones: [O, A],
  verRutas: [O, G, A],
  cotizar: [C, O, A],
  crearEnvio: [C, O, A],
  elegirCliente: [O, A],
  operarEnvio: [O, G, A], // reintentar asignación, cambiar estado manual
  pruebaEntrega: [O, A],
  cancelarReprogramar: [G, A],
  calendario: [O, G, A],
  verFlota: [O, G, A],
  editarFlota: [G, A],
  verMantenimiento: [O, G, A],
  registrarMantenimiento: [G, A],
  seguimiento: [O, G, A], // mapa del personal: flota, vehículos, telemetría, simulaciones
  seguimientoCliente: [C], // mapa de sus propios envíos (respuesta reducida)
  aduanas: [O, A],
  notificaciones: [O, A],
  preferencias: [C, A],
  verPagos: [C, O, A],
  verFacturas: [C, A],
  reembolsar: [A],
  administrar: [A], // usuarios, tarifas, costos, cerrar periodo, ETL, estado del sistema
  dashboard: [A],
  dashboardFlota: [G, A],
} satisfies Record<string, Rol[]>;

export type Accion = keyof typeof ACCIONES;

export function puede(rol: Rol | null | undefined, accion: Accion): boolean {
  return !!rol && (ACCIONES[accion] as Rol[]).includes(rol);
}
