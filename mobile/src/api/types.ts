/** Tipos del dominio según CONTRACT.md (GET /cercanos). */

export type TipoRed = 'agua' | 'desagüe' | 'gas' | 'eléctrico';

export interface Activo {
  capa: 'activo';
  /** Clave estable entre descargas: `activo-${id}`. */
  key: string;
  id: number;
  codigo: string;
  tipo: string | null;
  estado: string | null;
  /** Metros bajo el suelo (positivo = enterrado). null si no se conoce. */
  profundidad_m: number | null;
  atributos: Record<string, unknown> | null;
  distancia_m: number | null;
  lat: number;
  lon: number;
}

export interface Red {
  capa: 'red';
  /**
   * Clave estable entre descargas: `red-${id}-${n}`, con n = índice de la parte dentro de la misma
   * tubería tras ordenar sus partes de forma determinista (ver parse.ts). El `id` de BD NO es único
   * por feature: una tubería partida por el radio llega en varias features con el mismo id.
   */
  key: string;
  /** `red-${id}`: común a todas las partes de la misma tubería. */
  groupKey: string;
  id: number;
  codigo: string;
  /** Tipo tal cual llega (normalizado a minúsculas); ver `tipoRedNormalizado`. */
  tipo: string | null;
  diametro_mm: number | null;
  material: string | null;
  profundidad_m: number | null;
  distancia_m: number | null;
  /** Vértices en orden, WGS84. */
  coords: { lat: number; lon: number }[];
}

export type Feature = Activo | Red;

export interface Cercanos {
  activos: Activo[];
  redes: Red[];
}
