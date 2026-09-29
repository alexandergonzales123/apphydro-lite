/**
 * Lógica PURA de la pantalla de permisos: compatibilidad AR y evaluación de permisos, con las
 * diferencias entre plataformas aisladas aquí (el componente solo pasa Platform.OS).
 */

export type ArSupport = 'supported' | 'unsupported' | 'transient' | 'unknown';

export type ArSupportOutcome = { ok: true; value: unknown } | { ok: false; error: unknown };

/**
 * Interpreta el resultado de `isARSupportedOnDevice()` de Viro 3.0.1:
 *   - iOS: resuelve { isARSupported: boolean }.
 *   - Android: resuelve { isARSupported: true } si ARCore lo soporta (aunque aún no esté instalado:
 *     Viro pide instalarlo al abrir la vista AR) y RECHAZA con Error("UNSUPPORTED" | "UNKNOWN" |
 *     "TRANSIENT") en otro caso. TRANSIENT = ARCore todavía está comprobando: hay que reintentar.
 *   - Si falta el módulo nativo resuelve { isARSupported: false } en ambas.
 * Un formato inesperado o un error desconocido devuelven 'unknown' (no se bloquea al usuario).
 */
export function classifyArSupport(outcome: ArSupportOutcome): ArSupport {
  if (outcome.ok) {
    const v = outcome.value;
    if (v && typeof v === 'object' && 'isARSupported' in v) {
      return (v as { isARSupported: unknown }).isARSupported ? 'supported' : 'unsupported';
    }
    return 'unknown';
  }
  const e = outcome.error;
  const msg = (e instanceof Error ? e.message : typeof e === 'string' ? e : '').trim().toUpperCase();
  if (msg === 'UNSUPPORTED') return 'unsupported';
  if (msg === 'TRANSIENT') return 'transient';
  return 'unknown';
}

export type PermissionOutcome = 'granted' | 'denied' | 'approximate';

export interface PermissionInput {
  camera: boolean;
  location: boolean;
  /** Solo Android (expo-location): 'coarse' si el usuario eligió "ubicación aproximada". */
  locationAccuracy?: 'fine' | 'coarse' | 'none';
}

/**
 * En Android 12+ el usuario puede conceder solo la ubicación aproximada (~ km): expo-location la
 * da como `granted`, pero con ella no se pueden situar las tuberías, así que se pide la precisa.
 */
export function evaluatePermissions(p: PermissionInput, os: string): PermissionOutcome {
  if (!p.camera || !p.location) return 'denied';
  if (os === 'android' && p.locationAccuracy === 'coarse') return 'approximate';
  return 'granted';
}

export function unsupportedMessage(os: string): string {
  return os === 'android'
    ? 'Este dispositivo no es compatible con ARCore (Servicios de Google Play para RA), así que no ' +
        'puede mostrar la realidad aumentada. Consulta la lista de dispositivos compatibles en ' +
        'developers.google.com/ar/devices.'
    : 'Este dispositivo no es compatible con ARKit.';
}

export function deniedHint(os: string): string {
  return os === 'android'
    ? 'Falta algún permiso. Si lo denegaste antes, actívalo en los ajustes de la app (Permisos).'
    : 'Falta algún permiso. Si lo denegaste antes, actívalo en Ajustes.';
}

export const APPROXIMATE_LOCATION_HINT =
  'Has concedido solo la ubicación aproximada. Para situar sensores y tuberías hace falta la ' +
  'ubicación precisa: en los ajustes de la app, Permisos → Ubicación → activa "Usar ubicación precisa".';
