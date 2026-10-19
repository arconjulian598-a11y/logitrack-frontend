import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de la fase 2 (login, roles, cotizar, partes, programados, cobros…) contra el gateway
 * SIMULADO de e2e/mock (no necesitan el backend real ni Internet).
 *   npm run test:e2e:fase2
 * Requiere Python con fastapi y uvicorn (MOCK_PYTHON indica cuál usar).
 */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const python = process.env.MOCK_PYTHON || 'python';

export default defineConfig({
  testDir: './e2e/fase2',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath },
  },
  webServer: [
    { command: `${python} e2e/mock/gateway_simulado.py`, url: 'http://localhost:8002/health', reuseExistingServer: true },
    { command: 'npx vite --port 5173', url: 'http://localhost:5173', reuseExistingServer: true, env: { VITE_GATEWAY_URL: 'http://localhost:8002', VITE_API_BASE_URL: 'http://localhost:8002/api/v1' } },
  ],
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: { executablePath } }, grepInvert: /@movil/ },
    { name: 'movil', use: { ...devices['Pixel 7'], launchOptions: { executablePath } }, grep: /@movil/ },
  ],
});
