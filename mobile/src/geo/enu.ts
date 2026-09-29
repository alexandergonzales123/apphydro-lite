/**
 * Conversión WGS84 -> ECEF -> ENU -> marco de Viro (RF-L03).
 *
 * Módulo PURO: sin dependencias de React Native ni de Viro, para poder testearlo con jest.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONVENCIÓN DE EJES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WGS84 (geodésico): lat, lon en grados; h en metros sobre el elipsoide.
 *   En esta app se usa h = 0 para todo: la altura real la da el suelo detectado por AR,
 *   no el GPS (la altitud GPS tiene errores de varios metros).
 *
 * ECEF: X por (lat 0, lon 0), Y por (lat 0, lon 90° E), Z por el polo norte. Metros.
 *
 * ENU local (respecto al ORIGEN = posición del usuario al arrancar):
 *   e = Este, n = Norte, u = Arriba. Metros. Sistema dextrógiro.
 *
 * Marco de mundo de Viro/ARKit (worldAlignment = "Gravity"):
 *   +X = derecha, +Y = arriba (contra la gravedad), -Z = al frente.
 *   El "frente" (-Z) es la dirección horizontal a la que miraba la cámara cuando arrancó
 *   la sesión AR; NO es el norte. Por eso hay que alinear con el rumbo.
 *
 * Rumbo (heading): grados en sentido horario desde el norte verdadero (0 = N, 90 = E).
 *   `worldHeadingDeg` es el rumbo verdadero al que apunta el eje -Z del mundo Viro.
 *
 * Paso ENU -> Viro (rotación alrededor de Y + intercambio de ejes):
 *   Un punto a distancia horizontal d y azimut α (horario desde N) tiene e = d·sin α, n = d·cos α.
 *   Respecto al frente (-Z), su ángulo es β = α − h, así que en Viro:
 *     x =  d·sin β = e·cos h − n·sin h
 *     z = −d·cos β = −(e·sin h + n·cos h)
 *     y =  u
 *   Comprobación: h = 0 (mirando al norte) => x = e, z = −n  (norte al frente, este a la derecha).
 *
 * Rotación de yaw usada en toda la app (igual que Viro: rotation=[0, θ°, 0], dextrógiro,
 * positivo = antihorario visto desde arriba):
 *   x' =  x·cos θ + z·sin θ
 *   z' = −x·sin θ + z·cos θ
 */

export const WGS84_A = 6378137.0; // semieje mayor (m)
export const WGS84_F = 1 / 298.257223563; // achatamiento
export const WGS84_E2 = WGS84_F * (2 - WGS84_F); // excentricidad al cuadrado

const DEG = Math.PI / 180;

export interface LatLon {
  lat: number;
  lon: number;
}

export type Vec3 = [number, number, number];

/** Punto en ENU local, metros. */
export interface Enu {
  e: number;
  n: number;
  u: number;
}

/** Geodésico WGS84 (grados, metros) -> ECEF (metros). */
export function geodeticToEcef(latDeg: number, lonDeg: number, h = 0): Vec3 {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  return [
    (N + h) * cosLat * Math.cos(lon),
    (N + h) * cosLat * Math.sin(lon),
    (N * (1 - WGS84_E2) + h) * sinLat,
  ];
}

/** ECEF -> ENU respecto a un origen geodésico (grados). */
export function ecefToEnu(p: Vec3, origin: LatLon, originH = 0): Enu {
  const o = geodeticToEcef(origin.lat, origin.lon, originH);
  const dx = p[0] - o[0];
  const dy = p[1] - o[1];
  const dz = p[2] - o[2];
  const lat = origin.lat * DEG;
  const lon = origin.lon * DEG;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  return {
    e: -sinLon * dx + cosLon * dy,
    n: -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz,
    u: cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz,
  };
}

/** WGS84 -> ENU (h = 0 en ambos, ver convención). */
export function wgs84ToEnu(p: LatLon, origin: LatLon): Enu {
  return ecefToEnu(geodeticToEcef(p.lat, p.lon, 0), origin, 0);
}

/**
 * Pre-calcula el origen para convertir muchos puntos rápido (vértices cada 1 m).
 * Devuelve una función equivalente a wgs84ToEnu(p, origin).
 */
export function makeEnuConverter(origin: LatLon): (p: LatLon) => Enu {
  const o = geodeticToEcef(origin.lat, origin.lon, 0);
  const lat = origin.lat * DEG;
  const lon = origin.lon * DEG;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  return (p: LatLon) => {
    const q = geodeticToEcef(p.lat, p.lon, 0);
    const dx = q[0] - o[0];
    const dy = q[1] - o[1];
    const dz = q[2] - o[2];
    return {
      e: -sinLon * dx + cosLon * dy,
      n: -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz,
      u: cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz,
    };
  };
}

/** Normaliza un ángulo en grados a [0, 360). */
export function normalizeDeg(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/**
 * ENU -> marco horizontal de Viro. Devuelve [x, z] (la Y la decide el suelo detectado).
 * @param worldHeadingDeg rumbo verdadero del eje -Z del mundo Viro.
 */
export function enuToViroXZ(e: number, n: number, worldHeadingDeg: number): [number, number] {
  const h = worldHeadingDeg * DEG;
  const c = Math.cos(h);
  const s = Math.sin(h);
  return [e * c - n * s, -(e * s + n * c)];
}

/** Inversa de enuToViroXZ: [x, z] de Viro -> {e, n}. */
export function viroXZToEnu(x: number, z: number, worldHeadingDeg: number): { e: number; n: number } {
  const h = worldHeadingDeg * DEG;
  const c = Math.cos(h);
  const s = Math.sin(h);
  // x = e c − n s ; −z = e s + n c  => resolver (matriz de rotación ortonormal)
  return { e: x * c - z * s, n: -x * s - z * c };
}

/** ENU completo -> Viro [x, y, z] (y = u). */
export function enuToViro(p: Enu, worldHeadingDeg: number): Vec3 {
  const [x, z] = enuToViroXZ(p.e, p.n, worldHeadingDeg);
  return [x, p.u, z];
}

/**
 * Rumbo verdadero del eje -Z del mundo Viro a partir del rumbo de la brújula y del vector
 * "forward" de la cámara en coordenadas de mundo Viro, tomados en el mismo instante.
 *
 * La cámara puede haber girado desde que arrancó la sesión AR, así que su forward ya no
 * coincide con -Z. Yaw de la cámara en Viro (horario desde -Z visto desde arriba):
 *   φ = atan2(fx, −fz)
 * y el rumbo del eje -Z es h0 = headingCámara − φ.
 */
export function worldHeadingFromCamera(cameraHeadingDeg: number, forward: Vec3): number {
  const fx = forward[0];
  const fz = forward[2];
  if (Math.abs(fx) < 1e-9 && Math.abs(fz) < 1e-9) {
    // Cámara mirando justo arriba/abajo: no hay yaw definido; asumimos que no ha girado.
    return normalizeDeg(cameraHeadingDeg);
  }
  const phiDeg = Math.atan2(fx, -fz) / DEG;
  return normalizeDeg(cameraHeadingDeg - phiDeg);
}

/** Longitud de la proyección horizontal (XZ de Viro) de un vector. */
export function horizontalNorm(v: Vec3): number {
  return Math.hypot(v[0], v[2]);
}

/**
 * Igual que worldHeadingFromCamera, pero eligiendo el vector de la cámara que corresponde al rumbo:
 *   - 'camera' (iOS): el rumbo es el de la cámara -> se empareja con `forward` (sin cambios).
 *   - 'deviceTop' (Android): el rumbo es el de la parte superior del teléfono -> se empareja con
 *     `up` (en retrato, el "arriba" de la cámara Viro es la parte superior del teléfono). Ambos
 *     miden la misma dirección física, así que el resultado es correcto con cualquier inclinación
 *     siempre que `up` no sea casi vertical (ver isHeadingPoseUsable en src/flow/criteria.ts).
 *     Si `up` es vertical (degenerado) se recurre a `forward`.
 */
export function worldHeadingFromPose(
  headingDeg: number,
  pose: { forward: Vec3; up: Vec3 },
  reference: 'camera' | 'deviceTop',
): number {
  if (reference === 'deviceTop' && horizontalNorm(pose.up) > 1e-6) {
    return worldHeadingFromCamera(headingDeg, pose.up);
  }
  return worldHeadingFromCamera(headingDeg, pose.forward);
}

/** Rotación de yaw (ver convención de cabecera). */
export function rotateYaw(x: number, z: number, thetaRad: number): [number, number] {
  const c = Math.cos(thetaRad);
  const s = Math.sin(thetaRad);
  return [x * c + z * s, -x * s + z * c];
}

/** Distancia horizontal en metros entre dos puntos WGS84 (vía ENU). */
export function horizontalDistance(a: LatLon, b: LatLon): number {
  const p = wgs84ToEnu(b, a);
  return Math.hypot(p.e, p.n);
}

/** Distancia 2D mínima de un punto a una polilínea. */
export function distancePointToPolyline2D(
  px: number,
  py: number,
  line: ReadonlyArray<readonly [number, number]>,
): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) return Math.hypot(px - line[0][0], py - line[0][1]);
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i];
    const [bx, by] = line[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (d < best) best = d;
  }
  return best;
}
