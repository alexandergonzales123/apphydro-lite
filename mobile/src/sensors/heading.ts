/**
 * Normalización PURA de las lecturas de `watchHeadingAsync` de expo-location, que se comporta
 * distinto en cada plataforma (comprobado en el código nativo de expo-location 57):
 *
 * iOS (CLHeading)
 *   - trueHeading < 0 = no válido (sin ubicación) -> se usa magHeading.
 *   - accuracy: incertidumbre en grados convertida a 0..3 (3 < 20°, 2 < 35°, 1 < 50°, 0 peor).
 *   - Se empareja con el vector forward de la cámara (comportamiento previo, sin cambios).
 *
 * Android (SensorManager.getOrientation con acelerómetro + magnetómetro, sin remapear ejes)
 *   - El azimut es el de la parte de ARRIBA del teléfono (eje +Y del dispositivo) proyectada en
 *     horizontal, no el de la cámara. Con el teléfono vertical ese eje apunta casi al cielo y el
 *     azimut es inestable; por eso se empareja con el vector "up" de la cámara Viro (ver
 *     worldHeadingFromPose en src/geo/enu.ts) y se pide inclinar el teléfono hacia el suelo.
 *   - trueHeading = -1 si no hay declinación (sin ubicación). Pero también puede salir negativo
 *     siendo válido: expo calcula (mag + declinación) % 360, que es negativo si la declinación es
 *     negativa y mag es pequeño. Solo -1 exacto se trata como "no válido"; el resto se normaliza.
 *   - accuracy: SENSOR_STATUS_* de Android (-1 sin contacto, 0 no fiable, 1 baja, 2 media, 3 alta).
 *     Es el último valor de onAccuracyChanged de CUALQUIERA de los dos sensores y solo llega cuando
 *     cambia, así que es orientativo: puede quedarse en 0 aunque la brújula esté bien, o marcar 3
 *     por el acelerómetro. Se acota a 0..3 y se usa el mismo umbral que en iOS.
 */
import type { HeadingReading } from '../state/sensorStore';

export interface RawHeading {
  trueHeading: number;
  magHeading: number;
  accuracy: number;
}

/** 'camera' = rumbo hacia donde mira la cámara; 'deviceTop' = rumbo de la parte superior del teléfono. */
export type HeadingReference = HeadingReading['reference'];

export function headingReference(os: string): HeadingReference {
  return os === 'android' ? 'deviceTop' : 'camera';
}

function wrap360(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** Valor sentinela de Android para "sin rumbo verdadero". */
const ANDROID_NO_TRUE_HEADING = -1;

/** Convierte la lectura de expo-location en un HeadingReading; null si no hay ningún rumbo usable. */
export function normalizeHeading(raw: RawHeading, os: string): HeadingReading | null {
  const android = os === 'android';
  const t = raw.trueHeading;
  const trueValid = Number.isFinite(t) && (android ? t !== ANDROID_NO_TRUE_HEADING : t >= 0);
  const deg = trueValid ? t : raw.magHeading;
  if (!Number.isFinite(deg)) return null;
  const acc = Number.isFinite(raw.accuracy) ? Math.round(raw.accuracy) : 0;
  return {
    deg: wrap360(deg),
    isTrue: trueValid,
    accuracy: Math.min(3, Math.max(0, acc)),
    reference: headingReference(os),
  };
}
