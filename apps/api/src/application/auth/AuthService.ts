import crypto from 'crypto';
import type { PublicAccount, SessionPayload, WalletSignaturePayload } from '@fractachain/shared';
import { isWalletEmail, walletEmailFor, type Account } from '../../domain/account/Account';
import type { IAccountRepository } from '../../domain/account/AccountRepository';
import { isStellarPublicKey } from '../../domain/stellar/StellarAddress';
import { ConflictError, UnauthenticatedError, ValidationError } from '../../shared/errors';
import type { IClock } from '../../shared/clock';
import type { IIdentityTokenVerifier } from '../../infrastructure/security/FirebaseTokenVerifier';
import { PasswordPolicy, type IPasswordHasher } from '../../infrastructure/security/PasswordHasher';
import type { ITokenService } from '../../infrastructure/security/TokenService';
import type { IWalletSignatureVerifier } from '../../infrastructure/security/WalletSignatureVerifier';
import type { AccountService } from '../account/AccountService';
import type { AccountBootstrapper } from '../account/AccountBootstrapper';

/** Post-login wallet provisioning (Friendbot, USDC grant…), implemented by `WalletService`. */
export interface IWalletHydrator {
  hydrate(accountId: string): Promise<PublicAccount | undefined>;
}

export interface AuthPolicyOptions {
  /** New accounts start KYC-approved (hackathon demo). */
  autoApproveNewAccounts: boolean;
}

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
    private readonly clock: IClock,
    private readonly options: AuthPolicyOptions,
  ) {}

  /** Resolves a Bearer token to its account, or `undefined` if invalid, expired or revoked. */
  authenticate(token?: string | null): Account | undefined {
    if (!token) return undefined;
    const claims = this.tokens.verify(token);
    return claims ? this.repo.findById(claims.sub) : undefined;
  }

  logout(token?: string | null): boolean {
    return token ? this.tokens.revoke(token) : false;
  }

  /** Sign in, or register when the email is new. */
  async loginWithEmail(input: { email: string; password: string; name?: string }): Promise<SessionPayload> {
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
    const session = this.issue(account);
    void this.hydrator.hydrate(account.id).catch(() => undefined);
    return session;
  }

  /** Google sign-in: identity is taken from the verified Firebase ID token only. */
  async loginWithFirebase(input: { idToken?: string }): Promise<SessionPayload> {
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
    const session = this.issue(account, 'Autenticación con Firebase completada');
    void this.hydrator.hydrate(account.id).catch(() => undefined);
    return session;
  }

  /** Freighter sign-in: proof of key control via a single-use signed challenge. */
  async loginWithWallet(input: Partial<WalletSignaturePayload>): Promise<SessionPayload> {
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
    const session = this.issue(account);
    const hydrated = await this.hydrator.hydrate(account.id).catch(() => undefined);
    return hydrated ? { ...session, user: hydrated } : session;
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
