import { config } from './config';

const TZ = config.zonaHoraria;

/** Convierte decimales que llegan como texto (`"800.00"`) a número. `null` si no es válido. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const fmtCache = new Map<string, Intl.NumberFormat>();
function nf(opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const k = JSON.stringify(opts);
  let f = fmtCache.get(k);
  if (!f) {
    f = new Intl.NumberFormat('es-CO', opts);
    fmtCache.set(k, f);
  }
  return f;
}

export function numero(v: unknown, decimales = 0, vacio = '—'): string {
  const n = num(v);
  return n === null ? vacio : nf({ maximumFractionDigits: decimales, minimumFractionDigits: 0 }).format(n);
}

export function conUnidad(v: unknown, unidad: string, decimales = 0): string {
  const n = num(v);
  return n === null ? '—' : `${numero(n, decimales)} ${unidad}`;
}

export function pesos(v: unknown, vacio = '—'): string {
  const n = num(v);
  return n === null ? vacio : nf({ style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}

export function porcentaje(v: unknown, decimales = 0): string {
  const n = num(v);
  return n === null ? '—' : `${numero(n, decimales)} %`;
}

function aFecha(v: string | null | undefined): Date | null {
  if (!v) return null;
  // Las fechas sin zona del backend se interpretan como UTC (contrato 1.2).
  const s = /[zZ]|[+-]\d\d:?\d\d$/.test(v) || v.length <= 10 ? v : `${v}Z`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fechaHora(v: string | null | undefined, vacio = '—'): string {
  const d = aFecha(v);
  if (!d) return vacio;
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function hora(v: string | null | undefined, vacio = '—'): string {
  const d = aFecha(v);
  if (!d) return vacio;
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);
}

/** Fechas puras `YYYY-MM-DD` (sin hora): no se convierten de zona. */
export function fecha(v: string | null | undefined, vacio = '—'): string {
  if (!v) return vacio;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(Date.UTC(y!, m! - 1, d!)),
    );
  }
  const d = aFecha(v);
  if (!d) return vacio;
  return new Intl.DateTimeFormat('es-CO', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' }).format(d);
}

/** «hace 3 min», «en 2 h». */
export function relativo(v: string | null | undefined, ahora = Date.now(), vacio = '—'): string {
  const d = aFecha(v);
  if (!d) return vacio;
  const seg = Math.round((d.getTime() - ahora) / 1000);
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  const abs = Math.abs(seg);
  if (abs < 45) return rtf.format(seg, 'second');
  if (abs < 45 * 60) return rtf.format(Math.round(seg / 60), 'minute');
  if (abs < 22 * 3600) return rtf.format(Math.round(seg / 3600), 'hour');
  return rtf.format(Math.round(seg / 86400), 'day');
}

export function edadMs(v: string | null | undefined, ahora = Date.now()): number | null {
  const d = aFecha(v);
  return d ? ahora - d.getTime() : null;
}

export function duracion(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined) return '—';
  const s = Math.max(0, Math.round(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min ${r} s`;
  return `${r} s`;
}

export function horas(v: unknown): string {
  const n = num(v);
  if (n === null) return '—';
  const h = Math.floor(n);
  const m = Math.round((n - h) * 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export function idCorto(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : '—';
}

/** `cambio_aceite` → «Cambio aceite». */
export function humanizar(v: string | null | undefined): string {
  if (!v) return '—';
  const t = v.replace(/[_.-]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Valor para `<input type="datetime-local">` a partir de ISO, en hora de Bogotá. */
export function aInputLocal(d: Date): string {
  const partes = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
  return partes.replace(' ', 'T');
}

/** `datetime-local` interpretado en hora de Bogotá (UTC−5, sin horario de verano) → ISO UTC. */
export function desdeInputLocal(v: string): string | null {
  if (!v) return null;
  const d = new Date(`${v}:00-05:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** «14 oct» para ejes de gráficas (fechas puras, sin conversión de zona). */
export function fechaCorta(v: string | null | undefined): string {
  if (!v) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return v;
  const mes = new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(+m[1]!, +m[2]! - 1, 1)));
  return `${Number(m[3])} ${mes.replace('.', '')}`;
}
