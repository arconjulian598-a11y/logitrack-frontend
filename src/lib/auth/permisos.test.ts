import { estadoEnvio, ESTADOS_CANCELABLES, ESTADOS_FINALES_ENVIO } from '@/lib/dominio';
import { permitido, puede } from './permisos';

describe('matriz de permisos (contrato 9.2)', () => {
  it('el cliente cotiza, crea y ve lo suyo, pero no ve mapa, calendario ni flota', () => {
    expect(permitido('cliente', 'POST', '/envios/cotizar')).toBe(true);
    expect(permitido('cliente', 'POST', '/envios')).toBe(true);
    expect(permitido('cliente', 'GET', '/envios/123/partes')).toBe(true);
    expect(permitido('cliente', 'GET', '/pagos')).toBe(true);
    expect(permitido('cliente', 'GET', '/facturas-pedido/envio/1')).toBe(true);
    expect(permitido('cliente', 'GET', '/seguimiento/envio/1')).toBe(false);
    expect(permitido('cliente', 'GET', '/envios/programados')).toBe(false);
    expect(permitido('cliente', 'GET', '/vehiculos')).toBe(false);
    expect(permitido('cliente', 'GET', '/notificaciones')).toBe(false);
  });
  it('solo gestor y administrador cancelan y reprograman', () => {
    for (const rol of ['cliente', 'operador'] as const) {
      expect(permitido(rol, 'POST', '/envios/1/cancelar')).toBe(false);
      expect(permitido(rol, 'PATCH', '/envios/1/reprogramar')).toBe(false);
    }
    for (const rol of ['gestor_flota', 'administrador'] as const) {
      expect(permitido(rol, 'POST', '/envios/1/cancelar')).toBe(true);
      expect(permitido(rol, 'PATCH', '/envios/1/reprogramar')).toBe(true);
    }
  });
  it('el operador ve el calendario y los pagos, pero no reembolsa ni ve facturas', () => {
    expect(permitido('operador', 'GET', '/envios/programados')).toBe(true);
    expect(permitido('operador', 'GET', '/pagos')).toBe(true);
    expect(permitido('operador', 'GET', '/facturas-pedido')).toBe(false);
    expect(permitido('operador', 'POST', '/pagos/1/reembolsar')).toBe(false);
  });
  it('por-reembolsar no se confunde con /pagos/{id}', () => {
    expect(permitido('cliente', 'GET', '/pagos/por-reembolsar')).toBe(false);
    expect(permitido('administrador', 'GET', '/pagos/por-reembolsar')).toBe(true);
  });
  it('el gestor solo ve el dashboard de flota', () => {
    expect(permitido('gestor_flota', 'GET', '/dashboard/utilizacion-flota')).toBe(true);
    expect(permitido('gestor_flota', 'GET', '/dashboard/proyeccion-mantenimiento')).toBe(true);
    expect(permitido('gestor_flota', 'GET', '/dashboard/resumen')).toBe(false);
    expect(permitido('gestor_flota', 'GET', '/dashboard/ingresos/mensual')).toBe(false);
    expect(permitido('administrador', 'GET', '/dashboard/ingresos/pedidos')).toBe(true);
  });
  it('usuarios, ETL y estado son solo del administrador; sin rol no hay nada', () => {
    expect(permitido('operador', 'GET', '/usuarios')).toBe(false);
    expect(permitido('administrador', 'POST', '/usuarios')).toBe(true);
    expect(permitido('gestor_flota', 'POST', '/etl/ejecutar')).toBe(false);
    expect(permitido(null, 'GET', '/envios')).toBe(false);
    expect(permitido('administrador', 'GET', '/ruta-inventada')).toBe(false);
  });
  it('acciones de interfaz', () => {
    expect(puede('cliente', 'elegirCliente')).toBe(false);
    expect(puede('operador', 'elegirCliente')).toBe(true);
    expect(puede('gestor_flota', 'crearEnvio')).toBe(false);
    expect(puede('administrador', 'reembolsar')).toBe(true);
  });
});

describe('estados de la fase 2', () => {
  it('programado y cancelado tienen etiqueta; cancelado es final', () => {
    expect(estadoEnvio('programado').etiqueta).toBe('Programado');
    expect(estadoEnvio('cancelado').etiqueta).toBe('Cancelado');
    expect(ESTADOS_FINALES_ENVIO).toContain('cancelado');
    expect(ESTADOS_CANCELABLES).toEqual(['programado', 'pendiente', 'sin_asignacion']);
  });
});
