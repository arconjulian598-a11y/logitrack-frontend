import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Filtra un arreglo por texto libre sobre varios campos (insensible a tildes y mayúsculas). */
export function normalizar(t: string): string {
  return t
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function coincide(texto: string, ...campos: (string | number | null | undefined)[]): boolean {
  const q = normalizar(texto);
  if (!q) return true;
  return campos.some((c) => c !== null && c !== undefined && normalizar(String(c)).includes(q));
}

export function esUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());
}
