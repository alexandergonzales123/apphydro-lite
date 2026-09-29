/**
 * Flujo (sin login ni menú): Permisos -> Inicializando AR -> Vista AR.
 * La ficha y la calibración son paneles superpuestos a la vista AR, no pantallas aparte.
 */
import { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ARView } from './ar/ARView';
import { runInitialization } from './flow/initialize';
import { appStore } from './state/appStore';
import { useStore } from './state/store';
import { CalibrationPanel } from './ui/CalibrationPanel';
import { FeaturePanel } from './ui/FeaturePanel';
import { Hud, WarningBanner } from './ui/Hud';
import { InitOverlay } from './ui/InitOverlay';
import { PermissionsScreen } from './ui/PermissionsScreen';

function ArExperience() {
  const phase = useStore(appStore, (s) => s.phase);
  const hasSelection = useStore(appStore, (s) => s.selectedKey !== null);
  const calibrating = useStore(appStore, (s) => s.calibrationUi !== null);

  // La inicialización se lanza una sola vez al montar la experiencia AR.
  useEffect(() => runInitialization(), []);

  return (
    <View style={styles.root}>
      <ARView />
      {phase === 'initializing' && <InitOverlay />}
      {phase === 'ar' && <Hud />}
      {phase === 'ar' && hasSelection && !calibrating && <FeaturePanel />}
      {phase === 'ar' && calibrating && <CalibrationPanel />}
      <WarningBanner />
    </View>
  );
}

export default function App() {
  const phase = useStore(appStore, (s) => s.phase);
  const onGranted = useCallback(() => appStore.set({ phase: 'initializing' }), []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {phase === 'permissions' ? <PermissionsScreen onGranted={onGranted} /> : <ArExperience />}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
});
