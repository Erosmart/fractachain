import { FlaskConical } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';

/** Tells the user a screen is a simulator, not a live Stellar flow. */
export default function MockDisclaimer({ product }: { product: string }) {
  const { t } = useI18n();
  return (
    <aside className="flex items-start gap-3 rounded-2xl bg-butter-soft px-4 py-3.5 text-ink">
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-ink-2" aria-hidden="true" />
      <div className="min-w-0 text-[13px] leading-relaxed">
        <p className="font-medium">{t('mock.title')}</p>
        <p className="mt-0.5 text-ink-2">
          {t('mock.body', { product })}{' '}
          <a href="/market" className="font-medium text-ink underline underline-offset-2">
            {t('mock.listing')}
          </a>
          {t('mock.tail')}
        </p>
      </div>
    </aside>
  );
}
