import { dictionaries, type Locale, type Messages } from './dictionaries';

export type { Locale, Messages };
export type TranslateVars = Record<string, string | number>;
export type Translate = (key: string, vars?: TranslateVars) => string;

export const DEFAULT_LOCALE: Locale = 'es';
export const LOCALES: readonly Locale[] = ['es', 'en'];
export const LOCALE_COOKIE = 'fc_lang';
export const LOCALE_STORAGE_KEY = 'fc_lang';

export function isLocale(value: unknown): value is Locale {
  return value === 'es' || value === 'en';
}

/** Replaces `{name}` placeholders; unknown names are left visible on purpose. */
export function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`));
}

/** Resolves a dotted key (`market.title`) to a string, or `undefined`. */
export function lookup(messages: Messages, key: string): string | undefined {
  let cur: unknown = messages;
  for (const part of key.split('.')) {
    if (cur === null || typeof cur !== 'object' || !(part in cur)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function messagesFor(locale: Locale): Messages {
  return dictionaries[locale];
}

/** Pure translate: falls back to the key itself so a missing string is visible, not blank. */
export function translate(locale: Locale, key: string, vars?: TranslateVars): string {
  return interpolate(lookup(dictionaries[locale], key) ?? key, vars);
}

export function translatorFor(locale: Locale): Translate {
  return (key, vars) => translate(locale, key, vars);
}
