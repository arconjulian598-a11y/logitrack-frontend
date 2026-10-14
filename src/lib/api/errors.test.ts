import { ApiError, crearApiError, describirError, mensajeDeError } from './errors';

describe('mensajeDeError (contrato, sección 2.1)', () => {
  it('detail como texto', () => {
    expect(mensajeDeError({ detail: 'Envío no encontrado' }, 404)).toBe('Envío no encontrado');
  });

  it('detail como objeto con código', () => {
    const cuerpo = { detail: { codigo: 'CAPACIDAD_EXCEDIDA', mensaje: 'Ningún vehículo puede transportar 9000 kg' } };
    expect(mensajeDeError(cuerpo, 422)).toBe('Ningún vehículo puede transportar 9000 kg');
    expect(crearApiError(422, cuerpo).codigo).toBe('CAPACIDAD_EXCEDIDA');
  });

  it('detail con mensaje y lista de errores (elegibilidad de conductor)', () => {
    const cuerpo = { detail: { mensaje: 'El conductor no es elegible para este vehículo', errores: ['Requiere C3', 'Requiere 3 años'] } };
    expect(mensajeDeError(cuerpo, 422)).toBe('El conductor no es elegible para este vehículo: Requiere C3; Requiere 3 años');
    expect(crearApiError(422, cuerpo).errores).toEqual(['Requiere C3', 'Requiere 3 años']);
  });

  it('detail como lista de validación de FastAPI', () => {
    const cuerpo = { detail: [{ loc: ['body', 'peso_kg'], msg: 'Input should be greater than 0', type: 'greater_than' }] };
    expect(mensajeDeError(cuerpo, 422)).toBe('peso_kg: Input should be greater than 0');
    expect(crearApiError(422, cuerpo).validacion).toHaveLength(1);
  });

  it('validación a nivel de cuerpo sin campo', () => {
    expect(mensajeDeError({ detail: [{ loc: ['body'], msg: 'Value error, Debe enviar cliente_id o codigo_cliente' }] }, 422)).toBe(
      'cuerpo: Value error, Debe enviar cliente_id o codigo_cliente',
    );
  });

  it('cuerpo vacío o desconocido', () => {
    expect(mensajeDeError(null, 500)).toBe('Error 500');
    expect(mensajeDeError({}, 0)).toBe('No hay conexión con el API Gateway.');
  });
});

describe('errores propios del gateway (sección 2.3)', () => {
  it('reconoce el servicio caído y el servicio afectado', () => {
    const e = crearApiError(503, { detail: { codigo: 'SERVICIO_NO_DISPONIBLE', mensaje: 'x', servicio: 'billing' } }, 'abc123');
    expect(e.esServicioCaido).toBe(true);
    expect(e.servicio).toBe('billing');
    expect(e.requestId).toBe('abc123');
    expect(describirError(e)).toContain('billing');
  });

  it('sin conexión', () => {
    const e = new ApiError({ status: 0, mensaje: 'sin red' });
    expect(e.esDeRed).toBe(true);
    expect(describirError(e)).toMatch(/CORS_ORIGINS/);
  });
});
