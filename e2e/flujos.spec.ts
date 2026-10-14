import { expect, test, type Page } from '@playwright/test';
import { API, vigilar } from './util';

/**
 * Flujos de escritura contra el backend REAL. Cada prueba crea sus propios datos (nombres únicos)
 * y verifica el resultado tanto en la interfaz como consultando el gateway.
 */
const sufijo = Date.now().toString().slice(-6);

async function elegir(page: Page, etiqueta: string | RegExp, texto: string, dentro?: ReturnType<Page['getByRole']>) {
  const raiz = dentro ?? page;
  await raiz.getByRole('combobox', { name: etiqueta, exact: typeof etiqueta === 'string' }).click();
  const buscar = page.getByRole('textbox', { name: 'Buscar', exact: true });
  await buscar.fill(texto);
  await expect(page.getByRole('status', { name: 'Buscando' })).toHaveCount(0);
  const primera = page.getByRole('listbox').getByRole('option').first();
  // Las placas se muestran con un espacio fino (ABC 123): se compara sin espacios.
  await expect.poll(async () => ((await primera.textContent()) ?? '').replace(/\s/g, '').toLowerCase()).toContain(texto.replace(/\s/g, '').toLowerCase());
  await buscar.press('Enter');
}

async function api<T>(page: Page, ruta: string): Promise<T> {
  const r = await page.request.get(`${API}${ruta}`);
  expect(r.ok(), `GET ${ruta} → ${r.status()}`).toBeTruthy();
  return (await r.json()) as T;
}

test.describe.configure({ mode: 'serial' });

test('cliente: registrar, tarifa por km y preferencia de notificación', async ({ page }) => {
  const v = vigilar(page);
  await page.goto('/clientes');
  await page.getByRole('button', { name: 'Registrar cliente' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Nombre o razón social').fill(`Logística Prueba ${sufijo}`);
  await d.getByLabel('Número').fill(`900${sufijo}-1`);
  await d.getByLabel('Correo').fill(`ops${sufijo}@prueba.example`);
  await d.getByRole('button', { name: 'Registrar cliente' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Logística Prueba ${sufijo}`) })).toBeVisible();
  const id = page.url().split('/').pop()!;

  await page.getByText('Por kilómetro').click();
  await page.getByLabel(/Valor \(COP por km\)/).fill('2500');
  await page.getByRole('button', { name: 'Guardar tarifa' }).click();
  await expect(page.getByText('Tarifa guardada.')).toBeVisible();
  const tarifa = await api<{ modelo: string; valor: string }>(page, `/tarifas/${id}`);
  expect(tarifa.modelo).toBe('por_km');
  expect(Number(tarifa.valor)).toBe(2500);

  await page.getByLabel('Canal preferido').selectOption('sms');
  await page.getByRole('button', { name: 'Guardar preferencia' }).click();
  await expect(page.getByText('Preferencia guardada.')).toBeVisible();
  const pref = await api<{ canal_preferido: string }>(page, `/preferencias/${id}`);
  expect(pref.canal_preferido).toBe('sms');

  // Validación del formulario (sin llamar al backend)
  await page.getByRole('button', { name: 'Editar' }).click();
  await page.getByRole('dialog').getByLabel('Correo').fill('correo-invalido');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('dialog').getByText('Correo no válido')).toBeVisible();
  await page.keyboard.press('Escape');
  await v.verificar();
});

test('flota: vehículo, conductor elegible, rechazo por elegibilidad y ciclo de mantenimiento', async ({ page }) => {
  const v = vigilar(page);
  const placa = `E2E${sufijo.slice(-3)}`;
  const placa2 = `E2T${sufijo.slice(-3)}`;
  for (const [p, tipo, kg] of [
    [placa, 'furgoneta', '800'],
    [placa2, 'tractocamion', '4500'],
  ] as const) {
    await page.goto('/flota/vehiculos');
    await page.getByRole('button', { name: 'Registrar vehículo' }).click();
    const d = page.getByRole('dialog');
    await d.getByLabel('Placa').fill(p);
    await d.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption(tipo);
    await d.getByLabel('Capacidad (kg)').fill(kg);
    await d.getByRole('button', { name: 'Registrar vehículo' }).click();
    await expect(page.getByText(`Vehículo ${p} registrado.`)).toBeVisible();
  }
  const vehiculo = await api<{ id: string; estado: string }>(page, `/vehiculos/placa/${placa}`);

  // Conductor elegible para la furgoneta
  await page.goto('/flota/conductores');
  await page.getByRole('button', { name: 'Registrar conductor' }).click();
  let d = page.getByRole('dialog');
  await d.getByLabel('Nombre').fill(`Conductor Prueba ${sufijo}`);
  await d.getByLabel('Número de licencia').fill(`LIC-E2E-${sufijo}`);
  await d.getByLabel('Años de experiencia').fill('3');
  await d.getByRole('button', { name: 'B1', exact: true }).click();
  await elegir(page, 'Vehículo', placa, d);
  await expect(d.getByText('Cumple los requisitos de este vehículo')).toBeVisible();
  await d.getByRole('button', { name: 'Registrar conductor' }).click();
  await expect(page.getByText(/Conductor Conductor Prueba .* registrado con código/)).toBeVisible();

  // No elegible para el tractocamión: lo rechaza el servidor con la lista de motivos
  await page.getByRole('button', { name: 'Registrar conductor' }).click();
  d = page.getByRole('dialog');
  await d.getByLabel('Nombre').fill(`No Elegible ${sufijo}`);
  await d.getByLabel('Número de licencia').fill(`LIC-NE-${sufijo}`);
  await d.getByLabel('Años de experiencia').fill('1');
  await d.getByRole('button', { name: 'B1', exact: true }).click();
  await elegir(page, 'Vehículo', placa2, d);
  await expect(d.getByText('No cumple los requisitos de este vehículo')).toBeVisible();
  await d.getByRole('button', { name: 'Registrar conductor' }).click();
  await expect(d.getByRole('alert').filter({ hasText: 'El conductor no es elegible para este vehículo' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Cambio de estado manual y cierre por intervención (Mantenimiento lo devuelve a disponible)
  await page.goto(`/flota/vehiculos/${vehiculo.id}`);
  await page.getByRole('button', { name: 'Cambiar estado' }).click();
  await page.getByRole('menuitem', { name: 'En mantenimiento' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cambiar estado' }).click();
  await expect(page.getByText(`${placa}: en mantenimiento.`)).toBeVisible();
  expect((await api<{ estado: string }>(page, `/vehiculos/${vehiculo.id}`)).estado).toBe('en_mantenimiento');

  await page.goto(`/mantenimiento?vehiculo=${vehiculo.id}`);
  await page.getByRole('button', { name: 'Nuevo programa' }).click();
  d = page.getByRole('dialog');
  await d.getByLabel('Tipo').fill('cambio_aceite');
  await d.getByLabel('O al llegar a (km)').fill('15000');
  await d.getByRole('button', { name: 'Crear programa' }).click();
  await expect(page.getByText('Programa de mantenimiento creado.')).toBeVisible();
  await page.getByRole('button', { name: 'Registrar intervención' }).click();
  d = page.getByRole('dialog');
  await d.getByLabel('Qué se hizo').fill('revision_frenos');
  await d.getByLabel('Costo (COP)').fill('420000');
  await d.getByLabel('Taller').fill('Taller de pruebas');
  await d.getByRole('button', { name: 'Registrar intervención' }).click();
  await expect(page.getByText(/Intervención registrada/)).toBeVisible();
  await expect(page.getByRole('table', { name: 'Intervenciones' }).getByRole('cell', { name: 'Revisión de frenos' })).toBeVisible();
  await expect.poll(async () => (await api<{ estado: string }>(page, `/vehiculos/${vehiculo.id}`)).estado).toBe('active');
  const programas = await api<{ tipo: string }[]>(page, `/programas/${vehiculo.id}`);
  expect(programas.some((p) => p.tipo === 'cambio_aceite')).toBeTruthy();
  await v.verificar();
});

test('envío: comprobación de flota, rechazo 422 y creación con asignación automática', async ({ page }) => {
  const v = vigilar(page);
  await page.goto('/envios/nuevo');
  await elegir(page, 'Cliente', 'Distribuidora');
  await elegir(page, 'Origen', 'Monter');
  await elegir(page, 'Destino', 'Sincelejo');

  // Carga imposible: aviso previo y rechazo del servidor con su código
  await page.getByLabel('Peso (kg)').fill('9000');
  await expect(page.getByText('Ningún vehículo de la flota puede llevar esta carga')).toBeVisible();
  await page.getByRole('button', { name: 'Crear envío' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'CAPACIDAD_EXCEDIDA' })).toBeVisible();

  await page.getByLabel('Peso (kg)').fill('450');
  await expect(page.getByText('La flota puede transportar esta carga')).toBeVisible();
  await page.getByRole('button', { name: 'Previsualizar ruta' }).click();
  await expect(page.getByText(/RUT-\d{8}/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Crear envío' }).click();
  await expect(page).toHaveURL(/\/envios\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: /ENV-\d{8}/ })).toBeVisible();
  const id = page.url().split('/').pop()!;
  // El sistema lo saca de «pendiente» solo (asignado, en tránsito o sin asignación)
  await expect.poll(async () => (await api<{ estado: string }>(page, `/envios/${id}`)).estado, { timeout: 40_000 }).not.toBe('pendiente');
  await expect(page.getByText('Asignación en proceso')).toBeHidden({ timeout: 15_000 });
  await page.getByRole('tab', { name: 'Bitácora' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Bitácora' }).getByText('Creado', { exact: true })).toBeVisible();
  await v.verificar();
});

test('envío: incidencia, vuelta a tránsito y entrega manual con prueba de entrega', async ({ page }) => {
  const v = vigilar(page);
  const envios = await api<{ id: string; estado: string; codigo_envio: string }[]>(page, '/envios?estado=en_transito');
  test.skip(envios.length === 0, 'No hay envíos en tránsito para probar');
  const e = envios[0]!;
  await page.goto(`/envios/${e.id}`);
  await page.getByRole('button', { name: 'Cambiar estado' }).click();
  await page.getByRole('menuitem', { name: 'Con incidencia' }).click();
  await page.getByRole('dialog').getByLabel('Notas').fill('Prueba E2E: llanta pinchada');
  await page.getByRole('dialog').getByRole('button', { name: 'Cambiar estado' }).click();
  await expect(page.getByText(/ahora está «con incidencia»/)).toBeVisible();
  expect((await api<{ estado: string }>(page, `/envios/${e.id}`)).estado).toBe('con_incidencia');

  await page.getByRole('button', { name: 'Cambiar estado' }).click();
  await page.getByRole('menuitem', { name: 'En tránsito' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cambiar estado' }).click();
  await expect(page.getByText(/ahora está «en tránsito»/)).toBeVisible();

  await page.getByRole('button', { name: 'Registrar entrega' }).click();
  await page.getByRole('dialog').getByLabel('Nombre de quien recibe').fill('Receptora de Prueba');
  await page.getByRole('dialog').getByRole('button', { name: 'Registrar entrega' }).click();
  await expect(page.getByText(`Entrega de ${e.codigo_envio} registrada.`)).toBeVisible();
  const pod = await api<{ nombre_receptor: string; simulada: boolean }>(page, `/envios/${e.id}/prueba-entrega`);
  expect(pod.nombre_receptor).toBe('Receptora de Prueba');
  expect(pod.simulada).toBe(false);
  await page.getByRole('tab', { name: 'Prueba de entrega' }).click();
  await expect(page.getByText('Receptora de Prueba')).toBeVisible();
  await v.verificar();
});

test('envío en espera: reintento de asignación y devolución con confirmación', async ({ page }) => {
  const v = vigilar(page);
  // Preparación: se crean envíos refrigerados hasta saturar los vehículos con refrigeración,
  // de modo que el último quede «sin asignación» (situación real que el backend produce solo).
  let e: { id: string; codigo_envio: string } | undefined;
  for (let i = 0; i < 4 && !e; i++) {
    const r = await page.request.post(`${API}/envios`, {
      data: { codigo_cliente: 1000000002, origen_codigo: 'CO-BOG', destino_codigo: 'CO-TUN', peso_kg: 400, tipo_carga: 'refrigerada' },
    });
    expect(r.status()).toBe(201);
    const creado = (await r.json()) as { id: string; codigo_envio: string };
    await expect.poll(async () => (await api<{ estado: string }>(page, `/envios/${creado.id}`)).estado, { timeout: 30_000 }).not.toBe('pendiente');
    if ((await api<{ estado: string }>(page, `/envios/${creado.id}`)).estado === 'sin_asignacion') e = creado;
  }
  test.skip(!e, 'La flota refrigerada no se saturó');
  if (!e) return;
  await page.goto(`/envios/${e.id}`);
  await page.getByRole('button', { name: 'Reintentar asignación' }).click();
  await expect(page.getByText(/Reintento hecho|Vehículo asignado/)).toBeVisible();
  const actual = (await api<{ estado: string }>(page, `/envios/${e.id}`)).estado;
  test.skip(!['pendiente', 'sin_asignacion', 'asignado', 'en_transito'].includes(actual), 'El envío cambió de estado');
  await page.getByRole('button', { name: 'Cambiar estado' }).click();
  await page.getByRole('menuitem', { name: 'Devolver (cancelar)' }).click();
  await expect(page.getByRole('dialog').getByText(/No se puede deshacer/)).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Devolver envío' }).click();
  await expect(page.getByText(/ahora está «devuelto»/)).toBeVisible();
  expect((await api<{ estado: string }>(page, `/envios/${e.id}`)).estado).toBe('devuelto');
  await v.verificar();
});

test('aduanas: retener pausa el envío y aprobar lo libera', async ({ page }) => {
  const v = vigilar(page);
  // Preparación: un envío internacional propio (Cali → Quito) para no depender de otros viajes.
  const r = await page.request.post(`${API}/envios`, {
    data: { codigo_cliente: 1000000004, origen_codigo: 'CO-CLO', destino_codigo: 'EC-UIO', peso_kg: 300 },
  });
  expect(r.status()).toBe(201);
  const intl = (await r.json()) as { id: string };
  await expect.poll(async () => (await page.request.get(`${API}/declaraciones/${intl.id}`)).status(), { timeout: 30_000 }).toBe(200);
  await expect.poll(async () => (await api<{ estado: string }>(page, `/envios/${intl.id}`)).estado, { timeout: 30_000 }).not.toBe('pendiente');
  const decl = await api<{ id: string }>(page, `/declaraciones/${intl.id}`);
  await page.goto(`/aduanas?sel=${decl.id}`);
  await page.getByRole('button', { name: 'Retener' }).click();
  await page.getByRole('dialog', { name: /Retener el envío/ }).getByLabel('Motivo de la retención').fill('Revisión documental E2E');
  await page.getByRole('dialog', { name: /Retener el envío/ }).getByRole('button', { name: 'Retener' }).click();
  await expect(page.getByText('Declaración retenido.')).toBeVisible();
  await expect.poll(async () => (await api<{ estado: string }>(page, `/envios/${intl.id}`)).estado, { timeout: 30_000 }).toBe('retenido_aduana');

  await page.getByRole('button', { name: 'Aprobar y liberar' }).click();
  await page.getByRole('dialog', { name: /Aprobar la declaración/ }).getByRole('button', { name: 'Aprobar' }).click();
  await expect(page.getByText('Declaración aprobado.')).toBeVisible();
  await expect.poll(async () => (await api<{ estado: string }>(page, `/envios/${intl.id}`)).estado, { timeout: 30_000 }).not.toBe('retenido_aduana');
  await v.verificar();
});

test('rutas: recálculo manual con historial, barrido y error de OSRM no disponible', async ({ page }) => {
  const v = vigilar(page);
  const rutas = await api<{ id: string; ruta_maestra_id: string | null }[]>(page, '/rutas');
  const r = rutas[0]!;
  await page.goto(`/rutas/${r.id}`);
  await page.getByRole('button', { name: 'Recalcular' }).click();
  await page.getByRole('dialog').getByLabel('Motivo').fill(`Desvío por cierre de vía ${sufijo}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar recálculo' }).click();
  await expect(page.getByText('Ruta recalculada. El cambio quedó en el historial.')).toBeVisible();
  await expect(page.getByText(`Desvío por cierre de vía ${sufijo}`)).toBeVisible();
  const hist = await api<{ motivo_recalculo: string }[]>(page, `/rutas/${r.id}/historial`);
  expect(hist.some((h) => h.motivo_recalculo.includes(sufijo))).toBeTruthy();

  await page.goto('/rutas?tab=asignaciones');
  await page.getByRole('button', { name: 'Ejecutar barrido' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ejecutar' }).click();
  await expect(page.getByText('Barrido de asignaciones ejecutado.')).toBeVisible();
  await expect(page.getByText('Resultado', { exact: true })).toBeVisible();

  // En este entorno OSRM no es alcanzable: el backend responde 503 y la interfaz lo explica.
  await page.goto(`/rutas/maestras/${r.ruta_maestra_id}`);
  await page.getByRole('button', { name: 'Recalcular con el servicio de mapas' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Recalcular' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible({ timeout: 80_000 });
  await page.keyboard.press('Escape');
  v.fallos.splice(0); // el 503 de OSRM es la respuesta esperada aquí
  await v.verificar();
});

test('facturación y analítica: cerrar periodo y ejecutar la ETL', async ({ page }) => {
  const v = vigilar(page);
  await page.goto('/facturacion');
  await page.getByRole('button', { name: /Cerrar periodo/ }).click();
  await expect(page.getByRole('dialog').getByText(/no se puede deshacer/)).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar periodo' }).click();
  await expect(page.getByText(/Periodo \d{4}-\d{2} cerrado/)).toBeVisible();
  const facturas = await api<{ estado: string }[]>(page, '/facturas');
  expect(facturas.length).toBeGreaterThan(0);

  await page.goto('/analitica');
  await page.getByRole('button', { name: 'Ejecutar ETL ahora' }).click();
  await expect(page.getByText('ETL ejecutada: indicadores actualizados.')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Resultado de la ETL')).toBeVisible();
  await v.verificar();
});

test('ubicaciones: agregar al catálogo y desactivar', async ({ page }) => {
  const v = vigilar(page);
  const codigo = `CO-T${sufijo.slice(-4)}`;
  await page.goto('/ubicaciones');
  await page.getByRole('button', { name: 'Agregar ubicación' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Nombre').fill(`Puerto Prueba ${sufijo}`);
  await d.getByLabel('Departamento o región').fill('Magdalena');
  await d.getByLabel('Latitud').fill('11.0041');
  await d.getByLabel('Longitud').fill('-74.807');
  await d.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('puerto');
  await d.getByLabel('Código propio').fill(codigo);
  await d.getByRole('button', { name: 'Agregar ubicación' }).click();
  await expect(page.getByText(`Ubicación ${codigo} agregada al catálogo.`)).toBeVisible();
  const u = await api<{ id: string }>(page, `/ubicaciones/codigo/${codigo}`);
  await page.goto(`/ubicaciones?sel=${u.id}`);
  await page.getByLabel(/Activa \(las inactivas/).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Ubicación actualizada.')).toBeVisible();
  expect((await api<{ activo: boolean }>(page, `/ubicaciones/${u.id}`)).activo).toBe(false);
  await v.verificar();
});

test('mapa: marcadores reales, selección desde la lista, filtros y leyenda', async ({ page }) => {
  const v = vigilar(page);
  await page.goto('/mapa');
  await expect(page.locator('.lt-marker').first()).toBeVisible();
  const total = await page.getByRole('list', { name: 'Lista de vehículos' }).getByRole('listitem').count();
  expect(total).toBeGreaterThan(0);
  await page.getByLabel('Filtrar por posición').selectOption('sin_datos');
  const sinDatos = await page.getByRole('list', { name: 'Lista de vehículos' }).getByRole('listitem').count();
  expect(sinDatos).toBeLessThanOrEqual(total);
  await page.getByLabel('Filtrar por posición').selectOption('');
  await page.getByRole('list', { name: 'Lista de vehículos' }).getByRole('button').first().click();
  await expect(page.getByText('Vehículo seleccionado')).toBeVisible();
  await expect(page).toHaveURL(/\?.*v=[0-9a-f-]{36}/);
  await page.getByRole('button', { name: 'Leyenda' }).click();
  await expect(page.getByText('Color: estado operativo')).toBeVisible();
  await v.verificar();
});

test('buscador global por código, placa y ubicación', async ({ page }) => {
  const v = vigilar(page);
  await page.goto('/');
  const buscador = page.getByRole('searchbox').or(page.getByLabel(/Buscar por código de envío/));
  await buscador.fill('env-1');
  await buscador.press('Enter');
  await expect(page).toHaveURL(/\/envios\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'ENV-00000001' })).toBeVisible();
  await buscador.fill('GOQ998');
  await buscador.press('Enter');
  await expect(page).toHaveURL(/\/flota\/vehiculos\//);
  await buscador.fill('1000000001');
  await buscador.press('Enter');
  await expect(page).toHaveURL(/\/clientes\//);
  await buscador.fill('CO-MTR');
  await buscador.press('Enter');
  await expect(page).toHaveURL(/\/ubicaciones\?sel=/);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape'); // la ficha es modal: se cierra antes de volver a buscar
  await expect(page.getByRole('dialog')).toBeHidden();
  await buscador.fill('ZZZ999');
  await buscador.press('Enter');
  await expect(page.getByText('No se encontró «ZZZ999».')).toBeVisible();
  await v.verificar();
});

test('estados de error: servicio caído (503 del gateway) y gateway sin conexión', async ({ page }) => {
  await page.route('**/api/v1/vehiculos', (r) =>
    r.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: { codigo: 'SERVICIO_NO_DISPONIBLE', mensaje: "El servicio 'fleet' no está disponible en este momento", servicio: 'fleet' } }),
    }),
  );
  await page.goto('/flota/vehiculos');
  await expect(page.getByText('Servicio de flota no disponible')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await page.unroute('**/api/v1/vehiculos');

  await page.route('**/api/v1/clientes**', (r) => r.abort('connectionrefused'));
  await page.goto('/clientes');
  await expect(page.getByText('Sin conexión con el API Gateway')).toBeVisible({ timeout: 30_000 });
});
