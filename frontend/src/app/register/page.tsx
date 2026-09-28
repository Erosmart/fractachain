'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '../../context/I18nContext';

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useI18n();
  useEffect(() => {
    router.replace('/login');
  }, [router]);
  return <p className="py-16 text-center text-neutral-500">{t('misc.registerSame')}</p>;
}
