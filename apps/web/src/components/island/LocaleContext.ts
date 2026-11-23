import { createContext } from 'react';
import { DEFAULT_LOCALE, type Locale } from '@/core/i18n/translate';

/**
 * Seeds the locale for server rendering only. Islands are independent React
 * roots rendered per request, so the request's locale arrives as a prop; on
 * the client the shared LocaleStore takes over (and agrees with it).
 */
export const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);
