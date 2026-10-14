import { expect, test } from '@playwright/test';

/**
 * Pruebas con servicios realmente apagados. No corren por defecto: se activan con
 * CAIDA=billing (Billing apagado) o CAIDA=gateway (gateway apagado). Ver README, sección Pruebas.
 */
const caida = process.env.CAIDA;

test('Billing apagado: Facturación muestra el servicio caído y el resto sigue operando', async ({ page }) => {
  test.skip(caida !== 'billing', 'Requiere CAIDA=billing con billing-service detenido');
  await page.goto('/facturacion');
  await expect(page.getByText('Servicio de facturación no disponible').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Reintentar' }).first()).toBeVisible();
  await page.goto('/sistema');
  await expect(page.getByRole('row', { name: /Facturación/ }).getByText('Sin respuesta')).toBeVisible();
  await expect(page.getByRole('link', { name: /servicios/ })).toContainText('8/9');
  // Un módulo que no depende de Billing sigue funcionando.
  await page.goto('/flota/vehiculos');
  await expect(page.getByRole('table', { name: 'Vehículos' })).toBeVisible();
});

test('Gateway apagado: la interfaz lo indica sin romperse', async ({ page }) => {
  test.skip(caida !== 'gateway', 'Requiere CAIDA=gateway con el API Gateway detenido');
  await page.goto('/envios');
  await expect(page.getByText('Sin conexión con el API Gateway')).toBeVisible({ timeout: 40_000 });
  await expect(page.getByText('Gateway sin conexión')).toBeVisible();
});
