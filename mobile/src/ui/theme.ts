import { StyleSheet } from 'react-native';

export const colors = {
  panel: 'rgba(18, 20, 24, 0.92)',
  panelBorder: 'rgba(255,255,255,0.12)',
  text: '#FFFFFF',
  textDim: '#B0B7C3',
  accent: '#00E5FF',
  ok: '#4CAF50',
  warn: '#FFB300',
  danger: '#E53935',
  warningBg: 'rgba(229, 57, 53, 0.92)',
};

export const ui = StyleSheet.create({
  panel: {
    backgroundColor: colors.panel,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.panelBorder,
    padding: 16,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  text: { color: colors.text, fontSize: 15 },
  dim: { color: colors.textDim, fontSize: 13 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  buttonText: { color: '#001018', fontWeight: '700', fontSize: 15 },
  buttonGhost: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.panelBorder,
  },
  buttonGhostText: { color: colors.text, fontWeight: '600', fontSize: 15 },
  disabled: { opacity: 0.4 },
});
