import type { ReactNode } from 'react';

export interface DefinitionRow {
  label: ReactNode;
  value: ReactNode;
  /** Monospace for ids and hashes. */
  mono?: boolean;
  wide?: boolean;
}

/** Label/value pairs on hairlines: two columns on wide screens, one on phones. */
export default function DefinitionGrid({ rows }: { rows: DefinitionRow[] }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-8">
      {rows.map((r, i) => (
        <div
          key={i}
          className={`flex min-w-0 items-baseline justify-between gap-4 border-b border-line/70 py-3 ${r.wide ? 'sm:col-span-2' : ''}`}
        >
          <dt className="shrink-0 text-[13px] text-muted">{r.label}</dt>
          <dd
            className={`min-w-0 break-words text-right text-sm text-ink ${r.mono ? 'font-mono text-xs' : 'tnum'}`}
          >
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
