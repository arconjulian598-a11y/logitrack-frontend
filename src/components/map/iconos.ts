import L from 'leaflet';

const CAMION =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>';

const PAUSA =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg>';

const LLAVE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>';

function escapar(t: string): string {
  return t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Icono de vehículo: color = estado operativo; borde punteado = posición histórica. */
export function iconoVehiculo(opts: {
  color: string;
  placa: string;
  historica: boolean;
  seleccionado: boolean;
  pausado?: boolean;
  mantenimiento?: boolean;
}): L.DivIcon {
  const glifo = opts.pausado ? PAUSA : opts.mantenimiento ? LLAVE : CAMION;
  const fondo = opts.historica ? `color-mix(in srgb, ${opts.color} 70%, #fff)` : opts.color;
  const clases = ['lt-pin', opts.historica ? 'is-historica' : '', opts.seleccionado ? 'is-selected' : ''].join(' ');
  return L.divIcon({
    className: 'lt-marker',
    html: `<div style="position:relative"><div class="${clases}" style="background:${fondo};${opts.historica ? `border-color:${opts.color}` : ''}">${glifo}</div>${opts.placa ? `<span class="lt-pin-label">${escapar(opts.placa)}</span>` : ''}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

export function iconoExtremo(tipo: 'origen' | 'destino'): L.DivIcon {
  const color = tipo === 'origen' ? 'var(--ok)' : 'var(--danger)';
  const letra = tipo === 'origen' ? 'A' : 'B';
  return L.divIcon({
    className: 'lt-marker',
    html: `<div class="lt-pin" style="width:22px;height:22px;background:${color};font:700 11px var(--font-sans);color:#fff">${letra}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}
