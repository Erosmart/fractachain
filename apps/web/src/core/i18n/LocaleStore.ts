import { Store } from '../store/Store';
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_STORAGE_KEY, isLocale, type Locale } from './translate';

export interface LocaleState {
  locale: Locale;
}

/**
 * Current UI language. The server renders with the `fc_lang` cookie (see
 * middleware), so the browser starts from `<html lang>` and both always agree.
 * Switching writes cookie + localStorage and reloads: server-rendered sections
 * are re-rendered in the new language instead of flashing mixed copy.
 */
export class LocaleStore extends Store<LocaleState> {
  constructor(initial: Locale) {
    super({ locale: initial });
  }

  /** Locale the server rendered this document with. */
  static fromDocument(): Locale {
    if (typeof document === 'undefined') return DEFAULT_LOCALE;
    const lang = document.documentElement.lang;
    return isLocale(lang) ? lang : DEFAULT_LOCALE;
  }

  get locale(): Locale {
    return this.getSnapshot().locale;
  }

  readonly toggle = (): void => {
    this.persist(this.locale === 'es' ? 'en' : 'es');
    window.location.reload();
  };

  /**
   * Visitors from the Next.js app have the choice in localStorage only; copy it
   * to the cookie the server reads and re-render once if it differs.
   */
  readonly syncPersistedChoice = (): void => {
    if (typeof window === 'undefined') return;
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    } catch {
      return;
    }
    if (!isLocale(saved) || readCookie(LOCALE_COOKIE) === saved) return;
    this.persist(saved);
    if (saved !== this.locale) window.location.reload();
  };

  private persist(locale: Locale): void {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; SameSite=Lax${secure}`;
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // the cookie alone is enough for the server
    }
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=(\\w+)`));
  return match?.[1] ?? null;
}
