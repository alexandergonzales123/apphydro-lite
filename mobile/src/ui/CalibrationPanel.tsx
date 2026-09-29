/**
 * Calibración manual (RF-L07), como panel sobre la vista AR:
 *   1. Elegir un activo conocido de la lista.
 *   2. Tocar en pantalla su posición real en el suelo -> hit test contra el plano detectado.
 *   3. Se recalcula la transformación del nodo raíz (traslación y, con 2+ puntos separados, yaw).
 *   Deshacer restaura el estado anterior de la pila.
 */
import { useCallback } from 'react';
import { FlatList, type GestureResponderEvent, PixelRatio, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hitTestPoint } from '../ar/hitTestPoint';
import { getSceneApi } from '../ar/sceneBridge';
import {
  MIN_BASELINE_M,
  baseline,
  canUndo,
  horizontalShift,
  radToDeg,
  type CalibrationState,
} from '../calibration/calibration';
import { pickGroundHit } from '../scene/ground';
import { appActions, appStore } from '../state/appStore';
import { useStore } from '../state/store';
import { fmtMeters } from './format';
import { colors, ui } from './theme';

async function handleTap(e: GestureResponderEvent) {
  const s = appStore.get();
  const ui0 = s.calibrationUi;
  if (!ui0 || ui0.step !== 'tap' || ui0.busy || !ui0.assetKey) return;
  const pin = s.model?.pins.find((p) => p.key === ui0.assetKey);
  const api = getSceneApi();
  if (!pin || !api) return;

  const { pageX, pageY } = e.nativeEvent;
  const [x, y] = hitTestPoint(pageX, pageY, Platform.OS, PixelRatio.get());
  appActions.patchCalibrationUi({ busy: true, message: null });
  try {
    const hit = pickGroundHit(await api.hitTest(x, y));
    if (!hit) {
      appActions.patchCalibrationUi({
        busy: false,
        message: 'No se detectó el suelo en ese punto. Apunta al piso y vuelve a tocar.',
      });
      return;
    }
    // Releer tras el await: el suelo o el origen pudieron recolocarse durante el hit test.
    const now = appStore.get();
    const fresh = now.model?.pins.find((p) => p.key === pin.key) ?? pin;
    const before = now.calibration.current.transform;
    appActions.applyCalibration({ key: fresh.key, codigo: fresh.codigo, local: fresh.position, world: hit });
    const after = appStore.get().calibration.current;
    const shift = horizontalShift(before, after.transform, fresh.position);
    const yaw = radToDeg(after.transform.yawRad);
    appActions.patchCalibrationUi({
      busy: false,
      step: 'pick',
      assetKey: null,
      message:
        `${pin.codigo}: escena corregida ${fmtMeters(shift, 2)}` +
        (after.usedRotation ? `, giro ${yaw.toFixed(1)}°` : '') +
        `. Puntos: ${after.points.length}.`,
    });
  } catch (err) {
    appActions.patchCalibrationUi({
      busy: false,
      message: `Error en el hit test: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

/** Explica por qué no se corrige (todavía) el giro; null si ya se corrige o no hay puntos. */
function rotationNote(c: CalibrationState): string | null {
  const n = c.points.length;
  if (n === 0 || c.usedRotation) return null;
  const min = `${MIN_BASELINE_M} m`;
  if (n === 1) {
    return `Con un solo activo solo se corrige la posición. Para corregir también el giro, calibra otro activo a más de ${min} de este.`;
  }
  return (
    `No se corrige el giro: los activos calibrados están a ${fmtMeters(baseline(c.points), 1)} entre sí ` +
    `(mínimo ${min}). Con puntos tan juntos, un error pequeño al tocar el suelo giraría mucho la escena, ` +
    `así que solo se corrige la posición. Calibra un activo más alejado.`
  );
}

export function CalibrationPanel() {
  const insets = useSafeAreaInsets();
  const cal = useStore(appStore, (s) => s.calibrationUi);
  const history = useStore(appStore, (s) => s.calibration);
  const activos = useStore(appStore, (s) => s.activos);

  const pick = useCallback((key: string) => {
    appActions.patchCalibrationUi({ step: 'tap', assetKey: key, message: null });
  }, []);

  if (!cal) return null;
  const selected = cal.assetKey ? activos.find((a) => a.key === cal.assetKey) : undefined;
  const calibratedKeys = new Set(history.current.points.map((p) => p.key));
  const note = rotationNote(history.current);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Capa que captura el toque en pantalla solo en el paso "tocar el suelo". */}
      {cal.step === 'tap' && <Pressable style={StyleSheet.absoluteFill} onPress={handleTap} />}
      {cal.step === 'tap' && (
        <View style={styles.crossWrap} pointerEvents="none">
          <Text style={styles.tapHint}>Toca el suelo donde está realmente {selected?.codigo ?? 'el activo'}</Text>
        </View>
      )}

      <View style={[styles.wrap, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
        <View style={ui.panel}>
          <Text style={ui.title}>Calibración manual</Text>
          {cal.step === 'pick' ? (
            <>
              <Text style={[ui.dim, styles.gap]}>Elige un activo cuya posición real conozcas:</Text>
              {activos.length === 0 ? (
                <Text style={[ui.text, styles.gap]}>No hay activos descargados para calibrar.</Text>
              ) : (
                <FlatList
                  style={styles.list}
                  data={activos}
                  keyExtractor={(a) => a.key}
                  renderItem={({ item }) => (
                    <Pressable style={styles.item} onPress={() => pick(item.key)}>
                      <Text style={ui.text}>
                        {item.codigo}
                        {calibratedKeys.has(item.key) ? '  ✓' : ''}
                      </Text>
                      <Text style={ui.dim}>
                        {item.tipo ?? ''} · {fmtMeters(item.distancia_m)}
                      </Text>
                    </Pressable>
                  )}
                />
              )}
            </>
          ) : (
            <Text style={[ui.text, styles.gap]}>
              {cal.busy ? 'Buscando el suelo…' : `Toca en la pantalla el punto real de ${selected?.codigo ?? ''}.`}
            </Text>
          )}

          {cal.message ? <Text style={[ui.dim, styles.gap, { color: colors.warn }]}>{cal.message}</Text> : null}
          {note ? <Text style={[ui.dim, styles.gap]}>{note}</Text> : null}

          <View style={[styles.buttons, styles.gap]}>
            {cal.step === 'tap' && (
              <Pressable
                style={[ui.buttonGhost, styles.flex]}
                onPress={() => appActions.patchCalibrationUi({ step: 'pick', assetKey: null, message: null })}
              >
                <Text style={ui.buttonGhostText}>Atrás</Text>
              </Pressable>
            )}
            <Pressable
              style={[ui.buttonGhost, styles.flex, !canUndo(history) && ui.disabled]}
              disabled={!canUndo(history)}
              onPress={() => {
                appActions.undoCalibration();
                appActions.patchCalibrationUi({ message: 'Última calibración deshecha.' });
              }}
            >
              <Text style={ui.buttonGhostText}>Deshacer</Text>
            </Pressable>
            <Pressable style={[ui.button, styles.flex]} onPress={appActions.closeCalibration}>
              <Text style={ui.buttonText}>Listo</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, bottom: 0 },
  gap: { marginTop: 10 },
  list: { maxHeight: 220, marginTop: 8 },
  item: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.panelBorder,
  },
  buttons: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  crossWrap: { position: 'absolute', top: '35%', left: 24, right: 24, alignItems: 'center' },
  tapHint: {
    color: '#fff',
    backgroundColor: colors.panel,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    overflow: 'hidden',
    textAlign: 'center',
  },
});
