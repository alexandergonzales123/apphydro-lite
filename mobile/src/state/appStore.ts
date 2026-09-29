/** Estado de la app: fase del flujo, datos, marco de la escena, suelo, calibración y paneles. */
import type { Activo, Red } from '../api/types';
import {
  INITIAL_HISTORY,
  calibrate as calibrateMath,
  undo as undoMath,
  type CalibrationHistory,
  type Correspondence,
} from '../calibration/calibration';
import { buildSceneModel, type SceneFrame, type SceneModel } from '../scene/buildScene';
import { createStore } from './store';

export type Phase = 'permissions' | 'initializing' | 'ar';
export type StepStatus = 'pending' | 'ok' | 'estimated' | 'cache' | 'error';

export interface CalibrationUi {
  step: 'pick' | 'tap';
  assetKey: string | null;
  busy: boolean;
  message: string | null;
}

export interface AppState {
  phase: Phase;
  /** Pasos de "Inicializando AR". */
  gpsStatus: StepStatus; // ok = fix aceptable, estimated = fix impreciso, error = sin fix
  /** Mensaje si no llega ningún fix GPS a tiempo (se sigue esperando). */
  gpsError: string | null;
  compassStatus: StepStatus; // ok = rumbo fiable, estimated = arrancó sin rumbo fiable
  /** La escena se orientó sin un rumbo fiable (timeout o precisión baja): hay que calibrar. */
  headingUnreliable: boolean;
  /** Solo Android: se espera a que el usuario incline la cámara hacia el suelo para leer el rumbo. */
  needTilt: boolean;
  groundStatus: StepStatus; // ok = plano detectado, estimated = altura por defecto
  dataStatus: StepStatus; // ok = API, cache = última descarga, error = sin datos
  trackingReady: boolean;

  activos: Activo[];
  redes: Red[];
  dataError: string | null;
  cacheSavedAt: Date | null;
  /** Distancia (m) entre la posición de la caché y la actual, si se muestra caché. */
  cacheDistanceM: number | null;
  descartadas: number;

  frame: SceneFrame | null;
  groundY: number | null;
  model: SceneModel | null;

  calibration: CalibrationHistory;
  selectedKey: string | null;
  calibrationUi: CalibrationUi | null;
}

export const appStore = createStore<AppState>({
  phase: 'permissions',
  gpsStatus: 'pending',
  gpsError: null,
  compassStatus: 'pending',
  headingUnreliable: false,
  needTilt: false,
  groundStatus: 'pending',
  dataStatus: 'pending',
  trackingReady: false,
  activos: [],
  redes: [],
  dataError: null,
  cacheSavedAt: null,
  cacheDistanceM: null,
  descartadas: 0,
  frame: null,
  groundY: null,
  model: null,
  calibration: INITIAL_HISTORY,
  selectedKey: null,
  calibrationUi: null,
});

function rebuild(s: Pick<AppState, 'activos' | 'redes' | 'frame' | 'groundY'>): SceneModel | null {
  if (!s.frame || s.groundY === null) return null;
  return buildSceneModel(s.activos, s.redes, s.frame, s.groundY);
}

export const appActions = {
  setData(activos: Activo[], redes: Red[], extra: Partial<AppState>) {
    appStore.set((s) => {
      const next = { ...s, activos, redes, ...extra };
      return { activos, redes, ...extra, model: rebuild(next) };
    });
  },
  setFrame(frame: SceneFrame) {
    appStore.set((s) => ({ frame, model: rebuild({ ...s, frame }) }));
  },
  setGround(groundY: number, status: StepStatus) {
    appStore.set((s) => ({ groundY, groundStatus: status, model: rebuild({ ...s, groundY }) }));
  },
  select(key: string | null) {
    // Mientras se calibra, los toques en la escena no abren la ficha.
    if (appStore.get().calibrationUi) return;
    appStore.set({ selectedKey: key });
  },
  openCalibration() {
    appStore.set({
      selectedKey: null,
      calibrationUi: { step: 'pick', assetKey: null, busy: false, message: null },
    });
  },
  closeCalibration() {
    appStore.set({ calibrationUi: null });
  },
  patchCalibrationUi(patch: Partial<CalibrationUi>) {
    const ui = appStore.get().calibrationUi;
    if (ui) appStore.set({ calibrationUi: { ...ui, ...patch } });
  },
  applyCalibration(c: Correspondence) {
    appStore.set((s) => ({ calibration: calibrateMath(s.calibration, c) }));
  },
  undoCalibration() {
    appStore.set((s) => ({ calibration: undoMath(s.calibration) }));
  },
};
