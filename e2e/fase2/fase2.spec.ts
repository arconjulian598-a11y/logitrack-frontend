import { expect, test } from '@playwright/test';
import { vigilar } from '../util';
import { API, apiGet, control, CUENTAS, cop, entrarComo, llenarEnvio } from './apoyo';

/**
 * Fase 2 de la interfaz (TEXTO_FRONTEND_LOGITRACK.md y CONTRATO_API.md, sección 9), contra el
 * gateway SIMULADO de e2e/mock: inicio de sesión, menús por rol, cotizar -> crear, pedidos divididos,
 * programados, cancelar/reprogramar, cobros y reembolsos, ingresos, 401/403 y arranque en frío.
 */
test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ page }) => control(page, 'reiniciar'));

test.describe('inicio de sesión', () => {
  test('credenciales incorrectas, entrar, token solo en sessionStorage y cerrar sesión', async ({ page }) => {
    const v = vigilar(page);
    await page.goto('/envios');
    await expect(page).toHaveURL(/\/login\?volver=%2Fenvios/);
    await expect(page.getByRole('link', { name: 'Registrarse' })).toBeVisible();

    await page.getByLabel('Correo').fill(CUENTAS.operador.email);
    await page.getByLabel('Contraseña').fill('equivocada');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Correo o contraseña incorrectos.')).toBeVisible();

    await page.getByLabel('Contraseña').fill(CUENTAS.operador.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/envios$/); // vuelve a donde quería ir
    await expect(page.getByRole('heading', { name: 'Envíos' })).toBeVisible();

    const almacen = await page.evaluate(() => ({ local: JSON.stringify(localStorage), sesion: sessionStorage.getItem('logitrack_sesion') ?? '' }));
    expect(almacen.sesion).toContain('"rol":"operador"');
    expect(almacen.local).not.toMatch(/token|logitrack_sesion/);
    expect(page.url()).not.toContain('token');

    await page.getByRole('button', { name: /Cuenta de/ }).click();
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(await page.evaluate(() => sessionStorage.getItem('logitrack_sesion'))).toBeNull();
    await v.verificar();
  });

  test('un 401 a mitad de sesión vuelve al inicio con el aviso', async ({ page }) => {
    await entrarComo(page, 'operador');
    await page.goto('/envios');
    await expect(page.getByRole('heading', { name: 'Envíos' })).toBeVisible();
    await control(page, 'expirar');
    await page.getByRole('button', { name: 'Actualizar lista' }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('Su sesión terminó. Inicie sesión de nuevo para continuar.')).toBeVisible();
  });

  test('backend despertando: muestra «el sistema se está iniciando» y reintenta solo', async ({ page }) => {
    await entrarComo(page, 'operador');
    await control(page, 'dormir?n=2');
    await page.goto('/envios');
    await expect(page.getByText(/El sistema se está iniciando/)).toBeVisible();
    await expect(page.getByText('No hay envíos con estos filtros.')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/El sistema se está iniciando/)).toHaveCount(0);
  });
});

test.describe('menús y permisos por rol', () => {
  const MENU: Record<keyof typeof CUENTAS, { si: string[]; no: string[] }> = {
    cliente: { si: ['Mis envíos', 'Nuevo envío', 'Mis pagos y facturas'], no: ['Mapa en vivo', 'Calendario', 'Vehículos', 'Notificaciones', 'Usuarios', 'Panel de operación'] },
    operador: { si: ['Envíos', 'Nuevo envío', 'Clientes', 'Vehículos', 'Mapa en vivo', 'Calendario', 'Aduanas', 'Notificaciones', 'Pagos'], no: ['Usuarios', 'Tarifas y costos', 'Dashboard e ingresos'] },
    gestor_flota: { si: ['Envíos', 'Vehículos', 'Mantenimiento', 'Calendario', 'Mapa en vivo', 'Dashboard de flota'], no: ['Nuevo envío', 'Clientes', 'Aduanas', 'Usuarios', 'Pagos'] },
    administrador: { si: ['Usuarios', 'Cobros y reembolsos', 'Tarifas y costos', 'Dashboard e ingresos', 'Estado del sistema', 'Calendario'], no: [] },
  };
  for (const rol of Object.keys(MENU) as (keyof typeof CUENTAS)[]) {
    test(`menú de ${rol}`, async ({ page }) => {
      const v = vigilar(page);
      await entrarComo(page, rol);
      await page.goto('/');
      const nav = page.getByRole('navigation', { name: 'Principal' });
      await expect(nav).toBeVisible();
      for (const e of MENU[rol].si) await expect(nav.getByRole('link', { name: e, exact: true })).toBeVisible();
      for (const e of MENU[rol].no) await expect(nav.getByRole('link', { name: e, exact: true })).toHaveCount(0);
      await v.verificar();
    });
  }

  test('el cliente va directo a sus envíos y no entra al mapa ni al calendario (sin cerrar sesión)', async ({ page }) => {
    await entrarComo(page, 'cliente');
    await page.goto('/');
    await expect(page).toHaveURL(/\/envios$/);
    await expect(page.getByRole('heading', { name: 'Mis envíos' })).toBeVisible();
    for (const ruta of ['/mapa', '/calendario', '/usuarios']) {
      await page.goto(ruta);
      await expect(page.getByText('No tiene permiso para ver esta sección')).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /Cuenta de Carlos/ })).toBeVisible();
  });
});

test.describe('crear un envío en dos pasos', () => {
  test('cliente: cotizar, ver el precio en COP, aceptar y crear un solo pedido pagado', async ({ page }) => {
    const v = vigilar(page);
    const token = await entrarComo(page, 'cliente');
    await llenarEnvio(page, '3000');
    await expect(page.getByRole('combobox', { name: 'Cliente', exact: true })).toHaveCount(0); // el cliente no elige: se crea a su nombre
    await expect(page.getByRole('button', { name: /Aceptar/ })).toHaveCount(0); // no se crea sin cotizar

    await page.getByRole('button', { name: 'Cotizar precio' }).click();
    const monto = page.getByTestId('monto');
    await expect(monto).toHaveText(cop(119834));
    await expect(page.getByText('Pago simulado: no se mueve dinero real.')).toBeVisible();

    // Cambiar un dato invalida la cotización
    await page.getByLabel('Peso (kg)').fill('3001');
    await expect(page.getByText('Cambió algún dato del envío. Vuelva a cotizar para ver el precio actualizado.')).toBeVisible();
    await page.getByLabel('Peso (kg)').fill('3000');
    await expect(monto).toBeVisible();

    // Doble clic: un solo pedido
    await page.getByRole('button', { name: /Aceptar .* y crear/ }).dblclick();
    await expect(page).toHaveURL(/\/envios\/[0-9a-f-]{36}$/);
    await expect(page.getByText('Precio del pedido')).toBeVisible();
    await page.getByRole('tab', { name: /Pago y factura/ }).click();
    await expect(page.getByText(/^SIM-/)).toBeVisible();
    await expect(page.getByText('Simulado (sin dinero real)')).toBeVisible();
    await expect(page.getByText(/^FP-\d{8}$/)).toBeVisible();
    // El cliente no ve mapa ni asignación: ve «En qué va»
    await expect(page.getByText('En qué va')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Asignación' })).toHaveCount(0);

    const pagos = await apiGet<unknown[]>(page, token, '/pagos');
    expect(pagos).toHaveLength(1);
    await v.verificar();
  });

  test('carga que no cabe: sugerir divisible, plan de partes y pedido con sus partes', async ({ page }) => {
    const v = vigilar(page);
    await entrarComo(page, 'operador');
    await llenarEnvio(page, '12000', { cliente: 'Distrib' });
    await page.getByRole('button', { name: 'Cotizar precio' }).click();
    await expect(page.getByText('No se puede crear este envío')).toBeVisible();
    await expect(page.getByRole('button', { name: /Aceptar/ })).toHaveCount(0);

    await page.getByRole('checkbox', { name: 'Carga divisible' }).click();
    await page.getByRole('button', { name: 'Cotizar precio' }).click();
    await expect(page.getByText('La carga se dividirá en 3 envíos (uno por vehículo); el precio es el del pedido completo')).toBeVisible();
    await expect(page.getByText('Plan de división: 3 envíos')).toBeVisible();
    await page.getByRole('button', { name: /Aceptar .* y crear/ }).click();

    await expect(page).toHaveURL(/\/envios\/[0-9a-f-]{36}$/);
    await expect(page.getByText('Partes del pedido')).toBeVisible();
    await expect(page.getByText('0 de 3 partes entregadas', { exact: false }).first()).toBeVisible();
    for (const n of [1, 2, 3]) await expect(page.getByText(new RegExp(`ENV-\\d{8}-P${n}`))).toBeVisible();
    // Sobre el pedido no se cambia el estado ni se registra entrega (eso es de las partes)
    await expect(page.getByRole('button', { name: 'Cambiar estado' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Registrar entrega' })).toHaveCount(0);

    // Una parte: enlaza al pedido y no ofrece cancelar
    await page.getByText(/ENV-\d{8}-P2/).click();
    await expect(page.getByText('Parte 2 de un pedido dividido')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar pedido' })).toHaveCount(0);

    // La lista muestra el pedido una sola vez (solo_pedidos)
    await page.goto('/envios');
    await expect(page.getByText('0 de 3 partes')).toBeVisible();
    await expect(page.getByText(/ENV-\d{8}-P1/)).toHaveCount(0);
    await v.verificar();
  });

  test('si el precio cambió al crear, se vuelve a cotizar y se pide confirmar', async ({ page }) => {
    const v = vigilar(page);
    await entrarComo(page, 'operador');
    await llenarEnvio(page, '3000', { cliente: 'Distrib' });
    await page.getByRole('button', { name: 'Cotizar precio' }).click();
    await expect(page.getByTestId('monto')).toHaveText(cop(119834));
    await control(page, 'tarifa?base=30000'); // la tarifa cambia entre cotizar y crear
    await page.getByRole('button', { name: /Aceptar .* y crear/ }).click();
    await expect(page.getByText(/El precio cambió de .* a .*Revíselo y confirme de nuevo/)).toBeVisible();
    await expect(page.getByTestId('monto')).toHaveText(cop(129834));
    await expect(page).toHaveURL(/\/envios\/nuevo$/); // el formulario no se cierra
    await page.getByRole('button', { name: /Aceptar .* y crear/ }).click();
    await expect(page).toHaveURL(/\/envios\/[0-9a-f-]{36}$/);
    await v.verificar();
  });
});

test.describe('programados, cancelación, reembolso e ingresos', () => {
  test('programar, ver en el calendario, reprogramar, cancelar y reembolsar', async ({ page, browser }) => {
    const v = vigilar(page);
    // Operador crea un envío programado para mañana
    await entrarComo(page, 'operador');
    await llenarEnvio(page, '800', { cliente: 'Distrib' });
    const manana = new Date(Date.now() + 26 * 3600 * 1000);
    const local = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .format(manana)
      .replace(' ', 'T');
    await page.getByLabel('Fecha y hora de salida').fill(local);
    await page.getByRole('button', { name: 'Cotizar precio' }).click();
    await expect(page.getByTestId('monto')).toHaveText(cop(50000)); // aplica el mínimo
    await page.getByRole('button', { name: /Aceptar .* y crear/ }).click();
    await expect(page.getByText('Envío programado')).toBeVisible();
    const codigo = (await page.locator('h1 .font-cond').first().textContent())!.trim();
    // El operador ve el calendario pero no cancela ni reprograma
    await expect(page.getByRole('button', { name: 'Cancelar pedido' })).toHaveCount(0);
    await page.goto('/calendario');
    await expect(page.getByText(codigo)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reprogramar' })).toHaveCount(0);

    // Gestor de flota: reprograma y cancela
    const gestor = await browser.newPage();
    await control(gestor, 'avanzar'); // no cambia un programado
    await entrarComo(gestor, 'gestor_flota');
    await gestor.goto('/calendario');
    await gestor.getByText(codigo).click();
    await expect(gestor).toHaveURL(/\/envios\/[0-9a-f-]{36}$/);
    await expect(gestor.getByText('Envío programado')).toBeVisible();
    await gestor.getByRole('button', { name: 'Reprogramar' }).click();
    const dialogo = gestor.getByRole('dialog');
    const pasado = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .format(new Date(Date.now() - 3600 * 1000))
      .replace(' ', 'T');
    await dialogo.getByLabel('Nueva fecha y hora de salida').fill(pasado);
    await dialogo.getByRole('button', { name: 'Reprogramar' }).click();
    await expect(dialogo.getByText('La fecha debe ser al menos un minuto en el futuro.')).toBeVisible();
    const pasadoManana = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .format(new Date(Date.now() + 50 * 3600 * 1000))
      .replace(' ', 'T');
    await dialogo.getByLabel('Nueva fecha y hora de salida').fill(pasadoManana);
    await dialogo.getByRole('button', { name: 'Reprogramar' }).click();
    await expect(gestor.getByText(`${codigo} reprogramado.`)).toBeVisible();

    await gestor.getByRole('button', { name: 'Cancelar pedido' }).click();
    await gestor.getByRole('dialog').getByRole('button', { name: 'Cancelar pedido' }).click();
    await expect(gestor.getByText('Pedido cancelado', { exact: true })).toBeVisible();
    await gestor.close();

    // Administrador: lo ve en «Por reembolsar» y lo reembolsa
    const admin = await browser.newPage();
    const tokenAdmin = await entrarComo(admin, 'administrador');
    await admin.goto('/cobros?tab=reembolsos');
    const fila = admin.getByRole('row', { name: new RegExp(codigo) });
    await expect(fila).toContainText('Pedido cancelado');
    await fila.getByRole('button', { name: 'Reembolsar' }).click();
    await admin.getByRole('dialog').getByRole('button', { name: /Reembolsar/ }).click();
    await expect(admin.getByText(/reembolsado .*Su factura quedó anulada/)).toBeVisible();
    await expect(admin.getByText('No hay reembolsos pendientes.')).toBeVisible();
    const pagos = await apiGet<{ estado: string }[]>(admin, tokenAdmin, '/pagos');
    expect(pagos[0]?.estado).toBe('reembolsado');
    await admin.goto('/cobros?tab=facturas');
    await expect(admin.getByRole('row', { name: new RegExp(codigo) })).toContainText('Anulada');

    // Ingresos: bruto 50.000, reembolsos 50.000, neto 0
    await admin.goto('/analitica');
    await expect(admin.getByRole('heading', { name: 'Ingresos', exact: true })).toBeVisible();
    await admin.getByRole('button', { name: /tabla/i }).first().click();
    await expect(admin.getByText(cop(50000)).first()).toBeVisible();
    await admin.close();
    await v.verificar();
  });

  test('gestor de flota: dashboard de flota sin ingresos', async ({ page }) => {
    const v = vigilar(page);
    await entrarComo(page, 'gestor_flota');
    await page.goto('/analitica');
    await expect(page.getByRole('heading', { name: 'Dashboard de flota' })).toBeVisible();
    await expect(page.getByText('Utilización de la flota')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ingresos', exact: true })).toHaveCount(0);
    await v.verificar();
  });
});

test.describe('usuarios', () => {
  test('el administrador crea una cuenta de cliente y esa cuenta entra', async ({ page, browser }) => {
    const v = vigilar(page);
    await entrarComo(page, 'administrador');
    await page.goto('/usuarios');
    await page.getByRole('button', { name: 'Nueva cuenta' }).click();
    const d = page.getByRole('dialog');
    await d.getByLabel('Nombre').fill('María Compras');
    await d.getByLabel('Correo').fill('maria@frutas.test');
    await d.getByLabel('Contraseña inicial').fill('corta');
    await d.getByLabel('Rol').selectOption('cliente');
    await d.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(d.getByText('Mínimo 8 caracteres.')).toBeVisible();
    await expect(d.getByText('Elija la empresa cliente de esta cuenta.')).toBeVisible();
    await d.getByLabel('Contraseña inicial').fill('clave-de-prueba-9');
    await d.getByRole('combobox', { name: 'Empresa cliente' }).click();
    await page.getByRole('textbox', { name: 'Buscar', exact: true }).fill('Frutas');
    await page.getByRole('listbox').getByRole('option').first().click();
    await d.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByRole('row', { name: /María Compras/ })).toContainText('Cliente');

    const nueva = await browser.newPage();
    await nueva.goto('/login');
    await nueva.getByLabel('Correo').fill('maria@frutas.test');
    await nueva.getByLabel('Contraseña').fill('clave-de-prueba-9');
    await nueva.getByRole('button', { name: 'Entrar' }).click();
    await expect(nueva.getByRole('heading', { name: 'Mis envíos' })).toBeVisible();
    await nueva.close();
    await v.verificar();
  });

  test('el gateway decide: un 403 muestra «sin permiso» y no cierra la sesión', async ({ page }) => {
    const token = await entrarComo(page, 'operador');
    const r = await page.request.post(`${API}/envios/x/cancelar`, { headers: { Authorization: `Bearer ${token}` } });
    expect(r.status()).toBe(403);
    await page.goto('/usuarios');
    await expect(page.getByText('No tiene permiso para ver esta sección')).toBeVisible();
    await page.goto('/envios');
    await expect(page.getByRole('heading', { name: 'Envíos' })).toBeVisible();
  });
});

test.describe('registro y cambio de cuenta', () => {
  test('registrarse con autorización del administrador y entrar con la cuenta nueva', async ({ page }) => {
    const v = vigilar(page);
    await page.goto('/login');
    await page.getByRole('link', { name: 'Registrarse' }).click();
    await expect(page).toHaveURL(/\/registro$/);
    await page.locator('#r-nombre').fill('Pedro Despachos');
    await page.locator('#r-email').fill('pedro@frutas.test');
    await page.locator('#r-password').fill('clave-pedro-1');
    await page.locator('#r-confirmar').fill('clave-pedro-1');
    await page.locator('#r-codigo').fill('1000000002');

    // Sin autorización válida no se crea
    await page.locator('#r-admin-email').fill(CUENTAS.operador.email);
    await page.locator('#r-admin-password').fill(CUENTAS.operador.password);
    await page.getByRole('button', { name: 'Crear cuenta y entrar' }).click();
    await expect(page.getByText('Esa cuenta no es de administrador: no puede autorizar registros.')).toBeVisible();
    await page.locator('#r-admin-email').fill(CUENTAS.administrador.email);
    await page.locator('#r-admin-password').fill('equivocada');
    await page.getByRole('button', { name: 'Crear cuenta y entrar' }).click();
    await expect(page.getByText('Correo o contraseña del administrador incorrectos.')).toBeVisible();

    await page.locator('#r-admin-password').fill(CUENTAS.administrador.password);
    await page.getByRole('button', { name: 'Crear cuenta y entrar' }).click();
    await expect(page.getByRole('heading', { name: 'Mis envíos' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Cuenta de Pedro Despachos/ })).toBeVisible();
    // La sesión del administrador no quedó guardada: la abierta es la de Pedro
    expect(await page.evaluate(() => sessionStorage.getItem('logitrack_sesion'))).toContain('pedro@frutas.test');

    // Mismo correo otra vez: ya existe
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await page.goto('/registro');
    await page.locator('#r-nombre').fill('Pedro Otra Vez');
    await page.locator('#r-email').fill('pedro@frutas.test');
    await page.locator('#r-password').fill('clave-pedro-1');
    await page.locator('#r-confirmar').fill('clave-pedro-1');
    await page.locator('#r-rol').selectOption('operador');
    await page.locator('#r-admin-email').fill(CUENTAS.administrador.email);
    await page.locator('#r-admin-password').fill(CUENTAS.administrador.password);
    await page.getByRole('button', { name: 'Crear cuenta y entrar' }).click();
    await expect(page.getByText('Ya existe una cuenta con ese correo.')).toBeVisible();
    await v.verificar();
  });

  test('cerrar sesión desde el menú lateral y entrar con otro rol', async ({ page }) => {
    await entrarComo(page, 'cliente');
    await page.goto('/envios');
    await expect(page.getByRole('heading', { name: 'Mis envíos' })).toBeVisible();
    await page.evaluate(() => sessionStorage.clear()); // que el script de la prueba no vuelva a poner la sesión
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('Sesión cerrada. Puede entrar con otra cuenta (otro rol).')).toBeVisible();
    await page.getByLabel('Correo').fill(CUENTAS.gestor_flota.email);
    await page.getByLabel('Contraseña').fill(CUENTAS.gestor_flota.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Dashboard de flota' })).toBeVisible();
    await expect(page.getByText('Gestor de flota').first()).toBeVisible();
  });
});

test('@movil inicio de sesión y nuevo envío caben en un teléfono', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  const ancho = await page.evaluate(() => (globalThis as unknown as { document: { documentElement: { scrollWidth: number } }; innerWidth: number }).document.documentElement.scrollWidth - (globalThis as unknown as { innerWidth: number }).innerWidth);
  expect(ancho).toBeLessThanOrEqual(0);
  await entrarComo(page, 'cliente');
  await page.goto('/envios/nuevo');
  await expect(page.getByRole('button', { name: 'Cotizar precio' })).toBeVisible();
  expect(await page.evaluate(() => (globalThis as unknown as { document: { documentElement: { scrollWidth: number } }; innerWidth: number }).document.documentElement.scrollWidth - (globalThis as unknown as { innerWidth: number }).innerWidth)).toBeLessThanOrEqual(0);
});
