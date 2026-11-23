import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Mail } from 'lucide-react';
import type { SupportMessage } from '@fractachain/shared';
import RequireAdmin from '@/components/guards/RequireAdmin';
import { withIsland } from '@/components/island/withIsland';
import { EmptyState, Notice, PageHeader, PillTabs, StatusChip, type Tone } from '@/components/ui/kit';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { formatAmount } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import { formatDateTime, relativeAge } from '../../shared/datetime';
import { RefreshButton } from '../../shared/RefreshButton';
import { countOpen, replyHref, sortInbox, type SupportFilter } from '../model';

const { api } = container;

const TOPIC_TONE: Record<SupportMessage['topic'], Tone> = {
  general: 'neutral',
  kyc: 'sky',
  issuer: 'butter',
  privacy: 'peach',
  security: 'bad',
  bug: 'warn',
};

function TopicChip({ topic }: { topic: SupportMessage['topic'] }) {
  const { t } = useI18n();
  return (
    <StatusChip tone={TOPIC_TONE[topic]} icon={false}>
      {t(`support.contact.topics.${topic}`)}
    </StatusChip>
  );
}

function Detail({
  message,
  busy,
  onToggle,
  onBack,
}: {
  message: SupportMessage;
  busy: boolean;
  onToggle: () => void;
  onBack: () => void;
}) {
  const { t, locale } = useI18n();
  const open = message.status === 'open';
  return (
    <article className="card card-pad space-y-4 lg:sticky lg:top-24" aria-labelledby={`msg-${message.id}`}>
      <button type="button" onClick={onBack} className="btn btn-ghost btn-sm -ml-2 lg:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t('admin.support.back')}
      </button>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`msg-${message.id}`} className="text-[17px] font-medium text-ink">
            {message.name}
          </h2>
          <p className="break-all text-sm text-ink-2">{message.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TopicChip topic={message.topic} />
          <StatusChip tone={open ? 'sky' : 'good'}>{t(`admin.support.status.${message.status}`)}</StatusChip>
        </div>
      </header>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">{t('admin.support.received')}</dt>
          <dd className="text-ink">{formatDateTime(message.createdAt, locale)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t('admin.support.account')}</dt>
          <dd className={message.accountId ? 'truncate font-mono text-xs text-ink' : 'text-ink'}>
            {message.accountId || t('admin.support.guest')}
          </dd>
        </div>
        {message.company && (
          <div>
            <dt className="text-xs text-muted">{t('admin.support.company')}</dt>
            <dd className="text-ink">{message.company}</dd>
          </div>
        )}
        {message.cuit && (
          <div>
            <dt className="text-xs text-muted">{t('admin.support.cuit')}</dt>
            <dd className="tnum text-ink">{message.cuit}</dd>
          </div>
        )}
        {typeof message.amountUsd === 'number' && (
          <div>
            <dt className="text-xs text-muted">{t('admin.support.amount')}</dt>
            <dd className="tnum text-ink">US$ {formatAmount(message.amountUsd)}</dd>
          </div>
        )}
      </dl>
      {/* Untrusted text: rendered as text, never as HTML. */}
      <p className="whitespace-pre-wrap break-words rounded-xl bg-surface-2 p-4 text-sm leading-relaxed text-ink">
        {message.message}
      </p>
      {message.closedAt && (
        <p className="text-xs text-muted">
          {t('admin.support.closedAt', { when: formatDateTime(message.closedAt, locale) })}
          {message.closedBy ? ` · ${message.closedBy}` : ''}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <a
          href={replyHref(message, t(`support.contact.topics.${message.topic}`))}
          className="btn btn-primary btn-sm"
        >
          <Mail className="h-4 w-4" aria-hidden="true" />
          {t('admin.support.reply')}
        </a>
        <button type="button" onClick={onToggle} disabled={busy} className="btn btn-secondary btn-sm">
          {open ? t('admin.support.close') : t('admin.support.reopen')}
        </button>
      </div>
    </article>
  );
}

function SupportInbox() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<SupportFilter>('open');
  const [rows, setRows] = useState<SupportMessage[] | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, open] = await Promise.all([
        api.admin.supportMessages(filter),
        filter === 'open' ? Promise.resolve(null) : api.admin.supportMessages('open'),
      ]);
      const sorted = sortInbox(list);
      setRows(sorted);
      setOpenCount(open ? open.length : countOpen(sorted));
      setNow(Date.now());
    } catch (err) {
      setError(errorMessage(err, t('admin.support.loadError')));
    } finally {
      setLoading(false);
    }
  }, [filter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = useMemo(() => rows?.find((r) => r.id === selected) ?? null, [rows, selected]);

  const toggle = async (m: SupportMessage) => {
    setBusy(true);
    setError('');
    try {
      if (m.status === 'open') await api.admin.closeSupportMessage(m.id);
      else await api.admin.reopenSupportMessage(m.id);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const tabs = (['open', 'closed', 'all'] as const).map((key) => ({
    key,
    label: t(`admin.support.filters.${key}`),
    badge: key === 'open' ? openCount : undefined,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.support.title')}
        subtitle={t('admin.support.subtitle')}
        actions={<RefreshButton onClick={() => void load()} busy={loading} />}
      />
      <PillTabs
        label={t('admin.support.filtersLabel')}
        items={tabs}
        active={filter}
        onChange={(k) => {
          setFilter(k as SupportFilter);
          setSelected(null);
        }}
      />
      {error && <Notice tone="bad">{error}</Notice>}
      {rows === null ? (
        <p className="py-10 text-center text-sm text-muted" role="status">
          {t('auth.loading')}
        </p>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            title={filter === 'open' ? t('admin.support.empty') : t('admin.support.emptyFiltered')}
          />
        </div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <ul className={`card divide-y divide-line overflow-hidden ${current ? 'hidden lg:block' : ''}`}>
            {rows.map((m) => {
              const on = m.id === selected;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(m.id)}
                    aria-current={on ? 'true' : undefined}
                    className={`flex w-full flex-col gap-1.5 px-5 py-4 text-left transition-colors hover:bg-surface-2 ${
                      on ? 'bg-sky-soft/50' : ''
                    }`}
                  >
                    <span className="flex w-full flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-medium text-ink">{m.name}</span>
                      <span className="shrink-0 text-xs text-muted">{relativeAge(m.createdAt, now, t)}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <TopicChip topic={m.topic} />
                      {m.status === 'closed' && (
                        <StatusChip tone="good">{t('admin.support.status.closed')}</StatusChip>
                      )}
                    </span>
                    <span className="line-clamp-2 text-[13px] text-ink-2">{m.message}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {current ? (
            <Detail
              message={current}
              busy={busy}
              onToggle={() => void toggle(current)}
              onBack={() => setSelected(null)}
            />
          ) : (
            <div className="card hidden lg:block">
              <EmptyState title={t('admin.support.select')} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AdminSupportPage() {
  return (
    <RequireAdmin>
      <SupportInbox />
    </RequireAdmin>
  );
}

export default withIsland(AdminSupportPage);
