/**
 * Navegador AR. Sin props y memoizado: los cambios de estado de <App> (paneles, HUD) nunca
 * provocan un render del navegador; la escena lee su estado de appStore.
 */
import { memo } from 'react';
import { StyleSheet } from 'react-native';
import { ViroARSceneNavigator } from '@reactvision/react-viro';
import { InfraScene } from './InfraScene';

const initialScene = { scene: InfraScene };

function ARViewImpl() {
  return (
    <ViroARSceneNavigator
      style={StyleSheet.absoluteFill}
      initialScene={initialScene}
      // "Gravity": Y arriba; -Z = frente de la cámara al arrancar. La alineación con el norte
      // se hace en JS con la brújula (ver src/geo/enu.ts), así se puede corregir calibrando.
      worldAlignment="Gravity"
      provider="none"
      autofocus
      hdrEnabled={false}
      pbrEnabled={false}
      bloomEnabled={false}
      shadowsEnabled={false}
    />
  );
}

export const ARView = memo(ARViewImpl);
