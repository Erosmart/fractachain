import { cookies } from 'next/headers';
import { dictionaries, type Messages } from './i18n';

/**
 * Server-side locale resolution. The client provider mirrors `fc_lang`
 * into a cookie so RSC sections can render the same dictionary.
 */
export function getServerMessages(): Messages {
  const locale = cookies().get('fc_lang')?.value;
  return locale === 'en' ? dictionaries.en : dictionaries.es;
}
