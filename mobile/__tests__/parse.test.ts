import { buildCercanosUrl } from '../src/api/client';
import { GeoJsonParseError, parseCercanos, tipoRedNormalizado } from '../src/api/parse';
import { deserializeCache, serializeCache } from '../src/cache/format';

jest.mock('../src/config', () => ({
  API_URL: 'http://x',
  API_KEY: 'k',
  API_URL_IS_HTTPS: false,
  API_TIMEOUT_MS: 1000,
  RADIO_M: 50,
}));

/** Respuesta con la forma de CONTRACT.md (activos primero, luego red, por distancia). */
const SAMPLE = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-77.0301, -12.0463] },
      properties: {
        capa: 'activo',
        id: 1,
        codigo: 'SEN-014',
        tipo: 'sensor',
        estado: 'activo',
        profundidad_m: 0.4,
        atributos: {},
        distancia_m: 12.3,
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[-77.0303, -12.0462], [-77.0299, -12.0465]] },
      properties: {
        capa: 'red',
        id: 1,
        codigo: 'AG-220',
        tipo: 'agua',
        diametro_mm: 160,
        material: 'PVC',
        profundidad_m: 1.2,
        distancia_m: 3.1,
      },
    },
    // Misma tubería partida por el radio: mismo id y código (según el backend).
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[-77.0298, -12.0466], [-77.0297, -12.0467]] },
      properties: {
        capa: 'red',
        id: 1,
        codigo: 'AG-220',
        tipo: 'agua',
        diametro_mm: 160,
        material: 'PVC',
        profundidad_m: 1.2,
        distancia_m: 20.55,
      },
    },
  ],
};

describe('parseCercanos', () => {
  it('parsea activos y tuberías con [lon, lat] -> {lat, lon}', () => {
    const r = parseCercanos(SAMPLE);
    expect(r.activos).toHaveLength(1);
    expect(r.redes).toHaveLength(2);
    expect(r.descartadas).toBe(0);
    const a = r.activos[0];
    expect(a).toMatchObject({
      capa: 'activo',
      id: 1,
      codigo: 'SEN-014',
      tipo: 'sensor',
      estado: 'activo',
      profundidad_m: 0.4,
      distancia_m: 12.3,
      lat: -12.0463,
      lon: -77.0301,
    });
    const red = r.redes[0];
    expect(red).toMatchObject({ codigo: 'AG-220', tipo: 'agua', diametro_mm: 160, material: 'PVC', profundidad_m: 1.2 });
    expect(red.coords[0]).toEqual({ lat: -12.0462, lon: -77.0303 });
  });

  it('claves estables: activo-{id} y red-{id}-{n}, únicas aunque el id se repita', () => {
    const r = parseCercanos(SAMPLE);
    const keys = [...r.activos, ...r.redes].map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(r.activos[0].key).toBe('activo-1');
    // Partes ordenadas por su primera coordenada (lat ascendente): la 2ª feature empieza más al sur.
    expect(r.redes.map((x) => x.key)).toEqual(['red-1-1', 'red-1-0']);
    expect(r.redes.map((x) => x.groupKey)).toEqual(['red-1', 'red-1']);
  });

  it('las claves no cambian entre descargas aunque cambie el orden o aparezcan otras features', () => {
    const a = parseCercanos(SAMPLE);
    // Otra posición del usuario: cambia el orden por distancia y entra otra tubería antes.
    const otra = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[-77.03, -12.04], [-77.0301, -12.0401]] },
      properties: { capa: 'red', id: 7, codigo: 'GS-1', tipo: 'gas', diametro_mm: 90, material: 'PE', profundidad_m: 0.8, distancia_m: 1 },
    };
    const b = parseCercanos({
      type: 'FeatureCollection',
      features: [SAMPLE.features[0], otra, SAMPLE.features[2], SAMPLE.features[1]],
    });
    const byCoords = (rs: typeof a.redes) => Object.fromEntries(rs.map((x) => [JSON.stringify(x.coords[0]), x.key]));
    const ka = byCoords(a.redes);
    const kb = byCoords(b.redes);
    for (const c of Object.keys(ka)) expect(kb[c]).toBe(ka[c]);
    expect(b.activos[0].key).toBe(a.activos[0].key);
    expect(b.redes.find((x) => x.id === 7)?.key).toBe('red-7-0');
  });

  it('acepta texto JSON y application/geo+json sin distinción', () => {
    expect(parseCercanos(JSON.stringify(SAMPLE)).redes).toHaveLength(2);
  });

  it('campos nulos se conservan como null', () => {
    const r = parseCercanos({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [0, 0] },
          properties: { capa: 'activo', id: 5, codigo: 'X', tipo: null, estado: null, profundidad_m: null, atributos: null, distancia_m: null },
        },
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[0, 0], [0.0001, 0]] },
          properties: { capa: 'red', id: 2, codigo: 'D-1', tipo: 'desagüe', diametro_mm: null, material: null, profundidad_m: null, distancia_m: 0 },
        },
      ],
    });
    expect(r.activos[0]).toMatchObject({ tipo: null, estado: null, profundidad_m: null, atributos: null, distancia_m: null });
    expect(r.redes[0]).toMatchObject({ diametro_mm: null, material: null, profundidad_m: null, distancia_m: 0 });
  });

  it('colección vacía', () => {
    expect(parseCercanos({ type: 'FeatureCollection', features: [] })).toEqual({ activos: [], redes: [], descartadas: 0 });
  });

  it('descarta features inválidas sin romper el resto', () => {
    const r = parseCercanos({
      type: 'FeatureCollection',
      features: [
        SAMPLE.features[0],
        { type: 'Feature', geometry: { type: 'Point', coordinates: [200, 0] }, properties: { capa: 'activo', id: 9 } }, // lon fuera de rango
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0]] }, properties: { capa: 'red', id: 9 } }, // 1 vértice
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: { capa: 'red', id: 9 } },
        { type: 'Feature', geometry: null, properties: {} },
        null,
      ],
    });
    expect(r.activos).toHaveLength(1);
    expect(r.redes).toHaveLength(0);
    expect(r.descartadas).toBe(5);
  });

  it('lanza GeoJsonParseError si la raíz no es FeatureCollection', () => {
    expect(() => parseCercanos({ detail: 'API key inválida' })).toThrow(GeoJsonParseError);
    expect(() => parseCercanos('no es json')).toThrow(GeoJsonParseError);
    expect(() => parseCercanos(null)).toThrow(GeoJsonParseError);
  });
});

describe('tipoRedNormalizado', () => {
  it.each([
    ['agua', 'agua'],
    ['desagüe', 'desagüe'],
    ['Desague', 'desagüe'],
    ['GAS', 'gas'],
    ['eléctrico', 'eléctrico'],
    ['electrico', 'eléctrico'],
    ['fibra', null],
    [null, null],
  ])('%s -> %s', (input, out) => {
    expect(tipoRedNormalizado(input as string | null)).toBe(out);
  });
});

describe('buildCercanosUrl', () => {
  it('incluye lat, lon y radio=50', () => {
    expect(buildCercanosUrl('https://api.x', -12.0463, -77.0301)).toBe(
      'https://api.x/cercanos?lat=-12.0463000&lon=-77.0301000&radio=50',
    );
  });
});

describe('caché (formato)', () => {
  it('ida y vuelta', () => {
    const now = new Date('2026-09-28T10:00:00Z');
    const text = serializeCache(JSON.stringify(SAMPLE), -12.0463, -77.0301, now);
    const c = deserializeCache(text);
    expect(c).not.toBeNull();
    expect(c!.savedAt.toISOString()).toBe(now.toISOString());
    expect(c!.lat).toBe(-12.0463);
    expect(c!.data.redes).toHaveLength(2);
  });

  it('contenido corrupto o de otra versión -> null', () => {
    expect(deserializeCache('{')).toBeNull();
    expect(deserializeCache(JSON.stringify({ v: 999, raw: '{}', savedAt: 'x', lat: 0, lon: 0 }))).toBeNull();
    expect(deserializeCache(JSON.stringify({ v: 1, raw: '{"type":"nope"}', savedAt: new Date().toISOString(), lat: 0, lon: 0 }))).toBeNull();
  });
});
