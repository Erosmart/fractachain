import { useCallback, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { container } from '@/core/container';
import type { Theme } from '@/core/theme/ThemeStore';

const store = container.stores.theme;
const selectTheme = () => store.getSnapshot().theme;
const serverTheme = (): Theme => 'light';

export function useTheme() {
  const theme = useSyncExternalStore(store.subscribe, selectTheme, serverTheme);
  const toggleTheme = useCallback((origin?: HTMLElement | null) => store.toggle(origin, flushSync), []);
  return { theme, toggleTheme };
}
