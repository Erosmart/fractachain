import crypto from 'crypto';
import type { IClock } from '../../shared/clock';

export type TokenPurpose = 'email-verify' | 'password-reset' | 'two-factor';

export interface SignedTokenClaims {
  purpose: TokenPurpose;
  sub: string;
  exp: number;
  /** Binds the token to state that must not have changed (email, password hash…). */
  bind?: string;
}

/**
 * Short-lived, purpose-bound HMAC tokens for links and challenges (email
 * verification, password reset, 2FA login step). A token for one purpose is
 * never accepted for another, and `bind` makes it single-use in practice: a
 * reset link dies once the password (and so the bound fingerprint) changes.
 */
export class SignedTokenCodec {
  constructor(
    private readonly secret: string,
    private readonly clock: IClock,
  ) {}

  issue(purpose: TokenPurpose, sub: string, ttlMs: number, bind?: string): { token: string; expiresAt: string } {
    const claims: SignedTokenClaims = { purpose, sub, exp: this.clock.now() + ttlMs, ...(bind ? { bind } : {}) };
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return { token: `${body}.${this.mac(purpose, body)}`, expiresAt: new Date(claims.exp).toISOString() };
  }

  /** Returns the claims, or `null` when forged, expired, for another purpose or no longer bound. */
  verify(purpose: TokenPurpose, token: string, currentBind?: (sub: string) => string | undefined): SignedTokenClaims | null {
    const [body, mac] = String(token || '').split('.');
    if (!body || !mac) return null;
    const expected = Buffer.from(this.mac(purpose, body));
    const actual = Buffer.from(mac);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
    let claims: SignedTokenClaims;
    try {
      claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SignedTokenClaims;
    } catch {
      return null;
    }
    if (claims.purpose !== purpose || typeof claims.sub !== 'string' || claims.exp <= this.clock.now()) return null;
    if (claims.bind !== undefined && currentBind && currentBind(claims.sub) !== claims.bind) return null;
    return claims;
  }

  /** Stable short fingerprint of a value (never reversible to it). */
  static fingerprint(value: string | undefined): string {
    return crypto.createHash('sha256').update(value ?? '').digest('base64url').slice(0, 22);
  }

  private mac(purpose: TokenPurpose, body: string): string {
    return crypto.createHmac('sha256', this.secret).update(`fc-link:${purpose}:${body}`).digest('base64url');
  }
}
