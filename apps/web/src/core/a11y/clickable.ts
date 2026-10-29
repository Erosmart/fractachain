import type { KeyboardEvent } from 'react';

/**
 * Props that make a non-button block (a selectable card) operable with the
 * keyboard: focusable, announced as a button, activated by Enter / Space.
 */
export function clickable(onActivate: () => void, pressed?: boolean) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    'aria-pressed': pressed,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
