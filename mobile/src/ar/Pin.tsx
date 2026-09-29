/** Pin de un activo apoyado en el suelo (RF-L04). Memoizado: solo se re-renderiza si cambia. */
import { memo, useCallback } from 'react';
import { ViroBox, ViroNode, ViroPolyline, ViroSphere, ViroText } from '@reactvision/react-viro';
import type { PinModel } from '../scene/buildScene';
import { appActions } from '../state/appStore';
import { MAT } from './materials';

const STEM_H = 1.0;
const HEAD_R = 0.1;

const labelStyle = {
  fontFamily: 'Arial',
  fontSize: 20,
  color: '#FFFFFF',
  textAlignVertical: 'center' as const,
  textAlign: 'center' as const,
};
const depthStyle = { ...labelStyle, color: '#FFB300' };
const stroke = { type: 'Outline' as const, width: 2, color: '#000000' };

function PinImpl({ model, selected }: { model: PinModel; selected: boolean }) {
  const onClick = useCallback(() => appActions.select(model.key), [model.key]);
  const depth = model.profundidad_m !== null && model.profundidad_m > 0 ? model.profundidad_m : 0;

  return (
    <ViroNode position={model.position}>
      {/* Base plana sobre el suelo: muestra el punto de apoyo. */}
      <ViroBox
        position={[0, 0.005, 0]}
        width={0.3}
        height={0.01}
        length={0.3}
        materials={[MAT.pinBase]}
        onClick={onClick}
      />
      <ViroBox
        position={[0, STEM_H / 2, 0]}
        width={0.03}
        height={STEM_H}
        length={0.03}
        materials={[MAT.pinStem]}
        onClick={onClick}
      />
      <ViroSphere
        position={[0, STEM_H + HEAD_R, 0]}
        radius={selected ? HEAD_R * 1.4 : HEAD_R}
        widthSegmentCount={12}
        heightSegmentCount={8}
        materials={[selected ? MAT.pinHeadSelected : MAT.pinHead]}
        onClick={onClick}
      />
      <ViroText
        text={model.codigo}
        position={[0, STEM_H + 0.35, 0]}
        width={2}
        height={0.3}
        scale={[0.6, 0.6, 0.6]}
        style={labelStyle}
        outerStroke={stroke}
        transformBehaviors={['billboard']}
        onClick={onClick}
      />
      {model.depthLabel && (
        <ViroText
          text={model.depthLabel}
          position={[0, STEM_H + 0.55, 0]}
          width={2}
          height={0.3}
          scale={[0.6, 0.6, 0.6]}
          style={depthStyle}
          outerStroke={stroke}
          transformBehaviors={['billboard']}
          onClick={onClick}
        />
      )}
      {/* Línea vertical hasta la profundidad real del activo enterrado. */}
      {depth > 0 && (
        <ViroPolyline
          points={[
            [0, 0, 0],
            [0, -depth, 0],
          ]}
          thickness={0.015}
          materials={[MAT.depthLine]}
        />
      )}
    </ViroNode>
  );
}

export const Pin = memo(PinImpl);
