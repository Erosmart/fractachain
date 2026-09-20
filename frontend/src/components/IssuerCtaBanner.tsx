'use client';

import Link from 'next/link';
import { Building2, ArrowRight } from 'lucide-react';
import { useI18n } from '../context/I18nContext';

export default function IssuerCtaBanner() {
  const { t } = useI18n();
  return (
    <section className="p-5 sm:p-8 lg:p-10 rounded-2xl sm:rounded-3xl crystal-card">
      <div className="flex flex-col lg:flex-row lg:items-center gap-5 sm:gap-6 justify-between">
        <div className="max-w-2xl space-y-3">
          <p className="font-lcd text-[11px] uppercase tracking-[0.22em] text-neutral-500">{t('issuer.kicker')}</p>
          <h2 className="font-section text-2xl sm:text-3xl lg:text-4xl font-extrabold text-black leading-snug">
            {t('issuer.title')}
          </h2>
          <p className="text-neutral-600 text-sm sm:text-base">
            {t('issuer.body')}
          </p>
        </div>
        <Link
          href="/login?next=/admin/issuance"
          className="w-full sm:w-auto shrink-0 justify-center px-6 py-3.5 rounded-2xl bg-black text-white font-display font-bold text-sm inline-flex items-center gap-2"
        >
          <Building2 className="w-4 h-4" />
          {t('issuer.cta')}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  );
}
