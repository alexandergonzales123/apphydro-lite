/** Persistencia de la última descarga en un fichero local (expo-file-system, API de SDK 54+). */
import { File, Paths } from 'expo-file-system';
import { deserializeCache, serializeCache, type CachedData } from './format';

const FILE_NAME = 'cercanos-cache.json';

function cacheFile(): File {
  return new File(Paths.document, FILE_NAME);
}

export function saveCache(raw: string, lat: number, lon: number): void {
  try {
    const f = cacheFile();
    if (!f.exists) f.create();
    f.write(serializeCache(raw, lat, lon));
  } catch (e) {
    // La caché es opcional (S): un fallo al guardar no debe romper la vista AR.
    console.warn('[cache] no se pudo guardar', e);
  }
}

export async function loadCache(): Promise<CachedData | null> {
  try {
    const f = cacheFile();
    if (!f.exists) return null;
    return deserializeCache(await f.text());
  } catch (e) {
    console.warn('[cache] no se pudo leer', e);
    return null;
  }
}
