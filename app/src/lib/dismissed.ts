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
