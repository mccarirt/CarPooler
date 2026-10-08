// Design tokens. Warm neutral base, one accent, 8pt grid.
// Typeface: Hanken Grotesk, chosen by Ryan from three options (brief §10).
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

const family = "'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', sans-serif";

export const font = {
  family,
  display: { fontFamily: family, fontSize: 32, lineHeight: 40, fontWeight: '800' as const, letterSpacing: -0.5 },
  title: { fontFamily: family, fontSize: 24, lineHeight: 32, fontWeight: '700' as const, letterSpacing: -0.25 },
  heading: { fontFamily: family, fontSize: 18, lineHeight: 24, fontWeight: '700' as const },
  body: { fontFamily: family, fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  label: { fontFamily: family, fontSize: 14, lineHeight: 20, fontWeight: '600' as const },
  small: { fontFamily: family, fontSize: 13, lineHeight: 18, fontWeight: '500' as const },
};
