/** Pantalla 1 del flujo: compatibilidad AR y permisos de cámara y ubicación. */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { checkPermissions, isARSupportedOnDevice, requestRequiredPermissions } from '@reactvision/react-viro';
import {
  APPROXIMATE_LOCATION_HINT,
  classifyArSupport,
  deniedHint,
  evaluatePermissions,
  unsupportedMessage,
  type ArSupport,
  type PermissionOutcome,
} from '../flow/startup';
import { colors, ui } from './theme';

type Status = 'checking' | 'ask' | 'denied' | 'approximate' | 'unsupported';

const IS_ANDROID = Platform.OS === 'android';
/** Android: ARCore puede responder TRANSIENT mientras consulta su lista de dispositivos. */
const AR_CHECK_RETRIES = 6;
const AR_CHECK_RETRY_MS = 400;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function arSupport(): Promise<ArSupport> {
  let result: ArSupport = 'unknown';
  for (let i = 0; i < AR_CHECK_RETRIES; i++) {
    result = await isARSupportedOnDevice().then(
      (value) => classifyArSupport({ ok: true, value }),
      (error) => classifyArSupport({ ok: false, error }),
    );
    if (result !== 'transient') return result;
    await sleep(AR_CHECK_RETRY_MS);
  }
  return result;
}

/** Cámara: en Android con la API estándar de React Native; en iOS con Viro (como antes). */
async function hasCamera(): Promise<boolean> {
  if (IS_ANDROID) return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA).catch(() => false);
  const r = await checkPermissions(['camera']).catch(() => ({ camera: false }));
  return Boolean(r.camera);
}

async function askCamera(): Promise<boolean> {
  if (IS_ANDROID) {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA).catch(() => null);
    return r === PermissionsAndroid.RESULTS.GRANTED;
  }
  const r = await requestRequiredPermissions(['camera']).catch(() => ({ camera: false }));
  return Boolean(r.camera);
}

function outcome(camera: boolean, loc: Location.LocationPermissionResponse | null): PermissionOutcome {
  return evaluatePermissions(
    { camera, location: Boolean(loc?.granted), locationAccuracy: loc?.android?.accuracy },
    Platform.OS,
  );
}

export function PermissionsScreen({ onGranted }: { onGranted: () => void }) {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    let alive = true;
    (async () => {
      // 'unknown' no bloquea: mejor intentar abrir la vista AR que impedirlo por un fallo del chequeo.
      if ((await arSupport()) === 'unsupported') {
        if (alive) setStatus('unsupported');
        return;
      }
      const [cam, loc] = await Promise.all([
        hasCamera(),
        Location.getForegroundPermissionsAsync().catch(() => null),
      ]);
      if (!alive) return;
      const r = outcome(cam, loc);
      if (r === 'granted') onGranted();
      else setStatus(r === 'approximate' ? 'approximate' : 'ask');
    })();
    return () => {
      alive = false;
    };
  }, [onGranted]);

  const request = useCallback(async () => {
    setStatus('checking');
    const cam = await askCamera();
    const loc = await Location.requestForegroundPermissionsAsync().catch(() => null);
    const r = outcome(cam, loc);
    if (r === 'granted') onGranted();
    else setStatus(r);
  }, [onGranted]);

  return (
    <View style={styles.root}>
      <View style={[ui.panel, styles.card]}>
        <Text style={ui.title}>AR de Infraestructura</Text>
        {status === 'checking' && <ActivityIndicator color={colors.accent} style={styles.gap} />}
        {status === 'unsupported' && (
          <Text style={[ui.text, styles.gap]}>{unsupportedMessage(Platform.OS)}</Text>
        )}
        {(status === 'ask' || status === 'denied' || status === 'approximate') && (
          <>
            <Text style={[ui.text, styles.gap]}>
              Para ver los sensores y tuberías cercanos la app necesita la cámara y tu ubicación
              precisa mientras la usas.
            </Text>
            {status === 'denied' && (
              <Text style={[ui.dim, styles.gap, { color: colors.warn }]}>{deniedHint(Platform.OS)}</Text>
            )}
            {status === 'approximate' && (
              <Text style={[ui.dim, styles.gap, { color: colors.warn }]}>{APPROXIMATE_LOCATION_HINT}</Text>
            )}
            <Pressable style={[ui.button, styles.gap]} onPress={request}>
              <Text style={ui.buttonText}>Conceder permisos</Text>
            </Pressable>
            {(status === 'denied' || status === 'approximate') && (
              <Pressable style={[ui.buttonGhost, styles.gapSm]} onPress={() => Linking.openSettings()}>
                <Text style={ui.buttonGhostText}>{IS_ANDROID ? 'Abrir ajustes de la app' : 'Abrir Ajustes'}</Text>
              </Pressable>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', justifyContent: 'center', padding: 24 },
  card: { gap: 0 },
  gap: { marginTop: 16 },
  gapSm: { marginTop: 8 },
});
