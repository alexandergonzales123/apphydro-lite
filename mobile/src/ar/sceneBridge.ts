/**
 * Puente imperativo entre la escena Viro y la UI React Native (paneles, inicialización).
 * La escena registra aquí sus funciones al montarse; así la UI puede hacer hit tests o leer la
 * cámara sin re-renderizar la escena.
 */
import type { Vec3 } from '../geo/enu';
import type { HitResultLike } from '../scene/ground';

export interface CameraPose {
  position: Vec3;
  forward: Vec3;
  /** "Arriba" de la cámara (en retrato, la parte superior del teléfono). Se usa en Android para el rumbo. */
  up: Vec3;
}

export interface SceneApi {
  hitTest(x: number, y: number): Promise<HitResultLike[]>;
  getCamera(): Promise<CameraPose>;
}

let api: SceneApi | null = null;

export function registerSceneApi(a: SceneApi | null): void {
  api = a;
}

export function getSceneApi(): SceneApi | null {
  return api;
}
