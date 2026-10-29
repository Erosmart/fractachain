import type { ComponentType } from 'react';
import type { Locale } from '@/core/i18n/translate';
import { LocaleContext } from './LocaleContext';

export interface IslandProps {
  /** Locale of the request, passed by the `.astro` page (`Astro.locals.locale`). */
  locale?: Locale;
}

/**
 * Wraps a component so it can be mounted as an Astro island: every island
 * root receives the request locale and exposes it for server rendering.
 */
export function withIsland<P extends object>(Component: ComponentType<P>) {
  function Island(props: P & IslandProps) {
    return (
      <LocaleContext.Provider value={props.locale ?? 'es'}>
        <Component {...props} />
      </LocaleContext.Provider>
    );
  }
  Island.displayName = `Island(${Component.displayName || Component.name || 'Component'})`;
  return Island;
}
