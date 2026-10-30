import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react';
import { ArrowRight, CheckCircle2, LifeBuoy, ShieldCheck } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import { Notice, PageHeader } from '@/components/ui/kit';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import LinkedText, { DocLink } from '@/features/auth/components/LinkedText';
import { firstInvalid } from '@/features/auth/model';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';
import {
  CONTACT_FIELDS,
  MESSAGE_MAX,
  MESSAGE_MIN,
  SUPPORT_TOPICS,
  toRequest,
  topicFromParam,
  validateContact,
  type ContactField,
  type ContactForm,
} from '../model';

const { navigator, api } = container;

const EMPTY: ContactForm = {
  topic: 'general',
  name: '',
  email: '',
  message: '',
  company: '',
  cuit: '',
  amount: '',
  website: '',
};

/**
 * Contact & support: questions, KYC problems, privacy requests (Ley 25.326),
 * security reports and issuers who want to tokenize ("Tokenizar mi empresa"
 * lands here with `?tema=emisor`). Works signed in or not.
 */
function ContactPage() {
  const { user } = useSession();
  const { t } = useI18n();
  const ids = useId();
  const id = (f: string) => `${ids}-${f}`;
  const [form, setForm] = useState<ContactForm>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<ContactField, ContactField>>>({});
  const [failure, setFailure] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ id: string; email: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setForm((f) => ({ ...f, topic: topicFromParam(navigator.searchParam('tema')) }));
  }, []);

  // Signed-in users: prefill what we already know (still editable).
  useEffect(() => {
    if (!user) return;
    setForm((f) => ({
      ...f,
      name: f.name || user.legalName || user.name || '',
      email: f.email || (user.email && !user.email.endsWith('@fractachain') ? user.email : ''),
    }));
  }, [user]);

  useEffect(() => {
    if (sent) doneRef.current?.focus();
  }, [sent]);

  const set = <K extends keyof ContactForm>(key: K, value: ContactForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    setFailure('');
    const found = validateContact(form);
    setErrors(found);
    const first = firstInvalid(CONTACT_FIELDS, found);
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id(first))}`)?.focus();
      return;
    }
    setSending(true);
    try {
      const reference = await api.support.send(toRequest(form));
      setSent({ id: reference, email: form.email.trim() });
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const errorText = (f: ContactField) =>
    errors[f] ? t(`support.contact.errors.${errors[f]}`, { min: MESSAGE_MIN, max: MESSAGE_MAX }) : null;
  const describe = (f: ContactField, hint?: string) =>
    [errors[f] ? `${id(f)}-error` : '', hint ?? ''].filter(Boolean).join(' ') || undefined;
  const FieldError = ({ f }: { f: ContactField }) =>
    errors[f] ? (
      <p id={`${id(f)}-error`} className="mt-1.5 text-xs text-bad">
        {errorText(f)}
      </p>
    ) : null;

  const issuer = form.topic === 'issuer';
  const hasErrors = Object.values(errors).some(Boolean);

  const aside = (
    <aside className="space-y-4">
      <section className="gradient-panel p-5 sm:p-6">
        <h2 className="title">{t('support.contact.asideTitle')}</h2>
        <ul className="mt-4 space-y-2">
          {(
            [
              ['/ayuda', LifeBuoy, 'support.contact.asideHelp', 'support.contact.asideHelpBody'],
              [
                '/transparencia',
                ShieldCheck,
                'support.contact.asideStatus',
                'support.contact.asideStatusBody',
              ],
            ] as const
          ).map(([href, Icon, title, body]) => (
            <li key={href}>
              <a
                href={href}
                className="flex items-start gap-3 rounded-xl bg-surface/70 px-4 py-3 transition-colors hover:bg-surface"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-2" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{t(title)}</span>
                  <span className="block text-xs text-ink-2">{t(body)}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-ink-2">{t('support.contact.asideTime')}</p>
      </section>
    </aside>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
      <PageHeader
        eyebrow={t('support.contact.eyebrow')}
        title={t('support.contact.title')}
        subtitle={t('support.contact.lead')}
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {sent ? (
          <section className="card card-pad" aria-live="polite">
            <CheckCircle2 className="h-8 w-8 text-good" aria-hidden="true" />
            <h2
              ref={doneRef}
              tabIndex={-1}
              className="mt-4 text-[22px] font-normal tracking-[-0.02em] text-ink"
            >
              {t('support.contact.sentTitle')}
            </h2>
            <p className="mt-2 text-sm text-ink-2">
              {t('support.contact.sentBody', { email: sent.email, id: sent.id || '—' })}
            </p>
            <button
              type="button"
              className="btn btn-secondary mt-6"
              onClick={() => {
                setSent(null);
                setForm((f) => ({ ...f, message: '', company: '', cuit: '', amount: '' }));
              }}
            >
              {t('support.contact.sentAgain')}
            </button>
          </section>
        ) : (
          <form ref={formRef} onSubmit={submit} noValidate className="card card-pad relative space-y-5">
            {hasErrors && <Notice tone="bad">{t('support.contact.errors.summary')}</Notice>}
            <fieldset>
              <legend className="label">{t('support.contact.topic')}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {SUPPORT_TOPICS.map((topic) => {
                  const on = form.topic === topic;
                  return (
                    <label
                      key={topic}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                        on ? 'border-navy bg-sky-soft/60' : 'border-line bg-surface hover:border-line-strong'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`${ids}-topic`}
                        value={topic}
                        checked={on}
                        onChange={() => set('topic', topic)}
                        className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--navy))]"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink">
                          {t(`support.contact.topics.${topic}`)}
                        </span>
                        <span className="block text-xs text-ink-2">
                          {t(`support.contact.topicHints.${topic}`)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={id('name')} className="label">
                  {t('support.contact.name')}
                </label>
                <input
                  id={id('name')}
                  type="text"
                  autoComplete="name"
                  value={form.name}
                  aria-invalid={errors.name ? true : undefined}
                  aria-describedby={describe('name')}
                  onChange={(e) => set('name', e.target.value)}
                  className="input aria-[invalid=true]:border-bad"
                />
                <FieldError f="name" />
              </div>
              <div>
                <label htmlFor={id('email')} className="label">
                  {t('support.contact.email')}
                </label>
                <input
                  id={id('email')}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={form.email}
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={describe('email')}
                  onChange={(e) => set('email', e.target.value)}
                  className="input aria-[invalid=true]:border-bad"
                />
                <FieldError f="email" />
              </div>
            </div>

            {issuer && (
              <div className="grid gap-4 rounded-xl border border-line bg-surface-2 p-4 sm:grid-cols-3">
                <div className="sm:col-span-3">
                  <label htmlFor={id('company')} className="label">
                    {t('support.contact.company')}
                  </label>
                  <input
                    id={id('company')}
                    type="text"
                    autoComplete="organization"
                    value={form.company}
                    aria-invalid={errors.company ? true : undefined}
                    aria-describedby={describe('company')}
                    onChange={(e) => set('company', e.target.value)}
                    className="input aria-[invalid=true]:border-bad"
                  />
                  <FieldError f="company" />
                </div>
                <div className="sm:col-span-1">
                  <label htmlFor={id('cuit')} className="label">
                    {t('support.contact.cuit')}
                  </label>
                  <input
                    id={id('cuit')}
                    type="text"
                    inputMode="numeric"
                    placeholder="30-12345678-9"
                    value={form.cuit}
                    aria-invalid={errors.cuit ? true : undefined}
                    aria-describedby={describe('cuit')}
                    onChange={(e) => set('cuit', e.target.value)}
                    className="input aria-[invalid=true]:border-bad"
                  />
                  <FieldError f="cuit" />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor={id('amount')} className="label">
                    {t('support.contact.amount')}
                  </label>
                  <input
                    id={id('amount')}
                    type="text"
                    inputMode="decimal"
                    value={form.amount}
                    aria-invalid={errors.amount ? true : undefined}
                    aria-describedby={describe('amount', `${id('amount')}-hint`)}
                    onChange={(e) => set('amount', e.target.value)}
                    className="input aria-[invalid=true]:border-bad"
                  />
                  <p id={`${id('amount')}-hint`} className="mt-1.5 text-xs text-muted">
                    {t('support.contact.amountHint')}
                  </p>
                  <FieldError f="amount" />
                </div>
              </div>
            )}

            <div>
              <label htmlFor={id('message')} className="label">
                {t('support.contact.message')}
              </label>
              <textarea
                id={id('message')}
                rows={6}
                maxLength={MESSAGE_MAX}
                value={form.message}
                aria-invalid={errors.message ? true : undefined}
                aria-describedby={describe('message', `${id('message')}-hint`)}
                onChange={(e) => set('message', e.target.value)}
                className="input resize-y aria-[invalid=true]:border-bad"
              />
              <p
                id={`${id('message')}-hint`}
                className="mt-1.5 flex justify-between gap-3 text-xs text-muted"
              >
                <span>{t('support.contact.messageHint', { min: MESSAGE_MIN, max: MESSAGE_MAX })}</span>
                <span className="tnum">
                  {form.message.trim().length}/{MESSAGE_MAX}
                </span>
              </p>
              <FieldError f="message" />
            </div>

            {/* Honeypot: off-screen and hidden from assistive tech; people never fill it. */}
            <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
              <label htmlFor={id('website')}>{t('support.contact.honeypot')}</label>
              <input
                id={id('website')}
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={(e) => set('website', e.target.value)}
              />
            </div>

            {failure && <Notice tone="bad">{failure}</Notice>}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted">
                <LinkedText
                  text={t('support.contact.privacyNote')}
                  parts={{
                    privacy: (
                      <DocLink href="/legal/privacidad" newTab={t('account.signup.newTab')}>
                        {t('support.contact.privacyLink')}
                      </DocLink>
                    ),
                  }}
                />
              </p>
              <button type="submit" disabled={sending} className="btn btn-primary">
                {sending ? t('support.contact.sending') : t('support.contact.submit')}
                {!sending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
          </form>
        )}
        {aside}
      </div>
    </div>
  );
}

export default withIsland(ContactPage);
