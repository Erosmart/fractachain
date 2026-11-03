import type { SupportMessageRequest, SupportTopic } from '@fractachain/shared';
import { EMAIL_RE } from '@/features/auth/model';

export const SUPPORT_TOPICS: readonly SupportTopic[] = [
  'general',
  'kyc',
  'issuer',
  'privacy',
  'security',
  'bug',
];

/** `?topic=` values → topics (old Spanish `?tema=` values still map, for links already shared). */
const TOPIC_PARAM: Record<string, SupportTopic> = {
  general: 'general',
  kyc: 'kyc',
  verificacion: 'kyc',
  emisor: 'issuer',
  emisores: 'issuer',
  issuer: 'issuer',
  privacidad: 'privacy',
  privacy: 'privacy',
  seguridad: 'security',
  security: 'security',
  bug: 'bug',
  error: 'bug',
};

export function topicFromParam(param: string | null | undefined): SupportTopic {
  return (
    TOPIC_PARAM[
      String(param ?? '')
        .trim()
        .toLowerCase()
    ] ?? 'general'
  );
}

export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 4000;

/**
 * Form values a link can prefill: `?topic=` (or legacy `?tema=`), and for the
 * issuer simulator `?amount=` and `?message=`. Everything stays editable; the
 * amount keeps only digits and separators and the message is capped.
 */
export function prefillFromParams(
  get: (name: string) => string | null,
): Pick<ContactForm, 'topic'> & Partial<Pick<ContactForm, 'amount' | 'message'>> {
  const amount = (get('amount') ?? '').replace(/[^\d.,]/g, '').slice(0, 20);
  const message = (get('message') ?? '').trim().slice(0, MESSAGE_MAX);
  return {
    topic: topicFromParam(get('topic') ?? get('tema')),
    ...(amount ? { amount } : {}),
    ...(message ? { message } : {}),
  };
}

export interface ContactForm {
  topic: SupportTopic;
  name: string;
  email: string;
  message: string;
  company: string;
  cuit: string;
  amount: string;
  /** Honeypot: hidden from people; bots fill it. */
  website: string;
}

export type ContactField = 'name' | 'email' | 'message' | 'company' | 'cuit' | 'amount';
export const CONTACT_FIELDS: readonly ContactField[] = [
  'name',
  'email',
  'company',
  'cuit',
  'amount',
  'message',
];

export function validateContact(form: ContactForm): Partial<Record<ContactField, ContactField>> {
  const errors: Partial<Record<ContactField, ContactField>> = {};
  if (form.name.trim().length < 2) errors.name = 'name';
  if (!EMAIL_RE.test(form.email.trim())) errors.email = 'email';
  const len = form.message.trim().length;
  if (len < MESSAGE_MIN || len > MESSAGE_MAX) errors.message = 'message';
  if (form.topic === 'issuer') {
    if (form.company.trim().length < 2) errors.company = 'company';
    const digits = form.cuit.replace(/\D/g, '');
    if (form.cuit.trim() && digits.length !== 11) errors.cuit = 'cuit';
    if (form.amount.trim() && !/^\d+([.,]\d+)?$/.test(form.amount.trim().replace(/\./g, '')))
      errors.amount = 'amount';
  }
  return errors;
}

/** Request body: issuer fields only for the issuer topic, numbers parsed (es-AR "1.500.000" → 1500000). */
export function toRequest(form: ContactForm): SupportMessageRequest {
  const issuer = form.topic === 'issuer';
  const amount = form.amount.trim()
    ? Number(form.amount.trim().replace(/\./g, '').replace(',', '.'))
    : undefined;
  return {
    topic: form.topic,
    name: form.name.trim(),
    email: form.email.trim(),
    message: form.message.trim(),
    ...(issuer && form.company.trim() ? { company: form.company.trim() } : {}),
    ...(issuer && form.cuit.trim() ? { cuit: form.cuit.replace(/\D/g, '') } : {}),
    ...(issuer && amount !== undefined && Number.isFinite(amount) ? { amountUsd: amount } : {}),
    website: form.website,
  };
}
