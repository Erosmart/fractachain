import crypto from 'crypto';
import type { LoginPayload, PublicAccount, SessionPayload, TwoFactorChallengePayload, WalletSignaturePayload } from '@fractachain/shared';
import { hasTwoFactor, isWalletEmail, walletEmailFor, type Account } from '../../domain/account/Account';
import type { IAccountRepository } from '../../domain/account/AccountRepository';
import { isStellarPublicKey } from '../../domain/stellar/StellarAddress';
import { ConflictError, UnauthenticatedError, ValidationError } from '../../shared/errors';
import type { IClock } from '../../shared/clock';
import type { IIdentityTokenVerifier } from '../../infrastructure/security/FirebaseTokenVerifier';
import { PasswordPolicy, type IPasswordHasher } from '../../infrastructure/security/PasswordHasher';
import type { ITokenService } from '../../infrastructure/security/TokenService';
import type { SignedTokenCodec } from '../../infrastructure/security/SignedTokens';
import type { IWalletSignatureVerifier } from '../../infrastructure/security/WalletSignatureVerifier';
import type { AccountService } from '../account/AccountService';
import type { AccountBootstrapper } from '../account/AccountBootstrapper';
import type { TwoFactorService } from '../security/TwoFactorService';

/** Post-login wallet provisioning (Friendbot, USDC grant…), implemented by `WalletService`. */
export interface IWalletHydrator {
  hydrate(accountId: string): Promise<PublicAccount | undefined>;
}

export interface AuthPolicyOptions {
  /** New accounts start KYC-approved (hackathon demo). */
  autoApproveNewAccounts: boolean;
}

/** Reacts to a new email/password registration (sends the verification link). */
export interface IRegistrationListener {
  onEmailRegistered(account: Account): Promise<void>;
}

/** The 2FA login step is valid for 5 minutes. */
const TWO_FACTOR_CHALLENGE_TTL_MS = 5 * 60_000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVALID_CREDENTIALS = 'Email o contraseña incorrectos';

/**
 * Authentication use cases: email/password, Google (Firebase ID token),
 * Freighter signature, session resolution and logout.
 *
 * Security notes vs v1:
 * - An existing account with no password (created via Google or wallet) can
 *   no longer be "claimed" by posting its email with any password.
 * - Google identity comes only from a verified Firebase ID token.
 * - Passwords are scrypt-hashed; legacy SHA-256 hashes upgrade on login.
 * - Sessions expire and logout revokes them server-side.
 */
export class AuthService {
  constructor(
    private readonly repo: IAccountRepository,
    private readonly accounts: AccountService,
    private readonly bootstrapper: AccountBootstrapper,
    private readonly hasher: IPasswordHasher,
    private readonly tokens: ITokenService,
    private readonly identity: IIdentityTokenVerifier,
    private readonly walletSignatures: IWalletSignatureVerifier,
    private readonly hydrator: IWalletHydrator,
    private readonly twoFactor: TwoFactorService,
    private readonly challenges: SignedTokenCodec,
    private readonly registration: IRegistrationListener,
    private readonly clock: IClock,
    private readonly options: AuthPolicyOptions,
  ) {}

  /** Resolves a session token to its account, or `undefined` if invalid, expired or revoked. */
  authenticate(token?: string | null): Account | undefined {
    if (!token) return undefined;
    const claims = this.tokens.verify(token);
    if (!claims) return undefined;
    const account = this.repo.findById(claims.sub);
    // "Cerrar todas las sesiones" / password reset: older tokens are dead.
    if (!account || (account.sessionsRevokedAt && claims.iat < account.sessionsRevokedAt)) return undefined;
    return account;
  }

  logout(token?: string | null): boolean {
    return token ? this.tokens.revoke(token) : false;
  }

  /** Signs out every device (keeps the account usable with a fresh login). */
  revokeAllSessions(accountId: string): void {
    const account = this.accounts.require(accountId);
    account.sessionsRevokedAt = this.clock.now();
    this.repo.save(account);
  }

  /** Second login step: the challenge from the first step plus a TOTP or recovery code. */
  verifyTwoFactor(challenge: string, code: string): SessionPayload {
    const claims = this.challenges.verify('two-factor', challenge);
    if (!claims) throw new UnauthenticatedError('El paso de verificación venció. Ingresá de nuevo.');
    const account = this.accounts.require(claims.sub);
    if (!this.twoFactor.verify(account, code)) throw new UnauthenticatedError('Código incorrecto');
    return this.issue(account);
  }

  /** Session for an account that just proved itself another way (password reset link). */
  sessionFor(accountId: string): LoginPayload {
    return this.complete(this.accounts.require(accountId));
  }

  /** Sign in, or register when the email is new. */
  async loginWithEmail(input: { email: string; password: string; name?: string }): Promise<LoginPayload> {
    const email = String(input.email || '').trim().toLowerCase();
    const password = String(input.password || '');
    if (!EMAIL_RE.test(email) || isWalletEmail(email)) throw new ValidationError('Email inválido');
    if (!password) throw new ValidationError('Email y contraseña requeridos');
    if (password.length > PasswordPolicy.MAX_LENGTH) throw new UnauthenticatedError(INVALID_CREDENTIALS);

    let account = this.repo.findByEmail(email);
    if (!account) {
      const problem = PasswordPolicy.assertAcceptable(password);
      if (problem) throw new ValidationError(problem);
      account = this.newAccount({
        email,
        name: input.name?.trim() || email.split('@')[0],
        authProvider: 'email',
        passwordHash: await this.hasher.hash(password),
      });
      this.repo.insert(account);
      void this.registration.onEmailRegistered(account).catch(() => undefined);
    } else {
      if (!account.passwordHash) {
        // v1 let anyone set a password here and take the account over.
        throw new UnauthenticatedError('Esta cuenta ingresa con Google o con su wallet. Usá ese método.');
      }
      const check = await this.hasher.verify(password, account.passwordHash);
      if (!check.valid) throw new UnauthenticatedError(INVALID_CREDENTIALS);
      if (check.needsRehash) account.passwordHash = await this.hasher.hash(password);
      account.lastLoginAt = this.clock.isoNow();
      if (input.name?.trim()) account.name = input.name.trim();
    }
    this.bootstrapper.ensureAdminPrivileges(account);
    this.repo.save(account);
    void this.hydrator.hydrate(account.id).catch(() => undefined);
    return this.complete(account);
  }

  /** Google sign-in: identity is taken from the verified Firebase ID token only. */
  async loginWithFirebase(input: { idToken?: string }): Promise<LoginPayload> {
    const identity = await this.identity.verify(String(input.idToken || ''));
    if (!identity.emailVerified) {
      throw new UnauthenticatedError('El email de la cuenta de Google no está verificado');
    }
    let account = this.repo.findByEmail(identity.email);
    if (!account) {
      account = this.newAccount({
        id: /^[A-Za-z0-9_-]{6,128}$/.test(identity.uid) ? identity.uid : undefined,
        email: identity.email,
        name: identity.name || identity.email.split('@')[0],
        avatar: identity.picture,
        authProvider: 'firebase-google',
      });
      this.repo.insert(account);
    } else {
      account.lastLoginAt = this.clock.isoNow();
      account.authProvider = 'firebase-google';
      if (identity.name) account.name = identity.name;
      if (identity.picture) account.avatar = identity.picture;
    }
    this.bootstrapper.ensureAdminPrivileges(account);
    this.repo.save(account);
    void this.hydrator.hydrate(account.id).catch(() => undefined);
    return this.complete(account, 'Autenticación con Firebase completada');
  }

  /** Freighter sign-in: proof of key control via a single-use signed challenge. */
  async loginWithWallet(input: Partial<WalletSignaturePayload>): Promise<LoginPayload> {
    const publicKey = String(input.publicKey || '');
    const reason = this.walletSignatures.verify('login', publicKey, String(input.message || ''), String(input.signature || ''));
    if (reason) throw new UnauthenticatedError(reason);

    const email = walletEmailFor(publicKey);
    let account = this.repo.findByEmail(email) ?? this.repo.findByPublicKey(publicKey);
    if (!account) {
      account = this.newAccount({
        email,
        name: `Wallet ${publicKey.slice(0, 6)}…${publicKey.slice(-4)}`,
        authProvider: 'wallet',
        custodyMode: 'SELF',
        publicKey,
        kycStatus: 'UNREGISTERED',
      });
      this.repo.insert(account);
    } else {
      account.lastLoginAt = this.clock.isoNow();
      if (!account.publicKey) account.publicKey = publicKey;
      if (!account.custodyMode) account.custodyMode = 'SELF';
    }
    this.bootstrapper.ensureAdminPrivileges(account);
    this.repo.save(account);
    const hydrated = await this.hydrator.hydrate(account.id).catch(() => undefined);
    const result = this.complete(account);
    return hydrated && 'user' in result ? { ...result, user: hydrated } : result;
  }

  /** Links a Freighter wallet to the signed-in account (proof of key control first). */
  async linkWallet(accountId: string, input: Partial<WalletSignaturePayload>): Promise<{ success: true; user: PublicAccount }> {
    const publicKey = String(input.publicKey || '');
    const reason = this.walletSignatures.verify('link', publicKey, String(input.message || ''), String(input.signature || ''));
    if (reason) throw new ValidationError(reason);
    const account = this.accounts.require(accountId);
    if (!isStellarPublicKey(publicKey)) throw new ValidationError('Public key Stellar inválida');
    if (account.publicKey && account.publicKey !== publicKey) {
      throw new ConflictError('La cuenta ya tiene otra wallet vinculada');
    }
    const owner = this.repo.findByPublicKey(publicKey);
    if (owner && owner.id !== account.id) throw new ConflictError('Esa wallet ya está vinculada a otra cuenta');
    account.custodyMode = 'SELF';
    account.publicKey = publicKey;
    account.authProvider = account.authProvider || 'wallet';
    this.repo.save(account);
    const hydrated = await this.hydrator.hydrate(account.id).catch(() => undefined);
    return { success: true, user: hydrated ?? this.accounts.toPublic(account) };
  }

  /** Credentials accepted: a session, or the 2FA challenge when the account has a second factor. */
  private complete(account: Account, message?: string): LoginPayload {
    if (!hasTwoFactor(account)) return this.issue(account, message);
    const { token, expiresAt } = this.challenges.issue('two-factor', account.id, TWO_FACTOR_CHALLENGE_TTL_MS);
    const challenge: TwoFactorChallengePayload = { success: true, twoFactorRequired: true, challenge: token, expiresAt };
    return challenge;
  }

  private issue(account: Account, message?: string): SessionPayload {
    const issued = this.tokens.issue(account.id);
    return {
      success: true,
      token: issued.token,
      expiresAt: issued.expiresAt,
      user: this.accounts.toPublic(account),
      ...(message ? { message } : {}),
    };
  }

  private newAccount(fields: Partial<Account> & Pick<Account, 'email' | 'name'>): Account {
    const now = this.clock.isoNow();
    return {
      id: fields.id ?? `usr_${crypto.randomBytes(8).toString('hex')}`,
      avatar: '',
      custodyMode: null,
      publicKey: '',
      kycStatus: this.options.autoApproveNewAccounts ? 'APPROVED' : 'UNREGISTERED',
      holdings: [],
      trustlines: [],
      cashUsdc: 50_000,
      createdAt: now,
      lastLoginAt: now,
      ...fields,
    } as Account;
  }
}
