import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Plus, Search } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import { EmptyState, PillTabs } from '@/components/ui/kit';
import { useI18n } from '@/hooks/useI18n';

/** Lower-case and strip accents, so "verificacion" finds "verificación". */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export interface HelpCategory {
  id: string;
  title: string;
  items: string[][];
}

/** Categories and questions matching `query` (every word must appear) within `category` ('all' = every one). */
export function filterHelp(categories: HelpCategory[], category: string, query: string): HelpCategory[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return categories
    .filter((c) => category === 'all' || c.id === category)
    .map((c) => ({
      ...c,
      items: c.items.filter(([q, a]) => {
        const haystack = normalize(`${q} ${a}`);
        return words.every((w) => haystack.includes(w));
      }),
    }))
    .filter((c) => c.items.length > 0);
}

/**
 * Searchable help center. Server-rendered with every answer visible in the
 * HTML; the island only adds the search box and the category filter.
 */
function HelpCenter() {
  const { messages, t } = useI18n();
  const help = messages.legal.help;
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');

  // `/help#wallet` opens that category.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (help.categories.some((c) => c.id === hash)) setCategory(hash);
  }, [help.categories]);

  const visible = useMemo(
    () => filterHelp(help.categories, category, query),
    [help.categories, category, query],
  );
  const count = visible.reduce((n, c) => n + c.items.length, 0);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-6">
        <div className="space-y-3">
          <label htmlFor="help-search" className="sr-only">
            {help.searchLabel}
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              id="help-search"
              type="search"
              className="input pl-10"
              placeholder={help.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </div>
          <PillTabs
            label={help.categoriesLabel}
            active={category}
            onChange={setCategory}
            items={[
              { key: 'all', label: help.all },
              ...help.categories.map((c) => ({ key: c.id, label: c.title })),
            ]}
          />
          <p className="text-xs text-muted" aria-live="polite">
            {count === 1 ? help.oneResult : t('legal.help.results', { n: count })}
          </p>
        </div>

        {visible.length === 0 ? (
          <div className="card">
            <EmptyState
              title={help.emptyTitle}
              body={help.emptyBody}
              action={
                <a href="/contact" className="btn btn-primary">
                  {help.contact}
                </a>
              }
            />
          </div>
        ) : (
          visible.map((c) => (
            <section key={c.id} id={c.id} aria-labelledby={`help-${c.id}`} className="scroll-mt-24">
              <h2 id={`help-${c.id}`} className="mb-3 text-[17px] font-medium text-ink">
                {c.title}
              </h2>
              <div className="card divide-y divide-line px-5 sm:px-6">
                {c.items.map(([q, a]) => (
                  <details key={q} className="group py-1">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[15px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                      {q}
                      <span
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-sky-soft/70 text-ink transition-transform group-open:rotate-45"
                        aria-hidden="true"
                      >
                        <Plus className="h-4 w-4" />
                      </span>
                    </summary>
                    <p className="pb-5 pr-2 text-sm leading-relaxed text-ink-2 sm:pr-10">{a}</p>
                  </details>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="gradient-panel p-5 sm:p-6">
          <p className="title">{help.notFoundTitle}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{help.notFoundBody}</p>
          <a href="/contact" className="btn btn-primary mt-4">
            {help.contact}
          </a>
        </div>
        <nav className="card card-pad" aria-label={help.guidesTitle}>
          <p className="title">{help.guidesTitle}</p>
          <ul className="mt-3 space-y-2.5">
            {help.guides.map(([label, href]) => (
              <li key={href}>
                <a href={href} className="flex items-center gap-1.5 text-[14px] text-ink-2 hover:text-ink">
                  {label}
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </div>
  );
}

export default withIsland(HelpCenter);
