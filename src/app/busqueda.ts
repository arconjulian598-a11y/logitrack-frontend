import { esUuid } from '@/lib/utils';

/** Normaliza «env-32» → «ENV-00000032» (los códigos tienen 8 dígitos). */
export function normalizarCodigo(prefijo: 'ENV' | 'RUT', texto: string): string {
  const digitos = texto.replace(/\D/g, '');
  return `${prefijo}-${digitos.padStart(8, '0')}`;
}

export type Destino =
  | { tipo: 'envio'; codigo: string }
  | { tipo: 'ruta'; codigo: string }
  | { tipo: 'ubicacion'; codigo: string }
  | { tipo: 'placa'; placa: string }
  | { tipo: 'codigo10'; codigo: number }
  | { tipo: 'uuid'; id: string }
  | { tipo: 'desconocido' };

/** Interpreta lo escrito en el buscador (función pura, probada en unidad). */
export function interpretarBusqueda(entrada: string): Destino {
  const t = entrada.trim().toUpperCase();
  if (/^ENV[-\s]?\d{1,8}$/.test(t)) return { tipo: 'envio', codigo: normalizarCodigo('ENV', t) };
  if (/^RUT[-\s]?\d{1,8}$/.test(t)) return { tipo: 'ruta', codigo: normalizarCodigo('RUT', t) };
  if (/^[A-Z]{2}-[A-Z]{3}\d*$/.test(t)) return { tipo: 'ubicacion', codigo: t };
  if (/^[A-Z]{3}\s?\d{3}$/.test(t) || /^[A-Z]{3}\d{2}[A-Z]$/.test(t)) return { tipo: 'placa', placa: t.replace(/\s/g, '') };
  if (/^\d{10}$/.test(t)) return { tipo: 'codigo10', codigo: Number(t) };
  if (esUuid(t)) return { tipo: 'uuid', id: t.toLowerCase() };
  return { tipo: 'desconocido' };
}
