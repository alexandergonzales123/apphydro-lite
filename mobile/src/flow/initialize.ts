/**
 * "Inicializando AR": GPS + descarga + brújula + suelo + fijar el origen de la escena (una vez).
 *
 * Objetivo RNF-L04: pines visibles en <= 5 s. Por eso las esperas van en paralelo:
 *
 *   A. GPS: el primer fix con precisión <= ACCEPTABLE_GPS_ACCURACY_M (o, pasado
 *      GPS_ACCEPT_ANY_AFTER_MS, el mejor recibido) lanza YA la única llamada GET /cercanos (si falla
 *      por red/5xx se carga la caché). Sin ningún fix en GPS_TIMEOUT_MS se muestra un error claro y
 *      se sigue esperando en segundo plano.
 *   B. Pose: con el tracking AR listo se espera un rumbo fiable (precisión >= MIN_HEADING_ACCURACY)
 *      hasta HEADING_TIMEOUT_MS; mientras, el overlay pide calibrar la brújula. Si no llega, se
 *      arranca igual con `headingUnreliable` (el HUD invita a calibrar con 2 activos).
 *      En Android además se espera (hasta TILT_TIMEOUT_MS) a que la cámara esté inclinada hacia el
 *      suelo, porque el rumbo de Android es el de la parte superior del teléfono (ver
 *      src/sensors/heading.ts). En iOS ese paso no existe.
 *   C. Marco = origen ENU (fix de A) + rumbo del eje -Z (brújula + forward de la cámara de B en
 *      iOS, o su vector up en Android) + desplazamiento (posición de la cámara).
 *   D. Suelo: si a los FALLBACK_GROUND_DELAY_MS de rastrear no hay plano, se usa la altura estimada;
 *      al detectarse el plano real la escena se recoloca (groundController) si no se ha calibrado.
 *   E. Con marco + suelo + datos (o error) -> fase "ar".
 */
import { Platform } from 'react-native';
import { ApiError, fetchCercanos } from '../api/client';
import { loadCache, saveCache } from '../cache/cache';
import {
  ACCEPTABLE_GPS_ACCURACY_M,
  FALLBACK_GROUND_BELOW_CAMERA_M,
  FALLBACK_GROUND_DELAY_MS,
  GPS_ACCEPT_ANY_AFTER_MS,
  GPS_TIMEOUT_MS,
  HEADING_TIMEOUT_MS,
  MIN_HEADING_ACCURACY,
  MIN_UP_HORIZONTAL_ANDROID,
  REANCHOR_GOOD_ACCURACY_M,
  REANCHOR_IMPROVEMENT,
  REANCHOR_WINDOW_MS,
  TILT_POLL_MS,
  TILT_TIMEOUT_MS,
} from '../config';
import { horizontalDistance, worldHeadingFromPose } from '../geo/enu';
import { applyFallbackGround, setReferenceCameraY } from '../ar/groundController';
import { getSceneApi, type CameraPose } from '../ar/sceneBridge';
import { headingReference, type HeadingReference } from '../sensors/heading';
import { startSensors } from '../sensors/sensors';
import { appActions, appStore } from '../state/appStore';
import { sensorStore, type GpsFix } from '../state/sensorStore';
import { isAcceptableFix, isHeadingPoseUsable, isReliableHeading } from './criteria';
import { Cancelled, createCancelToken, sleep, waitFor, type CancelToken } from './wait';

export async function downloadData(fix: GpsFix): Promise<void> {
  appStore.set({ dataStatus: 'pending', dataError: null });
  try {
    const { data, raw } = await fetchCercanos(fix.lat, fix.lon);
    appActions.setData(data.activos, data.redes, {
      dataStatus: 'ok',
      dataError: null,
      cacheSavedAt: null,
      cacheDistanceM: null,
      descartadas: data.descartadas,
    });
    saveCache(raw, fix.lat, fix.lon);
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError('network', String(e));
    if (err.puedeUsarCache) {
      const cached = await loadCache();
      if (cached) {
        appActions.setData(cached.data.activos, cached.data.redes, {
          dataStatus: 'cache',
          dataError: err.message,
          cacheSavedAt: cached.savedAt,
          cacheDistanceM: horizontalDistance(fix, cached),
          descartadas: cached.data.descartadas,
        });
        return;
      }
    }
    appStore.set({ dataStatus: 'error', dataError: err.message });
  }
}

/** A. Primer fix aceptable; si tarda, el mejor recibido; sin ninguno, error visible y se sigue esperando. */
async function acquireFix(token: CancelToken): Promise<GpsFix> {
  const t0 = Date.now();
  const acceptable = await waitFor(
    sensorStore,
    (s) => isAcceptableFix(s.gps, ACCEPTABLE_GPS_ACCURACY_M),
    token,
    GPS_ACCEPT_ANY_AFTER_MS,
  );
  if (!acceptable) {
    const any = await waitFor(sensorStore, (s) => s.bestGps !== null, token, GPS_TIMEOUT_MS - (Date.now() - t0));
    if (!any) {
      appStore.set({
        gpsStatus: 'error',
        gpsError: `Sin señal GPS tras ${Math.round(GPS_TIMEOUT_MS / 1000)} s. Sal al exterior, lejos de edificios altos, y comprueba que la ubicación precisa está activada para la app. Seguimos esperando…`,
      });
      await waitFor(sensorStore, (s) => s.bestGps !== null, token);
    }
  }
  const s = sensorStore.get();
  const good = isAcceptableFix(s.gps, ACCEPTABLE_GPS_ACCURACY_M);
  const fix = (good ? s.gps : s.bestGps) as GpsFix;
  appStore.set({ gpsStatus: good ? 'ok' : 'estimated', gpsError: null });
  return fix;
}

function acc(f: GpsFix | null): number {
  return f?.accuracy ?? Number.POSITIVE_INFINITY;
}

function betterFix(a: GpsFix, b: GpsFix | null): GpsFix {
  return b && acc(b) < acc(a) ? b : a;
}

/**
 * F. Re-anclaje (RNF-L01): mientras no haya calibración, si llega un fix claramente mejor que el del
 * origen, el origen pasa a ese fix y el desplazamiento a la posición actual de la cámara (el rumbo
 * no cambia). Así un primer fix de ±25 m no deja la escena desplazada para siempre.
 */
async function refineOrigin(token: CancelToken, initial: GpsFix): Promise<void> {
  const deadline = Date.now() + REANCHOR_WINDOW_MS;
  let anchorAcc = acc(initial);
  while (anchorAcc > REANCHOR_GOOD_ACCURACY_M && Date.now() < deadline) {
    const better = await waitFor(
      sensorStore,
      (s) => acc(s.gps) <= anchorAcc * REANCHOR_IMPROVEMENT,
      token,
      deadline - Date.now(),
    );
    if (!better) return;
    const api = getSceneApi();
    if (!api || appStore.get().calibration.current.points.length > 0) return;
    const cam = await api.getCamera();
    // Leídos después del await: fix y cámara del mismo instante, y la calibración pudo empezar.
    const gps = sensorStore.get().gps;
    const frame = appStore.get().frame;
    if (token.cancelled || !gps || !frame || appStore.get().calibration.current.points.length > 0) return;
    appActions.setFrame({
      ...frame,
      origin: { lat: gps.lat, lon: gps.lon },
      offsetX: cam.position[0],
      offsetZ: cam.position[2],
    });
    anchorAcc = acc(gps);
  }
}

interface Pose {
  cam: CameraPose;
  headingDeg: number;
  headingReference: HeadingReference;
  headingUnreliable: boolean;
  trackingAt: number;
}

/** B. Tracking AR + rumbo fiable (con timeout) + pose de la cámara. */
async function capturePose(token: CancelToken, sensorsAt: number): Promise<Pose> {
  await waitFor(appStore, (s) => s.trackingReady, token);
  const trackingAt = Date.now();

  await waitFor(
    sensorStore,
    (s) => isReliableHeading(s.heading, MIN_HEADING_ACCURACY),
    token,
    sensorsAt + HEADING_TIMEOUT_MS - Date.now(),
  );

  let api = getSceneApi();
  for (let i = 0; !api && i < 20; i++) {
    await sleep(100, token);
    api = getSceneApi();
  }
  if (!api) throw new Error('La escena AR no está disponible');

  const reference = sensorStore.get().heading?.reference ?? headingReference(Platform.OS);
  let cam = await api.getCamera();
  // Rumbo leído DESPUÉS de la pose de cámara para que ambos sean del mismo instante.
  let heading = sensorStore.get().heading;
  let poseUsable = isHeadingPoseUsable(cam, reference, MIN_UP_HORIZONTAL_ANDROID);

  // Solo Android ('deviceTop'): en iOS la primera pose siempre vale y no se entra aquí.
  if (!poseUsable) {
    appStore.set({ needTilt: true });
    try {
      const deadline = Date.now() + TILT_TIMEOUT_MS;
      while (!poseUsable && Date.now() < deadline) {
        await sleep(TILT_POLL_MS, token);
        cam = await api.getCamera();
        heading = sensorStore.get().heading;
        poseUsable = isHeadingPoseUsable(cam, reference, MIN_UP_HORIZONTAL_ANDROID);
      }
    } finally {
      appStore.set({ needTilt: false });
    }
  }

  return {
    cam,
    // Sin ninguna lectura de brújula no hay otra opción que suponer 0°; se avisa con el flag.
    headingDeg: heading?.deg ?? 0,
    headingReference: heading?.reference ?? reference,
    headingUnreliable: !poseUsable || !isReliableHeading(heading, MIN_HEADING_ACCURACY),
    trackingAt,
  };
}

/** Arranca la inicialización. Devuelve una función de limpieza (sensores y esperas pendientes). */
export function runInitialization(): () => void {
  const { token, cancel } = createCancelToken();
  let stopSensors: (() => void) | null = null;

  (async () => {
    stopSensors = await startSensors();
    // Cancelado mientras arrancaban: la limpieza ya pasó sin tener stopSensors.
    if (token.cancelled) return stopSensors();
    const sensorsAt = Date.now();

    const posePromise = capturePose(token, sensorsAt);
    posePromise.catch(() => {}); // se espera más abajo; evita "unhandled rejection" mientras tanto

    // La descarga arranca en cuanto hay fix, sin esperar a la pose ni al suelo.
    const fix = await acquireFix(token);
    const download = downloadData(fix);

    const pose = await posePromise;
    setReferenceCameraY(pose.cam.position[1]);
    // La pose puede llegar segundos después del fix de descarga: se ancla con el mejor fix de ahora.
    const anchor = betterFix(fix, sensorStore.get().bestGps);
    appActions.setFrame({
      origin: { lat: anchor.lat, lon: anchor.lon },
      worldHeadingDeg: worldHeadingFromPose(pose.headingDeg, pose.cam, pose.headingReference),
      offsetX: pose.cam.position[0],
      offsetZ: pose.cam.position[2],
    });
    appStore.set({
      compassStatus: pose.headingUnreliable ? 'estimated' : 'ok',
      headingUnreliable: pose.headingUnreliable,
    });

    // D. Suelo estimado si a los ~1,5 s de rastrear sigue sin plano (se recoloca al detectarlo).
    if (appStore.get().groundY === null) {
      await sleep(pose.trackingAt + FALLBACK_GROUND_DELAY_MS - Date.now(), token);
      applyFallbackGround(FALLBACK_GROUND_BELOW_CAMERA_M);
    }

    await download;
    await waitFor(appStore, (st) => st.groundY !== null, token);
    if (!token.cancelled) appStore.set({ phase: 'ar' });

    await refineOrigin(token, anchor);
  })().catch((e) => {
    if (e instanceof Cancelled) return;
    console.warn('[init]', e);
    sensorStore.set({ error: e instanceof Error ? e.message : String(e) });
  });

  return () => {
    cancel();
    stopSensors?.();
  };
}
