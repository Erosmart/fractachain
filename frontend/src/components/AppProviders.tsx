'use client';

import { AuthProvider } from '../context/AuthContext';
import { I18nProvider } from '../context/I18nContext';
import { ThemeProvider } from '../context/ThemeContext';

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>{children}</AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
