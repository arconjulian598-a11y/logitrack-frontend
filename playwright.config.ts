import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de extremo a extremo contra el backend REAL (API Gateway en VITE_API_BASE_URL).
 * Requisitos: gateway y microservicios encendidos, y el frontend en http://localhost:5173 (`npm run dev`).
 * Si el navegador de Playwright no está instalado, `npx playwright install chromium`,
 * o indique uno existente con PW_CHROMIUM_PATH.
 */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath },
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: { executablePath } } },
    { name: 'movil', use: { ...devices['Pixel 7'], launchOptions: { executablePath } }, grep: /@movil/ },
  ],
});
