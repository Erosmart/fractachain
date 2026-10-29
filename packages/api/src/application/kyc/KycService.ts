import type { PublicAccount } from '@fractachain/shared';
import { isEmailVerified, isWalletEmail, type Account } from '../../domain/account/Account';
import type { IAccountRepository } from '../../domain/account/AccountRepository';
import {
  GafiPolicy,
  isArgentinaBusinessHours,
  type IKycRecordRepository,
  type KycRecord,
  type KycReviewStatus,
} from '../../domain/kyc/KycRecord';
import { ConflictError, DomainError, ForbiddenError, NotFoundError, ValidationError, errorMessage } from '../../shared/errors';
import type { ILogger } from '../../shared/logger';
import type { LicitacionContract } from '../../infrastructure/stellar/LicitacionContract';
import type { ISelfieStorage, StoredImage } from '../../infrastructure/storage/SelfieStorage';
import type { AccountService } from '../account/AccountService';
import type { AdminPolicy } from '../account/AdminPolicy';
import type { ComplianceService } from '../compliance/ComplianceService';
import type { ListingLedger } from '../listing/ListingLedger';

export interface KycPolicyOptions {
  /** No KYC provider exists behind the form on testnet: approve on submit. */
  autoApprove: boolean;
  /** Refuse approvals outside Argentine banking hours. */
  enforceBusinessHours: boolean;
  /** Email/password accounts must confirm their address before submitting KYC. */
  requireEmailVerification: boolean;
}

export interface OnboardingKycInput {
  legalName: string;
  cuit: string;
  selfieDataUrl?: string;
  email?: string;
}

export interface KycQueueRow {
  id: string;
  fullName: string;
  docType: 'CUIT' | 'DNI';
  docNumber: string;
  country: string;
  walletAddress: string;
  userType: 'INVESTOR';
  status: KycReviewStatus;
  isGafiHighRisk: boolean;
  createdAt: string;
  selfieUrl?: string;
  userId?: string;
  email: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * KYC: investor onboarding, the compliance review queue and its on-chain
 * consequences (contract whitelisting, trustline authorization).
 *
 * v1 kept review records in a process array (lost on restart, so approvals
 * after a redeploy silently skipped the on-chain authorization) next to the
 * account status. Records are persisted now and the account status is always
 * updated alongside them.
 */
export class KycService {
  constructor(
    private readonly repo: IAccountRepository,
    private readonly accounts: AccountService,
    private readonly records: IKycRecordRepository,
    private readonly selfies: ISelfieStorage,
    private readonly compliance: ComplianceService,
    private readonly licitacion: LicitacionContract,
    private readonly listings: ListingLedger,
    private readonly admins: AdminPolicy,
    private readonly options: KycPolicyOptions,
    private readonly logger: ILogger,
  ) {}

  async submitOnboarding(accountId: string, input: OnboardingKycInput): Promise<PublicAccount> {
    const account = this.accounts.require(accountId);
    if (!account.custodyMode) throw new DomainError('Elegí primero el tipo de custodia');
    if (this.options.requireEmailVerification && account.authProvider === 'email' && !isEmailVerified(account)) {
      throw new ForbiddenError('Confirmá tu email antes de enviar el KYC (revisá tu casilla o pedí un nuevo link).', 'EMAIL_NOT_VERIFIED');
    }
    const legalName = String(input.legalName || '').trim();
    const cuitDigits = String(input.cuit || '').replace(/[^\d]/g, '');
    if (cuitDigits.length < 10 || cuitDigits.length > 11) throw new ValidationError('CUIT inválido');
    if (!legalName) throw new ValidationError('Falta el nombre');

    // Wallet-only accounts have no real email yet: the KYC form collects it
    // (the selfie is optional for them, mandatory for everyone else).
    if (account.authProvider === 'wallet') {
      const email = String(input.email || '').trim().toLowerCase();
      if (!EMAIL_RE.test(email) || isWalletEmail(email)) throw new ValidationError('Email inválido');
      // An admin address can never be claimed through the KYC form.
      if (this.admins.isAdminEmail(email)) throw new ForbiddenError('Ese email está reservado');
      const clash = this.repo.findByEmail(email);
      if (clash && clash.id !== account.id) throw new ConflictError('Ese email ya tiene una cuenta');
      account.email = email;
    } else if (!input.selfieDataUrl) {
      throw new ValidationError('Falta la foto');
    }
    if (input.selfieDataUrl) account.selfiePath = this.selfies.save(account.id, input.selfieDataUrl);

    account.legalName = legalName;
    account.name = legalName;
    account.cuit = String(input.cuit).trim();
    account.kycStatus = this.options.autoApprove ? 'APPROVED' : 'PENDING';
    account.kycId = account.kycId || `kyc-${account.id}`;
    this.repo.save(account);

    this.records.upsert({
      ...(this.records.findById(account.kycId) ?? {}),
      id: account.kycId,
      userId: account.id,
      fullName: legalName,
      documentNumber: account.cuit,
      taxId: account.cuit,
      countryCode: 32,
      countryName: 'Argentina',
      address: 'Onboarding in-app',
      investorType: 'National',
      stellarAddress: account.publicKey,
      documentFrontUrl: '',
      selfieUrl: `/api/kyc/selfie/${account.id}`,
      status: account.kycStatus === 'APPROVED' ? 'APPROVED' : 'PENDING',
      createdAt: this.records.findById(account.kycId)?.createdAt ?? new Date().toISOString(),
      ...(account.kycStatus === 'APPROVED' ? { reviewedAt: new Date().toISOString() } : {}),
    });

    if (account.kycStatus === 'APPROVED' && account.publicKey) {
      void this.whitelistOnLiveOfferings(account.publicKey);
    }
    return this.accounts.toPublic(account);
  }

  /** Review queue for the compliance desk. */
  queue(status?: string): KycQueueRow[] {
    const filter = status?.toUpperCase();
    const seen = new Set<string>();
    const rows: KycQueueRow[] = [];
    for (const u of this.accounts.list()) {
      if (u.kycStatus === 'UNREGISTERED') continue;
      const id = u.kycId || u.id;
      seen.add(id);
      rows.push({
        id,
        fullName: u.legalName || u.name,
        docType: 'CUIT',
        docNumber: u.cuit || '',
        country: 'Argentina',
        walletAddress: u.publicKey,
        userType: 'INVESTOR',
        status: u.kycStatus === 'APPROVED' ? 'APPROVED' : u.kycStatus === 'REJECTED' ? 'REJECTED' : u.kycStatus === 'REVOKED' ? 'REVOKED' : 'PENDING',
        isGafiHighRisk: false,
        createdAt: u.createdAt,
        selfieUrl: u.selfiePath ? `/api/kyc/selfie/${u.id}` : undefined,
        userId: u.id,
        email: u.email,
      });
    }
    for (const r of this.records.list()) {
      if (seen.has(r.id) || (r.userId && rows.some((x) => x.userId === r.userId))) continue;
      rows.push({
        id: r.id,
        fullName: r.fullName,
        docType: r.taxId ? 'CUIT' : 'DNI',
        docNumber: r.taxId || r.documentNumber,
        country: r.countryName,
        walletAddress: r.stellarAddress,
        userType: 'INVESTOR',
        status: r.status,
        isGafiHighRisk: GafiPolicy.isBlacklisted(r.countryCode),
        createdAt: r.createdAt,
        selfieUrl: r.selfieUrl || undefined,
        userId: r.userId,
        email: '',
      });
    }
    return rows
      .filter((r) => !filter || filter === 'ALL' || r.status === filter)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }

  get(id: string): KycRecord {
    const record = this.records.findById(id);
    if (!record) throw new NotFoundError('KYC no encontrado');
    return record;
  }

  /** Manual registration by compliance (with the FATF auto-reject). */
  register(input: Omit<KycRecord, 'id' | 'status' | 'createdAt'> & { id?: string }): KycRecord {
    if (GafiPolicy.isBlacklisted(input.countryCode)) {
      throw new DomainError(
        `Registro denegado automáticamente: El país ${input.countryName} integra la Lista de Alto Riesgo del GAFI (FATF Blacklist).`,
      );
    }
    const record: KycRecord = {
      ...input,
      id: input.id || `kyc-${Date.now()}`,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    if (this.records.findById(record.id)) throw new ConflictError('Ya existe una solicitud con ese id');
    this.records.upsert(record);
    return record;
  }

  approve(id: string) {
    if (this.options.enforceBusinessHours && !isArgentinaBusinessHours()) {
      throw new DomainError(
        'Autorización on-chain bloqueada fuera del horario laboral argentino (Lunes a Viernes 08:00 a 16:00 ART). Medida de seguridad anti-compromiso.',
      );
    }
    const { account, record } = this.decide(id, 'APPROVED', 'APPROVED');
    const address = account?.publicKey || record?.stellarAddress;
    if (address) {
      // On-chain half of the approval. Fire-and-forget: the decision is
      // recorded; a Horizon hiccup is recoverable via compliance/sync.
      void this.compliance.grant(address).catch((err) => this.logger.warn('grant on-chain falló', { err: errorMessage(err) }));
      void this.whitelistOnLiveOfferings(address);
    }
    return { success: true as const, user: account ? this.accounts.toPublic(account) : undefined, record };
  }

  reject(id: string, reason?: string) {
    const { account, record } = this.decide(id, 'REJECTED', 'REJECTED', reason || 'Documentación ilegible o inconsistente');
    return { success: true as const, user: account ? this.accounts.toPublic(account) : undefined, record };
  }

  /** Hard freeze: the network also pulls the holder's open offers. */
  revoke(id: string, reason?: string) {
    const { account, record } = this.decide(id, 'REVOKED', 'REVOKED', reason || 'Revocación preventiva por compliance');
    const address = account?.publicKey || record?.stellarAddress;
    if (address) {
      void this.compliance
        .revoke(address, { allowUnwind: false })
        .catch((err) => this.logger.warn('revoke on-chain falló', { err: errorMessage(err) }));
    }
    return { success: true as const, user: account ? this.accounts.toPublic(account) : undefined, record };
  }

  /** Selfies are personal data: only an admin or the account owner may read them. */
  selfieFor(accountId: string, requester: Account): StoredImage {
    if (requester.id !== accountId && !this.accounts.isAdmin(requester)) {
      throw new ForbiddenError('Solo el titular o un administrador pueden ver esta imagen');
    }
    const owner = this.accounts.get(accountId);
    const image = this.selfies.read(owner?.selfiePath);
    if (!image) throw new NotFoundError('Imagen no encontrada');
    return image;
  }

  private decide(id: string, accountStatus: 'APPROVED' | 'REJECTED' | 'REVOKED', recordStatus: KycReviewStatus, reason?: string) {
    const record = this.records.findById(id);
    const account = (record?.userId && this.accounts.get(record.userId)) || this.repo.findByKycId(id);
    if (!record && !account) throw new NotFoundError('Solicitud no encontrada');
    const now = new Date().toISOString();
    if (record) {
      record.status = recordStatus;
      record.reviewedAt = now;
      if (reason) record.rejectionReason = reason;
      if (recordStatus === 'APPROVED') record.expiresAt = new Date(Date.now() + 365 * 86_400_000).toISOString();
      this.records.upsert(record);
    }
    if (account) {
      account.kycStatus = accountStatus;
      this.repo.save(account);
    }
    return { account: account || undefined, record };
  }

  private async whitelistOnLiveOfferings(publicKey: string): Promise<void> {
    for (const listing of this.listings.list()) {
      if (!this.listings.isOnChain(listing)) continue;
      try {
        await this.licitacion.verifyInvestor(listing, publicKey);
      } catch (err) {
        this.logger.warn('verify_investor falló', { listingId: listing.id, err: errorMessage(err) });
      }
    }
  }
}
