/** Últimas lecturas de GPS y rumbo (RF-L01). Solo lo consumen el HUD, la ficha y la inicialización. */
import { createStore } from './store';

export interface GpsFix {
  lat: number;
  lon: number;
  /** Precisión horizontal estimada (m), null si el sistema no la da. */
  accuracy: number | null;
  timestamp: number;
}

export interface HeadingReading {
  /** Grados desde el norte (verdadero si está disponible). */
  deg: number;
  isTrue: boolean;
  /** 0..3 (3 = mejor), según expo-location (ver src/sensors/heading.ts: la escala difiere en Android). */
  accuracy: number;
  /**
   * A qué apunta el rumbo: 'camera' (iOS, dirección de la cámara) o 'deviceTop' (Android: dirección
   * de la parte superior del teléfono proyectada en horizontal).
   */
  reference: 'camera' | 'deviceTop';
}

export interface SensorState {
  gps: GpsFix | null;
  /** Mejor fix recibido hasta ahora (para el arranque). */
  bestGps: GpsFix | null;
  heading: HeadingReading | null;
  error: string | null;
}

export const sensorStore = createStore<SensorState>({
  gps: null,
  bestGps: null,
  heading: null,
  error: null,
});
