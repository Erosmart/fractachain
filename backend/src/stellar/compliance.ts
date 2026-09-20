/**
 * Binds compliance decisions to on-chain authorization.
 *
 * A KYC approval in the admin panel is only half the story. The half that
 * actually enforces anything is the issuer authorizing that holder's trustline:
 * until it happens, `AUTH_REQUIRED` keeps the account unable to receive the
 * token or place an offer for it, and after a revocation the network deletes
 * the holder's open offers on its own.
 *
 * Every function here is best-effort by design. A Horizon outage must not
 * block a compliance officer from recording their decision, so failures are
 * collected and reported rather than thrown — the decision stands in the
 * database and the on-chain leg can be retried with `syncHolderAuthorization`.
 */
import { listListings } from '../admin/listings';
import {
  authorizeHolder,
  deauthorizeHolder,
  getTrustlineState,
  securityAsset,
} from './sdex';

export interface AuthorizationOutcome {
  listingId: string;
  tokenTicker: string;
  /** `skipped` means the investor has not created the trustline yet. */
  result: 'authorized' | 'deauthorized' | 'skipped' | 'failed';
  detail?: string;
}

export interface ComplianceSyncReport {
  address: string;
  enabled: boolean;
  outcomes: AuthorizationOutcome[];
}

/**
 * False in sandbox mode, where no issuer key is configured.
 *
 * Checked up front so the KYC flow can report "recorded, not enforced on-chain"
 * instead of silently pretending the authorization happened.
 */
export function onChainEnforcementEnabled(): boolean {
  return Boolean(process.env.STELLAR_ISSUER_SECRET);
}

/** Listings that have a real issuer account and a token code to authorize. */
function authorizableAssets() {
  return listListings()
    .filter((l) => l.dossier.issuerPublicKey && l.dossier.tokenTicker)
    .map((l) => ({
      listingId: l.id,
      tokenTicker: l.dossier.tokenTicker,
      asset: securityAsset(l.dossier.tokenTicker, l.dossier.issuerPublicKey),
    }));
}

/**
 * Authorizes a holder across every security the platform issues.
 *
 * Skips assets where the investor has no trustline yet: authorizing a
 * non-existent trustline fails, and the investor will pass through
 * `syncHolderAuthorization` again once their wallet opts in.
 */
export async function grantHolderAuthorization(address: string): Promise<ComplianceSyncReport> {
  if (!onChainEnforcementEnabled()) {
    return { address, enabled: false, outcomes: [] };
  }

  const outcomes: AuthorizationOutcome[] = [];
  for (const { listingId, tokenTicker, asset } of authorizableAssets()) {
    try {
      const line = await getTrustlineState(address, asset);
      if (!line.exists) {
        outcomes.push({
          listingId,
          tokenTicker,
          result: 'skipped',
          detail: 'El inversor todavía no creó la trustline',
        });
        continue;
      }
      if (line.authorized) {
        outcomes.push({ listingId, tokenTicker, result: 'authorized', detail: 'Ya estaba autorizada' });
        continue;
      }
      await authorizeHolder(asset, address);
      outcomes.push({ listingId, tokenTicker, result: 'authorized' });
    } catch (err: any) {
      outcomes.push({ listingId, tokenTicker, result: 'failed', detail: err?.message });
    }
  }
  return { address, enabled: true, outcomes };
}

/**
 * Withdraws a holder's authorization everywhere.
 *
 * `allowUnwind` leaves `authorizedToMaintainLiabilities` set, so the holder can
 * still close out open positions but cannot take on new ones. That is the right
 * setting for a KYC that merely expired; a sanctions or fraud revocation should
 * be a hard freeze, which also makes the network pull their offers immediately.
 */
export async function revokeHolderAuthorization(
  address: string,
  opts?: { allowUnwind?: boolean },
): Promise<ComplianceSyncReport> {
  if (!onChainEnforcementEnabled()) {
    return { address, enabled: false, outcomes: [] };
  }

  const outcomes: AuthorizationOutcome[] = [];
  for (const { listingId, tokenTicker, asset } of authorizableAssets()) {
    try {
      const line = await getTrustlineState(address, asset);
      if (!line.exists) {
        outcomes.push({ listingId, tokenTicker, result: 'skipped' });
        continue;
      }
      await deauthorizeHolder(asset, address, { allowUnwind: opts?.allowUnwind });
      outcomes.push({ listingId, tokenTicker, result: 'deauthorized' });
    } catch (err: any) {
      outcomes.push({ listingId, tokenTicker, result: 'failed', detail: err?.message });
    }
  }
  return { address, enabled: true, outcomes };
}

/**
 * Reconciles the ledger against the compliance database for one holder.
 *
 * Needed because the two can drift in normal operation: an investor is
 * approved before creating their trustline, a Horizon call failed mid-sweep, or
 * a KYC expired on a schedule nobody triggered. Safe to run repeatedly.
 */
export async function syncHolderAuthorization(
  address: string,
  approved: boolean,
): Promise<ComplianceSyncReport> {
  return approved
    ? grantHolderAuthorization(address)
    : revokeHolderAuthorization(address, { allowUnwind: true });
}
