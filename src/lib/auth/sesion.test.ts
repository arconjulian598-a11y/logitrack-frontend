import { solicitar } from '@/lib/api/http';
import { cerrarSesion, iniciarSesion, motivoCierre, sesionActual, token } from './sesion';

const usuario = {
  id: 'u1',
  email: 'ana@empresa.co',
  nombre: 'Ana',
  rol: 'operador' as const,
  cliente_id: null,
  codigo_cliente: null,
  activo: true,
};

function respuesta(status: number, cuerpo: unknown) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('sesión y cliente HTTP', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cerrarSesion('salida');
  });

  it('guarda el token en sessionStorage (nunca en localStorage) y lo envía como Bearer', async () => {
    iniciarSesion({ access_token: 'tok-123', expires_in: 28800, usuario });
    expect(sessionStorage.getItem('logitrack_sesion')).toContain('tok-123');
    expect(JSON.stringify({ ...localStorage })).not.toContain('tok-123');
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respuesta(200, []));
    await solicitar('GET', '/envios');
    const cabeceras = (f.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
    expect(cabeceras.Authorization).toBe('Bearer tok-123');
  });

  it('un 401 cierra la sesión (volver al inicio de sesión)', async () => {
    iniciarSesion({ access_token: 'tok-viejo', expires_in: 28800, usuario });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respuesta(401, { detail: { codigo: 'TOKEN_EXPIRADO', mensaje: 'Expiró' } }));
    await expect(solicitar('GET', '/envios')).rejects.toMatchObject({ status: 401, codigo: 'TOKEN_EXPIRADO' });
    expect(sesionActual()).toBeNull();
    expect(token()).toBeNull();
    expect(motivoCierre()).toBe('expirada');
  });

  it('un 403 SIN_PERMISO no cierra la sesión', async () => {
    iniciarSesion({ access_token: 'tok-1', expires_in: 28800, usuario });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respuesta(403, { detail: { codigo: 'SIN_PERMISO', mensaje: 'No' } }));
    await expect(solicitar('POST', '/envios/1/cancelar')).rejects.toMatchObject({ status: 403, sinPermiso: true });
    expect(token()).toBe('tok-1');
  });

  it('el inicio de sesión no envía token y su 401 no se toma como sesión vencida', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respuesta(401, { detail: { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'x' } }));
    await expect(solicitar('POST', '/auth/login', { body: { email: 'a', password: 'b' }, publica: true })).rejects.toMatchObject({
      codigo: 'CREDENCIALES_INVALIDAS',
    });
    const cabeceras = (f.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
    expect(cabeceras.Authorization).toBeUndefined();
    expect(motivoCierre()).toBe('salida');
  });

  it('las lecturas se reintentan si el backend está despertando (503) y luego responden', async () => {
    vi.useFakeTimers();
    const f = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(respuesta(503, { detail: { codigo: 'SERVICIO_NO_DISPONIBLE', mensaje: 'dormido' } }))
      .mockResolvedValueOnce(respuesta(200, [{ id: 1 }]));
    const p = solicitar<unknown[]>('GET', '/envios');
    await vi.advanceTimersByTimeAsync(3000);
    await expect(p).resolves.toEqual([{ id: 1 }]);
    expect(f).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('un POST no se repite solo (podría crear dos veces)', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respuesta(503, { detail: { codigo: 'SERVICIO_NO_DISPONIBLE', mensaje: 'x' } }));
    await expect(solicitar('POST', '/envios', { body: {} })).rejects.toMatchObject({ status: 503 });
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('respuestas de error en HTML', () => {
  afterEach(() => vi.restoreAllMocks());
  it('una página 502 en HTML se convierte en un mensaje claro (sin mostrar HTML)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<!DOCTYPE html><html><title>502</title></html>', { status: 502, headers: { 'X-Gateway-Servicio': 'shipment' } }),
    );
    const e = (await solicitar('POST', '/auth/login', { body: {}, publica: true }).catch((x: unknown) => x)) as { codigo?: string; message: string };
    expect(e.codigo).toBe('SERVICIO_NO_DISPONIBLE');
    expect(e.message).toContain('shipment');
    expect(e.message).not.toContain('<');
  });
});
