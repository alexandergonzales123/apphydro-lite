/** Pantalla 2 del flujo: "Inicializando AR" (suelo, brújula, GPS y descarga), superpuesta a la cámara. */
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { MIN_HEADING_ACCURACY } from '../config';
import { isReliableHeading } from '../flow/criteria';
import { appStore, type StepStatus } from '../state/appStore';
import { sensorStore } from '../state/sensorStore';
import { useStore } from '../state/store';
import { fmtMeters } from './format';
import { colors, ui } from './theme';

function Step({ label, status, detail }: { label: string; status: StepStatus; detail?: string }) {
  const icon =
    status === 'pending' ? (
      <ActivityIndicator size="small" color={colors.accent} />
    ) : (
      <Text style={[styles.icon, { color: status === 'error' ? colors.danger : status === 'ok' ? colors.ok : colors.warn }]}>
        {status === 'error' ? '✕' : status === 'ok' ? '✓' : '!'}
      </Text>
    );
  return (
    <View style={styles.row}>
      <View style={styles.iconBox}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={ui.text}>{label}</Text>
        {detail ? <Text style={ui.dim}>{detail}</Text> : null}
      </View>
    </View>
  );
}

export function InitOverlay() {
  const tracking = useStore(appStore, (s) => s.trackingReady);
  const ground = useStore(appStore, (s) => s.groundStatus);
  const gps = useStore(appStore, (s) => s.gpsStatus);
  const gpsError = useStore(appStore, (s) => s.gpsError);
  const compass = useStore(appStore, (s) => s.compassStatus);
  const needTilt = useStore(appStore, (s) => s.needTilt);
  const headingOk = useStore(sensorStore, (s) => isReliableHeading(s.heading, MIN_HEADING_ACCURACY));
  const data = useStore(appStore, (s) => s.dataStatus);
  const dataError = useStore(appStore, (s) => s.dataError);
  const accuracy = useStore(sensorStore, (s) => s.gps?.accuracy ?? null);
  const sensorError = useStore(sensorStore, (s) => s.error);

  const groundDetail =
    ground === 'estimated'
      ? 'No se detectó el suelo: altura estimada'
      : !tracking
        ? 'Mueve el teléfono despacio'
        : ground === 'pending'
          ? 'Apunta la cámara al suelo'
          : undefined;

  const compassDetail =
    compass === 'estimated'
      ? 'Brújula poco fiable: tendrás que calibrar'
      : compass === 'pending'
        ? needTilt
          ? 'Inclina el teléfono hacia el suelo para leer el rumbo'
          : headingOk
          ? 'Rumbo correcto'
          : 'Calibrando brújula: mueve el teléfono en forma de 8'
        : undefined;

  const gpsDetail =
    gpsError ??
    `Precisión: ${fmtMeters(accuracy, 0)}${gps === 'estimated' ? ' (baja: calibra al llegar)' : ''}`;

  return (
    <View style={styles.root} pointerEvents="none">
      <View style={[ui.panel, styles.card]}>
        <Text style={ui.title}>Inicializando AR</Text>
        <Step label="Suelo" status={ground} detail={groundDetail} />
        <Step label="Brújula" status={compass} detail={compassDetail} />
        <Step label="GPS" status={gps} detail={gpsDetail} />
        <Step
          label="Descarga (50 m)"
          status={data}
          detail={data === 'cache' ? 'Sin conexión: usando la última descarga' : (dataError ?? undefined)}
        />
        {sensorError ? <Text style={[ui.dim, { color: colors.warn, marginTop: 8 }]}>{sensorError}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', padding: 24 },
  card: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 24, alignItems: 'center' },
  icon: { fontSize: 18, fontWeight: '700' },
});
