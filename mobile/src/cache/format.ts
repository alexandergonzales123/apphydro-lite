/** Formato PURO del fichero de caché de la última descarga (RF-L09). */
import { parseCercanos, type ParseResult } from '../api/parse';

export const CACHE_VERSION = 1;

export interface CacheEnvelope {
  v: number;
  savedAt: string; // ISO 8601
  lat: number;
  lon: number;
  raw: string; // GeoJSON tal cual llegó de la API
}

export interface CachedData {
  data: ParseResult;
  savedAt: Date;
  lat: number;
  lon: number;
}

export function serializeCache(raw: string, lat: number, lon: number, now: Date = new Date()): string {
  const env: CacheEnvelope = { v: CACHE_VERSION, savedAt: now.toISOString(), lat, lon, raw };
  return JSON.stringify(env);
}

/** Devuelve null si el contenido no es una caché válida (versión distinta, corrupta...). */
export function deserializeCache(text: string): CachedData | null {
  try {
    const env = JSON.parse(text) as Partial<CacheEnvelope>;
    if (
      env?.v !== CACHE_VERSION ||
      typeof env.raw !== 'string' ||
      typeof env.savedAt !== 'string' ||
      typeof env.lat !== 'number' ||
      typeof env.lon !== 'number'
    ) {
      return null;
    }
    const savedAt = new Date(env.savedAt);
    if (Number.isNaN(savedAt.getTime())) return null;
    return { data: parseCercanos(env.raw), savedAt, lat: env.lat, lon: env.lon };
  } catch {
    return null;
  }
}
