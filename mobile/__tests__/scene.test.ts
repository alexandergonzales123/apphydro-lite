import type { Activo, Red } from '../src/api/types';
import {
  PIPE_COLORS,
  DASH_LEN_M,
  GAP_LEN_M,
  PIPE_COLOR_UNKNOWN,
  SURFACE_LIFT_M,
  buildSceneModel,
  dashSegments,
  formatDepthLabel,
  pipeColor,
} from '../src/scene/buildScene';
import { groundChanged, pickGroundHit, pickGroundPlane } from '../src/scene/ground';

const ORIGIN = { lat: -12.0463, lon: -77.0301 };
const dLat1m = 1 / 110574; // ~1 m de latitud

function activo(p: Partial<Activo>): Activo {
  return {
    capa: 'activo',
    key: 'activo-1',
    id: 1,
    codigo: 'SEN-1',
    tipo: 'sensor',
    estado: 'activo',
    profundidad_m: 0.4,
    atributos: null,
    distancia_m: 10,
    lat: ORIGIN.lat,
    lon: ORIGIN.lon,
    ...p,
  };
}

function red(p: Partial<Red>): Red {
  return {
    capa: 'red',
    key: 'red-1-0',
    groupKey: 'red-1',
    id: 1,
    codigo: 'AG-1',
    tipo: 'agua',
    diametro_mm: 160,
    material: 'PVC',
    profundidad_m: 1.2,
    distancia_m: 3,
    coords: [
      { lat: ORIGIN.lat, lon: ORIGIN.lon },
      { lat: ORIGIN.lat + 9.5 * dLat1m, lon: ORIGIN.lon },
    ],
    ...p,
  };
}

describe('buildSceneModel', () => {
  const frame = { origin: ORIGIN, worldHeadingDeg: 0, offsetX: 0, offsetZ: 0 };

  it('pin 10 m al norte con rumbo 0 queda en z ≈ -10 sobre el suelo, con etiqueta de profundidad', () => {
    const m = buildSceneModel([activo({ lat: ORIGIN.lat + 10 * dLat1m })], [], frame, -1.4);
    const pin = m.pins[0];
    expect(pin.position[0]).toBeCloseTo(0, 2);
    expect(pin.position[1]).toBe(-1.4);
    expect(pin.position[2]).toBeCloseTo(-10, 1);
    expect(pin.depthLabel).toBe('enterrado 0.4 m');
  });

  it('aplica el desplazamiento de la cámara', () => {
    const m = buildSceneModel([activo({})], [], { ...frame, offsetX: 2, offsetZ: -3 }, 0);
    expect(m.pins[0].position[0]).toBeCloseTo(2, 6);
    expect(m.pins[0].position[2]).toBeCloseTo(-3, 6);
  });

  it('tubería a suelo − profundidad, color por tipo y proyección discontinua sobre el piso', () => {
    const m = buildSceneModel([], [red({})], frame, -1.5);
    const p = m.pipes[0];
    expect(p.color).toBe(PIPE_COLORS.agua);
    expect(p.points.every((v) => Math.abs(v[1] - -2.7) < 1e-9)).toBe(true);
    expect(p.dashes.length).toBe(5); // ~9.5 m con trazos de 1 m y huecos de 1 m
    expect(p.dashes.every((d) => d.every((v) => v[1] > -1.5))).toBe(true);
    expect(p.groupKey).toBe('red-1');
  });

  it('profundidad nula o <= 0: tubería a suelo + 0,02 m, sin proyección y sin etiqueta en pines', () => {
    for (const profundidad_m of [null, 0, -0.5]) {
      const m = buildSceneModel([activo({ profundidad_m })], [red({ profundidad_m })], frame, -1);
      expect(m.pins[0].depthLabel).toBeNull();
      expect(m.pipes[0].points.every((v) => Math.abs(v[1] - (-1 + SURFACE_LIFT_M)) < 1e-9)).toBe(true);
      expect(m.pipes[0].dashes).toEqual([]);
    }
  });

  it('número de trazos ≈ longitud / 2 m con vértices cada ~1 m (datos de ST_Segmentize)', () => {
    // Tubería de ~60 m con vértices cada 0,93 m (no caen en múltiplos del trazo).
    const coords = Array.from({ length: 66 }, (_, i) => ({ lat: ORIGIN.lat + i * 0.93 * dLat1m, lon: ORIGIN.lon }));
    const m = buildSceneModel([], [red({ coords })], frame, -1.5);
    const lengthM = 65 * 0.93;
    const n = m.pipes[0].dashes.length;
    expect(Math.abs(n - lengthM / (DASH_LEN_M + GAP_LEN_M))).toBeLessThanOrEqual(1);
    // Antes se partía cada trazo en cada vértice (~2 piezas por trazo): comprobar que no.
    expect(n).toBeLessThan(coords.length / 1.5);
    // Cada trazo es una polilínea multipunto de ~1 m (el último puede ser más corto).
    for (const d of m.pipes[0].dashes.slice(0, -1)) {
      expect(d.length).toBeGreaterThanOrEqual(2);
      const len = d.slice(1).reduce((acc, v, i) => acc + Math.hypot(v[0] - d[i][0], v[2] - d[i][2]), 0);
      expect(len).toBeCloseTo(DASH_LEN_M, 1);
    }
  });
});

describe('dashSegments', () => {
  it('alterna 1 m sí / 1 m no sobre la longitud acumulada, aunque los vértices no caigan en múltiplos', () => {
    const d = dashSegments([
      [0, 0],
      [0.5, 0],
      [4.2, 0],
    ]);
    const polyLen = (pts: [number, number][]) =>
      pts.slice(1).reduce((acc, b, i) => acc + Math.hypot(b[0] - pts[i][0], b[1] - pts[i][1]), 0);
    const covered = d.reduce((acc, pts) => acc + polyLen(pts), 0);
    // [0,1] + [2,3] + [4,4.2] = 2.2 m
    expect(covered).toBeCloseTo(2.2, 9);
    expect(d).toHaveLength(3);
    expect(d[0][0]).toEqual([0, 0]);
    // El primer trazo cruza el vértice (0.5, 0): una sola polilínea con 3 puntos.
    expect(d[0]).toHaveLength(3);
    expect(d[0][1]).toEqual([0.5, 0]);
    const last = d[d.length - 1];
    expect(last[last.length - 1][0]).toBeCloseTo(4.2, 9);
  });

  it('un trazo que termina justo en un vértice no se une al siguiente; uno que dobla una esquina sí es una sola polilínea', () => {
    const d = dashSegments([
      [0, 0],
      [1, 0],
      [2.5, 0],
      [2.5, 1],
    ]);
    // Trazos: [0,1] (acaba en el vértice (1,0)) | hueco [1,2] | [2,3] dobla la esquina (2.5,0).
    expect(d).toHaveLength(2);
    expect(d[0]).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(d[1]).toHaveLength(3);
    expect(d[1][0][0]).toBeCloseTo(2, 9);
    expect(d[1][1]).toEqual([2.5, 0]);
    expect(d[1][2][1]).toBeCloseTo(0.5, 9);
  });

  it('líneas degeneradas', () => {
    expect(dashSegments([])).toEqual([]);
    expect(dashSegments([[1, 1]])).toEqual([]);
    expect(dashSegments([[1, 1], [1, 1]])).toEqual([]);
  });
});

describe('colores y etiquetas', () => {
  it('colores por tipo', () => {
    expect(pipeColor('agua')).toBe('#1E88E5');
    expect(pipeColor('desagüe')).toBe(PIPE_COLORS['desagüe']);
    expect(pipeColor('gas')).toBe('#FDD835');
    expect(pipeColor('eléctrico')).toBe('#E53935');
    expect(pipeColor('otro')).toBe(PIPE_COLOR_UNKNOWN);
  });

  it('formatDepthLabel', () => {
    expect(formatDepthLabel(0)).toBeNull();
    expect(formatDepthLabel(-1)).toBeNull();
    expect(formatDepthLabel(null)).toBeNull();
    expect(formatDepthLabel(1.25)).toBe('enterrado 1.3 m');
  });
});

describe('suelo', () => {
  it('pickGroundPlane elige el horizontal más grande bajo la cámara, ignorando mesas', () => {
    const best = pickGroundPlane(
      [
        { id: 'mesa', y: -0.3, area: 1, horizontal: true },
        { id: 'pared', y: -1.4, area: 20, horizontal: false },
        { id: 'suelo', y: -1.45, area: 6, horizontal: true },
        { id: 'trozo', y: -1.5, area: 0.5, horizontal: true },
      ],
      0,
    );
    expect(best?.id).toBe('suelo');
    expect(pickGroundPlane([], 0)).toBeNull();
  });

  it('pickGroundHit prioriza planos existentes sobre puntos de características', () => {
    const hit = pickGroundHit([
      { type: 'FeaturePoint', transform: { position: [9, 9, 9] } },
      { type: 'ExistingPlaneUsingExtent', transform: { position: [1, -1.4, -2] } },
      { type: 'EstimatedHorizontalPlane', transform: { position: [5, 5, 5] } },
    ]);
    expect(hit).toEqual([1, -1.4, -2]);
    expect(pickGroundHit([])).toBeNull();
    expect(pickGroundHit([{ type: 'Raro', transform: { position: [0, 0, 0] } }])).toBeNull();
  });

  it('groundChanged con umbral de 5 cm', () => {
    expect(groundChanged(null, -1)).toBe(true);
    expect(groundChanged(-1.4, -1.43)).toBe(false);
    expect(groundChanged(-1.4, -1.46)).toBe(true);
  });
});
