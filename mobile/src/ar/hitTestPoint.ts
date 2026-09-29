/**
 * Coordenadas PURAS para `performARHitTestWithPoint` a partir de un toque (pageX/pageY en puntos
 * lógicos de React Native).
 *
 * - iOS: se pasan tal cual (puntos). Comportamiento previo; ver README "Qué verificar".
 * - Android: el módulo nativo de Viro 3.0.1 (ARSceneModule) crea un android.graphics.Point con los
 *   valores recibidos, sin convertir de dp a píxeles, y ARCore hace el hit test en píxeles de la
 *   vista. Por eso se multiplica por PixelRatio y se redondea.
 */
export function hitTestPoint(pageX: number, pageY: number, os: string, pixelRatio: number): [number, number] {
  if (os !== 'android') return [pageX, pageY];
  const r = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  return [Math.round(pageX * r), Math.round(pageY * r)];
}
