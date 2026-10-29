import type {
  CompanyDossier,
  Listing,
  ListingStatus,
  PaymentKind,
  PoolStatus,
  SettlePolicy,
} from '@fractachain/shared';
import { DomainError, ValidationError } from '../../shared/errors';
import { DAY_MS } from '../../shared/numbers';
import { isContractId, isStellarPublicKey } from '../stellar/StellarAddress';

export type { CompanyDossier, Listing, ListingStatus, PaymentKind, PoolStatus, SettlePolicy };

export interface SettleChoice {
  settlePolicy?: SettlePolicy;
  settleAt?: string;
}

const REQUIRED_FIELDS: (keyof CompanyDossier)[] = [
  'legalName',
  'cuit',
  'ticker',
  'tokenTicker',
  'isin',
  'cajaSubaccount',
  'custodianCuit',
  'cnvRecordId',
  'legalTermsUri',
  'estatutoHash',
  'auditor',
  'proceedsWallet',
];

/**
 * Validates an issuance dossier before anything is deployed against it.
 *
 * The proceeds wallet is where the raise is paid on-chain, so a typo sends
 * the whole offering somewhere unrecoverable: the checksum is validated, not
 * just presence.
 */
export class DossierValidator {
  static assertComplete(d: CompanyDossier): void {
    const missing: string[] = [];
    for (const field of REQUIRED_FIELDS) {
      if (!String(d[field] ?? '').trim()) missing.push(field);
    }
    if (d.proceedsWallet && !isStellarPublicKey(d.proceedsWallet.trim())) {
      throw new ValidationError(
        'La wallet que recibe la licitación no es una dirección Stellar válida (debe empezar con G)',
      );
    }
    if (d.proceedsWallet && d.issuerPublicKey && d.proceedsWallet.trim() === d.issuerPublicKey.trim()) {
      throw new ValidationError(
        'La wallet que cobra no puede ser la cuenta emisora: el emisor de un activo no puede mantener saldo propio del token',
      );
    }
    if (!d.sharesToTokenize || d.sharesToTokenize <= 0) missing.push('sharesToTokenize');
    if (!d.pricePerShareUsdc || d.pricePerShareUsdc <= 0) missing.push('pricePerShareUsdc');
    if (!d.offeringHardCapUsdc || d.offeringHardCapUsdc <= 0) missing.push('offeringHardCapUsdc');
    if (d.offeringSoftCapUsdc > d.offeringHardCapUsdc) {
      throw new ValidationError('Soft cap no puede ser mayor que hard cap');
    }
    if (missing.length) {
      throw new ValidationError('Falta información para salir a la bolsa: ' + missing.join(', '));
    }
    if (d.cuit.replace(/[^\d]/g, '').length < 10) throw new ValidationError('CUIT inválido');
  }
}

/** When the offering closes: an explicit settle date, else listing date + offering days. */
export function listingDeadline(listing: Listing): Date | null {
  if (listing.settleAt) return new Date(listing.settleAt);
  if (listing.listedAt) {
    return new Date(new Date(listing.listedAt).getTime() + listing.dossier.offeringDays * DAY_MS);
  }
  return null;
}

export function poolStatus(listing: Listing): PoolStatus {
  if (listing.status === 'LISTED') return 'OPEN';
  if (listing.status === 'CLOSED_SUCCESS') return 'SUCCESSFUL';
  if (listing.status === 'CLOSED_FAILED') return 'FAILED';
  return 'SETTLED';
}

export function assertListed(listing: Listing): void {
  if (listing.status !== 'LISTED') throw new DomainError('La licitación no está abierta');
}

/** Payment asset the offering bills in — frozen in the contract at `initialize`. */
export function paymentUnit(listing: Listing): 'XLM' | 'USDC' {
  return listing.dossier.paymentKind === 'XLM' ? 'XLM' : 'USDC';
}

/**
 * A listing is on-chain when it has a live Soroban licitación instance. USDC
 * offerings count too: the payment token was frozen in the contract at init.
 */
export function isOnChainListing(listing: Listing): boolean {
  return isContractId(listing.licitacionContract);
}
