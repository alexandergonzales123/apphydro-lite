/**
 * Parseo PURO de la respuesta GeoJSON de GET /cercanos (CONTRACT.md).
 *
 * Tolerante: una feature mal formada se descarta (y se cuenta) en lugar de tumbar toda la
 * descarga; solo se lanza error si la raíz no es un FeatureCollection.
 */
import type { Activo, Cercanos, Red, TipoRed } from './types';

export class GeoJsonParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeoJsonParseError';
  }
}

export interface ParseResult extends Cercanos {
  /** Features descartadas por geometría/propiedades inválidas. */
  descartadas: number;
}

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function str(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

/** [lon, lat] -> {lat, lon} validando rango. */
function position(v: unknown): { lat: number; lon: number } | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  const lon = num(v[0]);
  const lat = num(v[1]);
  if (lon === null || lat === null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

/** Quita tildes/diéresis y pasa a minúsculas: "Desagüe" -> "desague". */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/** Normaliza el tipo de red a uno de los 4 valores del contrato, o null si es desconocido. */
export function tipoRedNormalizado(tipo: string | null | undefined): TipoRed | null {
  if (!tipo) return null;
  switch (fold(tipo)) {
    case 'agua':
      return 'agua';
    case 'desague':
      return 'desagüe';
    case 'gas':
      return 'gas';
    case 'electrico':
      return 'eléctrico';
    default:
      return null;
  }
}

type LL = { lat: number; lon: number };

function cmpPos(a: LL, b: LL): number {
  return a.lat - b.lat || a.lon - b.lon;
}

/**
 * Orden determinista de las partes de una misma tubería, independiente del orden de llegada
 * (que depende de distancia_m y por tanto de dónde esté el usuario): primera coordenada,
 * luego última coordenada, luego número de vértices.
 */
function cmpParts(a: LL[], b: LL[]): number {
  return cmpPos(a[0], b[0]) || cmpPos(a[a.length - 1], b[b.length - 1]) || a.length - b.length;
}

/** Evita claves repetidas (datos anómalos: dos features idénticas o ids duplicados). */
function uniqueKey(base: string, used: Set<string>): string {
  let key = base;
  for (let i = 2; used.has(key); i++) key = `${base}~${i}`;
  used.add(key);
  return key;
}

export function parseCercanos(input: unknown): ParseResult {
  let root: unknown = input;
  if (typeof input === 'string') {
    try {
      root = JSON.parse(input);
    } catch {
      throw new GeoJsonParseError('La respuesta no es JSON válido');
    }
  }
  if (!isObj(root) || root.type !== 'FeatureCollection' || !Array.isArray(root.features)) {
    throw new GeoJsonParseError('La respuesta no es un FeatureCollection GeoJSON');
  }

  const activos: Activo[] = [];
  const redes: Red[] = [];
  const usedKeys = new Set<string>();
  let descartadas = 0;

  root.features.forEach((f: unknown, index: number) => {
    if (!isObj(f) || !isObj(f.geometry) || !isObj(f.properties)) {
      descartadas++;
      return;
    }
    const g = f.geometry;
    const p = f.properties;
    const id = num(p.id);
    const codigo = str(p.codigo);
    const capa = p.capa;
    const profundidad = num(p.profundidad_m);
    const distancia = num(p.distancia_m);

    if (capa === 'activo' && g.type === 'Point') {
      const pos = position(g.coordinates);
      if (!pos) {
        descartadas++;
        return;
      }
      activos.push({
        capa: 'activo',
        // Sin id no hay clave estable posible: se usa el índice (dato anómalo, el contrato lo exige).
        key: uniqueKey(id !== null ? `activo-${id}` : `activo-x${index}`, usedKeys),
        id: id ?? -1,
        codigo: codigo ?? `Activo ${index + 1}`,
        tipo: str(p.tipo),
        estado: str(p.estado),
        profundidad_m: profundidad,
        atributos: isObj(p.atributos) ? p.atributos : null,
        distancia_m: distancia,
        lat: pos.lat,
        lon: pos.lon,
      });
      return;
    }

    if (capa === 'red' && g.type === 'LineString' && Array.isArray(g.coordinates)) {
      const coords: { lat: number; lon: number }[] = [];
      for (const c of g.coordinates) {
        const pos = position(c);
        if (!pos) {
          coords.length = 0;
          break;
        }
        coords.push(pos);
      }
      if (coords.length < 2) {
        descartadas++;
        return;
      }
      const tipo = str(p.tipo);
      redes.push({
        capa: 'red',
        key: '', // se asigna al final, cuando se conocen todas las partes de la tubería
        groupKey: id !== null ? `red-${id}` : `red-x${index}`,
        id: id ?? -1,
        codigo: codigo ?? `Tramo ${index + 1}`,
        tipo: tipo === null ? null : tipo.trim().toLowerCase(),
        diametro_mm: num(p.diametro_mm),
        material: str(p.material),
        profundidad_m: profundidad,
        distancia_m: distancia,
        coords,
      });
      return;
    }

    descartadas++;
  });

  // Claves de red: n = posición de la parte entre las de su misma tubería, en orden determinista.
  const groups = new Map<string, Red[]>();
  for (const r of redes) {
    const g = groups.get(r.groupKey);
    if (g) g.push(r);
    else groups.set(r.groupKey, [r]);
  }
  for (const [groupKey, parts] of groups) {
    [...parts]
      .sort((a, b) => cmpParts(a.coords, b.coords))
      .forEach((r, n) => {
        r.key = uniqueKey(`${groupKey}-${n}`, usedKeys);
      });
  }

  return { activos, redes, descartadas };
}
