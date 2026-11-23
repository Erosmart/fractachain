import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { NotConfiguredError, UnauthenticatedError } from '../../shared/errors';

export interface VerifiedGoogleIdentity {
  uid: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export interface IIdentityTokenVerifier {
  readonly configured: boolean;
  verify(idToken: string): Promise<VerifiedGoogleIdentity>;
}

/** Google's public keys for Firebase ID tokens (rotated by Google; cached by jose). */
const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

/**
 * Verifies Firebase Authentication ID tokens server-side.
 *
 * v1 trusted the `{ uid, email }` the browser posted to `/api/auth/firebase`,
 * so anyone could log in as any email — admins included — with one curl.
 * Identity now comes only from a token signed by Google for this project
 * (signature, issuer, audience, expiry and `auth_time` are all checked).
 */
export class FirebaseTokenVerifier implements IIdentityTokenVerifier {
  private readonly jwks = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL), {
    cooldownDuration: 30_000,
    cacheMaxAge: 6 * 3_600_000,
  });

  constructor(private readonly projectId?: string) {}

  get configured(): boolean {
    return Boolean(this.projectId);
  }

  async verify(idToken: string): Promise<VerifiedGoogleIdentity> {
    if (!this.projectId) {
      throw new NotConfiguredError(
        'El ingreso con Google no está configurado en el servidor (FIREBASE_PROJECT_ID). Usá email y contraseña.',
      );
    }
    if (!idToken || typeof idToken !== 'string') throw new UnauthenticatedError('Falta el token de Google');
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(idToken, this.jwks, {
        issuer: `https://securetoken.google.com/${this.projectId}`,
        audience: this.projectId,
        algorithms: ['RS256'],
        clockTolerance: 30,
      }));
    } catch {
      throw new UnauthenticatedError('El token de Google es inválido o venció. Volvé a ingresar.');
    }
    const authTime = typeof payload.auth_time === 'number' ? payload.auth_time : 0;
    if (!payload.sub || authTime * 1000 > Date.now() + 30_000) {
      throw new UnauthenticatedError('El token de Google es inválido');
    }
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (!email) throw new UnauthenticatedError('La cuenta de Google no tiene email');
    return {
      uid: payload.sub,
      email,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      picture: typeof payload.picture === 'string' ? payload.picture : undefined,
    };
  }
}
