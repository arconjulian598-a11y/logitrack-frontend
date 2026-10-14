import { expect, test, type Page } from '@playwright/test';
import { API, vigilar } from './util';

/** Lecturas de detalle y ediciones que no cubren los otros flujos, siempre desde la interfaz. */
const sufijo = Date.now().toString().slice(-5);

async function api<T>(page: Page, ruta: string, init?: { method?: string; data?: unknown }): Promise<T> {
  const r = init?.method === 'POST' ? await page.request.post(`${API}${ruta}`, { data: init.data }) : await page.request.get(`${API}${ruta}`);
  expect(r.ok(), `${init?.method ?? 'GET'} ${ruta} → ${r.status()}`).toBeTruthy();
  return (await r.json()) as T;
}

test.describe.configure({ mode: 'serial' });

test('ediciones: cliente, vehículo y conductor; vínculo permanente', async ({ page }) => {
  const v = vigilar(page);
  // Preparación por la API pública: un vehículo y un conductor sin vincular.
  const placa = `V${sufijo}`.slice(0, 6);
  const veh = await api<{ id: string }>(page, '/vehiculos', { method: 'POST', data: { placa, tipo: 'furgoneta', capacidad_kg: 700 } });
  const con = await api<{ id: string }>(page, '/conductores', {
    method: 'POST',
    data: { nombre: `Vinculable ${sufijo}`, licencia_numero: `LIC-V-${sufijo}`, categorias_licencia: 'B1', anios_experiencia: 2 },
  });
  const clientes = await api<{ id: string }[]>(page, '/clientes?q=Prueba&limite=1');

  await page.goto(`/clientes/${clientes[0]!.id}`);
  await page.getByRole('button', { name: 'Editar' }).click();
  await page.getByRole('dialog').getByLabel('Teléfono').fill(`300${sufijo}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText(/Cliente .* actualizado\./)).toBeVisible();

  await page.goto(`/flota/vehiculos/${veh.id}`);
  await page.getByRole('button', { name: 'Editar' }).click();
  await page.getByRole('dialog').getByLabel('Capacidad (kg)').fill('750');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText(`Vehículo ${placa} actualizado.`)).toBeVisible();
  expect(Number((await api<{ capacidad_kg: string }>(page, `/vehiculos/${veh.id}`)).capacidad_kg)).toBe(750);

  await page.goto(`/flota/conductores/${con.id}`);
  await page.getByRole('button', { name: 'Editar' }).click();
  await page.getByRole('dialog').getByLabel('Horas semanales').fill('36');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText(/Conductor .* actualizado\./)).toBeVisible();

  await page.getByRole('button', { name: 'Vincular vehículo' }).first().click();
  const d = page.getByRole('dialog');
  await d.getByRole('combobox', { name: 'Vehículo sin conductor' }).click();
  await page.getByRole('textbox', { name: 'Buscar', exact: true }).fill(placa);
  await page.getByRole('listbox').getByRole('option').first().click();
  await expect(d.getByText('Cumple los requisitos de este vehículo')).toBeVisible();
  await d.getByRole('button', { name: 'Vincular de forma permanente' }).click();
  await expect(page.getByText('Vehículo vinculado de forma permanente.')).toBeVisible();
  expect((await api<{ vehiculo_id: string }>(page, `/conductores/${con.id}`)).vehiculo_id).toBe(veh.id);
  await v.verificar();
});

test('lecturas de detalle: reserva, aduana, simulación, factura, seguimiento por código', async ({ page }) => {
  const v = vigilar(page);
  const envios = await api<{ id: string; codigo_envio: string; es_internacional: boolean; estado: string }[]>(page, '/envios');
  const intl = envios.find((e) => e.es_internacional)!;
  await page.goto(`/envios/${intl.id}`);
  await page.getByRole('tab', { name: 'Asignación' }).click();
  await expect(page.getByText('Reserva de flota')).toBeVisible();
  await expect(page.getByText(/Vigente|Liberada/).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Aduana' }).click();
  await expect(page.getByText('Documentos exigidos (3)')).toBeVisible();
  await page.getByRole('tab', { name: 'Eventos del viaje' }).click();
  await expect(page.getByText('Viaje programado').first()).toBeVisible();

  await page.goto('/simulaciones');
  await page.getByRole('table', { name: 'Simulaciones' }).getByRole('row').nth(1).click();
  await expect(page.getByRole('dialog').getByText('Bitácora del viaje')).toBeVisible();
  await page.keyboard.press('Escape');
  const activo = envios.find((e) => e.estado === 'en_transito') ?? envios[0]!;
  await page.getByRole('textbox', { name: 'Código', exact: true }).fill(activo.codigo_envio);
  await page.getByRole('button', { name: 'Consultar' }).click();
  await expect(page.getByText(/Viaje simulado y acelerado/)).toBeVisible();

  await page.goto('/facturacion');
  await page.getByRole('table', { name: 'Facturas' }).getByRole('row').nth(1).click();
  await expect(page.getByRole('dialog').getByText('Monto total')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.goto('/rutas?tab=asignaciones');
  await page.getByLabel('Código o id del envío').fill('ENV-1');
  await page.getByRole('button', { name: 'Reintentar asignación' }).click();
  await expect(page.getByText(/Estado de la ruta:/)).toBeVisible();

  await page.goto('/sistema');
  await expect(page.getByText('Salud (GET /health)')).toBeVisible();
  await expect(page.getByRole('main').getByText('ok', { exact: true })).toBeVisible();
  await v.verificar();
});

test('buscador global: ruta maestra y conductor por código', async ({ page }) => {
  const v = vigilar(page);
  const conductores = await api<{ id: string; codigo_conductor: number }[]>(page, '/conductores');
  const mayor = conductores.reduce((a, b) => (b.codigo_conductor > a.codigo_conductor ? b : a));
  const esCliente = (await page.request.get(`${API}/clientes/codigo/${mayor.codigo_conductor}`)).ok();
  await page.goto('/');
  const buscador = page.getByLabel(/Buscar por código de envío/);
  await buscador.fill('RUT-1');
  await buscador.press('Enter');
  await expect(page).toHaveURL(/\/rutas\/maestras\//);
  await buscador.fill(String(mayor.codigo_conductor));
  await buscador.press('Enter');
  await expect(page).toHaveURL(esCliente ? /\/clientes\// : new RegExp(`/flota/conductores/${mayor.id}`));
  await v.verificar();
});

/** Gateway elegido en el navegador, como el flujo ?api= de web-frontend y LevantarTunel.ps1. */
test('gateway por ?api= y vuelta al predeterminado', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto('/sistema?api=http://127.0.0.1:8002/');
  await expect(page.getByText('Personalizado')).toBeVisible();
  await expect(page.getByRole('main').getByText('http://127.0.0.1:8002/api/v1')).toBeVisible();
  await expect(page.getByText('Todos responden')).toBeVisible();
  expect(urls.some((u) => u.startsWith('http://127.0.0.1:8002/api/v1/estado'))).toBeTruthy();
  await page.goto('/envios');
  await expect(page.getByRole('table').first()).toBeVisible();
  expect(urls.filter((u) => u.includes(':8002/api/v1/envios')).every((u) => u.startsWith('http://127.0.0.1:8002'))).toBeTruthy();
  await page.goto('/sistema');
  await page.getByLabel('Raíz del API Gateway').fill('ftp://x');
  await page.getByRole('button', { name: 'Usar este gateway' }).click();
  await expect(page.getByText(/Escriba una dirección http/)).toBeVisible();
  await page.getByRole('button', { name: /Volver a http:\/\/localhost:8002/ }).click();
  await expect(page.getByText('El de la compilación (VITE_GATEWAY_URL)')).toBeVisible();
  await page.screenshot({ path: 'capturas/escritorio/sistema-gateway.png', fullPage: true });
});
