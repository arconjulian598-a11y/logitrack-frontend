import { expect, type Page } from '@playwright/test';

/** Gateway simulado (e2e/mock/gateway_simulado.py). Cuentas de prueba: solo existen ahí. */
export const GW = process.env.E2E_GATEWAY_URL || 'http://localhost:8002';
export const API = `${GW}/api/v1`;

export const CUENTAS = {
  administrador: { email: 'admin@logitrack.test', password: 'prueba-admin-1' },
  operador: { email: 'operador@logitrack.test', password: 'prueba-oper-1' },
  gestor_flota: { email: 'gestor@logitrack.test', password: 'prueba-gest-1' },
  cliente: { email: 'cliente@logitrack.test', password: 'prueba-clie-1' },
} as const;
export type RolPrueba = keyof typeof CUENTAS;

export async function control(page: Page, accion: string) {
  const r = await page.request.post(`${GW}/__mock/${accion}`);
  expect(r.ok()).toBeTruthy();
}

/** Inicia sesión por la API y deja la sesión en sessionStorage antes de abrir la app (rápido). */
export async function entrarComo(page: Page, rol: RolPrueba) {
  const r = await page.request.post(`${API}/auth/login`, { data: CUENTAS[rol] });
  expect(r.ok()).toBeTruthy();
  const d = (await r.json()) as { access_token: string; expires_in: number; usuario: unknown };
  const sesion = { token: d.access_token, vence: Date.now() + d.expires_in * 1000, usuario: d.usuario };
  await page.addInitScript((s) => sessionStorage.setItem('logitrack_sesion', s), JSON.stringify(sesion));
  return d.access_token;
}

/** Lectura directa del gateway simulado con el token de un rol. */
export async function apiGet<T>(page: Page, token: string, ruta: string): Promise<T> {
  const r = await page.request.get(`${API}${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(r.ok(), `GET ${ruta} -> ${r.status()}`).toBeTruthy();
  return (await r.json()) as T;
}

export async function elegir(page: Page, etiqueta: string, texto: string) {
  await page.getByRole('combobox', { name: etiqueta, exact: true }).click();
  const buscar = page.getByRole('textbox', { name: 'Buscar', exact: true });
  await buscar.fill(texto);
  await expect(page.getByRole('status', { name: 'Buscando' })).toHaveCount(0);
  const primera = page.getByRole('listbox').getByRole('option').first();
  await expect.poll(async () => ((await primera.textContent()) ?? '').toLowerCase()).toContain(texto.toLowerCase());
  await expect(page.getByRole('status', { name: 'Buscando' })).toHaveCount(0);
  await buscar.press('Enter');
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

/** Llena el formulario de nuevo envío (origen, destino y peso). */
export async function llenarEnvio(page: Page, peso: string, opciones: { cliente?: string } = {}) {
  await page.goto('/envios/nuevo');
  if (opciones.cliente) await elegir(page, 'Cliente', opciones.cliente);
  await elegir(page, 'Origen', 'Monter');
  await elegir(page, 'Destino', 'Sincelejo');
  await page.getByLabel('Peso (kg)').fill(peso);
}

/** Pesos colombianos como los muestra Intl (es-CO): «$ 53.278». */
export function cop(n: number): RegExp {
  const miles = Math.round(n).toLocaleString('es-CO').replace(/\./g, '\\.');
  return new RegExp(`\\$\\s?${miles}`);
}
