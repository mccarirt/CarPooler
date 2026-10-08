// Design tokens. Warm neutral base, one accent, 8pt grid.
// Typeface is intentionally unset until Ryan picks from the three options (brief §10).
export const colors = {
  bg: '#FBF7F0',
  surface: '#FFFFFF',
  sunk: '#F3ECE1',
  line: '#E6DCCB',
  ink: '#2B2118',
  inkSoft: '#6B5D4F',
  accent: '#D44D00',
  accentSoft: '#FBE3D3',
  danger: '#B3261E',
  ok: '#2F7D4F',
  okSoft: '#DDEFE3',
};

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
export const radius = { sm: 12, md: 20, pill: 999 };
export const tap = 56; // minimum touch target: curbside, one-handed, gloved

export const font = {
  family: undefined as string | undefined,
  display: { fontSize: 32, lineHeight: 40, fontWeight: '800' as const, letterSpacing: -0.5 },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '700' as const, letterSpacing: -0.25 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '500' as const },
};
