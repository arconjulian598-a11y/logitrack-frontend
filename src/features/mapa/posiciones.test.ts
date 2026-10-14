import type { Conductor, LecturaTelemetria, SeguimientoResumen, Vehiculo } from '@/lib/types/api';
import { construirVista, estadoMapa, tienePosicion } from './posiciones';

const veh = (id: string, estado = 'active'): Vehiculo => ({
  id,
  placa: id.toUpperCase(),
  tipo: 'camion',
  capacidad_kg: '3000.00',
  capacidad_m3: null,
  anio: null,
  vencimiento_seguro: null,
  estado,
  capacidad_refrigeracion: false,
  certificado_hazmat: false,
  capacidad_tanque_l: null,
  consumo_km_por_litro: null,
  tipo_combustible: null,
});

const viaje = (vehiculo_id: string, estado = 'en_curso', lat: number | null = 8.7): SeguimientoResumen => ({
  envio_id: `e-${vehiculo_id}`,
  codigo_envio: 'ENV-00000001',
  vehiculo_id,
  placa: null,
  estado,
  origen: null,
  destino: null,
  latitud: lat,
  longitud: lat === null ? null : -75.8,
  velocidad_actual_kmh: 64,
  progreso_pct: 40,
  combustible_pct: 70,
  hora_estimada_llegada: null,
});

const lectura = (vehiculo_id: string): LecturaTelemetria => ({
  id: 1,
  tiempo: '2026-10-13T20:00:00Z',
  vehiculo_id,
  latitud: '10.39',
  longitud: '-75.48',
  velocidad_kmh: '0.00',
  nivel_combustible_pct: '55.00',
  temperatura_carga_c: null,
  kilometraje_acumulado_km: '1200.00',
  horas_motor: null,
  codigo_obd2: null,
  temperatura_motor_c: '88.00',
});

const conductor: Conductor = {
  id: 'c1',
  codigo_conductor: 1000000001,
  nombre: 'Francisco',
  licencia_numero: 'L1',
  categorias_licencia: 'C2',
  certificacion_hazmat: false,
  anios_experiencia: 5,
  vehiculo_id: 'a',
  horas_semanales: '40.00',
  estado: 'en_ruta',
};

describe('construirVista: posiciones sin inventar', () => {
  it('usa la posición en vivo del seguimiento para vehículos en viaje', () => {
    const [v] = construirVista([veh('a', 'en_transito')], [conductor], [viaje('a')], new Map());
    expect(v!.fuente).toBe('en_vivo');
    expect(v!.latitud).toBe(8.7);
    expect(v!.conductor?.nombre).toBe('Francisco');
    expect(v!.estadoMapa).toBe('en_ruta');
  });

  it('usa la última lectura de telemetría (histórica) para vehículos sin viaje', () => {
    const ultimas = new Map([['b', { lectura: lectura('b'), cargando: false }]]);
    const [v] = construirVista([veh('b')], [], [], ultimas);
    expect(v!.fuente).toBe('historica');
    expect(v!.latitud).toBeCloseTo(10.39);
    expect(v!.posicionEn).toBe('2026-10-13T20:00:00Z');
    expect(v!.estadoMapa).toBe('libre');
  });

  it('sin datos no inventa coordenadas', () => {
    const ultimas = new Map([['c', { lectura: null, cargando: false }]]);
    const [v] = construirVista([veh('c', 'fuera_de_servicio')], [], [], ultimas);
    expect(v!.fuente).toBe('sin_datos');
    expect(tienePosicion(v!)).toBe(false);
    expect(v!.estadoMapa).toBe('fuera_servicio');
  });

  it('marca «cargando» mientras llega la telemetría', () => {
    const [v] = construirVista([veh('d')], [], [], new Map([['d', { lectura: undefined, cargando: true }]]));
    expect(v!.fuente).toBe('cargando');
  });

  it('un viaje sin coordenadas cae a la última lectura', () => {
    const ultimas = new Map([['e', { lectura: lectura('e'), cargando: false }]]);
    const [v] = construirVista([veh('e', 'en_transito')], [], [viaje('e', 'en_curso', null)], ultimas);
    expect(v!.fuente).toBe('historica');
    expect(v!.estadoMapa).toBe('en_ruta');
  });
});

describe('estadoMapa: estado operativo independiente de la posición', () => {
  it('pausa por aduana', () => expect(estadoMapa(veh('x', 'en_transito'), viaje('x', 'pausada'))).toBe('detenido_aduana'));
  it('asignado sin viaje iniciado', () => expect(estadoMapa(veh('x', 'en_transito'), null)).toBe('asignado'));
  it('mantenimiento', () => expect(estadoMapa(veh('x', 'en_mantenimiento'), null)).toBe('mantenimiento'));
});
