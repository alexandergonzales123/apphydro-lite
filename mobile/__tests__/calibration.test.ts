import {
  INITIAL_HISTORY,
  MIN_BASELINE_M,
  applyTransform,
  baseline,
  calibrate,
  canUndo,
  horizontalShift,
  invertApply,
  solveTransform,
  undo,
  type CalibTransform,
  type Correspondence,
} from '../src/calibration/calibration';
import type { Vec3 } from '../src/geo/enu';

const deg = (d: number) => (d * Math.PI) / 180;

function expectVec(a: Vec3, b: Vec3, digits = 6) {
  expect(a[0]).toBeCloseTo(b[0], digits);
  expect(a[1]).toBeCloseTo(b[1], digits);
  expect(a[2]).toBeCloseTo(b[2], digits);
}

function corr(key: string, local: Vec3, world: Vec3): Correspondence {
  return { key, codigo: key, local, world };
}

describe('applyTransform / invertApply', () => {
  it('identidad', () => {
    expectVec(applyTransform({ tx: 0, ty: 0, tz: 0, yawRad: 0 }, [1, 2, 3]), [1, 2, 3]);
  });

  it('yaw +90° (antihorario desde arriba) lleva el frente (-Z) a la izquierda (-X), como Viro', () => {
    expectVec(applyTransform({ tx: 0, ty: 0, tz: 0, yawRad: deg(90) }, [0, 0, -1]), [-1, 0, 0]);
  });

  it('invertApply deshace applyTransform', () => {
    const t: CalibTransform = { tx: 1.5, ty: -0.2, tz: -3, yawRad: deg(23) };
    const p: Vec3 = [4, -1.4, -9];
    expectVec(invertApply(t, applyTransform(t, p)), p);
  });
});

describe('solveTransform', () => {
  it('sin puntos: identidad', () => {
    expect(solveTransform([])).toEqual({ transform: { tx: 0, ty: 0, tz: 0, yawRad: 0 }, usedRotation: false });
  });

  it('un punto: solo traslación que lleva el activo al punto tocado', () => {
    const c = corr('a', [2, -1.4, -10], [3.5, -1.3, -8]);
    const { transform, usedRotation } = solveTransform([c]);
    expect(usedRotation).toBe(false);
    expect(transform.yawRad).toBe(0);
    expectVec(applyTransform(transform, c.local), c.world);
  });

  it('dos puntos separados: recupera traslación + yaw exactos', () => {
    const truth: CalibTransform = { tx: 1.2, ty: 0.1, tz: -2.5, yawRad: deg(8) };
    const a: Vec3 = [0, -1.4, -10];
    const b: Vec3 = [8, -1.4, 0]; // 12,8 m de separación (>= MIN_BASELINE_M)
    const pts = [corr('a', a, applyTransform(truth, a)), corr('b', b, applyTransform(truth, b))];
    const { transform, usedRotation } = solveTransform(pts);
    expect(usedRotation).toBe(true);
    expect(transform.yawRad).toBeCloseTo(truth.yawRad, 9);
    expect(transform.tx).toBeCloseTo(truth.tx, 9);
    expect(transform.ty).toBeCloseTo(truth.ty, 9);
    expect(transform.tz).toBeCloseTo(truth.tz, 9);
  });

  it('yaw negativo y grande', () => {
    const truth: CalibTransform = { tx: -4, ty: 0, tz: 3, yawRad: deg(-35) };
    const locals: Vec3[] = [
      [0, 0, -5],
      [10, 0, -5],
      [3, 0, 12],
    ];
    const { transform } = solveTransform(locals.map((l, i) => corr(String(i), l, applyTransform(truth, l))));
    expect(transform.yawRad).toBeCloseTo(truth.yawRad, 9);
    expect(transform.tx).toBeCloseTo(truth.tx, 9);
    expect(transform.tz).toBeCloseTo(truth.tz, 9);
  });

  it('MIN_BASELINE_M es 10 m: a 8,5 m de separación no se corrige el giro', () => {
    expect(MIN_BASELINE_M).toBe(10);
    const truth: CalibTransform = { tx: 0, ty: 0, tz: 0, yawRad: deg(8) };
    const a: Vec3 = [0, 0, -10];
    const b: Vec3 = [6, 0, -4];
    const pts = [corr('a', a, applyTransform(truth, a)), corr('b', b, applyTransform(truth, b))];
    expect(baseline(pts)).toBeCloseTo(Math.hypot(6, 6), 9);
    expect(solveTransform(pts).usedRotation).toBe(false);
  });

  it('dos puntos demasiado juntos (< 3 m): no aplica yaw, traslación media', () => {
    const pts = [corr('a', [0, 0, -10], [1, 0, -10]), corr('b', [1, 0, -10], [2.2, 0, -10])];
    const { transform, usedRotation } = solveTransform(pts);
    expect(usedRotation).toBe(false);
    expect(transform.yawRad).toBe(0);
    expect(transform.tx).toBeCloseTo(1.1, 9);
  });

  it('con ruido de 10 cm en puntos a 20 m, el error resultante es < 1 m (RNF-L02)', () => {
    const truth: CalibTransform = { tx: 2, ty: 0, tz: -1, yawRad: deg(12) };
    const a: Vec3 = [0, 0, -5];
    const b: Vec3 = [8, 0, -15];
    const pts = [
      corr('a', a, applyTransform(truth, [a[0] + 0.1, 0, a[2]])),
      corr('b', b, applyTransform(truth, [b[0], 0, b[2] - 0.1])),
    ];
    const { transform } = solveTransform(pts);
    const probe: Vec3 = [-10, 0, -20];
    const err = horizontalShift(truth, transform, probe);
    expect(err).toBeLessThan(1);
  });
});

describe('historial y deshacer', () => {
  it('calibrar apila y deshacer vuelve al estado anterior', () => {
    expect(canUndo(INITIAL_HISTORY)).toBe(false);
    const h1 = calibrate(INITIAL_HISTORY, corr('a', [0, 0, -10], [1, 0, -10]));
    expect(canUndo(h1)).toBe(true);
    expect(h1.current.transform.tx).toBeCloseTo(1, 9);

    const h2 = calibrate(h1, corr('b', [10, 0, -10], [11, 0, -10]));
    expect(h2.current.points).toHaveLength(2);
    expect(h2.past).toHaveLength(2);

    const u1 = undo(h2);
    expect(u1.current).toBe(h1.current);
    const u0 = undo(u1);
    expect(u0.current).toBe(INITIAL_HISTORY.current);
    expect(canUndo(u0)).toBe(false);
    expect(undo(u0)).toBe(u0);
  });

  it('recalibrar el mismo activo sustituye su punto', () => {
    const h1 = calibrate(INITIAL_HISTORY, corr('a', [0, 0, -10], [1, 0, -10]));
    const h2 = calibrate(h1, corr('a', [0, 0, -10], [0.5, 0, -10]));
    expect(h2.current.points).toHaveLength(1);
    expect(h2.current.transform.tx).toBeCloseTo(0.5, 9);
  });

  it('recalibrar un activo con otros ya calibrados lo sustituye en su sitio, sin duplicarlo', () => {
    let h = calibrate(INITIAL_HISTORY, corr('activo-1', [0, 0, -10], [1, 0, -10]));
    h = calibrate(h, corr('activo-2', [12, 0, -10], [13, 0, -10]));
    h = calibrate(h, corr('activo-1', [0, 0, -10], [0.8, 0, -10]));
    expect(h.current.points.map((p) => p.key)).toEqual(['activo-1', 'activo-2']);
    expect(h.current.points[0].world).toEqual([0.8, 0, -10]);
  });

  it('no muta el historial anterior', () => {
    const h1 = calibrate(INITIAL_HISTORY, corr('a', [0, 0, -10], [1, 0, -10]));
    const snapshot = JSON.stringify(h1);
    calibrate(h1, corr('b', [5, 0, -2], [5, 0, -1]));
    expect(JSON.stringify(h1)).toBe(snapshot);
  });
});
