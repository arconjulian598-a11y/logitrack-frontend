/** Conversión de valores de formulario (los inputs numéricos se manejan como texto). */

/** Convierte texto de un input numérico en número o null (acepta coma decimal). */
export function aNumero(v: string | undefined | null): number | null {
  if (v === undefined || v === null || v.trim() === '') return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Texto vacío → null (los campos opcionales del backend esperan null). */
export function vacioANull(v: string | undefined | null): string | null {
  const t = v?.trim();
  return t ? t : null;
}
