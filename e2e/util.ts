import { appendFileSync, mkdirSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

const REGISTRO = process.env.E2E_REGISTRO; // si se define, cada petición al gateway se anota (JSONL)

/** Errores de consola y respuestas fallidas del gateway durante una prueba. */
export function vigilar(page: Page) {
  const errores: string[] = [];
  const fallos: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // Las teselas de OpenStreetMap pueden no cargar sin Internet: no es un error de la aplicación.
    if (/tile\.openstreetmap|Failed to load resource/.test(t)) return;
    errores.push(t);
  });
  page.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    const u = r.url();
    if (REGISTRO && (u.includes('/api/v1/') || u.endsWith('/health'))) {
      mkdirSync(REGISTRO.replace(/\/[^/]+$/, ''), { recursive: true });
      appendFileSync(REGISTRO, JSON.stringify({ metodo: r.request().method(), url: u, estado: r.status() }) + '\n');
    }
    if (u.includes('/api/v1/') && r.status() >= 500) fallos.push(`${r.status()} ${r.request().method()} ${u}`);
  });
  return {
    errores,
    fallos,
    async verificar() {
      expect(errores, `Errores de consola:\n${errores.join('\n')}`).toEqual([]);
      expect(fallos, `Respuestas 5xx del gateway:\n${fallos.join('\n')}`).toEqual([]);
    },
  };
}

export const API = process.env.E2E_API_URL || 'http://localhost:8002/api/v1';
