/**
 * Escena AR. Toda la geometría cuelga de un nodo raíz con la transformación de calibración
 * (RF-L07): mundo = R_y(θ)·local + t.
 *
 * Rendimiento (RNF-L03): la escena NO se suscribe al GPS. Solo re-renderiza si cambian el
 * modelo (datos/suelo), la calibración o la selección; Pin/Pipe están memoizados.
 *
 * Pose de la cámara: `getCameraOrientationAsync` está deprecated en Viro 3.0.1. Su sustituto es
 * el evento `onCameraTransformUpdate`, que se emite en CADA frame y cruza el bridge; para no pagar
 * ese coste de forma continua solo se activa mientras hay alguien esperando una pose (en el
 * arranque) y se desactiva con el primer evento (el nativo habilita/deshabilita el evento al
 * cambiar la prop: VRTScene.setCanCameraTransformUpdate).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ViroARScene,
  ViroNode,
  ViroTrackingStateConstants,
  type ViroAnchor,
  type ViroCameraTransform,
  type ViroTrackingState,
} from '@reactvision/react-viro';
import type { Vec3 } from '../geo/enu';
import { radToDeg } from '../calibration/calibration';
import { appStore } from '../state/appStore';
import { useStore } from '../state/store';
import { onAnchorFoundOrUpdated, onAnchorRemoved } from './groundController';
import { ensureMaterials } from './materials';
import { Pin } from './Pin';
import { Pipe } from './Pipe';
import { registerSceneApi, type CameraPose } from './sceneBridge';

ensureMaterials();

/** Si en este tiempo no llega ningún onCameraTransformUpdate, se usa la API antigua (ver abajo). */
const CAMERA_EVENT_TIMEOUT_MS = 1000;

const toVec3 = (v: unknown): Vec3 => {
  const a = Array.isArray(v) ? v : [];
  return [Number(a[0]) || 0, Number(a[1]) || 0, Number(a[2]) || 0];
};

export function InfraScene() {
  const sceneRef = useRef<ViroARScene>(null);
  const model = useStore(appStore, (s) => s.model);
  const transform = useStore(appStore, (s) => s.calibration.current.transform);
  const selectedKey = useStore(appStore, (s) => s.selectedKey);

  // Peticiones de pose pendientes; mientras haya alguna se escucha onCameraTransformUpdate.
  const cameraWaiters = useRef<((pose: CameraPose) => void)[]>([]);
  const [listenCamera, setListenCamera] = useState(false);

  const onCameraTransform = useCallback((t: ViroCameraTransform) => {
    const waiters = cameraWaiters.current;
    if (waiters.length === 0) return;
    cameraWaiters.current = [];
    setListenCamera(false);
    const pose = { position: toVec3(t.position), forward: toVec3(t.forward), up: toVec3(t.up) };
    waiters.forEach((w) => w(pose));
  }, []);

  useEffect(() => {
    registerSceneApi({
      async hitTest(x, y) {
        const scene = sceneRef.current;
        if (!scene) return [];
        const res = await scene.performARHitTestWithPoint(x, y);
        return Array.isArray(res) ? res : [];
      },
      getCamera() {
        return new Promise<CameraPose>((resolve, reject) => {
          let done = false;
          const waiter = (pose: CameraPose) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve(pose);
          };
          const timer = setTimeout(async () => {
            if (done) return;
            done = true;
            cameraWaiters.current = cameraWaiters.current.filter((w) => w !== waiter);
            if (cameraWaiters.current.length === 0) setListenCamera(false);
            // Red de seguridad: si el evento no llega (no se ha podido verificar en todos los
            // dispositivos), se recurre a la API deprecated, que sigue existiendo en 3.0.1.
            // Quitar cuando Viro la elimine.
            const scene = sceneRef.current;
            if (!scene) return reject(new Error('Escena AR no montada'));
            try {
              const o = await scene.getCameraOrientationAsync();
              resolve({ position: toVec3(o.position), forward: toVec3(o.forward), up: toVec3(o.up) });
            } catch (e) {
              reject(e instanceof Error ? e : new Error(String(e)));
            }
          }, CAMERA_EVENT_TIMEOUT_MS);
          cameraWaiters.current.push(waiter);
          setListenCamera(true);
        });
      },
    });
    return () => registerSceneApi(null);
  }, []);

  // Una tubería partida por el radio llega en varias partes con el mismo id: se resaltan todas.
  const selectedPipeGroup = useMemo(
    () => (selectedKey ? (model?.pipes.find((p) => p.key === selectedKey)?.groupKey ?? null) : null),
    [model, selectedKey],
  );

  const onTrackingUpdated = useCallback((state: ViroTrackingState) => {
    // Solo se publica el primer "normal": una pérdida momentánea no debe volver a la pantalla
    // de inicialización (la HUD de ARKit/ARCore ya avisa al usuario).
    if (state === ViroTrackingStateConstants.TRACKING_NORMAL && !appStore.get().trackingReady) {
      appStore.set({ trackingReady: true });
    }
  }, []);

  const onFound = useCallback((a?: ViroAnchor) => onAnchorFoundOrUpdated(a), []);
  const onRemoved = useCallback((a?: ViroAnchor) => onAnchorRemoved(a), []);

  const rootPosition = useMemo<Vec3>(() => [transform.tx, transform.ty, transform.tz], [transform]);
  const rootRotation = useMemo<Vec3>(() => [0, radToDeg(transform.yawRad), 0], [transform]);

  return (
    <ViroARScene
      ref={sceneRef}
      anchorDetectionTypes={['planesHorizontal']}
      onTrackingUpdated={onTrackingUpdated}
      onAnchorFound={onFound}
      onAnchorUpdated={onFound}
      onAnchorRemoved={onRemoved}
      onCameraTransformUpdate={listenCamera ? onCameraTransform : undefined}
    >
      <ViroNode position={rootPosition} rotation={rootRotation}>
        {model?.pipes.map((p) => (
          <Pipe key={p.key} model={p} selected={p.groupKey === selectedPipeGroup} />
        ))}
        {model?.pins.map((p) => (
          <Pin key={p.key} model={p} selected={p.key === selectedKey} />
        ))}
      </ViroNode>
    </ViroARScene>
  );
}
