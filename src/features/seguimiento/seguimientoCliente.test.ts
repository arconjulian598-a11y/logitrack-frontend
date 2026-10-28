import { ApiError } from '@/lib/api/errors';
import { permitido, puede } from '@/lib/auth/permisos';
import { sinUbicacion } from '@/lib/dominio';
import type { SeguimientoCliente, Vehiculo } from '@/lib/types/api';
import { construirVista } from '../mapa/posiciones';
import { errorDefinitivo, esperaSiguiente, puntoDeEstela, seguimientoTerminado } from './useSeguimientoCliente';

const UUID = '3257edd0-1111-4222-8333-444455556666';

const seg = (o: Partial<SeguimientoCliente> = {}): SeguimientoCliente => ({
  envio_id: UUID,
  codigo_envio: 'ENV-00000001',
  estado_envio: 'en_transito',
  estado_viaje: 'en_curso',
  mensaje: 'En camino.',
  es_pedido_dividido: false,
  viaja_compartido: false,
  trazado_disponible: true,
  origen: { nombre: 'Bogotá', latitud: 4.711, longitud: -74.0721 },
  destino: { nombre: 'Cali', latitud: 3.4516, longitud: -76.532 },
  posicion: {
    disponible: true,
    latitud: 4.3823,
    longitud: -74.7141,
    velocidad_kmh: 60,
    actualizada_en: '2026-10-21T12:01:00Z',
    desactualizada: false,
    segundos_desde_actualizacion: 0,
    umbral_segundos: 60,
  },
  progreso: { porcentaje: 26.1, km_recorridos: 80, km_totales: 306.67, km_restantes: 226.67 },
  tiempos: { iniciado_en: null, hora_estimada_llegada: null, llegada_en: null, segundos_restantes: 113 },
  parada_actual: { en_parada: false, motivo: null },
  paradas: [],
  fase: 'viaje',
  ...o,
});

describe('polling del seguimiento del cliente', () => {
  it('5 s en curso, 10 s preparando/pausado/sin viaje, y se detiene al terminar', () => {
    expect(esperaSiguiente(seg(), 0)).toBe(5000);
    expect(esperaSiguiente(seg({ estado_viaje: 'preparando' }), 0)).toBe(10000);
    expect(esperaSiguiente(seg({ estado_viaje: 'pausada' }), 0)).toBe(10000);
    expect(esperaSiguiente(seg({ estado_viaje: 'sin_viaje', estado_envio: 'pendiente' }), 0)).toBe(10000);
    expect(esperaSiguiente(seg({ estado_viaje: 'finalizada' }), 0)).toBeNull();
    expect(esperaSiguiente(seg({ estado_viaje: 'cancelada' }), 0)).toBeNull();
    expect(esperaSiguiente(seg({ estado_viaje: 'sin_viaje', estado_envio: 'cancelado' }), 0)).toBeNull();
    expect(esperaSiguiente(seg({ estado_viaje: 'sin_viaje', estado_envio: 'entregado' }), 0)).toBeNull();
    expect(seguimientoTerminado(seg({ estado_envio: 'devuelto' }))).toBe(true);
  });
  it('tras errores de red espera 5, 10, 20, 40 y como máximo 60 s; al recuperarse vuelve a 5 s', () => {
    expect([1, 2, 3, 4, 5, 9].map((f) => esperaSiguiente(seg(), f))).toEqual([5000, 10000, 20000, 40000, 60000, 60000]);
    expect(esperaSiguiente(null, 3)).toBe(20000);
    expect(esperaSiguiente(seg(), 0)).toBe(5000);
  });
  it('404, 403 y 401 no se reintentan; red, 502, 503 y 504 sí', () => {
    const e = (status: number, codigo?: string) => new ApiError({ status, mensaje: 'x', codigo });
    expect(errorDefinitivo(e(404, 'ENVIO_NO_ENCONTRADO'))).toBe(true);
    expect(errorDefinitivo(e(403, 'SIN_PERMISO'))).toBe(true);
    expect(errorDefinitivo(e(401, 'TOKEN_EXPIRADO'))).toBe(true);
    for (const s of [0, 502, 503, 504]) expect(errorDefinitivo(e(s, 'SEGUIMIENTO_NO_DISPONIBLE'))).toBe(false);
  });
  it('la estela solo crece con posiciones reales, al día y con la carga a bordo', () => {
    expect(puntoDeEstela(seg())).toEqual({ tiempo: '2026-10-21T12:01:00Z', latitud: 4.3823, longitud: -74.7141 });
    expect(puntoDeEstela(seg({ fase: 'reposicion' }))).toBeNull();
    expect(puntoDeEstela(seg({ estado_viaje: 'pausada' }))).toBeNull();
    const vieja = seg();
    vieja.posicion = { ...vieja.posicion, desactualizada: true, segundos_desde_actualizacion: 300 };
    expect(puntoDeEstela(vieja)).toBeNull();
    const sinPos = seg();
    sinPos.posicion = { ...sinPos.posicion, disponible: false, latitud: null, longitud: null, actualizada_en: null };
    expect(puntoDeEstela(sinPos)).toBeNull();
  });
});

describe('permisos de la parte nueva', () => {
  it('el cliente solo sigue por /seguimiento/cliente/envio/{uuid}; el personal no usa esa ruta', () => {
    expect(permitido('cliente', 'GET', `/seguimiento/cliente/envio/${UUID}`)).toBe(true);
    expect(permitido('cliente', 'GET', `/seguimiento/cliente/envio/${UUID}/trazado`)).toBe(true);
    expect(permitido('cliente', 'GET', `/seguimiento/cliente/envio/${UUID}/recorrido?limite=500`)).toBe(true);
    expect(permitido('cliente', 'GET', '/seguimiento/flota')).toBe(false);
    expect(permitido('cliente', 'GET', `/seguimiento/envio/${UUID}`)).toBe(false);
    expect(permitido('cliente', 'GET', '/telemetria/x')).toBe(false);
    expect(permitido('operador', 'GET', `/seguimiento/cliente/envio/${UUID}`)).toBe(false);
    expect(puede('cliente', 'seguimientoCliente')).toBe(true);
    expect(puede('cliente', 'seguimiento')).toBe(false);
  });
  it('solo gestor y administrador fijan la ubicación de un vehículo', () => {
    expect(permitido('gestor_flota', 'PUT', '/vehiculos/1/ubicacion')).toBe(true);
    expect(permitido('administrador', 'PUT', '/vehiculos/1/ubicacion')).toBe(true);
    expect(permitido('operador', 'PUT', '/vehiculos/1/ubicacion')).toBe(false);
    expect(permitido('cliente', 'PUT', '/vehiculos/1/ubicacion')).toBe(false);
  });
});

const veh = (o: Partial<Vehiculo> = {}): Vehiculo => ({
  id: 'v1',
  placa: 'KQA794',
  tipo: 'camion',
  capacidad_kg: '5000.00',
  capacidad_m3: null,
  anio: null,
  vencimiento_seguro: null,
  estado: 'active',
  capacidad_refrigeracion: false,
  certificado_hazmat: false,
  capacidad_tanque_l: null,
  consumo_km_por_litro: null,
  tipo_combustible: null,
  ...o,
});

describe('ubicación base de los vehículos', () => {
  it('«sin ubicación»: sin latitud o con ubicación no confiable', () => {
    expect(sinUbicacion(veh())).toBe(true);
    expect(sinUbicacion(veh({ latitud: 4.7, longitud: -74, ubicacion_confiable: false }))).toBe(true);
    expect(sinUbicacion(veh({ latitud: 4.7, longitud: -74, ubicacion_confiable: true }))).toBe(false);
  });
  it('el mapa dibuja la ubicación registrada tal cual; sin ubicación ni lecturas, no dibuja nada', () => {
    const conBase = veh({ latitud: 4.711, longitud: -74.0721, ubicacion_confiable: true, ubicacion_nombre: 'Bogotá', ubicacion_actualizada_en: '2026-10-28T10:00:00Z' });
    const [a] = construirVista([conBase], [], [], new Map([['v1', { lectura: null, cargando: false }]]));
    expect(a).toMatchObject({ fuente: 'registrada', latitud: 4.711, longitud: -74.0721 });
    const [b] = construirVista([veh()], [], [], new Map([['v1', { lectura: null, cargando: false }]]));
    expect(b).toMatchObject({ fuente: 'sin_datos', latitud: null, longitud: null });
  });
});
