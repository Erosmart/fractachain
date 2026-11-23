import { Store } from '../store/Store';

export type Theme = 'light' | 'dark';

export interface ThemeState {
  theme: Theme;
}

const STORAGE_KEY = 'fc_theme';

type ViewTransitionDocument = Document & {
  startViewTransition?: (cb: () => void) => { ready: Promise<void> };
};

/**
 * Light / dark theme. The class on `<html>` is applied before first paint by
 * the inline bootstrap script; this store mirrors it for the toggle button.
 */
export class ThemeStore extends Store<ThemeState> {
  constructor() {
    super({ theme: ThemeStore.fromDocument() });
  }

  static fromDocument(): Theme {
    if (typeof document === 'undefined') return 'light';
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  }

  /**
   * Flips the theme with a circular reveal from `origin` when the browser
   * supports view transitions. `commitSync` lets the React layer flush the
   * icon swap synchronously inside the transition (it wraps `flushSync`).
   */
  readonly toggle = (
    origin?: HTMLElement | null,
    commitSync: (fn: () => void) => void = (fn) => fn(),
  ): void => {
    const next: Theme = ThemeStore.fromDocument() === 'dark' ? 'light' : 'dark';
    const commit = () => {
      document.documentElement.classList.toggle('dark', next === 'dark');
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // theme still applies for this page
      }
      try {
        commitSync(() => this.setState({ theme: next }));
      } catch {
        this.setState({ theme: next });
      }
    };

    const start = (document as ViewTransitionDocument).startViewTransition;
    if (typeof start !== 'function' || !origin) {
      commit();
      return;
    }

    void (async () => {
      await start.call(document, commit).ready;
      const { top, left, width, height } = origin.getBoundingClientRect();
      const x = left + width / 2;
      const y = top + height / 2;
      const radius = Math.hypot(
        Math.max(left, window.innerWidth - left),
        Math.max(top, window.innerHeight - top),
      );
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 400, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)' },
      );
    })();
  };
}
