/**
 * Construcción PURA del modelo de escena: datos parseados + marco (origen, rumbo) + altura del
 * suelo -> posiciones 3D en el marco LOCAL del nodo raíz (antes de la calibración).
 *
 * Se ejecuta solo cuando cambian los datos, el marco (fijado una vez al arrancar) o el suelo
 * (umbral de 5 cm). Nunca en cada tick de GPS (RNF-L03).
 */
import { tipoRedNormalizado } from '../api/parse';
import type { Activo, Red, TipoRed } from '../api/types';
import { makeEnuConverter, enuToViroXZ, type LatLon, type Vec3 } from '../geo/enu';

export interface SceneFrame {
  /** Origen ENU: posición GPS del usuario al fijar la escena. */
  origin: LatLon;
  /** Rumbo verdadero (grados) del eje -Z del mundo Viro. */
  worldHeadingDeg: number;
  /** Posición (X, Z) de la cámara en el mundo Viro cuando se tomó el origen. */
  offsetX: number;
  offsetZ: number;
}

export interface PinModel {
  key: string;
  codigo: string;
  /** Punto de apoyo en el suelo (marco local). */
  position: Vec3;
  profundidad_m: number | null;
  /** "enterrado X m" si profundidad_m > 0. */
  depthLabel: string | null;
}

export interface PipeModel {
  key: string;
  /** Igual en todas las partes de una tubería partida (capa + id): se resaltan juntas. */
  groupKey: string;
  codigo: string;
  tipo: TipoRed | null;
  color: string;
  profundidad_m: number | null;
  /** Polilínea bajo el suelo (y = suelo − profundidad) o a ras de suelo si no está enterrada. */
  points: Vec3[];
  /**
   * Proyección discontinua sobre el piso: un trazo = UNA polilínea multipunto (incluye los
   * vértices intermedios), así hay ~longitud / (DASH + GAP) nodos Viro por tubería (RNF-L03).
   * Vacía si la tubería no está enterrada (se solaparía con la propia línea).
   */
  dashes: Vec3[][];
}

export interface SceneModel {
  pins: PinModel[];
  pipes: PipeModel[];
}

export const PIPE_COLORS: Record<TipoRed, string> = {
  agua: '#1E88E5',
  desagüe: '#8D5A2B',
  gas: '#FDD835',
  eléctrico: '#E53935',
};
export const PIPE_COLOR_UNKNOWN = '#9E9E9E';

export function pipeColor(tipo: string | null | undefined): string {
  const t = tipoRedNormalizado(tipo);
  return t ? PIPE_COLORS[t] : PIPE_COLOR_UNKNOWN;
}

/** Elevación de la proyección sobre el piso para evitar z-fighting con el plano detectado. */
export const DASH_LIFT_M = 0.01;
/** Elevación de una tubería en superficie (profundidad null o <= 0) sobre el piso. */
export const SURFACE_LIFT_M = 0.02;
export const DASH_LEN_M = 1;
export const GAP_LEN_M = 1;

export function formatDepthLabel(profundidad: number | null | undefined): string | null {
  if (profundidad === null || profundidad === undefined || !(profundidad > 0)) return null;
  return `enterrado ${profundidad.toFixed(profundidad < 10 ? 1 : 0)} m`;
}

type P2 = [number, number];

/**
 * Parte una polilínea 2D en trazos alternos de `dash` m separados por huecos de `gap` m,
 * midiendo sobre la longitud acumulada (no depende de dónde caigan los vértices).
 * Cada trazo es una única polilínea multipunto: si cruza vértices de la línea, los incluye.
 */
export function dashSegments(
  line: ReadonlyArray<readonly [number, number]>,
  dash = DASH_LEN_M,
  gap = GAP_LEN_M,
): P2[][] {
  const out: P2[][] = [];
  if (line.length < 2 || dash <= 0) return out;
  const period = dash + Math.max(0, gap);
  let current: P2[] | null = null; // trazo abierto que continúa en el siguiente segmento
  let dist = 0; // longitud acumulada al inicio del segmento actual
  const close = () => {
    if (current && current.length >= 2) out.push(current);
    current = null;
  };
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i];
    const [bx, by] = line[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    if (len === 0) continue;
    let s = 0;
    while (s < len) {
      const phase = (dist + s) % period;
      const inDash = phase < dash - 1e-9;
      const remainingInPhase = inDash ? dash - phase : period - phase;
      const e = Math.min(len, s + remainingInPhase);
      if (inDash && e - s > 1e-6) {
        const t0 = s / len;
        const t1 = e / len;
        const p0: P2 = [ax + (bx - ax) * t0, ay + (by - ay) * t0];
        const p1: P2 = [ax + (bx - ax) * t1, ay + (by - ay) * t1];
        if (current === null) current = [p0];
        current.push(p1);
        // El trazo acaba dentro de este segmento: se cierra. Si llega justo al vértice, sigue abierto.
        if (e < len) close();
      } else if (!inDash) {
        close();
      }
      s = e;
    }
    dist += len;
  }
  close();
  return out;
}

export function buildSceneModel(
  activos: ReadonlyArray<Activo>,
  redes: ReadonlyArray<Red>,
  frame: SceneFrame,
  groundY: number,
): SceneModel {
  const toEnu = makeEnuConverter(frame.origin);
  const toLocalXZ = (lat: number, lon: number): [number, number] => {
    const p = toEnu({ lat, lon });
    const [x, z] = enuToViroXZ(p.e, p.n, frame.worldHeadingDeg);
    return [x + frame.offsetX, z + frame.offsetZ];
  };

  const pins: PinModel[] = activos.map((a) => {
    const [x, z] = toLocalXZ(a.lat, a.lon);
    return {
      key: a.key,
      codigo: a.codigo,
      position: [x, groundY, z],
      profundidad_m: a.profundidad_m,
      depthLabel: formatDepthLabel(a.profundidad_m),
    };
  });

  const pipes: PipeModel[] = redes.map((r) => {
    const buried = r.profundidad_m !== null && r.profundidad_m > 0;
    const xz = r.coords.map((c) => toLocalXZ(c.lat, c.lon));
    // En superficie la línea va apenas sobre el piso y no se dibuja proyección (se solaparían).
    const pipeY = buried ? groundY - (r.profundidad_m as number) : groundY + SURFACE_LIFT_M;
    const dashY = groundY + DASH_LIFT_M;
    return {
      key: r.key,
      groupKey: r.groupKey,
      codigo: r.codigo,
      tipo: tipoRedNormalizado(r.tipo),
      color: pipeColor(r.tipo),
      profundidad_m: r.profundidad_m,
      points: xz.map(([x, z]) => [x, pipeY, z] as Vec3),
      dashes: buried ? dashSegments(xz).map((d) => d.map(([x, z]) => [x, dashY, z] as Vec3)) : [],
    };
  });

  return { pins, pipes };
}
