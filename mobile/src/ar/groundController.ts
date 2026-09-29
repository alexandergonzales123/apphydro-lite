/**
 * Detección de la altura del suelo a partir de los planos horizontales de ARKit (RF-L04).
 * Recibe los anchors desde la escena y publica groundY en appStore solo si cambia >= 5 cm.
 */
import type { ViroAnchor } from '@reactvision/react-viro';
import { groundChanged, pickGroundPlane, type PlaneInfo } from '../scene/ground';
import { appActions, appStore } from '../state/appStore';

const planes = new Map<string, PlaneInfo>();
/** Altura de la cámara de referencia (Y de mundo). ARKit arranca con la cámara en y≈0. */
let cameraY = 0;

export function setReferenceCameraY(y: number): void {
  cameraY = y;
  evaluate();
}

function toPlane(a: ViroAnchor): PlaneInfo | null {
  if (a.type !== 'plane') return null;
  const horizontal = a.alignment === undefined || a.alignment.startsWith('Horizontal');
  const y = a.position[1] + (a.center?.[1] ?? 0);
  const area = (a.width ?? 0) * (a.height ?? 0);
  return { id: a.anchorId, y, area, horizontal };
}

function evaluate(): void {
  const s = appStore.get();
  // Tras calibrar, la altura queda fijada por el punto tocado: no se toca más el suelo.
  if (s.calibration.current.points.length > 0) return;
  const best = pickGroundPlane(planes.values(), cameraY);
  if (!best) return;
  if (s.groundStatus !== 'ok' || groundChanged(s.groundY, best.y)) {
    appActions.setGround(best.y, 'ok');
  }
}

export function onAnchorFoundOrUpdated(a: ViroAnchor | undefined): void {
  if (!a) return;
  const p = toPlane(a);
  if (!p) return;
  planes.set(p.id, p);
  evaluate();
}

export function onAnchorRemoved(a: ViroAnchor | undefined): void {
  if (!a) return;
  planes.delete(a.anchorId);
}

/** Si no hay plano a tiempo, se usa una altura estimada (se sustituye al detectar uno). */
export function applyFallbackGround(belowCameraM: number): void {
  if (appStore.get().groundY === null) {
    appActions.setGround(cameraY - belowCameraM, 'estimated');
  }
}
