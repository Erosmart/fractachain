import { useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import { LocaleContext } from '@/components/island/LocaleContext';
import { container } from '@/core/container';
import {
  messagesFor,
  translate,
  type Locale,
  type Messages,
  type TranslateVars,
} from '@/core/i18n/translate';

export interface I18n {
  locale: Locale;
  messages: Messages;
  t: (key: string, vars?: TranslateVars) => string;
  toggleLocale: () => void;
}

const store = container.stores.locale;
const selectLocale = () => store.getSnapshot().locale;

export function useI18n(): I18n {
  const serverLocale = useContext(LocaleContext);
  const locale = useSyncExternalStore(store.subscribe, selectLocale, () => serverLocale);
  const t = useCallback((key: string, vars?: TranslateVars) => translate(locale, key, vars), [locale]);
  return useMemo(
    () => ({ locale, messages: messagesFor(locale), t, toggleLocale: store.toggle }),
    [locale, t],
  );
}
