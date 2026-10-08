import { Platform } from 'react-native';
import { colors, mode } from '@/theme';

// Tells the phone what this app is called and looks like, so "Add to Home screen" gives a proper tile
// that opens full-screen without the browser's address bar. (The static page Expo builds is fixed, so
// these are added as the app starts. Files live in app/public.)
let done = false;
export function setUpHead() {
  if (done || Platform.OS !== 'web' || typeof document === 'undefined') return;
  done = true;
  const h = document.head;
  const meta = (name: string, content: string) => {
    const m = document.createElement('meta');
    m.name = name;
    m.content = content;
    h.appendChild(m);
  };
  const link = (rel: string, href: string, extra: Record<string, string> = {}) => {
    const l = document.createElement('link');
    l.rel = rel;
    l.href = href;
    Object.entries(extra).forEach(([k, v]) => l.setAttribute(k, v));
    h.appendChild(l);
  };
  meta('theme-color', colors.bg);
  meta('color-scheme', mode);
  meta('description', 'Share the school and sports runs with the parents you trust.');
  meta('mobile-web-app-capable', 'yes');
  meta('apple-mobile-web-app-capable', 'yes');
  meta('apple-mobile-web-app-title', 'Carpool');
  link('manifest', '/manifest.webmanifest');
  link('icon', '/favicon.png', { type: 'image/png' });
  link('apple-touch-icon', '/apple-touch-icon.png');
  document.body.style.backgroundColor = colors.bg;
  document.documentElement.style.colorScheme = mode;
}
