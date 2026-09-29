/**
 * HUD de la vista AR: aviso fijo (RF-L08), precisión GPS y rumbo (RF-L01), origen de los datos
 * (API/caché, RF-L09) y botón de calibración. Es el único componente que re-renderiza con el GPS.
 */
import { memo, useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MIN_BASELINE_M } from '../calibration/calibration';
import { downloadData } from '../flow/initialize';
import { appActions, appStore } from '../state/appStore';
import { sensorStore } from '../state/sensorStore';
import { useStore } from '../state/store';
import { fmtDate, fmtMeters } from './format';
import { colors, ui } from './theme';

export const WarningBanner = memo(function WarningBanner() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.warning, { paddingTop: insets.top + 6 }]} pointerEvents="none">
      <Text style={styles.warningText}>Posición referencial: no excavar sin verificar</Text>
    </View>
  );
});

function accuracyColor(acc: number | null): string {
  if (acc === null) return colors.textDim;
  if (acc <= 5) return colors.ok;
  if (acc <= 10) return colors.warn;
  return colors.danger;
}

function SensorChips() {
  const acc = useStore(sensorStore, (s) => s.gps?.accuracy ?? null);
  const heading = useStore(sensorStore, (s) => s.heading);
  return (
    <View style={styles.chips}>
      <View style={styles.chip}>
        <View style={[styles.dot, { backgroundColor: accuracyColor(acc) }]} />
        <Text style={styles.chipText}>GPS ±{fmtMeters(acc, 1)}</Text>
      </View>
      <View style={styles.chip}>
        <Text style={styles.chipText}>
          Rumbo {heading ? `${Math.round(heading.deg)}°${heading.isTrue ? '' : ' (mag)'}` : '—'}
        </Text>
      </View>
    </View>
  );
}

/**
 * La escena se orientó sin un rumbo fiable: puede estar girada. Desaparece cuando la calibración
 * corrige el giro (2 activos suficientemente separados).
 */
function HeadingWarning() {
  const show = useStore(
    appStore,
    (s) => s.headingUnreliable && !s.calibration.current.usedRotation && s.calibrationUi === null,
  );
  if (!show) return null;
  return (
    <Pressable style={styles.headingWarn} onPress={appActions.openCalibration}>
      <Text style={styles.headingWarnTitle}>Brújula poco fiable: la escena puede estar girada</Text>
      <Text style={styles.headingWarnText}>
        Toca aquí para calibrar con 2 activos separados más de {MIN_BASELINE_M} m.
      </Text>
    </Pressable>
  );
}

function DataStatus() {
  const status = useStore(appStore, (s) => s.dataStatus);
  const error = useStore(appStore, (s) => s.dataError);
  const savedAt = useStore(appStore, (s) => s.cacheSavedAt);
  const cacheDist = useStore(appStore, (s) => s.cacheDistanceM);
  const ground = useStore(appStore, (s) => s.groundStatus);
  const nActivos = useStore(appStore, (s) => s.activos.length);
  const nRedes = useStore(appStore, (s) => s.redes.length);
  const [retrying, setRetrying] = useState(false);

  const retry = useCallback(async () => {
    const fix = sensorStore.get().gps;
    if (!fix) return;
    setRetrying(true);
    try {
      await downloadData(fix);
    } finally {
      setRetrying(false);
    }
  }, []);

  return (
    <View style={styles.status}>
      {status === 'ok' && (
        <Text style={styles.statusText}>
          {nActivos} activos · {nRedes} tramos
          {nActivos + nRedes === 0 ? ' (nada en 50 m)' : ''}
        </Text>
      )}
      {status === 'cache' && savedAt && (
        <Text style={[styles.statusText, { color: colors.warn }]}>
          Sin conexión: datos en caché del {fmtDate(savedAt)}
          {cacheDist !== null && cacheDist > 50 ? ` (descargados a ${Math.round(cacheDist)} m de aquí)` : ''}
        </Text>
      )}
      {status === 'error' && (
        <Text style={[styles.statusText, { color: colors.danger }]}>Sin datos: {error ?? 'error'}</Text>
      )}
      {ground === 'estimated' && (
        <Text style={[styles.statusText, { color: colors.warn }]}>Suelo estimado: apunta al piso</Text>
      )}
      {(status === 'error' || status === 'cache') && (
        <Pressable
          style={[ui.buttonGhost, styles.retry, retrying && ui.disabled]}
          onPress={retry}
          disabled={retrying}
        >
          <Text style={ui.buttonGhostText}>{retrying ? 'Descargando…' : 'Reintentar'}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function Hud() {
  const insets = useSafeAreaInsets();
  const panelOpen = useStore(appStore, (s) => s.calibrationUi !== null || s.selectedKey !== null);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={[styles.top, { top: insets.top + 40 }]} pointerEvents="box-none">
        <SensorChips />
        <HeadingWarning />
        <DataStatus />
      </View>
      {!panelOpen && (
        <Pressable
          style={[ui.button, styles.calibrate, { bottom: insets.bottom + 24 }]}
          onPress={appActions.openCalibration}
        >
          <Text style={ui.buttonText}>Calibrar</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  warning: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.warningBg,
    paddingBottom: 6,
    alignItems: 'center',
  },
  warningText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  top: { position: 'absolute', left: 12, right: 12, gap: 6 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.panel,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: { color: colors.text, fontSize: 13, fontVariant: ['tabular-nums'] },
  dot: { width: 8, height: 8, borderRadius: 4 },
  status: { alignSelf: 'flex-start', gap: 4, maxWidth: '100%' },
  statusText: {
    color: colors.text,
    fontSize: 12,
    backgroundColor: colors.panel,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  headingWarn: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255, 179, 0, 0.95)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  headingWarnTitle: { color: '#1A1200', fontWeight: '700', fontSize: 13 },
  headingWarnText: { color: '#1A1200', fontSize: 12, marginTop: 2 },
  retry: { alignSelf: 'flex-start', paddingVertical: 6, backgroundColor: colors.panel },
  calibrate: { position: 'absolute', right: 20 },
});
