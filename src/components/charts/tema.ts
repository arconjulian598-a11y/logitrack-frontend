/** Colores por rol (variables CSS: cambian solas con el tema). */
export const C = {
  s1: 'var(--chart-1)',
  s2: 'var(--chart-2)',
  s3: 'var(--chart-3)',
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  danger: 'var(--danger)',
  grid: 'var(--chart-grid)',
  eje: 'var(--text-3)',
  texto: 'var(--text-2)',
  superficie: 'var(--surface)',
};

/** Props comunes de ejes: recesivos, sin línea de eje en Y. */
export const ejeX = {
  stroke: C.eje,
  tick: { fill: 'var(--text-3)', fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: 'var(--rule-strong)' },
} as const;
export const ejeY = {
  stroke: C.eje,
  tick: { fill: 'var(--text-3)', fontSize: 11 },
  tickLine: false,
  axisLine: false,
  width: 44,
} as const;
export const rejilla = { stroke: C.grid, strokeDasharray: '0', vertical: false } as const;
