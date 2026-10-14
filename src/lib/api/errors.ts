/**
 * Errores del API Gateway. El campo `detail` llega en tres formas (contrato, sección 2.1):
 * texto, objeto `{codigo, mensaje, servicio?}` / `{mensaje, errores[]}`, o lista de validación 422.
 */

export interface ErrorValidacion {
  loc?: (string | number)[];
  msg: string;
  type?: string;
}

export type CodigoGateway =
  | 'RUTA_NO_ENCONTRADA'
  | 'METODO_NO_PERMITIDO'
  | 'SERVICIO_NO_DISPONIBLE'
  | 'SERVICIO_NO_CONFIGURADO'
  | 'SERVICIO_LENTO'
  | 'ERROR_DE_GATEWAY';

export class ApiError extends Error {
  readonly status: number;
  readonly codigo?: string;
  readonly servicio?: string;
  readonly requestId?: string;
  readonly errores: string[];
  readonly validacion: ErrorValidacion[];
  readonly cuerpo: unknown;

  constructor(opts: {
    status: number;
    mensaje: string;
    codigo?: string;
    servicio?: string;
    requestId?: string;
    errores?: string[];
    validacion?: ErrorValidacion[];
    cuerpo?: unknown;
  }) {
    super(opts.mensaje);
    this.name = 'ApiError';
    this.status = opts.status;
    this.codigo = opts.codigo;
    this.servicio = opts.servicio;
    this.requestId = opts.requestId;
    this.errores = opts.errores ?? [];
    this.validacion = opts.validacion ?? [];
    this.cuerpo = opts.cuerpo;
  }

  /** Sin conexión con el gateway (red caída, CORS, gateway apagado). */
  get esDeRed(): boolean {
    return this.status === 0;
  }

  /** El gateway respondió pero el microservicio no (503/504/502 propios del gateway). */
  get esServicioCaido(): boolean {
    return (
      this.codigo === 'SERVICIO_NO_DISPONIBLE' ||
      this.codigo === 'SERVICIO_LENTO' ||
      this.codigo === 'ERROR_DE_GATEWAY' ||
      this.codigo === 'SERVICIO_NO_CONFIGURADO'
    );
  }

  get noEncontrado(): boolean {
    return this.status === 404;
  }
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const NOMBRES_CAMPO: Record<string, string> = {
  body: 'cuerpo',
  query: 'consulta',
  path: 'ruta',
};

function campo(loc: (string | number)[] | undefined): string {
  if (!loc || loc.length === 0) return '';
  const partes = loc.slice(1).map(String);
  if (partes.length === 0) return NOMBRES_CAMPO[String(loc[0])] ?? String(loc[0]);
  return partes.join('.');
}

/** Traduce un cuerpo de error del gateway a un mensaje legible (contrato 2.1, `mensajeDeError`). */
export function mensajeDeError(cuerpo: unknown, status: number): string {
  const d = esObjeto(cuerpo) ? cuerpo.detail : undefined;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) {
    return d
      .map((e: unknown) => {
        if (!esObjeto(e)) return String(e);
        const c = campo(e.loc as (string | number)[] | undefined);
        const msg = String(e.msg ?? '');
        return c ? `${c}: ${msg}` : msg;
      })
      .join('\n');
  }
  if (esObjeto(d)) {
    const errores = Array.isArray(d.errores) ? (d.errores as unknown[]).map(String) : [];
    const mensaje = typeof d.mensaje === 'string' ? d.mensaje : undefined;
    if (errores.length) return `${mensaje ?? 'Datos no válidos'}: ${errores.join('; ')}`;
    return mensaje ?? (typeof d.codigo === 'string' ? d.codigo : `Error ${status}`);
  }
  if (status === 0) return 'No hay conexión con el API Gateway.';
  return `Error ${status}`;
}

/** Construye un ApiError a partir de la respuesta HTTP ya leída. */
export function crearApiError(status: number, cuerpo: unknown, requestId?: string): ApiError {
  const d = esObjeto(cuerpo) ? cuerpo.detail : undefined;
  return new ApiError({
    status,
    mensaje: mensajeDeError(cuerpo, status),
    codigo: esObjeto(d) && typeof d.codigo === 'string' ? d.codigo : undefined,
    servicio: esObjeto(d) && typeof d.servicio === 'string' ? d.servicio : undefined,
    errores: esObjeto(d) && Array.isArray(d.errores) ? (d.errores as unknown[]).map(String) : undefined,
    validacion: Array.isArray(d) ? (d as ErrorValidacion[]) : undefined,
    requestId,
    cuerpo,
  });
}

/** Mensaje corto y accionable para mostrar al usuario a partir de cualquier error. */
export function describirError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.esDeRed) {
      return 'No se pudo conectar con el API Gateway. Compruebe que está encendido y que este origen está en CORS_ORIGINS.';
    }
    if (error.codigo === 'SERVICIO_NO_DISPONIBLE') {
      return `El servicio ${error.servicio ?? ''} no está disponible en este momento. Reintente en unos segundos.`.replace('  ', ' ');
    }
    if (error.codigo === 'SERVICIO_LENTO') {
      return `El servicio ${error.servicio ?? ''} tardó demasiado en responder.`.replace('  ', ' ');
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Ocurrió un error inesperado.';
}
