/** GPS y rumbo con expo-location (RF-L01). Escribe en sensorStore, no en estado de React. */
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { sensorStore, type GpsFix } from '../state/sensorStore';
import { normalizeHeading } from './heading';

/** Mínimo cambio de rumbo (grados) o intervalo (ms) para publicar una lectura nueva. */
const HEADING_MIN_DELTA_DEG = 1;
const HEADING_MIN_INTERVAL_MS = 250;

function angularDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function better(a: GpsFix | null, b: GpsFix): GpsFix {
  if (!a) return b;
  const accA = a.accuracy ?? Infinity;
  const accB = b.accuracy ?? Infinity;
  return accB <= accA ? b : a;
}

/** Arranca los watchers. Devuelve una función para pararlos. */
export async function startSensors(): Promise<() => void> {
  const subs: Location.LocationSubscription[] = [];
  let lastHeadingAt = 0;

  try {
    subs.push(
      await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 0,
        },
        (loc) => {
          const fix: GpsFix = {
            lat: loc.coords.latitude,
            lon: loc.coords.longitude,
            accuracy: loc.coords.accuracy ?? null,
            timestamp: loc.timestamp,
          };
          sensorStore.set((s) => ({ gps: fix, bestGps: better(s.bestGps, fix), error: null }));
        },
        (reason) => sensorStore.set({ error: `GPS: ${reason}` }),
      ),
    );

    subs.push(
      await Location.watchHeadingAsync(
        (h) => {
          const reading = normalizeHeading(h, Platform.OS);
          if (!reading) return;
          const deg = reading.deg;
          const prev = sensorStore.get().heading;
          const now = Date.now();
          if (
            prev &&
            angularDiff(prev.deg, deg) < HEADING_MIN_DELTA_DEG &&
            prev.accuracy === reading.accuracy &&
            now - lastHeadingAt < HEADING_MIN_INTERVAL_MS
          ) {
            return;
          }
          lastHeadingAt = now;
          sensorStore.set({ heading: reading });
        },
        (reason) => sensorStore.set({ error: `Brújula: ${reason}` }),
      ),
    );
  } catch (e) {
    sensorStore.set({ error: e instanceof Error ? e.message : String(e) });
  }

  return () => subs.forEach((s) => s.remove());
}
