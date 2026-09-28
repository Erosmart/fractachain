'use client';

import { Suspense } from 'react';
import LoginPage from './LoginInner';
import { useI18n } from '../../context/I18nContext';

function Fallback() {
  const { t } = useI18n();
  return <p className="py-16 text-center">{t('misc.loading')}</p>;
}

export default function Page() {
  return (
    <Suspense fallback={<Fallback />}>
      <LoginPage />
    </Suspense>
  );
}
