'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { dictionaries, interpolate, type Locale, type Messages } from '../lib/i18n';

type I18nCtx = {
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
  messages: Messages;
  toggleLocale: () => void;
};

const I18nContext = createContext<I18nCtx>({
  locale: 'es',
  t: (key) => key,
  messages: dictionaries.es,
  toggleLocale: () => {},
});

export function useI18n() {
  return useContext(I18nContext);
}

function lookup(messages: Messages, key: string): string | undefined {
  const parts = key.split('.');
  let cur: unknown = messages;
  for (const part of parts) {
    if (cur === null || typeof cur !== 'object' || !(part in (cur as object))) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>('es');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('fc_lang');
    if (saved === 'en' || saved === 'es') setLocale(saved);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem('fc_lang', locale);
    document.documentElement.lang = locale;
  }, [locale, hydrated]);

  const messages = dictionaries[locale];

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      return interpolate(lookup(messages, key) ?? key, vars);
    },
    [messages],
  );

  const toggleLocale = useCallback(() => {
    setLocale((prev) => (prev === 'es' ? 'en' : 'es'));
  }, []);

  const value = useMemo(
    () => ({ locale, t, messages, toggleLocale }),
    [locale, t, messages, toggleLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
