/** Selección PURA del suelo a partir de planos ARKit y resultados de hit test (RF-L04, RF-L07). */
import type { Vec3 } from '../geo/enu';

export interface PlaneInfo {
  id: string;
  /** Altura (Y de mundo Viro) del plano. */
  y: number;
  /** Área aproximada (m²). */
  area: number;
  horizontal: boolean;
}

/** El plano debe estar al menos esto por debajo de la cámara para considerarse suelo (no una mesa). */
export const MIN_DROP_BELOW_CAMERA_M = 0.5;

/**
 * Elige el plano de suelo: horizontal, al menos MIN_DROP m bajo la cámara, el de mayor área
 * (a igualdad de área, el más bajo). Devuelve null si no hay candidato.
 */
export function pickGroundPlane(planes: Iterable<PlaneInfo>, cameraY: number): PlaneInfo | null {
  let best: PlaneInfo | null = null;
  for (const p of planes) {
    if (!p.horizontal) continue;
    if (p.y > cameraY - MIN_DROP_BELOW_CAMERA_M) continue;
    if (
      best === null ||
      p.area > best.area + 1e-6 ||
      (Math.abs(p.area - best.area) <= 1e-6 && p.y < best.y)
    ) {
      best = p;
    }
  }
  return best;
}

export interface HitResultLike {
  type: string;
  transform: { position: Vec3 | number[] };
}

/** Preferencia de tipos de hit test para "tocar el suelo". */
const HIT_PRIORITY: Record<string, number> = {
  ExistingPlaneUsingExtent: 0,
  ExistingPlane: 1,
  EstimatedHorizontalPlane: 2,
  DepthPoint: 3,
  FeaturePoint: 4,
};

/** Elige el mejor resultado de hit test para un toque en el suelo; null si no hay ninguno útil. */
export function pickGroundHit(results: ReadonlyArray<HitResultLike> | null | undefined): Vec3 | null {
  if (!results || results.length === 0) return null;
  let best: HitResultLike | null = null;
  let bestRank = Infinity;
  for (const r of results) {
    const rank = HIT_PRIORITY[r.type];
    if (rank === undefined) continue;
    const pos = r.transform?.position;
    if (!pos || pos.length < 3 || !pos.every((v) => Number.isFinite(v))) continue;
    if (rank < bestRank) {
      best = r;
      bestRank = rank;
    }
  }
  if (!best) return null;
  const p = best.transform.position;
  return [p[0], p[1], p[2]];
}

/** ¿Merece la pena re-renderizar por un cambio de altura de suelo? (evita renders por ruido). */
export function groundChanged(prev: number | null, next: number, thresholdM = 0.05): boolean {
  return prev === null || Math.abs(prev - next) >= thresholdM;
}
