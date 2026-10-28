import { expect, test, type Page } from '@playwright/test';
import { vigilar } from '../util';
import { apiGet, control, elegir, entrarComo, GW } from './apoyo';

/**
 * Parte A (ubicación base obligatoria al crear vehículos) y Parte B (seguimiento de envíos para el
 * cliente), contra el gateway SIMULADO (e2e/mock/gateway_simulado.py).
 */
test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ page }) => control(page, 'reiniciar'));

interface VehiculoApi {
  id: string;
  placa: string;
  latitud: number | null;
  ubicacion_confiable: boolean;
  ubicacion_nombre: string | null;
}

async function envioCliente(page: Page, escenario: string, extra = ''): Promise<{ id: string; codigo_envio: string }> {
  const r = await page.request.post(`${GW}/__mock/envio_cliente?escenario=${escenario}${extra}`);
  expect(r.ok()).toBeTruthy();
  return r.json();
}

async function consultas(page: Page, envio: string): Promise<string[]> {
  const r = await page.request.get(`${GW}/__mock/seguimiento/consultas?envio=${envio}`);
  return ((await r.json()) as { t: string }[]).map((x) => x.t);
}

// ---------------------------------------------------------------------------------------------
// PARTE A
// ---------------------------------------------------------------------------------------------
test.describe('Parte A: ubicación base de los vehículos', () => {
  test('A1-A2-A6: crear exige elegir la ubicación de la lista (sin coordenadas a mano) y la placa repetida no borra lo escrito', async ({ page }) => {
    const v = vigilar(page);
    const token = await entrarComo(page, 'gestor_flota');
    const cuerpos: Record<string, unknown>[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith('/api/v1/vehiculos')) cuerpos.push(r.postDataJSON());
    });
    await page.goto('/flota/vehiculos');
    await page.getByRole('button', { name: 'Registrar vehículo' }).click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByRole('combobox', { name: 'Ubicación base' })).toBeVisible();
    // A2: no hay campos de latitud/longitud y «Registrar» no se activa sin ubicación
    await expect(dialogo.getByLabel(/latitud|longitud/i)).toHaveCount(0);
    await dialogo.getByLabel('Placa').fill('GOQ998');
    await dialogo.getByLabel('Capacidad (kg)').fill('4000');
    const crear = dialogo.getByRole('button', { name: 'Registrar vehículo' });
    await expect(crear).toBeDisabled();

    // A6: placa repetida -> 409 junto a la placa, sin perder lo escrito
    await elegir(page, 'Ubicación base', 'Sincelejo');
    await expect(crear).toBeEnabled();
    await crear.click();
    await expect(dialogo.getByText('Ya existe un vehículo con esa placa')).toBeVisible();
    await expect(dialogo.getByLabel('Placa')).toHaveValue('GOQ998');
    await expect(dialogo.getByLabel('Capacidad (kg)')).toHaveValue('4000');
    await expect(dialogo.getByRole('combobox', { name: 'Ubicación base' })).toContainText('Sincelejo');

    // A1: con otra placa se crea; el cuerpo lleva los datos de la ubicación elegida
    await dialogo.getByLabel('Placa').fill('NUE123');
    await crear.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const enviado = cuerpos.at(-1)!;
    const ubic = await apiGet<{ id: string; nombre: string; latitud: number; longitud: number }[]>(page, token, '/ubicaciones?q=Sincelejo');
    expect(enviado).toMatchObject({
      placa: 'NUE123',
      ubicacion_id: ubic[0]!.id,
      ubicacion_nombre: 'Sincelejo',
      latitud: ubic[0]!.latitud,
      longitud: ubic[0]!.longitud,
      codigo_pais: 'CO',
    });
    const lista = await apiGet<VehiculoApi[]>(page, token, '/vehiculos');
    expect(lista.find((x) => x.placa === 'NUE123')).toMatchObject({ ubicacion_confiable: true, ubicacion_nombre: 'Sincelejo' });
    // ...y aparece en el mapa
    await page.goto('/mapa');
    await expect(page.locator('.leaflet-marker-pane [title^="NUE123:"]')).toHaveCount(1);
    await v.verificar();
  });

  test('A3: un vehículo antiguo «Sin ubicación» se la fija desde el desplegable y entra al mapa', async ({ page }) => {
    const v = vigilar(page);
    await entrarComo(page, 'gestor_flota');
    await page.goto('/mapa');
    // A.4: el mapa avisa en lugar de dejarlo invisible
    await expect(page.locator('.leaflet-marker-pane [title^="KQA794:"]')).toHaveCount(0);
    await page.getByRole('button', { name: '1 vehículo sin ubicación' }).click();
    const aviso = page.getByRole('region', { name: 'Vehículos sin ubicación' });
    await expect(aviso.getByRole('link', { name: 'Placa KQA794' })).toBeVisible();
    await aviso.getByRole('button', { name: 'Establecer ubicación' }).click();
    await elegir(page, 'Ubicación base', 'Bogot');
    await page.getByRole('button', { name: 'Guardar ubicación' }).click();
    await expect(page.getByText('KQA794: ubicación base en Bogotá.')).toBeVisible();
    await expect(page.locator('.leaflet-marker-pane [title^="KQA794:"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: /sin ubicación/ })).toHaveCount(0);
    await v.verificar();
  });

  test('A3 (lista): «Sin ubicación» y «Establecer ubicación» en la lista de vehículos', async ({ page }) => {
    await entrarComo(page, 'administrador');
    const cuerpos: Record<string, unknown>[] = [];
    page.on('request', (r) => {
      if (r.method() === 'PUT' && r.url().includes('/ubicacion')) cuerpos.push(r.postDataJSON());
    });
    await page.goto('/flota/vehiculos');
    const fila = page.getByRole('row', { name: /KQA794/ });
    await expect(fila.getByText('Sin ubicación')).toBeVisible();
    await fila.getByRole('button', { name: 'Establecer ubicación' }).click();
    await expect(page).toHaveURL(/\/flota\/vehiculos$/); // el botón no abre la ficha
    await elegir(page, 'Ubicación base', 'Cartag');
    await page.getByRole('button', { name: 'Guardar ubicación' }).click();
    await expect(fila.getByText('Cartagena')).toBeVisible();
    await expect(fila.getByText('Sin ubicación')).toHaveCount(0);
    expect(cuerpos[0]).toMatchObject({ nombre: 'Cartagena', codigo_pais: 'CO', fuente: 'registro_gestor' });
    expect(Object.keys(cuerpos[0]!).sort()).toEqual(['codigo_pais', 'fuente', 'latitud', 'longitud', 'nombre', 'ubicacion_id']);
  });

  test('A4: vehículo en viaje -> aviso VEHICULO_EN_VIAJE y no se reintenta', async ({ page }) => {
    const token = await entrarComo(page, 'gestor_flota');
    const goq = (await apiGet<VehiculoApi[]>(page, token, '/vehiculos')).find((x) => x.placa === 'GOQ998')!;
    let puts = 0;
    page.on('request', (r) => {
      if (r.method() === 'PUT') puts += 1;
    });
    await page.goto(`/flota/vehiculos/${goq.id}`);
    await page.getByRole('button', { name: 'Cambiar ubicación' }).click();
    await elegir(page, 'Ubicación base', 'Sincelejo');
    await page.getByRole('button', { name: 'Guardar ubicación' }).click();
    await expect(page.getByText('El vehículo está en un viaje')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar ubicación' })).toBeDisabled();
    await page.waitForTimeout(1500);
    expect(puts).toBe(1);
  });

  test('A5: operador y cliente no ven el alta ni «Establecer ubicación»', async ({ page, browser }) => {
    await entrarComo(page, 'operador');
    await page.goto('/flota/vehiculos');
    await expect(page.getByRole('row', { name: /KQA794/ }).getByText('Sin ubicación')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Registrar vehículo' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Establecer ubicación|Cambiar ubicación/ })).toHaveCount(0);
    await page.goto('/mapa');
    await page.getByRole('button', { name: '1 vehículo sin ubicación' }).click();
    await expect(page.getByRole('region', { name: 'Vehículos sin ubicación' }).getByRole('button')).toHaveCount(0);

    const otra = await browser.newPage();
    await entrarComo(otra, 'cliente');
    await otra.goto('/flota/vehiculos');
    await expect(otra.getByText('No tiene permiso para ver esta sección')).toBeVisible();
    await expect(otra.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Vehículos' })).toHaveCount(0);
    await otra.close();
  });
});

// ---------------------------------------------------------------------------------------------
// PARTE B
// ---------------------------------------------------------------------------------------------
test.describe('Parte B: seguimiento para el cliente', () => {
  test('B1-B11: envío en curso con mapa, ruta, estela, marcador, progreso y ETA; se actualiza cada ~5 s y sin datos del vehículo', async ({ page }) => {
    const v = vigilar(page);
    const e = await envioCliente(page, 'en_curso');
    await entrarComo(page, 'cliente');
    const urls: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/v1/')) urls.push(r.url());
    });
    await page.goto('/envios');
    await page.getByRole('link', { name: `Ver seguimiento de ${e.codigo_envio}` }).click();
    await expect(page).toHaveURL(new RegExp(`/seguimiento/${e.id}$`));
    await expect(page.getByRole('region', { name: `Mapa del envío ${e.codigo_envio}` })).toBeVisible();
    await expect(page.getByText('En camino.')).toBeVisible();
    await expect(page.locator('.leaflet-overlay-pane path')).not.toHaveCount(0); // ruta y estela
    await expect(page.getByRole('progressbar')).toBeVisible();
    await expect(page.getByText('Llegada estimada')).toBeVisible();
    await expect(page.getByText(/Última actualización:/)).toBeVisible();
    const pin = page.locator('.leaflet-marker-pane .lt-pin.is-selected');
    await expect(pin).toHaveCount(1);
    const antes = await pin.evaluate((el) => (el.closest('.leaflet-marker-icon') as unknown as { style: { transform: string } }).style.transform);
    await page.waitForTimeout(11000);
    const despues = await pin.evaluate((el) => (el.closest('.leaflet-marker-icon') as unknown as { style: { transform: string } }).style.transform);
    expect(despues).not.toBe(antes); // se movió a la nueva posición del backend
    const t = (await consultas(page, e.id)).map((x) => Date.parse(x));
    expect(t.length).toBeGreaterThanOrEqual(3);
    const pasos = t.slice(1).map((x, i) => x - t[i]!);
    for (const p of pasos.slice(-2)) {
      expect(p).toBeGreaterThan(4000);
      expect(p).toBeLessThan(7000);
    }

    // B11 (cliente): nada de placa, conductor ni combustible; nada de endpoints del personal ni cliente_id
    for (const prohibido of ['GOQ998', 'Andrés', 'Combustible']) await expect(page.getByText(prohibido)).toHaveCount(0);
    expect(urls.filter((u) => /seguimiento\/(flota|vehiculo|codigo|envio)\b|telemetria|simulaciones/.test(u))).toEqual([]);
    expect(urls.filter((u) => u.includes('seguimiento/cliente') && /cliente_id|customer_id/.test(u))).toEqual([]);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toMatch(/latitud|longitud/);
    // tampoco en «Mis envíos» ni en el detalle
    await page.goto(`/envios/${e.id}`);
    await expect(page.getByRole('link', { name: 'Ver seguimiento' })).toBeVisible();
    for (const prohibido of ['GOQ998', 'Andrés Pérez']) await expect(page.getByText(prohibido)).toHaveCount(0);
    await page.goto('/envios');
    await expect(page.getByText('GOQ998')).toHaveCount(0);
    await v.verificar();
  });

  test('B2-B3-B7: sin vehículo, preparando y tramo hacia la recogida', async ({ page }) => {
    const sinViaje = await envioCliente(page, 'sin_viaje');
    const preparando = await envioCliente(page, 'preparando');
    const repo = await envioCliente(page, 'reposicion');
    await entrarComo(page, 'cliente');

    await page.goto(`/seguimiento/${sinViaje.id}`);
    await expect(page.getByText('Estamos asignando un vehículo a su envío.')).toBeVisible();
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
    await expect(page.locator('.lt-pin')).toHaveCount(0);

    await page.goto(`/seguimiento/${preparando.id}`);
    await expect(page.getByText('Preparando el viaje.')).toBeVisible();
    await expect(page.getByText('Todavía no hay ubicación disponible.')).toBeVisible();
    await expect(page.locator('.lt-pin.is-selected')).toHaveCount(0);

    await page.goto(`/seguimiento/${repo.id}`);
    await expect(page.getByText('El vehículo se dirige al punto de recogida.')).toBeVisible();
    await expect(page.getByText('0 %')).toBeVisible();
    await expect(page.getByText('El avance empieza cuando el vehículo recoge su carga')).toBeVisible();
    await expect(page.locator('.leaflet-marker-pane .lt-pin.is-selected')).toHaveCount(1);
  });

  test('B4: ubicación desactualizada: marcador en la última posición y aviso con el tiempo', async ({ page }) => {
    const e = await envioCliente(page, 'desactualizada');
    await entrarComo(page, 'cliente');
    await page.goto(`/seguimiento/${e.id}`);
    await expect(page.getByText('Ubicación desactualizada (hace 7 min).')).toBeVisible();
    await expect(page.locator('.leaflet-marker-pane .lt-pin.is-selected.is-historica')).toHaveCount(1);
  });

  test('B5-B6: entregado y cancelado muestran el mensaje final y dejan de consultar', async ({ page }) => {
    const fin = await envioCliente(page, 'en_curso');
    const can = await envioCliente(page, 'en_curso');
    await control(page, `seguimiento?envio=${fin.id}&escenario=finalizada`);
    await control(page, `seguimiento?envio=${can.id}&escenario=cancelada`);
    await entrarComo(page, 'cliente');

    await page.goto(`/seguimiento/${fin.id}`);
    await expect(page.getByText('Llegó a su destino.')).toBeVisible();
    await expect(page.getByText('Seguimiento terminado: ya no se actualiza.')).toBeVisible();
    await expect(page.locator('.leaflet-marker-pane .lt-pin.is-selected')).toHaveCount(1);
    const n1 = (await consultas(page, fin.id)).length;
    await page.waitForTimeout(11000);
    expect((await consultas(page, fin.id)).length).toBe(n1);

    await page.goto(`/seguimiento/${can.id}`);
    await expect(page.getByText('Envío cancelado.')).toBeVisible();
    const n2 = (await consultas(page, can.id)).length;
    await page.waitForTimeout(11000);
    expect((await consultas(page, can.id)).length).toBe(n2);
  });

  test('B8: el envío de otro cliente responde «Envío no encontrado» sin pistas ni reintentos', async ({ page }) => {
    const ajeno = await envioCliente(page, 'en_curso', '&ajeno=true');
    await entrarComo(page, 'cliente');
    await page.goto(`/seguimiento/${ajeno.id}`);
    await expect(page.getByText('Envío no encontrado')).toBeVisible();
    await expect(page.getByText(ajeno.codigo_envio)).toHaveCount(0);
    // Sin reintentos: tras el 404 no sale ninguna consulta más (en desarrollo, StrictMode monta el efecto
    // dos veces y la primera petición se cancela; por eso se cuenta desde que aparece el mensaje)
    const n = (await consultas(page, ajeno.id)).length;
    expect(n).toBeLessThanOrEqual(2);
    await page.waitForTimeout(11000);
    expect(await consultas(page, ajeno.id)).toHaveLength(n);
  });

  test('B9: 503 o red caída: aviso de no actualizado, conserva lo último y reintenta con espera creciente', async ({ page }) => {
    const e = await envioCliente(page, 'en_curso');
    await entrarComo(page, 'cliente');
    await page.goto(`/seguimiento/${e.id}`);
    await expect(page.locator('.leaflet-marker-pane .lt-pin.is-selected')).toHaveCount(1);
    await control(page, 'seguimiento?fallos=2');
    await expect(page.getByText('No se pudo actualizar')).toBeVisible({ timeout: 8000 });
    // lo último sigue en pantalla
    await expect(page.locator('.leaflet-marker-pane .lt-pin.is-selected')).toHaveCount(1);
    await expect(page.getByText('En camino.')).toBeVisible();
    await expect(page.getByText(/Próximo intento en (5|10) s/)).toBeVisible();
    await expect(page.getByText('No se pudo actualizar')).toHaveCount(0, { timeout: 20000 });
    const t = (await consultas(page, e.id)).map((x) => Date.parse(x));
    const pasos = t.slice(1).map((x, i) => x - t[i]!);
    // ... ok, falla, falla(+5 s), ok(+10 s): espera creciente
    const ultimos = pasos.slice(-2);
    expect(ultimos[0]).toBeGreaterThan(4000);
    expect(ultimos[1]).toBeGreaterThan(9000);
  });

  test('B10: sesión vencida (401) lleva al inicio de sesión', async ({ page }) => {
    const e = await envioCliente(page, 'en_curso');
    await entrarComo(page, 'cliente');
    await page.goto(`/seguimiento/${e.id}`);
    await expect(page.getByText('En camino.')).toBeVisible();
    await page.evaluate(() => sessionStorage.clear()); // que el script de la prueba no vuelva a poner la sesión
    await control(page, 'expirar');
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    await expect(page.getByText(/Su sesión terminó/)).toBeVisible();
  });

  test('B13: cambiar de pantalla, ocultar la pestaña o cerrar sesión detiene las consultas', async ({ page }) => {
    const e = await envioCliente(page, 'en_curso');
    await entrarComo(page, 'cliente');
    await page.goto(`/seguimiento/${e.id}`);
    await expect(page.getByText('En camino.')).toBeVisible();

    // pestaña oculta: pausa; al volver consulta enseguida
    await page.evaluate(() => {
      const doc = (globalThis as unknown as { document: object & { dispatchEvent: (e: Event) => void } }).document;
      Object.defineProperty(doc, 'visibilityState', { configurable: true, get: () => 'hidden' });
      doc.dispatchEvent(new Event('visibilitychange'));
    });
    const oculta = (await consultas(page, e.id)).length;
    await page.waitForTimeout(11000);
    expect((await consultas(page, e.id)).length).toBe(oculta);
    await page.evaluate(() => {
      const doc = (globalThis as unknown as { document: object & { dispatchEvent: (e: Event) => void } }).document;
      Object.defineProperty(doc, 'visibilityState', { configurable: true, get: () => 'visible' });
      doc.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(async () => (await consultas(page, e.id)).length, { timeout: 2000 }).toBe(oculta + 1);

    // salir de la pantalla
    await page.getByRole('link', { name: 'Mis envíos' }).first().click();
    await expect(page).toHaveURL(/\/envios$/);
    const fuera = (await consultas(page, e.id)).length;
    await page.waitForTimeout(11000);
    expect((await consultas(page, e.id)).length).toBe(fuera);

    // cerrar sesión desde el seguimiento
    await page.goto(`/seguimiento/${e.id}`);
    await expect(page.getByText('En camino.')).toBeVisible();
    await page.evaluate(() => sessionStorage.clear());
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    const tras = (await consultas(page, e.id)).length;
    await page.waitForTimeout(11000);
    expect((await consultas(page, e.id)).length).toBe(tras);
  });

  test('pedido dividido: sin mapa del pedido; cada parte abre su propio seguimiento', async ({ page }) => {
    const e = await envioCliente(page, 'en_curso', '&dividido=true');
    await entrarComo(page, 'cliente');
    await page.goto(`/seguimiento/${e.id}`);
    await expect(page.getByText('Partes de su pedido')).toBeVisible();
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
    await expect(page.getByText('PRT001')).toHaveCount(0);
    await page.getByRole('link', { name: 'Ver seguimiento' }).first().click();
    await expect(page).toHaveURL(/\/seguimiento\/[0-9a-f-]{36}$/);
    await expect(page.getByText('En camino.')).toBeVisible();
    await expect(page.locator('.leaflet-container')).toHaveCount(1);
  });

  test('B11 (personal): operador y gestor siguen viendo el mapa del personal igual que antes', async ({ page }) => {
    const v = vigilar(page);
    const e = await envioCliente(page, 'en_curso');
    await entrarComo(page, 'operador');
    await page.goto(`/envios/${e.id}`);
    await expect(page.getByText('Ruta y posición')).toBeVisible();
    await expect(page.locator('.leaflet-marker-pane .lt-pin-label', { hasText: 'GOQ998' })).toHaveCount(1);
    await expect(page.getByText('Combustible', { exact: true })).toBeVisible();
    await expect(page.getByText(/Viaje simulado y acelerado/)).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Seguimiento' })).toHaveCount(0);
    await page.goto(`/seguimiento/${e.id}`);
    await expect(page.getByText('No tiene permiso para ver esta sección')).toBeVisible();
    await v.verificar();
  });

  test('menú del cliente: «Seguimiento» lista sus envíos sin abrir un polling por tarjeta', async ({ page }) => {
    const a = await envioCliente(page, 'en_curso');
    const b = await envioCliente(page, 'en_curso');
    await entrarComo(page, 'cliente');
    await page.goto('/envios');
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Seguimiento' }).click();
    await expect(page.getByRole('heading', { name: 'Seguimiento' })).toBeVisible();
    await expect(page.getByRole('link', { name: `Ver seguimiento de ${a.codigo_envio}` })).toBeVisible();
    await expect(page.getByRole('link', { name: `Ver seguimiento de ${b.codigo_envio}` })).toBeVisible();
    await page.waitForTimeout(6000);
    expect(await consultas(page, a.id)).toHaveLength(0);
    expect(await consultas(page, b.id)).toHaveLength(0);
  });
});

test('@movil seguimiento del cliente y registrar vehículo caben en un teléfono', async ({ page, browser }) => {
  const e = await envioCliente(page, 'en_curso');
  await entrarComo(page, 'cliente');
  await page.goto(`/seguimiento/${e.id}`);
  await expect(page.getByText('En camino.')).toBeVisible();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  const desborde = () =>
    page.evaluate(() => {
      const g = globalThis as unknown as { document: { documentElement: { scrollWidth: number } }; innerWidth: number };
      return g.document.documentElement.scrollWidth - g.innerWidth;
    });
  expect(await desborde()).toBeLessThanOrEqual(0);

  const otra = await browser.newPage({ viewport: { width: 360, height: 740 } });
  await entrarComo(otra, 'gestor_flota');
  await otra.goto('/flota/vehiculos');
  await otra.getByRole('button', { name: 'Registrar vehículo' }).click();
  await expect(otra.getByRole('combobox', { name: 'Ubicación base' })).toBeVisible();
  expect(
    await otra.evaluate(() => {
      const g = globalThis as unknown as { document: { documentElement: { scrollWidth: number } }; innerWidth: number };
      return g.document.documentElement.scrollWidth - g.innerWidth;
    }),
  ).toBeLessThanOrEqual(0);
  await otra.close();
});
