import { expect, test } from '@playwright/test';
import { control, elegir, entrarComo } from './apoyo';

/** Al volver a abrir un formulario interno aparece limpio: tras cancelar, tras un error y tras guardar. */
test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ page }) => control(page, 'reiniciar'));

test('registrar vehículo: abre limpio tras cancelar, tras un error y tras guardar', async ({ page }) => {
  await entrarComo(page, 'gestor_flota');
  await page.goto('/flota/vehiculos');
  const abrir = () => page.getByRole('button', { name: 'Registrar vehículo' }).first().click();
  const dialogo = page.getByRole('dialog');
  const placa = dialogo.getByLabel('Placa');
  const kg = dialogo.getByLabel('Capacidad (kg)');
  const ubicacion = dialogo.getByRole('combobox', { name: 'Ubicación base' });
  const limpio = async () => {
    await expect(placa).toHaveValue('');
    await expect(kg).toHaveValue('');
    await expect(ubicacion).not.toContainText('Sincelejo');
    await expect(dialogo.getByText('Ya existe un vehículo con esa placa')).toHaveCount(0);
  };

  // 1) escribir y cancelar
  await abrir();
  await placa.fill('ABC999');
  await kg.fill('3000');
  await elegir(page, 'Ubicación base', 'Sincelejo');
  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialogo).toHaveCount(0);
  await abrir();
  await limpio();

  // 2) error del servidor (placa repetida), cerrar con Escape y volver a abrir
  await placa.fill('GOQ998');
  await kg.fill('3000');
  await elegir(page, 'Ubicación base', 'Sincelejo');
  await dialogo.getByRole('button', { name: 'Registrar vehículo' }).click();
  await expect(dialogo.getByText('Ya existe un vehículo con esa placa')).toBeVisible();
  await expect(placa).toHaveValue('GOQ998'); // mientras está abierto se conserva lo escrito
  await page.keyboard.press('Escape');
  await expect(dialogo).toHaveCount(0);
  await abrir();
  await limpio();

  // 3) guardar bien y volver a abrir
  await placa.fill('NUE321');
  await kg.fill('3000');
  await elegir(page, 'Ubicación base', 'Sincelejo');
  await dialogo.getByRole('button', { name: 'Registrar vehículo' }).click();
  await expect(dialogo).toHaveCount(0);
  await abrir();
  await limpio();
});

test('nueva cuenta de usuario y establecer ubicación también abren limpios', async ({ page }) => {
  await entrarComo(page, 'administrador');
  await page.goto('/usuarios');
  await page.getByRole('button', { name: 'Nueva cuenta' }).click();
  const d = page.getByRole('dialog');
  const primero = d.locator('input:visible').first();
  await primero.fill('Texto viejo');
  await page.keyboard.press('Escape');
  await expect(d).toHaveCount(0);
  await page.getByRole('button', { name: 'Nueva cuenta' }).click();
  await expect(d.locator('input:visible').first()).toHaveValue('');

  await page.goto('/flota/vehiculos');
  const fila = page.getByRole('row', { name: /KQA794/ });
  await fila.getByRole('button', { name: 'Establecer ubicación' }).click();
  await elegir(page, 'Ubicación base', 'Cartag');
  await page.keyboard.press('Escape');
  await fila.getByRole('button', { name: 'Establecer ubicación' }).click();
  await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Ubicación base' })).not.toContainText('Cartagena');
});
