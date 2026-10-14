import { expect, test, type Page } from '@playwright/test';
import { API, vigilar } from './util';

/**
 * Pruebas de lo pedido para los envíos, contra el backend REAL:
 *  1. Un clic = un envío: doble o triple clic (o la misma petición repetida) no crea duplicados.
 *  2. Todo automático: al crear el envío se asignan vehículo y conductor sin intervención.
 *  3. Recoger en el camino: un pedido que sale de un punto intermedio de un viaje en curso
 *     (Sahagún, en la ruta Montería → Sincelejo) se asigna al MISMO vehículo y conductor.
 *  4. Seguimiento en tiempo real: la ficha del envío muestra cómo avanza (recogida, entrega).
 *
 * Requisitos: un cliente activo, un vehículo libre con conductor habilitado y la ruta
 * Montería → Sincelejo pasando por Sahagún (catálogo de ubicaciones actualizado).
 */

type Envio = {
  id: string;
  codigo_envio: string;
  estado: string;
  peso_kg: string;
  placa_vehiculo: string | null;
  conductor_nombre: string | null;
  vehiculo_id: string | null;
  creado_en: string;
};
type Seguimiento = { estado_viaje: string; mensaje: string; progreso: { porcentaje: number; km_recorridos: number } };

const ASIGNADO = ['asignado', 'en_transito', 'entregado'];

async function api<T>(page: Page, ruta: string): Promise<T> {
  const r = await page.request.get(`${API}${ruta}`);
  expect(r.ok(), `GET ${ruta} → ${r.status()}`).toBeTruthy();
  return (await r.json()) as T;
}

async function elegir(page: Page, etiqueta: string, texto: string) {
  await page.getByRole('combobox', { name: etiqueta, exact: true }).click();
  const buscar = page.getByRole('textbox', { name: 'Buscar', exact: true });
  await buscar.fill(texto);
  await expect(page.getByRole('status', { name: 'Buscando' })).toHaveCount(0);
  const primera = page.getByRole('listbox').getByRole('option').first();
  await expect.poll(async () => ((await primera.textContent()) ?? '').toLowerCase()).toContain(texto.toLowerCase());
  await buscar.press('Enter');
}

/** Peso con decimales únicos: identifica en la base el envío creado por esta prueba. */
function pesoUnico(base: number): string {
  return `${base + Math.floor(Math.random() * 50)}.${String(Math.floor(Math.random() * 90) + 10)}`;
}

async function clienteActivo(page: Page) {
  const clientes = await api<{ id: string; nombre: string; activo: boolean }[]>(page, '/clientes');
  const c = clientes.find((x) => x.activo);
  expect(c, 'Se necesita al menos un cliente activo').toBeTruthy();
  return c!;
}

async function ubicacion(page: Page, codigo: string) {
  return api<{ id: string; nombre: string }>(page, `/ubicaciones/codigo/${codigo}`);
}

async function esperarAsignado(page: Page, id: string, timeout = 60_000): Promise<Envio> {
  await expect
    .poll(async () => (await api<Envio>(page, `/envios/${id}`)).estado, { timeout, message: 'el envío debe asignarse solo' })
    .toMatch(new RegExp(`^(${ASIGNADO.join('|')})$`));
  return api<Envio>(page, `/envios/${id}`);
}

test.describe.configure({ mode: 'serial' });

test('un clic = un envío: doble/triple clic y peticiones repetidas no duplican', async ({ page }) => {
  const v = vigilar(page);
  const cliente = await clienteActivo(page);
  const peso = pesoUnico(300);
  await page.goto('/envios/nuevo');
  await elegir(page, 'Cliente', cliente.nombre.slice(0, 6));
  await elegir(page, 'Origen', 'Monter');
  await elegir(page, 'Destino', 'Sincelejo');
  await page.getByLabel('Peso (kg)').fill(peso);
  await expect(page.getByText('La flota puede transportar esta carga')).toBeVisible();

  // Tres clics en el mismo instante (más rápido de lo que una persona puede): el caso más difícil,
  // porque ocurren antes de que la pantalla alcance a deshabilitar el botón.
  await page.locator('form button[type="submit"]').evaluate((b) => {
    const boton = b as unknown as { click: () => void };
    boton.click();
    boton.click();
    boton.click();
  });
  await expect(page).toHaveURL(/\/envios\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  const id = page.url().split('/').pop()!;

  // Además, la misma petición llega otras 3 veces a la vez (otra pestaña, red lenta): el servidor la frena
  const creado = await api<Envio & { cliente_id: string; origen_id: string; destino_id: string }>(page, `/envios/${id}`);
  const cuerpo = {
    cliente_id: creado.cliente_id,
    origen_id: creado.origen_id,
    destino_id: creado.destino_id,
    peso_kg: Number(peso),
    tipo_carga: 'general',
    es_hazmat: false,
  };
  const repetidas = await Promise.all([1, 2, 3].map(() => page.request.post(`${API}/envios`, { data: cuerpo })));
  for (const r of repetidas) expect((await r.json()).id).toBe(id);

  const todos = await api<Envio[]>(page, '/envios');
  const conEsePeso = todos.filter((e) => Number(e.peso_kg).toFixed(2) === Number(peso).toFixed(2));
  expect(conEsePeso.map((e) => e.codigo_envio), 'solo debe existir un envío con ese pedido').toHaveLength(1);
  await v.verificar();
});

test('todo automático: vehículo y conductor asignados sin intervención', async ({ page }) => {
  const v = vigilar(page);
  const todos = await api<Envio[]>(page, '/envios');
  const ultimo = todos.sort((a, b) => b.creado_en.localeCompare(a.creado_en))[0]!;
  const e = await esperarAsignado(page, ultimo.id);
  expect(e.placa_vehiculo, 'vehículo asignado automáticamente').toBeTruthy();
  expect(e.conductor_nombre, 'conductor asignado automáticamente').toBeTruthy();

  await page.goto(`/envios/${e.id}`);
  await expect(page.getByRole('heading', { name: e.codigo_envio })).toBeVisible();
  await expect(page.getByText(e.conductor_nombre!).first()).toBeVisible();
  await v.verificar();
});

test('recoger en el camino y seguimiento en tiempo real (Montería → Sincelejo, pedido en Sahagún)', async ({ page }) => {
  test.setTimeout(240_000);
  const v = vigilar(page);
  const cliente = await clienteActivo(page);
  const [mtr, sin, sah] = await Promise.all([ubicacion(page, 'CO-MTR'), ubicacion(page, 'CO-SIN'), ubicacion(page, 'CO-SAH')]);

  // La ruta del viaje debe pasar por Sahagún
  const ruta = await (await page.request.post(`${API}/rutas-maestras/calcular`, { data: { origen_id: mtr.id, destino_id: sin.id } })).json();
  expect((ruta.paradas ?? []).map((p: { nombre: string }) => p.nombre), 'Montería → Sincelejo debe pasar por Sahagún').toContain(sah.nombre);

  // El pedido en Sahagún hacia Sincelejo se deja listo en la interfaz ANTES de que salga el viaje,
  // para enviarlo apenas el vehículo arranque (a la velocidad de la simulación pasa rápido por Sahagún).
  await page.goto('/envios/nuevo');
  await elegir(page, 'Cliente', cliente.nombre.slice(0, 6));
  await elegir(page, 'Origen', 'Sahag');
  await elegir(page, 'Destino', 'Sincelejo');
  await page.getByLabel('Peso (kg)').fill(pesoUnico(100));
  await expect(page.getByText('La flota puede transportar esta carga')).toBeVisible();

  // Debe haber un vehículo con conductor libre para el viaje (los de pruebas anteriores pueden seguir en ruta)
  await expect
    .poll(
      async () => {
        const v = await page.request.post(`${API}/viabilidad`, { data: { peso_kg: 300, tipo_carga: 'general' } });
        return ((await v.json()) as { disponibles_ahora: number }).disponibles_ahora;
      },
      { timeout: 180_000, intervals: [3_000], message: 'esperando un vehículo con conductor libre' },
    )
    .toBeGreaterThan(0);

  // Viaje anfitrión: Montería → Sincelejo (por la API, para que salga ya)
  const r = await page.request.post(`${API}/envios`, {
    data: { cliente_id: cliente.id, origen_id: mtr.id, destino_id: sin.id, peso_kg: Number(pesoUnico(200)), tipo_carga: 'general' },
    headers: { 'Idempotency-Key': `e2e-anfitrion-${Date.now()}` },
  });
  expect(r.ok(), `crear el viaje anfitrión → ${r.status()}`).toBeTruthy();
  const anfitrion = await esperarAsignado(page, (await r.json()).id, 30_000);

  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/envios\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  const id = page.url().split('/').pop()!;

  // Va montado en un viaje que ya circula por esa ruta: mismo vehículo y mismo conductor que ese viaje
  // (puede ser el anfitrión creado arriba u otro Montería → Sincelejo que llegue antes a Sahagún)
  const pedido = await esperarAsignado(page, id, 30_000);
  const [rutaPedido] = await api<{ viaje_ruta_id: string | null; detalle_asignacion: { recoger_en_camino?: boolean; viaje_envio_id?: string } }[]>(
    page,
    `/rutas?envio_id=${id}`,
  );
  expect(rutaPedido?.viaje_ruta_id, 'el pedido debe ir montado en un viaje en curso').toBeTruthy();
  expect(rutaPedido?.detalle_asignacion?.recoger_en_camino).toBe(true);
  const viaje = await api<Envio>(page, `/envios/${rutaPedido!.detalle_asignacion.viaje_envio_id}`);
  expect(pedido.placa_vehiculo, 'lo recoge el vehículo que ya va por la ruta').toBe(viaje.placa_vehiculo);
  expect(pedido.conductor_nombre).toBe(viaje.conductor_nombre);
  expect(anfitrion.placa_vehiculo).toBeTruthy();

  // Seguimiento en vivo: primero "va a recogerlo", luego "Recogido", luego "Entregado"
  const ficha = page.getByText(/va a recogerlo en Sahagún|Recogido en Sahagún|Entregado en Sincelejo/).first();
  await expect(ficha).toBeVisible({ timeout: 30_000 });
  const mensajes = new Set<string>();
  await expect
    .poll(
      async () => {
        const s = await api<Seguimiento>(page, `/seguimiento/envio/${id}`);
        mensajes.add(s.mensaje.replace(/\(faltan .*\)/, '').trim());
        return s.estado_viaje;
      },
      { timeout: 180_000, intervals: [2_000] },
    )
    .toBe('finalizada');
  expect([...mensajes].some((m) => m.startsWith('Recogido en Sahagún')) || [...mensajes].some((m) => m.startsWith('Entregado')), [...mensajes].join(' | ')).toBeTruthy();
  await expect(page.getByText('Entregado en Sincelejo').first()).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await api<Envio>(page, `/envios/${id}`)).estado, { timeout: 30_000 }).toBe('entregado');
  await v.verificar();
});
