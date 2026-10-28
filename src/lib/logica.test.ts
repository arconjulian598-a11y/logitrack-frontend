import { interpretarBusqueda, normalizarCodigo } from '@/app/busqueda';
import * as endpoints from '@/lib/api/endpoints';
import { construirUrl } from '@/lib/api/http';
import { diasRestantes, erroresElegibilidad, estadoEnvio, humanizar, TRANSICIONES_MANUALES } from '@/lib/dominio';
import { desdeInputLocal, fecha, num, pesos } from '@/lib/format';
import { aNumero } from '@/lib/formularios';

describe('buscador global', () => {
  it('normaliza códigos de envío y ruta a 8 dígitos', () => {
    expect(normalizarCodigo('ENV', 'env-32')).toBe('ENV-00000032');
    expect(interpretarBusqueda('rut13')).toEqual({ tipo: 'ruta', codigo: 'RUT-00000013' });
  });
  it('reconoce placas, ubicaciones y códigos de 10 dígitos', () => {
    expect(interpretarBusqueda('goq 998')).toEqual({ tipo: 'placa', placa: 'GOQ998' });
    expect(interpretarBusqueda('co-mtr')).toEqual({ tipo: 'ubicacion', codigo: 'CO-MTR' });
    expect(interpretarBusqueda('1000000006')).toEqual({ tipo: 'codigo10', codigo: 1000000006 });
    expect(interpretarBusqueda('hola')).toEqual({ tipo: 'desconocido' });
  });
  it('reconoce las partes de un pedido dividido', () => {
    expect(interpretarBusqueda('env-32-p1')).toEqual({ tipo: 'envio', codigo: 'ENV-00000032-P1' });
    expect(interpretarBusqueda('ENV-00000032-P10')).toEqual({ tipo: 'envio', codigo: 'ENV-00000032-P10' });
  });
});

describe('formatos', () => {
  it('convierte decimales que llegan como texto', () => {
    expect(num('800.00')).toBe(800);
    expect(num(null)).toBeNull();
    expect(num('abc')).toBeNull();
    expect(aNumero('4,5')).toBe(4.5);
  });
  it('formatea pesos colombianos', () => {
    expect(pesos('1250000.00').replace(/\s/g, ' ')).toMatch(/1\.250\.000/);
  });
  it('las fechas puras no cambian de día por la zona horaria', () => {
    expect(fecha('2026-10-11')).toMatch(/11/);
  });
  it('datetime-local se interpreta en hora de Bogotá (UTC−5)', () => {
    expect(desdeInputLocal('2026-10-20T17:00')).toBe('2026-10-20T22:00:00.000Z');
    expect(desdeInputLocal('')).toBeNull();
  });
});

describe('reglas del dominio', () => {
  it('elegibilidad conductor↔vehículo igual que fleet-service', () => {
    const tracto = { tipo: 'tractocamion', certificado_hazmat: true, placa: 'TKR451' };
    expect(erroresElegibilidad(tracto, { categorias_licencia: 'C3', anios_experiencia: 9, certificacion_hazmat: true })).toEqual([]);
    const errores = erroresElegibilidad(tracto, { categorias_licencia: 'B1', anios_experiencia: 1, certificacion_hazmat: false });
    expect(errores).toHaveLength(4);
  });
  it('transiciones manuales del contrato', () => {
    expect(TRANSICIONES_MANUALES.devuelto).toContain('retenido_aduana');
    expect(TRANSICIONES_MANUALES.en_transito).not.toContain('pendiente');
  });
  it('etiquetas legibles de estados y eventos', () => {
    expect(estadoEnvio('retenido_aduana').tono).toBe('danger');
    expect(estadoEnvio('estado_nuevo').etiqueta).toBe('Estado nuevo');
    expect(humanizar('shipment.created')).toBe('Envío creado');
    expect(diasRestantes(-12)).toBe('venció hace 12 días');
  });
});

describe('capa de API', () => {
  it('expone las 83 rutas de la primera versión, las de la fase 2, el registro, la ubicación de vehículos y el seguimiento del cliente', () => {
    const total = Object.values(endpoints).reduce((n, grupo) => n + Object.keys(grupo).length, 0);
    expect(total).toBe(109);
  });
  it('construye URLs con la base configurada y omite parámetros vacíos', () => {
    expect(construirUrl('/envios', { estado: 'en_transito', cliente_id: '' })).toBe('http://localhost:8002/api/v1/envios?estado=en_transito');
    expect(construirUrl('/health', undefined, true)).toBe('http://localhost:8002/health');
  });
});

describe('gateway elegido en el navegador (?api=)', () => {
  it('acepta la raíz del túnel y quita barra final o /api/v1', async () => {
    const { normalizarGateway } = await import('@/lib/config');
    expect(normalizarGateway('https://abc-def.trycloudflare.com/')).toBe('https://abc-def.trycloudflare.com');
    expect(normalizarGateway('http://192.168.1.20:8002/api/v1')).toBe('http://192.168.1.20:8002');
  });
  it('rechaza valores que no son http(s)', async () => {
    const { normalizarGateway } = await import('@/lib/config');
    expect(normalizarGateway('javascript:alert(1)')).toBeNull();
    expect(normalizarGateway('localhost:8002')).toBeNull();
    expect(normalizarGateway('')).toBeNull();
  });
});
