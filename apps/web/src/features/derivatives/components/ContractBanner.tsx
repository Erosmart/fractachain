import type { ReactNode } from 'react';

/** Legal / regulatory framing of a derivative product, with its contract file. */
export default function ContractBanner({
  icon,
  title,
  body,
  wasm,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  wasm: string;
}) {
  return (
    <section className="card card-pad flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-soft text-ink"
          aria-hidden="true"
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="title">{title}</h2>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-ink-2">{body}</p>
        </div>
      </div>
      <span className="chip chip-neutral self-start font-mono">{wasm}</span>
    </section>
  );
}
