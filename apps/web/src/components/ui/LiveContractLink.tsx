import { useEffect, useState } from 'react';
import { container } from '@/core/container';
import { explorerContract } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import ExternalLink from './ExternalLink';

/** Shows the live testnet instance of a demo contract, when one is deployed. */
export default function LiveContractLink({ kind }: { kind: 'forward' | 'warrant' | 'stockVault' }) {
  const { t } = useI18n();
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    container.api.onChain
      .status()
      .then((status) => {
        const value = status?.[kind];
        if (alive && typeof value === 'string' && value.startsWith('C')) setId(value);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [kind]);

  if (!id) return null;

  return (
    <p className="break-all text-xs text-ink-2">
      {t('misc.testnetInstance')}{' '}
      <ExternalLink
        href={explorerContract(id)}
        className="font-mono text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
      >
        {id}
      </ExternalLink>
    </p>
  );
}
