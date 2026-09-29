/** Cliente de GET /cercanos (RF-L02). Una sola llamada por arranque. */
import { API_KEY, API_TIMEOUT_MS, API_URL, API_URL_IS_HTTPS, RADIO_M } from '../config';
import { parseCercanos, type ParseResult } from './parse';

export type ApiErrorKind = 'config' | 'auth' | 'validation' | 'unavailable' | 'network' | 'parse';

export class ApiError extends Error {
  constructor(
    public kind: ApiErrorKind,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Errores ante los que tiene sentido mostrar la caché (sin conexión / servidor caído). */
  get puedeUsarCache(): boolean {
    return this.kind === 'network' || this.kind === 'unavailable';
  }
}

export interface Descarga {
  data: ParseResult;
  /** Texto crudo para guardarlo en caché. */
  raw: string;
}

export function buildCercanosUrl(baseUrl: string, lat: number, lon: number, radio = RADIO_M): string {
  const q = `lat=${encodeURIComponent(lat.toFixed(7))}&lon=${encodeURIComponent(
    lon.toFixed(7),
  )}&radio=${encodeURIComponent(String(radio))}`;
  return `${baseUrl}/cercanos?${q}`;
}

async function detalle(res: Response): Promise<string | undefined> {
  try {
    const j = (await res.json()) as { detail?: unknown };
    return typeof j?.detail === 'string' ? j.detail : undefined;
  } catch {
    return undefined;
  }
}

export async function fetchCercanos(lat: number, lon: number, radio = RADIO_M): Promise<Descarga> {
  if (!API_URL || !API_KEY) {
    throw new ApiError('config', 'Faltan EXPO_PUBLIC_API_URL o EXPO_PUBLIC_API_KEY en el build');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(buildCercanosUrl(API_URL, lat, lon, radio), {
      method: 'GET',
      headers: { 'X-API-Key': API_KEY, Accept: 'application/geo+json, application/json' },
      signal: controller.signal,
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    // En release, una URL http:// la bloquean iOS (ATS) y Android (cleartext) y el fallo parece
    // "sin conexión": se dice.
    const httpHint =
      !aborted && !API_URL_IS_HTTPS && typeof __DEV__ !== 'undefined' && !__DEV__
        ? ' (la URL de la API no es https://: el sistema bloquea HTTP en esta build)'
        : '';
    throw new ApiError('network', aborted ? 'Tiempo de espera agotado' : `Sin conexión con el servidor${httpHint}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) {
    throw new ApiError('auth', (await detalle(res)) ?? 'API key inválida', 401);
  }
  if (res.status === 422) {
    throw new ApiError('validation', (await detalle(res)) ?? 'Parámetros inválidos', 422);
  }
  if (res.status >= 500) {
    // 503 {"detail":"Base de datos no disponible"} y demás 5xx: se trata como fallo de red.
    throw new ApiError('unavailable', (await detalle(res)) ?? `Servidor no disponible (${res.status})`, res.status);
  }
  if (!res.ok) {
    throw new ApiError('network', (await detalle(res)) ?? `Error HTTP ${res.status}`, res.status);
  }

  const raw = await res.text();
  try {
    return { data: parseCercanos(raw), raw };
  } catch (e) {
    throw new ApiError('parse', e instanceof Error ? e.message : 'Respuesta inválida');
  }
}
