'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../lib/api';

export default function LiveContractLink({ kind }: { kind: 'forward' | 'warrant' | 'stockVault' }) {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/onchain/status`)
      .then((r) => r.json())
      .then((json) => {
        const value = json?.data?.[kind];
        if (typeof value === 'string' && value.startsWith('C')) setId(value);
      })
      .catch(() => {});
  }, [kind]);

  if (!id) return null;

  return (
    <p className="text-xs font-mono text-neutral-600 break-all">
      Instancia testnet:{' '}
      <a
        href={`https://stellar.expert/explorer/testnet/contract/${id}`}
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        {id}
      </a>
    </p>
  );
}
