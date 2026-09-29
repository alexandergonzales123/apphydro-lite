/**
 * Matemática PURA de la calibración manual (RF-L07).
 *
 * Toda la escena cuelga de un nodo raíz con transformación  mundo = R_y(θ)·local + t,
 * que en Viro es <ViroNode position={[tx,ty,tz]} rotation={[0, θ°, 0]}>.
 * (Rotación de yaw con la convención de src/geo/enu.ts: x' = x·cosθ + z·sinθ, z' = −x·sinθ + z·cosθ.)
 *
 * Cada calibración añade una correspondencia (posición local del activo, punto real tocado
 * en el suelo en coordenadas de mundo). La transformación se resuelve con todas:
 *  - 1 punto (o puntos muy juntos): solo traslación.
 *  - ≥ 2 puntos separados ≥ MIN_BASELINE_M: traslación + yaw por mínimos cuadrados
 *    (Procrustes 2D en el plano XZ). Con puntos juntos el yaw sería inestable, por eso no se aplica.
 *  - La Y se corrige con la media de (y_tocada − y_local): el suelo real en ese punto.
 *
 * El historial es inmutable: cada calibración apila el estado anterior para poder deshacer.
 */
import { rotateYaw, type Vec3 } from '../geo/enu';

export interface CalibTransform {
  tx: number;
  ty: number;
  tz: number;
  /** Yaw en radianes (positivo = antihorario visto desde arriba, como Viro). */
  yawRad: number;
}

export interface Correspondence {
  /** Clave estable del activo (`activo-${id}`). Recalibrar el mismo activo sustituye su punto. */
  key: string;
  codigo: string;
  /** Posición del activo en el marco local del nodo raíz (sin calibrar). */
  local: Vec3;
  /** Punto real tocado (hit test), en coordenadas de mundo Viro. */
  world: Vec3;
}

export interface CalibrationState {
  transform: CalibTransform;
  points: Correspondence[];
  usedRotation: boolean;
}

export interface CalibrationHistory {
  current: CalibrationState;
  past: CalibrationState[];
}

/**
 * Separación mínima entre activos calibrados para corregir el giro. Con errores de ~0,3–0,5 m al
 * tocar el suelo, a 10 m el error angular queda en ~2–3°; con 3 m podía superar los 10°.
 */
export const MIN_BASELINE_M = 10;
export const MAX_UNDO = 20;

export const IDENTITY: CalibTransform = { tx: 0, ty: 0, tz: 0, yawRad: 0 };

export const INITIAL_STATE: CalibrationState = { transform: IDENTITY, points: [], usedRotation: false };

export const INITIAL_HISTORY: CalibrationHistory = { current: INITIAL_STATE, past: [] };

/** local -> mundo. */
export function applyTransform(t: CalibTransform, p: Vec3): Vec3 {
  const [x, z] = rotateYaw(p[0], p[2], t.yawRad);
  return [x + t.tx, p[1] + t.ty, z + t.tz];
}

/** mundo -> local (inversa). */
export function invertApply(t: CalibTransform, p: Vec3): Vec3 {
  const [x, z] = rotateYaw(p[0] - t.tx, p[2] - t.tz, -t.yawRad);
  return [x, p[1] - t.ty, z];
}

/** Máxima distancia horizontal (m) entre los puntos locales calibrados. */
export function baseline(points: Correspondence[]): number {
  let best = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = Math.hypot(points[i].local[0] - points[j].local[0], points[i].local[2] - points[j].local[2]);
      if (d > best) best = d;
    }
  }
  return best;
}

export function solveTransform(
  points: Correspondence[],
  minBaselineM = MIN_BASELINE_M,
): { transform: CalibTransform; usedRotation: boolean } {
  const n = points.length;
  if (n === 0) return { transform: IDENTITY, usedRotation: false };

  let ax = 0,
    az = 0,
    px = 0,
    pz = 0,
    dy = 0;
  for (const c of points) {
    ax += c.local[0];
    az += c.local[2];
    px += c.world[0];
    pz += c.world[2];
    dy += c.world[1] - c.local[1];
  }
  ax /= n;
  az /= n;
  px /= n;
  pz /= n;
  const ty = dy / n;

  let yaw = 0;
  const usedRotation = n >= 2 && baseline(points) >= minBaselineM;
  if (usedRotation) {
    // Maximiza Σ p·R(θ)a con vectores centrados: θ = atan2(Σ(px·az − pz·ax), Σ(px·ax + pz·az)).
    let sDot = 0;
    let sCross = 0;
    for (const c of points) {
      const lx = c.local[0] - ax;
      const lz = c.local[2] - az;
      const wx = c.world[0] - px;
      const wz = c.world[2] - pz;
      sDot += wx * lx + wz * lz;
      sCross += wx * lz - wz * lx;
    }
    yaw = Math.atan2(sCross, sDot);
  }
  const [rx, rz] = rotateYaw(ax, az, yaw);
  return { transform: { tx: px - rx, ty, tz: pz - rz, yawRad: yaw }, usedRotation };
}

/**
 * Añade una correspondencia y apila el estado anterior. Si el activo ya estaba calibrado, su
 * correspondencia se SUSTITUYE en su sitio (no se acumulan dos puntos del mismo activo).
 */
export function calibrate(h: CalibrationHistory, c: Correspondence): CalibrationHistory {
  const exists = h.current.points.some((p) => p.key === c.key);
  const points = exists ? h.current.points.map((p) => (p.key === c.key ? c : p)) : [...h.current.points, c];
  const { transform, usedRotation } = solveTransform(points);
  const past = [...h.past, h.current].slice(-MAX_UNDO);
  return { current: { transform, points, usedRotation }, past };
}

export function undo(h: CalibrationHistory): CalibrationHistory {
  if (h.past.length === 0) return h;
  return { current: h.past[h.past.length - 1], past: h.past.slice(0, -1) };
}

export function canUndo(h: CalibrationHistory): boolean {
  return h.past.length > 0;
}

/** Desplazamiento horizontal (m) que sufre un punto local al pasar de la transformación a a la b. */
export function horizontalShift(a: CalibTransform, b: CalibTransform, local: Vec3): number {
  const pa = applyTransform(a, local);
  const pb = applyTransform(b, local);
  return Math.hypot(pb[0] - pa[0], pb[2] - pa[2]);
}

export function radToDeg(r: number): number {
  return (r * 180) / Math.PI;
}
