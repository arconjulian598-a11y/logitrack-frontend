import { expect, test } from '@playwright/test';
import { API, vigilar } from './util';

/** Recorre todas las páginas contra el backend real: sin errores de consola ni 5xx del gateway. */
const PAGINAS: { ruta: string; titulo: RegExp }[] = [
  { ruta: '/', titulo: /Panel de operación/ },
  { ruta: '/mapa', titulo: /Vehículos/ },
  { ruta: '/envios', titulo: /^Envíos$/ },
  { ruta: '/envios/nuevo', titulo: /Nuevo envío/ },
  { ruta: '/rutas', titulo: /Rutas y asignaciones/ },
  { ruta: '/rutas?tab=maestras', titulo: /Rutas y asignaciones/ },
  { ruta: '/rutas?tab=asignaciones', titulo: /Rutas y asignaciones/ },
  { ruta: '/aduanas', titulo: /Aduanas/ },
  { ruta: '/flota/vehiculos', titulo: /Vehículos/ },
  { ruta: '/flota/conductores', titulo: /Conductores/ },
  { ruta: '/flota/conductores?tab=auditoria', titulo: /Conductores/ },
  { ruta: '/telemetria', titulo: /Telemetría/ },
  { ruta: '/mantenimiento', titulo: /Mantenimiento/ },
  { ruta: '/clientes', titulo: /Clientes/ },
  { ruta: '/facturacion', titulo: /Facturación y costos/ },
  { ruta: '/facturacion?tab=tarifas', titulo: /Facturación y costos/ },
  { ruta: '/facturacion?tab=costos', titulo: /Facturación y costos/ },
  { ruta: '/notificaciones', titulo: /Notificaciones/ },
  { ruta: '/notificaciones?tab=preferencias', titulo: /Notificaciones/ },
  { ruta: '/analitica', titulo: /Analítica/ },
  { ruta: '/ubicaciones', titulo: /Ubicaciones/ },
  { ruta: '/simulaciones', titulo: /Simulaciones de viaje/ },
  { ruta: '/sistema', titulo: /Estado del sistema/ },
];

function nombre(ruta: string) {
  return ruta === '/' ? 'panel' : ruta.replace(/^\//, '').replace(/[/?=&]/g, '_');
}

for (const p of PAGINAS) {
  test(`carga ${p.ruta} @movil`, async ({ page }, info) => {
    const v = vigilar(page);
    await page.goto(p.ruta);
    await expect(page.getByRole('heading', { name: p.titulo }).first()).toBeVisible();
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `capturas/${info.project.name}/${nombre(p.ruta)}.png`, fullPage: info.project.name !== 'movil' });
    await v.verificar();
  });
}

test('páginas de detalle con datos reales', async ({ page, request }, info) => {
  const v = vigilar(page);
  const envios = (await (await request.get(`${API}/envios`)).json()) as { id: string; estado: string; ruta_id: string | null; ruta_maestra_id: string | null; cliente_id: string; vehiculo_id: string | null; conductor_id: string | null }[];
  const enCurso = envios.find((e) => e.estado === 'en_transito') ?? envios[0]!;
  const conRuta = envios.find((e) => e.ruta_id)!;
  const detalles = [
    { ruta: `/envios/${enCurso.id}`, nombre: 'envio_detalle' },
    { ruta: `/rutas/${conRuta.ruta_id}`, nombre: 'ruta_detalle' },
    { ruta: `/rutas/maestras/${conRuta.ruta_maestra_id}`, nombre: 'ruta_maestra' },
    { ruta: `/clientes/${enCurso.cliente_id}`, nombre: 'cliente_detalle' },
    { ruta: `/flota/vehiculos/${enCurso.vehiculo_id}`, nombre: 'vehiculo_detalle' },
    { ruta: `/flota/conductores/${enCurso.conductor_id}`, nombre: 'conductor_detalle' },
    { ruta: `/telemetria?vehiculo=${enCurso.vehiculo_id}`, nombre: 'telemetria_vehiculo' },
    { ruta: `/mantenimiento?vehiculo=${enCurso.vehiculo_id}`, nombre: 'mantenimiento_vehiculo' },
    { ruta: `/mapa?v=${enCurso.vehiculo_id}`, nombre: 'mapa_seleccion' },
  ];
  for (const d of detalles) {
    await page.goto(d.ruta);
    await expect(page.locator('h1').first()).toBeVisible();
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `capturas/${info.project.name}/${d.nombre}.png`, fullPage: true });
  }
  await v.verificar();
});

test('tema oscuro: páginas principales sin errores', async ({ page }, info) => {
  const v = vigilar(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  for (const [ruta, nombre] of [
    ['/', 'oscuro_panel'],
    ['/mapa', 'oscuro_mapa'],
    ['/analitica', 'oscuro_analitica'],
    ['/envios', 'oscuro_envios'],
  ] as const) {
    await page.goto(ruta);
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `capturas/${info.project.name}/${nombre}.png`, fullPage: ruta !== '/mapa' });
  }
  await v.verificar();
});
