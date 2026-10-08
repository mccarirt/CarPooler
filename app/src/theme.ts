// Design tokens. Warm neutral base, one accent, 8pt grid.
// Typeface: Hanken Grotesk, chosen by Ryan from three options (brief §10).
//
// Two palettes, each designed by hand rather than inverted. Dark mode is a warm brown-black (never pure
// black or cool grey), with a lighter orange so the accent keeps its contrast, and text ON the accent
// turns dark. The palette is picked once, when the app loads, from the person's choice on Me or else
// their phone's setting; changing it reloads the page. So `colors` is a plain object everywhere.

const light = {
  bg: '#FBF7F0',
  surface: '#FFFFFF',
  sunk: '#F3ECE1',
  line: '#E6DCCB',
  ink: '#2B2118',
  inkSoft: '#6B5D4F',
  accent: '#D44D00',
  accentSoft: '#FBE3D3',
  onAccent: '#FFFFFF', // text and icons sitting on an accent fill
  onInk: '#FFFFFF', // text and icons sitting on an ink fill (selected chips, confirmation pill)
  danger: '#B3261E',
  dangerSoft: '#FBE4E2',
  ok: '#2F7D4F',
  okSoft: '#DDEFE3',
  warnBg: '#FBE9CF',
  warnFg: '#8A5300',
  warnCard: '#FFF4DD',
  warnLine: '#F0D9A8',
  placeholder: '#A39787',
};

const dark: typeof light = {
  bg: '#17120E',
  surface: '#211A14',
  sunk: '#2B231B',
  line: '#3B3228',
  ink: '#F3ECE2',
  inkSoft: '#B5A797',
  accent: '#FF8A4C',
  accentSoft: '#3A2214',
  onAccent: '#1A0E06',
  onInk: '#17120E',
  danger: '#FF8F85',
  dangerSoft: '#3D1F1C',
  ok: '#6FCF97',
  okSoft: '#1E3327',
  warnBg: '#3A2A12',
  warnFg: '#F2B35E',
  warnCard: '#2F2410',
  warnLine: '#5A431C',
  placeholder: '#7E7264',
};

export type ThemePreference = 'system' | 'light' | 'dark';
const KEY = 'cc.theme';

export function getThemePreference(): ThemePreference {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const systemDark = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;

export const mode: 'light' | 'dark' = (() => {
  const pref = getThemePreference();
  return pref === 'dark' || (pref === 'system' && systemDark()) ? 'dark' : 'light';
})();

export const colors = mode === 'dark' ? dark : light;

// Change the palette. The page reloads so every screen picks it up.
export function setThemePreference(pref: ThemePreference) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // Storage blocked: the choice cannot be remembered, so there is nothing to reload into.
    return;
  }
  if (typeof location !== 'undefined') location.reload();
}

// Following the phone's setting: if it flips (evening, say) while the app is open, follow it.
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && getThemePreference() === 'system') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => location.reload());
}

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
