import { useState } from 'react';

// Updates you have swiped away. Remembered on this phone only (a convenience, not shared and not
// important if it is lost). A newer update for the same ride has a different key, so it shows again.
const KEY = 'cc.dismissedUpdates';

function read(): string[] {
  try {
    return JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem(KEY)) || '[]');
  } catch {
    return [];
  }
}

export function useDismissed() {
  const [list, setList] = useState<string[]>(() => read());
  const dismiss = (key: string) => {
    const next = [...list.filter((k) => k !== key), key].slice(-200);
    setList(next);
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Storage blocked: it just comes back next time.
    }
  };
  return { dismissed: new Set(list), dismiss };
}

// "Save your account" reminder on Today: "Not now" hides it for three days on this phone.
const NUDGE = 'cc.accountNudgeUntil';
export function useNudgeDismissed() {
  const [until, setUntil] = useState<number>(() => {
    try {
      return Number((typeof localStorage !== 'undefined' && localStorage.getItem(NUDGE)) || 0);
    } catch {
      return 0;
    }
  });
  const hide = () => {
    const t = Date.now() + 3 * 24 * 60 * 60 * 1000;
    setUntil(t);
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(NUDGE, String(t));
    } catch {
      // Storage blocked: it just comes back next time.
    }
  };
  return { hidden: Date.now() < until, hide };
}
