/** Ficha del activo o tubería (RF-L06): panel superpuesto a la vista AR, no otra pantalla. */
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tipoRedNormalizado } from '../api/parse';
import type { Activo, Feature, Red } from '../api/types';
import { distancePointToPolyline2D, horizontalDistance, makeEnuConverter } from '../geo/enu';
import { pipeColor } from '../scene/buildScene';
import { appActions, appStore } from '../state/appStore';
import { sensorStore } from '../state/sensorStore';
import { useStore } from '../state/store';
import { fmtMeters, fmtText } from './format';
import { colors, ui } from './theme';

function liveDistance(f: Feature, lat: number, lon: number): number {
  if (f.capa === 'activo') return horizontalDistance({ lat, lon }, f);
  const toEnu = makeEnuConverter({ lat, lon });
  const line = f.coords.map((c) => {
    const p = toEnu(c);
    return [p.e, p.n] as const;
  });
  return distancePointToPolyline2D(0, 0, line);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={ui.dim}>{label}</Text>
      <Text style={[ui.text, styles.value]}>{value}</Text>
    </View>
  );
}

function ActivoRows({ a }: { a: Activo }) {
  return (
    <>
      <Row label="Tipo" value={fmtText(a.tipo)} />
      <Row label="Estado" value={fmtText(a.estado)} />
    </>
  );
}

function RedRows({ r }: { r: Red }) {
  return (
    <>
      <Row label="Tipo" value={fmtText(tipoRedNormalizado(r.tipo) ?? r.tipo)} />
      <Row label="Diámetro" value={r.diametro_mm === null ? '—' : `${r.diametro_mm} mm`} />
      <Row label="Material" value={fmtText(r.material)} />
    </>
  );
}

export function FeaturePanel() {
  const insets = useSafeAreaInsets();
  const key = useStore(appStore, (s) => s.selectedKey);
  const activos = useStore(appStore, (s) => s.activos);
  const redes = useStore(appStore, (s) => s.redes);
  const gps = useStore(sensorStore, (s) => s.gps);

  const feature = useMemo<Feature | null>(() => {
    if (!key) return null;
    return activos.find((a) => a.key === key) ?? redes.find((r) => r.key === key) ?? null;
  }, [key, activos, redes]);

  if (!feature) return null;

  const dist = gps ? liveDistance(feature, gps.lat, gps.lon) : null;
  const buried = feature.profundidad_m !== null && feature.profundidad_m > 0;

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
      <View style={ui.panel}>
        <View style={styles.header}>
          {feature.capa === 'red' && (
            <View style={[styles.swatch, { backgroundColor: pipeColor(feature.tipo) }]} />
          )}
          <Text style={[ui.title, { flex: 1 }]} numberOfLines={1}>
            {feature.codigo}
          </Text>
          <Text style={ui.dim}>{feature.capa === 'activo' ? 'Activo' : 'Tubería'}</Text>
        </View>
        {feature.capa === 'activo' ? <ActivoRows a={feature} /> : <RedRows r={feature} />}
        <Row
          label="Profundidad"
          value={
            feature.profundidad_m === null
              ? 'desconocida'
              : buried
                ? `${feature.profundidad_m.toFixed(2)} m bajo el suelo`
                : 'en superficie'
          }
        />
        <Row label="Distancia" value={fmtMeters(dist ?? feature.distancia_m)} />
        {feature.distancia_m !== null && dist !== null && (
          <Text style={[ui.dim, styles.note]}>Al descargar: {fmtMeters(feature.distancia_m, 2)}</Text>
        )}
        <Pressable style={[ui.buttonGhost, styles.close]} onPress={() => appActions.select(null)}>
          <Text style={ui.buttonGhostText}>Cerrar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, bottom: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  swatch: { width: 14, height: 14, borderRadius: 3 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.panelBorder,
  },
  value: { flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  note: { marginTop: 4, textAlign: 'right' },
  close: { marginTop: 12 },
});
