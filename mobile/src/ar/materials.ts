/** Materiales Viro (iluminación Constant: no dependen de luces, más baratos para >= 30 fps). */
import { ViroMaterials } from '@reactvision/react-viro';
import { PIPE_COLORS, PIPE_COLOR_UNKNOWN } from '../scene/buildScene';

export const MAT = {
  pinHead: 'pin_head',
  pinHeadSelected: 'pin_head_sel',
  pinStem: 'pin_stem',
  pinBase: 'pin_base',
  depthLine: 'depth_line',
  selected: 'selected',
} as const;

/** Nombre de material de una tubería / su proyección según el color. */
const colorKey = (hex: string) => hex.replace('#', '').toLowerCase();
export const pipeMaterial = (hex: string) => `pipe_${colorKey(hex)}`;
export const dashMaterial = (hex: string) => `dash_${colorKey(hex)}`;

let created = false;

export function ensureMaterials(): void {
  if (created) return;
  created = true;
  const colors = [...Object.values(PIPE_COLORS), PIPE_COLOR_UNKNOWN];
  const dict: Record<string, { diffuseColor: string; lightingModel: 'Constant'; blendMode?: 'Alpha' }> = {
    [MAT.pinHead]: { diffuseColor: '#FF6D00', lightingModel: 'Constant' },
    [MAT.pinHeadSelected]: { diffuseColor: '#00E5FF', lightingModel: 'Constant' },
    [MAT.pinStem]: { diffuseColor: '#FFFFFF', lightingModel: 'Constant' },
    [MAT.pinBase]: { diffuseColor: '#FF6D00B0', lightingModel: 'Constant', blendMode: 'Alpha' },
    [MAT.depthLine]: { diffuseColor: '#FFB300', lightingModel: 'Constant' },
    [MAT.selected]: { diffuseColor: '#00E5FF', lightingModel: 'Constant' },
  };
  for (const c of colors) {
    dict[pipeMaterial(c)] = { diffuseColor: c, lightingModel: 'Constant' };
    dict[dashMaterial(c)] = { diffuseColor: `${c}C0`, lightingModel: 'Constant', blendMode: 'Alpha' };
  }
  ViroMaterials.createMaterials(dict);
}
