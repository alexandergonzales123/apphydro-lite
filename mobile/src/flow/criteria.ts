/** Criterios PUROS de la inicialización (aceptar un fix GPS, fiabilidad del rumbo). */
import { horizontalNorm, type Vec3 } from '../geo/enu';
import type { GpsFix, HeadingReading } from '../state/sensorStore';

/** ¿El fix vale para arrancar? Precisión desconocida (null) se acepta: no hay nada mejor que esperar. */
export function isAcceptableFix(fix: GpsFix | null, maxAccuracyM: number): fix is GpsFix {
  return fix !== null && (fix.accuracy === null || fix.accuracy <= maxAccuracyM);
}

/**
 * ¿El rumbo es fiable para orientar la escena? `accuracy` ya viene acotada a 0..3 en las dos
 * plataformas (src/sensors/heading.ts). En Android es el SENSOR_STATUS del sensor y es solo
 * orientativa; la otra condición de Android (inclinación) la comprueba isHeadingPoseUsable.
 */
export function isReliableHeading(h: HeadingReading | null, minAccuracy: number): h is HeadingReading {
  return h !== null && Number.isFinite(h.deg) && h.accuracy >= minAccuracy;
}

/**
 * ¿La pose de la cámara permite emparejarla con el rumbo?
 *   - 'camera' (iOS): siempre (comportamiento previo).
 *   - 'deviceTop' (Android): el rumbo es el de la parte superior del teléfono; con el teléfono
 *     vertical ese eje apunta al cielo y tanto el azimut de Android como el yaw del vector `up`
 *     son ruido. Se exige que la proyección horizontal de `up` sea >= minUpHorizontal, lo que
 *     equivale a inclinar la cámara hacia el suelo (0,5 ≈ 30° por debajo del horizonte).
 */
export function isHeadingPoseUsable(
  pose: { up: Vec3 },
  reference: HeadingReading['reference'],
  minUpHorizontal: number,
): boolean {
  return reference === 'camera' || horizontalNorm(pose.up) >= minUpHorizontal;
}
