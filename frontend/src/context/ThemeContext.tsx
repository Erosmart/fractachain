'use client';

import React, { createContext, useCallback, useContext, useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';

export type Theme = 'light' | 'dark';

type ThemeCtx = {
  theme: Theme;
  toggleTheme: (button?: HTMLElement | null) => void;
};

const ThemeContext = createContext<ThemeCtx>({
  theme: 'light',
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('fc_theme', theme);
}

function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  useLayoutEffect(() => {
    setTheme(currentTheme());
  }, []);

  const toggleTheme = useCallback((button?: HTMLElement | null) => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';

    const commit = () => {
      applyTheme(next);
      try {
        flushSync(() => setTheme(next));
      } catch {
        setTheme(next);
      }
    };

    const start = (
      document as Document & {
        startViewTransition?: (cb: () => void) => { ready: Promise<void> };
      }
    ).startViewTransition;

    if (typeof start !== 'function' || !button) {
      commit();
      return;
    }

    const run = async () => {
      await start.call(document, commit).ready;
      const { top, left, width, height } = button.getBoundingClientRect();
      const x = left + width / 2;
      const y = top + height / 2;
      const radius = Math.hypot(
        Math.max(left, window.innerWidth - left),
        Math.max(top, window.innerHeight - top),
      );
      document.documentElement.animate(
        {
          clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`],
        },
        {
          duration: 400,
          easing: 'ease-in-out',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    };

    void run();
  }, []);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}
