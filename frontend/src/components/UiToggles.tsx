'use client';

import { useRef } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../context/I18nContext';

function ArgentinaFlag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 42" className={className} aria-hidden>
      <rect width="60" height="42" rx="3" fill="#74acdf" />
      <rect y="14" width="60" height="14" fill="#fff" />
      <circle cx="30" cy="21" r="4.2" fill="#f6b40e" />
      <circle cx="30" cy="21" r="1.6" fill="#85340a" />
    </svg>
  );
}

function UsFlag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 42" className={className} aria-hidden>
      <rect width="60" height="42" rx="3" fill="#b22234" />
      <rect y="3.2" width="60" height="3.2" fill="#fff" />
      <rect y="9.6" width="60" height="3.2" fill="#fff" />
      <rect y="16" width="60" height="3.2" fill="#fff" />
      <rect y="22.4" width="60" height="3.2" fill="#fff" />
      <rect y="28.8" width="60" height="3.2" fill="#fff" />
      <rect y="35.2" width="60" height="3.2" fill="#fff" />
      <rect width="26" height="22.5" rx="2" fill="#3c3b6e" />
    </svg>
  );
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useI18n();
  const btnRef = useRef<HTMLButtonElement>(null);
  const dark = theme === 'dark';

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={() => toggleTheme(btnRef.current)}
      aria-label={dark ? t('ui.themeToLight') : t('ui.themeToDark')}
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-black/10 bg-white/70 text-black shrink-0"
    >
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}

export function LangToggle() {
  const { locale, toggleLocale, t } = useI18n();
  const es = locale === 'es';

  return (
    <button
      type="button"
      onClick={toggleLocale}
      aria-label={es ? t('ui.langToEn') : t('ui.langToEs')}
      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-black/10 bg-white/70 pl-1.5 pr-2.5 shrink-0"
    >
      {es ? <ArgentinaFlag className="h-3.5 w-5" /> : <UsFlag className="h-3.5 w-5" />}
      <span className="text-[11px] font-display font-bold tracking-wide text-black">{es ? 'ES' : 'EN'}</span>
    </button>
  );
}
