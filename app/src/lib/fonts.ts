import { Platform } from 'react-native';

// Hanken Grotesk, loaded from Google Fonts on web. Native builds (Phase 6) will bundle it with expo-font.
let loaded = false;
export function loadFonts() {
  if (loaded || Platform.OS !== 'web' || typeof document === 'undefined') return;
  loaded = true;
  const pre1 = document.createElement('link');
  pre1.rel = 'preconnect';
  pre1.href = 'https://fonts.googleapis.com';
  const pre2 = document.createElement('link');
  pre2.rel = 'preconnect';
  pre2.href = 'https://fonts.gstatic.com';
  pre2.crossOrigin = '';
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap';
  document.head.append(pre1, pre2, css);
  // Anything that does not name a family itself (plain Text, inputs) still gets the app face.
  const style = document.createElement('style');
  style.textContent = `body, input, textarea, button { font-family: 'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', sans-serif; }`;
  document.head.appendChild(style);
}
