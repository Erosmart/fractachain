import { RefreshCw } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';

/** Header action shared by every console page. */
export function RefreshButton({ onClick, busy = false }: { onClick: () => void; busy?: boolean }) {
  const { t } = useI18n();
  return (
    <button type="button" onClick={onClick} disabled={busy} className="btn btn-secondary">
      <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
      {busy ? t('admin.common.refreshing') : t('admin.common.refresh')}
    </button>
  );
}
