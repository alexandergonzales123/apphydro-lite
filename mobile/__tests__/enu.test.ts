import {
  distancePointToPolyline2D,
  ecefToEnu,
  enuToViro,
  enuToViroXZ,
  geodeticToEcef,
  horizontalDistance,
  makeEnuConverter,
  normalizeDeg,
  rotateYaw,
  viroXZToEnu,
  wgs84ToEnu,
  worldHeadingFromCamera,
} from '../src/geo/enu';

const LIMA = { lat: -12.0463, lon: -77.0301 };

describe('geodeticToEcef', () => {
  it('ecuador / meridiano 0 -> (a, 0, 0)', () => {
    const [x, y, z] = geodeticToEcef(0, 0, 0);
    expect(x).toBeCloseTo(6378137, 3);
    expect(y).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(0, 6);
  });

  it('polo norte -> (0, 0, b)', () => {
    const [x, y, z] = geodeticToEcef(90, 0, 0);
    expect(Math.abs(x)).toBeLessThan(1e-6);
    expect(Math.abs(y)).toBeLessThan(1e-6);
    expect(z).toBeCloseTo(6356752.314245, 3);
  });

  it('lon 90 E -> (0, a, 0)', () => {
    const [x, y] = geodeticToEcef(0, 90, 0);
    expect(Math.abs(x)).toBeLessThan(1e-6);
    expect(y).toBeCloseTo(6378137, 3);
  });
});

describe('wgs84ToEnu', () => {
  it('el origen es (0,0,0)', () => {
    const p = wgs84ToEnu(LIMA, LIMA);
    expect(p.e).toBeCloseTo(0, 9);
    expect(p.n).toBeCloseTo(0, 9);
    expect(p.u).toBeCloseTo(0, 9);
  });

  it('1e-5° de latitud ≈ 1.1 m al norte (ecuador)', () => {
    const p = wgs84ToEnu({ lat: 1e-5, lon: 0 }, { lat: 0, lon: 0 });
    expect(p.n).toBeCloseTo(1.1057, 3);
    expect(Math.abs(p.e)).toBeLessThan(1e-9);
  });

  it('1e-5° de latitud ≈ 1.1 m al norte (Lima)', () => {
    const p = wgs84ToEnu({ lat: LIMA.lat + 1e-5, lon: LIMA.lon }, LIMA);
    expect(p.n).toBeCloseTo(1.106, 2);
    expect(Math.abs(p.e)).toBeLessThan(1e-6);
    expect(Math.abs(p.u)).toBeLessThan(1e-3); // curvatura despreciable a 1 m
  });

  it('1e-5° de longitud ≈ 1.113 m al este en el ecuador y ≈ 0.557 m a 60°', () => {
    expect(wgs84ToEnu({ lat: 0, lon: 1e-5 }, { lat: 0, lon: 0 }).e).toBeCloseTo(1.1132, 3);
    const p60 = wgs84ToEnu({ lat: 60, lon: 1e-5 }, { lat: 60, lon: 0 });
    expect(p60.e).toBeCloseTo(0.5580, 3);
    expect(Math.abs(p60.n)).toBeLessThan(1e-6);
  });

  it('latitud menor = sur (n negativo), longitud menor = oeste (e negativo)', () => {
    const p = wgs84ToEnu({ lat: LIMA.lat - 1e-4, lon: LIMA.lon - 1e-4 }, LIMA);
    expect(p.n).toBeLessThan(0);
    expect(p.e).toBeLessThan(0);
  });

  it('50 m al norte tiene u ligeramente negativo por la curvatura (~ -0.2 mm)', () => {
    const dLat = 50 / 110574;
    const p = wgs84ToEnu({ lat: LIMA.lat + dLat, lon: LIMA.lon }, LIMA);
    expect(p.n).toBeCloseTo(50, 0);
    expect(p.u).toBeLessThan(0);
    expect(p.u).toBeGreaterThan(-0.001);
  });

  it('makeEnuConverter coincide con wgs84ToEnu', () => {
    const conv = makeEnuConverter(LIMA);
    const pts = [
      { lat: -12.0462, lon: -77.0303 },
      { lat: -12.0465, lon: -77.0299 },
    ];
    for (const q of pts) {
      const a = conv(q);
      const b = wgs84ToEnu(q, LIMA);
      expect(a.e).toBeCloseTo(b.e, 9);
      expect(a.n).toBeCloseTo(b.n, 9);
      expect(a.u).toBeCloseTo(b.u, 9);
    }
  });

  it('ecefToEnu del propio origen es cero', () => {
    const o = geodeticToEcef(LIMA.lat, LIMA.lon, 0);
    const p = ecefToEnu(o, LIMA);
    expect(Math.hypot(p.e, p.n, p.u)).toBeLessThan(1e-9);
  });

  it('horizontalDistance ≈ haversine en distancias cortas', () => {
    const d = horizontalDistance(LIMA, { lat: LIMA.lat + 1e-4, lon: LIMA.lon + 1e-4 });
    // dn ≈ 11.06 m, de ≈ 11.13·cos(12°) ≈ 10.89 m
    expect(d).toBeCloseTo(Math.hypot(11.06, 10.89), 0);
  });
});

describe('ENU -> Viro', () => {
  it('rumbo 0 (mirando al norte): norte al frente (-Z), este a la derecha (+X)', () => {
    expect(enuToViroXZ(0, 10, 0)[0]).toBeCloseTo(0, 9);
    expect(enuToViroXZ(0, 10, 0)[1]).toBeCloseTo(-10, 9);
    expect(enuToViroXZ(5, 0, 0)[0]).toBeCloseTo(5, 9);
    expect(enuToViroXZ(5, 0, 0)[1]).toBeCloseTo(0, 9);
  });

  it('rumbo 90 (mirando al este): el este queda al frente y el norte a la izquierda', () => {
    const [xe, ze] = enuToViroXZ(10, 0, 90);
    expect(xe).toBeCloseTo(0, 9);
    expect(ze).toBeCloseTo(-10, 9);
    const [xn, zn] = enuToViroXZ(0, 10, 90);
    expect(xn).toBeCloseTo(-10, 9);
    expect(zn).toBeCloseTo(0, 9);
  });

  it('rumbo 180 (mirando al sur): el norte queda detrás (+Z) y el este a la izquierda', () => {
    const [x, z] = enuToViroXZ(0, 10, 180);
    expect(x).toBeCloseTo(0, 9);
    expect(z).toBeCloseTo(10, 9);
    expect(enuToViroXZ(10, 0, 180)[0]).toBeCloseTo(-10, 9);
  });

  it('conserva distancias y viroXZToEnu es la inversa', () => {
    for (const h of [0, 17, 90, 133.3, 270, 359]) {
      const [x, z] = enuToViroXZ(3, -7, h);
      expect(Math.hypot(x, z)).toBeCloseTo(Math.hypot(3, -7), 9);
      const back = viroXZToEnu(x, z, h);
      expect(back.e).toBeCloseTo(3, 9);
      expect(back.n).toBeCloseTo(-7, 9);
    }
  });

  it('enuToViro pasa u a Y', () => {
    expect(enuToViro({ e: 1, n: 2, u: -1.5 }, 0)).toEqual([1, -1.5, -2]);
  });

  it('enuToViroXZ(h) equivale a rotar el caso h=0 con rotateYaw(+h)', () => {
    // Girar el mundo +h (antihorario desde arriba) compensa que la cámara mire h grados a la derecha.
    const [x0, z0] = enuToViroXZ(4, 9, 0);
    const [xr, zr] = rotateYaw(x0, z0, (35 * Math.PI) / 180);
    const [x, z] = enuToViroXZ(4, 9, 35);
    expect(xr).toBeCloseTo(x, 9);
    expect(zr).toBeCloseTo(z, 9);
  });
});

describe('worldHeadingFromCamera', () => {
  it('cámara mirando a -Z: el rumbo del mundo es el de la brújula', () => {
    expect(worldHeadingFromCamera(42, [0, 0, -1])).toBeCloseTo(42, 9);
  });

  it('cámara girada 90° a la derecha (+X): el eje -Z apunta 90° menos', () => {
    expect(worldHeadingFromCamera(100, [1, 0, 0])).toBeCloseTo(10, 9);
  });

  it('normaliza a [0, 360)', () => {
    expect(worldHeadingFromCamera(10, [1, 0, 0])).toBeCloseTo(280, 9);
    expect(normalizeDeg(-30)).toBe(330);
    expect(normalizeDeg(720)).toBe(0);
  });

  it('ignora la inclinación (forward con componente Y)', () => {
    expect(worldHeadingFromCamera(0, [0, -0.8, -0.6])).toBeCloseTo(0, 9);
  });

  it('forward vertical: no hay yaw, se usa la brújula', () => {
    expect(worldHeadingFromCamera(77, [0, -1, 0])).toBeCloseTo(77, 9);
  });

  it('un punto al frente de la cámara (en su rumbo) acaba delante de la cámara en Viro', () => {
    // Cámara girada: forward = +X, brújula 90 (este) -> mundo -Z apunta al norte.
    const h0 = worldHeadingFromCamera(90, [1, 0, 0]);
    const [x, z] = enuToViroXZ(10, 0, h0); // 10 m al este
    expect(x).toBeCloseTo(10, 9); // +X = hacia donde mira la cámara
    expect(z).toBeCloseTo(0, 9);
  });
});

describe('distancePointToPolyline2D', () => {
  it('distancia perpendicular a un segmento y a los extremos', () => {
    const line = [
      [0, 0],
      [10, 0],
    ] as const;
    expect(distancePointToPolyline2D(5, 3, line)).toBeCloseTo(3, 9);
    expect(distancePointToPolyline2D(-4, 3, line)).toBeCloseTo(5, 9);
    expect(distancePointToPolyline2D(1, 1, [])).toBe(Infinity);
  });
});
