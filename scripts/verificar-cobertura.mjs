#!/usr/bin/env node
/**
 * Compara las rutas públicas del API Gateway (openapi.json en vivo) con las que usa el frontend
 * (src/lib/api/endpoints.ts). Uso: node scripts/verificar-cobertura.mjs [http://localhost:8002]
 * Sale con código 1 si alguna ruta del gateway no está cubierta o si el frontend llama a una que no existe.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const gateway = (process.argv[2] || process.env.GATEWAY_URL || 'http://localhost:8002').replace(/\/+$/, '');
const fuente = readFileSync(fileURLToPath(new URL('../src/lib/api/endpoints.ts', import.meta.url)), 'utf8');

const norm = (ruta) =>
  ruta
    .replace(/^\/api\/v1/, '')
    .replace(/\$\{[^}]+\}/g, '{}')
    .replace(/\{[^}]+\}/g, '{}')
    .replace(/\/+$/, '') || '/';

// Llamadas del frontend: http.<método><T>('ruta', ...)
const frontend = new Set();
for (const m of fuente.matchAll(/http\.(get|post|patch|put)<[^>]*>\(\s*[`'"]([^`'"]+)[`'"]/g)) {
  frontend.add(`${m[1].toUpperCase()} ${norm(m[2])}`);
}

const resp = await fetch(`${gateway}/openapi.json`);
if (!resp.ok) {
  console.error(`No se pudo leer ${gateway}/openapi.json (${resp.status})`);
  process.exit(2);
}
const spec = await resp.json();
const publicas = new Set();
for (const [ruta, item] of Object.entries(spec.paths ?? {})) {
  for (const metodo of Object.keys(item)) {
    if (['get', 'post', 'patch', 'put', 'delete'].includes(metodo)) publicas.add(`${metodo.toUpperCase()} ${norm(ruta)}`);
  }
}

const faltan = [...publicas].filter((r) => !frontend.has(r)).sort();
const sobran = [...frontend].filter((r) => !publicas.has(r)).sort();
const caidos = (spec.info?.description ?? '').match(/\*\*Servicios sin respuesta.*?\*\* (.*)/)?.[1];

console.log(`Gateway: ${gateway}`);
console.log(`Rutas públicas en openapi.json: ${publicas.size}`);
console.log(`Rutas usadas por el frontend:   ${frontend.size}`);
if (caidos) console.log(`AVISO: servicios sin respuesta al generar la especificación: ${caidos}`);
console.log(`Cubiertas: ${publicas.size - faltan.length}/${publicas.size}`);
if (faltan.length) console.log(`\nSin uso en el frontend:\n  ${faltan.join('\n  ')}`);
if (sobran.length) console.log(`\nEl frontend llama a rutas que el gateway no publica:\n  ${sobran.join('\n  ')}`);
process.exit(faltan.length || sobran.length ? 1 : 0);
