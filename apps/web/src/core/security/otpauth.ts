/**
 * Helpers for TOTP enrollment. The QR library is loaded only when a user
 * actually enables 2FA, so it never weighs on other pages.
 */

/** Only `otpauth://totp/…` URIs are rendered: the QR must not encode anything else. */
export function isTotpUri(uri: string): boolean {
  return /^otpauth:\/\/totp\/[^\s]+$/i.test(uri.trim());
}

/** Groups a base32 secret in blocks of 4 so it can be typed by hand. */
export function formatSecret(secret: string): string {
  return secret
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/(.{4})(?=.)/g, '$1 ');
}

/** PNG data URL of the QR for an otpauth URI (CSP allows `img-src data:`). */
export async function totpQrDataUrl(uri: string): Promise<string> {
  if (!isTotpUri(uri)) throw new Error('invalid otpauth uri');
  const { toDataURL } = await import('qrcode');
  return toDataURL(uri, { errorCorrectionLevel: 'M', margin: 1, width: 220 });
}

/** Strips a one-time secret (`?token=`) from the address bar so it does not linger in history. */
export function consumeUrlToken(name = 'token'): string | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const value = url.searchParams.get(name);
  if (value !== null) {
    url.searchParams.delete(name);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
  return value && value.trim() ? value.trim() : null;
}
