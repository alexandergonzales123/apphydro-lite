/**
 * Tubería bajo el suelo (suelo − profundidad) + proyección discontinua sobre el piso (RF-L05).
 * Memoizada: las geometrías solo cambian si cambia el modelo (datos/suelo), no con el GPS.
 * Solo la tubería es tocable; los trazos de la proyección no llevan onClick (menos nodos con
 * hit testing de eventos, RNF-L03).
 */
import { memo, useCallback } from 'react';
import { ViroNode, ViroPolyline } from '@reactvision/react-viro';
import type { PipeModel } from '../scene/buildScene';
import { appActions } from '../state/appStore';
import { MAT, dashMaterial, pipeMaterial } from './materials';

const PIPE_THICKNESS = 0.08;
const DASH_THICKNESS = 0.05;

function PipeImpl({ model, selected }: { model: PipeModel; selected: boolean }) {
  const onClick = useCallback(() => appActions.select(model.key), [model.key]);
  const pipeMat = selected ? MAT.selected : pipeMaterial(model.color);
  const dashMat = dashMaterial(model.color);

  return (
    <ViroNode>
      <ViroPolyline
        points={model.points}
        thickness={selected ? PIPE_THICKNESS * 1.5 : PIPE_THICKNESS}
        materials={[pipeMat]}
        onClick={onClick}
      />
      {model.dashes.map((d, i) => (
        <ViroPolyline
          key={i}
          points={d}
          thickness={DASH_THICKNESS}
          materials={[dashMat]}
        />
      ))}
    </ViroNode>
  );
}

export const Pipe = memo(PipeImpl);
