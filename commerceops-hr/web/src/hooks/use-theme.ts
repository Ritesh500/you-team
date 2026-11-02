import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'youteam-theme';

function currentTheme(): Theme {
  return (document.documentElement.dataset['theme'] as Theme | undefined) ?? 'light';
}

/**
 * The initial value is stamped on <html> before first paint by the inline
 * script in index.html; this hook only reads and updates it.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  const apply = useCallback((next: Theme) => {
    document.documentElement.dataset['theme'] = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing: the theme just won't persist.
    }
    setTheme(next);
  }, []);

  const toggle = useCallback(() => {
    apply(currentTheme() === 'dark' ? 'light' : 'dark');
  }, [apply]);

  // Follow the OS only while the user has not made an explicit choice.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => {
      if (localStorage.getItem(STORAGE_KEY)) return;
      const next: Theme = event.matches ? 'dark' : 'light';
      document.documentElement.dataset['theme'] = next;
      setTheme(next);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return { theme, setTheme: apply, toggle };
}
