import { useI18n } from '@/hooks/useI18n';
import type { TxStatus } from '../../hooks/useOffering';
import OpStatus from '../OpStatus';

/** Status of the last operation on the offering page. */
export default function TxStatusLine({ tx, className = '' }: { tx: TxStatus | null; className?: string }) {
  const { t } = useI18n();
  return (
    <OpStatus
      tx={tx}
      className={className}
      title={tx ? t(`offerings.tx.kinds.${tx.kind}`) : undefined}
      stateLabel={(s) => t(`offerings.tx.${s}`)}
      regionLabel={t('offerings.tx.region')}
      viewLabel={t('offerings.tx.view')}
      detailLabel={t('offerings.tx.detail')}
    />
  );
}
