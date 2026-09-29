/**
 * Configuración de la app. Las variables EXPO_PUBLIC_* se incrustan en el bundle en tiempo
 * de build (ver README). Deben leerse con acceso estático `process.env.EXPO_PUBLIC_X`.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
export const API_KEY = process.env.EXPO_PUBLIC_API_KEY ?? '';

/**
 * iOS (ATS) y Android (cleartext bloqueado desde targetSdk 28) bloquean HTTP en builds de release,
 * y RNF-L06 exige HTTPS en producción.
 */
export const API_URL_IS_HTTPS = /^https:\/\//i.test(API_URL);

/** Radio de descarga (RF-L02). */
export const RADIO_M = 50;

/** Timeout de la llamada a la API: RNF-L04 pide ver pines en <= 5 s. */
export const API_TIMEOUT_MS = 6000;

/** Altura del suelo por defecto (m bajo la cámara) si ARKit/ARCore aún no ha detectado un plano. */
export const FALLBACK_GROUND_BELOW_CAMERA_M = 1.4;

/**
 * Tiempo (desde que ARKit/ARCore rastrea) tras el que se muestra la escena con el suelo estimado si no
 * hay plano. Cuando se detecta el plano real, la escena se recoloca (mientras no se haya calibrado).
 */
export const FALLBACK_GROUND_DELAY_MS = 1500;

/**
 * Precisión GPS (m) a partir de la cual el primer fix se acepta para descargar y fijar el origen.
 * No se espera a un fix "muy bueno": el radio de descarga (50 m) cubre el error y la calibración
 * corrige la posición.
 */
export const ACCEPTABLE_GPS_ACCURACY_M = 30;

/** Si en este tiempo no llega un fix aceptable, se usa el mejor recibido (aunque sea peor). */
export const GPS_ACCEPT_ANY_AFTER_MS = 3000;

/** Sin ningún fix en este tiempo se muestra un error (se sigue esperando en segundo plano). */
export const GPS_TIMEOUT_MS = 10000;

/**
 * Brújula: precisión mínima (escala de expo-location, 0..3) para considerar fiable el rumbo con el
 * que se orienta la escena. iOS: 2 = incertidumbre < 35°. Android: 2 = SENSOR_STATUS_ACCURACY_MEDIUM
 * (orientativo, ver src/sensors/heading.ts).
 */
export const MIN_HEADING_ACCURACY = 2;

/** Tiempo máximo (desde que arrancan los sensores) esperando un rumbo fiable. */
export const HEADING_TIMEOUT_MS = 3000;

/**
 * Solo Android: proyección horizontal mínima del vector "up" de la cámara para emparejarlo con el
 * rumbo (0,5 ≈ cámara 30° por debajo del horizonte). Ver isHeadingPoseUsable.
 */
export const MIN_UP_HORIZONTAL_ANDROID = 0.5;

/** Solo Android: tiempo máximo esperando esa inclinación antes de arrancar con el rumbo marcado como poco fiable. */
export const TILT_TIMEOUT_MS = 4000;

/** Solo Android: intervalo entre lecturas de pose mientras se espera la inclinación. */
export const TILT_POLL_MS = 150;

/**
 * Refinado del origen ENU (RNF-L01): el origen se fija con el fix disponible al arrancar, que puede
 * ser malo (≤ 30 m). Mientras no se haya calibrado, si durante REANCHOR_WINDOW_MS llega un fix con
 * precisión ≤ REANCHOR_IMPROVEMENT × la del origen actual, se re-ancla la escena a ese fix.
 * Se deja de refinar al alcanzar REANCHOR_GOOD_ACCURACY_M.
 */
export const REANCHOR_GOOD_ACCURACY_M = 8;
export const REANCHOR_IMPROVEMENT = 0.6;
export const REANCHOR_WINDOW_MS = 30000;
