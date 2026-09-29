/** Diferencias iOS/Android aisladas en lógica pura (rumbo, pose, hit test, compatibilidad AR, permisos). */
import { hitTestPoint } from '../src/ar/hitTestPoint';
import { isHeadingPoseUsable } from '../src/flow/criteria';
import { classifyArSupport, evaluatePermissions, unsupportedMessage } from '../src/flow/startup';
import { enuToViroXZ, worldHeadingFromPose, type Vec3 } from '../src/geo/enu';
import { headingReference, normalizeHeading } from '../src/sensors/heading';

describe('normalizeHeading', () => {
  it('iOS: trueHeading < 0 no es válido y se usa magHeading', () => {
    expect(normalizeHeading({ trueHeading: -1, magHeading: 120, accuracy: 3 }, 'ios')).toEqual({
      deg: 120,
      isTrue: false,
      accuracy: 3,
      reference: 'camera',
    });
    expect(normalizeHeading({ trueHeading: 45, magHeading: 50, accuracy: 2 }, 'ios')).toMatchObject({
      deg: 45,
      isTrue: true,
      reference: 'camera',
    });
  });

  it('Android: -1 exacto = sin rumbo verdadero -> magHeading', () => {
    expect(normalizeHeading({ trueHeading: -1, magHeading: 200, accuracy: 3 }, 'android')).toEqual({
      deg: 200,
      isTrue: false,
      accuracy: 3,
      reference: 'deviceTop',
    });
  });

  it('Android: otro negativo es un rumbo verdadero válido (declinación negativa) y se normaliza', () => {
    // expo calcula (mag + decl) % 360: mag 2°, decl -5° -> -3°, que es 357°.
    const h = normalizeHeading({ trueHeading: -3, magHeading: 2, accuracy: 2 }, 'android');
    expect(h?.isTrue).toBe(true);
    expect(h?.deg).toBeCloseTo(357, 9);
  });

  it('Android: accuracy SENSOR_STATUS_NO_CONTACT (-1) se acota a 0; fuera de rango a 0..3', () => {
    expect(normalizeHeading({ trueHeading: 10, magHeading: 10, accuracy: -1 }, 'android')?.accuracy).toBe(0);
    expect(normalizeHeading({ trueHeading: 10, magHeading: 10, accuracy: 7 }, 'android')?.accuracy).toBe(3);
    expect(normalizeHeading({ trueHeading: 10, magHeading: 10, accuracy: NaN }, 'android')?.accuracy).toBe(0);
  });

  it('sin ningún rumbo finito devuelve null', () => {
    expect(normalizeHeading({ trueHeading: -1, magHeading: NaN, accuracy: 3 }, 'android')).toBeNull();
    expect(normalizeHeading({ trueHeading: NaN, magHeading: NaN, accuracy: 3 }, 'ios')).toBeNull();
  });

  it('referencia por plataforma', () => {
    expect(headingReference('ios')).toBe('camera');
    expect(headingReference('android')).toBe('deviceTop');
  });
});

describe('worldHeadingFromPose', () => {
  // Cámara mirando al frente (-Z) e inclinada 45° hacia el suelo.
  const s = Math.SQRT1_2;
  const tiltedDown = { forward: [0, -s, -s] as Vec3, up: [0, s, -s] as Vec3 };

  it('iOS (camera) usa forward: igual que worldHeadingFromCamera', () => {
    expect(worldHeadingFromPose(42, tiltedDown, 'camera')).toBeCloseTo(42, 9);
    expect(worldHeadingFromPose(100, { forward: [1, 0, 0], up: [0, 1, 0] }, 'camera')).toBeCloseTo(10, 9);
  });

  it('Android (deviceTop) con la cámara inclinada al suelo: up y forward coinciden en horizontal', () => {
    expect(worldHeadingFromPose(42, tiltedDown, 'deviceTop')).toBeCloseTo(42, 9);
  });

  it('Android: con la cámara hacia el cielo la parte superior apunta hacia atrás y se tiene en cuenta', () => {
    // Cámara al frente (-Z) inclinada 30° hacia arriba: la parte superior del teléfono se proyecta
    // hacia +Z. Si -Z es el norte, Android da 180° (rumbo de la parte superior). Debe salir -Z = norte.
    const a = Math.PI / 6;
    const up: Vec3 = [0, Math.cos(a), Math.sin(a)];
    const forward: Vec3 = [0, Math.sin(a), -Math.cos(a)];
    expect(worldHeadingFromPose(180, { forward, up }, 'deviceTop')).toBeCloseTo(0, 9);
  });

  it('Android: cámara girada a +X e inclinada; un punto al este acaba delante de la cámara', () => {
    const pose = { forward: [s, -s, 0] as Vec3, up: [s, s, 0] as Vec3 };
    const h0 = worldHeadingFromPose(90, pose, 'deviceTop'); // parte superior hacia el este
    expect(h0).toBeCloseTo(0, 9);
    const [x, z] = enuToViroXZ(10, 0, h0);
    expect(x).toBeCloseTo(10, 9);
    expect(z).toBeCloseTo(0, 9);
  });

  it('Android: up vertical (degenerado) recurre a forward', () => {
    expect(worldHeadingFromPose(100, { forward: [1, 0, 0], up: [0, 1, 0] }, 'deviceTop')).toBeCloseTo(10, 9);
  });
});

describe('isHeadingPoseUsable', () => {
  const tilt = (deg: number): Vec3 => [0, Math.cos((deg * Math.PI) / 180), -Math.sin((deg * Math.PI) / 180)];

  it('iOS siempre vale (sin cambios de comportamiento)', () => {
    expect(isHeadingPoseUsable({ up: [0, 1, 0] }, 'camera', 0.5)).toBe(true);
  });

  it('Android exige la cámara inclinada hacia el suelo', () => {
    expect(isHeadingPoseUsable({ up: [0, 1, 0] }, 'deviceTop', 0.5)).toBe(false); // vertical
    expect(isHeadingPoseUsable({ up: tilt(20) }, 'deviceTop', 0.5)).toBe(false);
    expect(isHeadingPoseUsable({ up: tilt(35) }, 'deviceTop', 0.5)).toBe(true);
    expect(isHeadingPoseUsable({ up: tilt(90) }, 'deviceTop', 0.5)).toBe(true); // plano, mirando al suelo
  });
});

describe('hitTestPoint', () => {
  it('iOS pasa los puntos sin tocar', () => {
    expect(hitTestPoint(100.5, 200.25, 'ios', 3)).toEqual([100.5, 200.25]);
  });

  it('Android convierte a píxeles con PixelRatio y redondea', () => {
    expect(hitTestPoint(100.5, 200.25, 'android', 2.75)).toEqual([276, 551]);
  });

  it('Android con PixelRatio inválido usa 1', () => {
    expect(hitTestPoint(10, 20, 'android', 0)).toEqual([10, 20]);
    expect(hitTestPoint(10, 20, 'android', NaN)).toEqual([10, 20]);
  });
});

describe('classifyArSupport', () => {
  it('resultado { isARSupported }', () => {
    expect(classifyArSupport({ ok: true, value: { isARSupported: true } })).toBe('supported');
    expect(classifyArSupport({ ok: true, value: { isARSupported: false } })).toBe('unsupported');
  });

  it('Android: rechazos de Viro con el estado de ARCore', () => {
    expect(classifyArSupport({ ok: false, error: new Error('UNSUPPORTED') })).toBe('unsupported');
    expect(classifyArSupport({ ok: false, error: new Error('TRANSIENT') })).toBe('transient');
    expect(classifyArSupport({ ok: false, error: new Error('UNKNOWN') })).toBe('unknown');
  });

  it('errores o formatos desconocidos no bloquean', () => {
    expect(classifyArSupport({ ok: false, error: 'AR Support Unknown.' })).toBe('unknown');
    expect(classifyArSupport({ ok: true, value: 'raro' })).toBe('unknown');
    expect(classifyArSupport({ ok: false, error: undefined })).toBe('unknown');
  });
});

describe('evaluatePermissions', () => {
  it('falta cámara o ubicación -> denied', () => {
    expect(evaluatePermissions({ camera: false, location: true }, 'ios')).toBe('denied');
    expect(evaluatePermissions({ camera: true, location: false, locationAccuracy: 'none' }, 'android')).toBe(
      'denied',
    );
  });

  it('Android con ubicación aproximada -> approximate', () => {
    expect(evaluatePermissions({ camera: true, location: true, locationAccuracy: 'coarse' }, 'android')).toBe(
      'approximate',
    );
    expect(evaluatePermissions({ camera: true, location: true, locationAccuracy: 'fine' }, 'android')).toBe(
      'granted',
    );
  });

  it('iOS no cambia', () => {
    expect(evaluatePermissions({ camera: true, location: true }, 'ios')).toBe('granted');
  });

  it('mensaje de incompatibilidad por plataforma', () => {
    expect(unsupportedMessage('ios')).toMatch(/ARKit/);
    expect(unsupportedMessage('android')).toMatch(/ARCore/);
  });
});
