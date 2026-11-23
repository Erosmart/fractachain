/**
 * Binds compliance decisions to on-chain authorization.
 *
 * A KYC approval in the admin panel is half the story; the half that enforces
 * anything is the issuer authorizing the holder's trustline. Until then
 * `AUTH_REQUIRED` keeps the account unable to receive or offer the token, and
 * after a revocation the network deletes the holder's open offers itself.
 *
 * Best-effort by design: a Horizon outage must not block an officer from
 * recording a decision, so failures are reported per asset and the on-chain
 * leg can be retried with `sync`.
 */
import type { Asset } from '@stellar/stellar-sdk';
import { errorMessage } from '../../shared/errors';
import type { PlatformKeyring } from '../../infrastructure/stellar/PlatformKeyring';
import { securityAsset, type SdexGateway } from '../../infrastructure/stellar/SdexGateway';
import type { ListingLedger } from '../listing/ListingLedger';

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

export class ComplianceService {
  constructor(
    private readonly listings: ListingLedger,
    private readonly sdex: SdexGateway,
    private readonly keyring: PlatformKeyring,
  ) {}

  /** False in sandbox mode (no issuer key): the flow reports "recorded, not enforced". */
  enforcementEnabled(): boolean {
    return this.keyring.hasIssuerKey();
  }

  private authorizableAssets(): { listingId: string; tokenTicker: string; asset: Asset }[] {
    return this.listings
      .list()
      .filter((l) => l.dossier.issuerPublicKey && l.dossier.tokenTicker)
      .flatMap((l) => {
        try {
          return [
            {
              listingId: l.id,
              tokenTicker: l.dossier.tokenTicker,
              asset: securityAsset(l.dossier.tokenTicker, l.dossier.issuerPublicKey),
            },
          ];
        } catch {
          return [];
        }
      });
  }

  /** Authorizes a holder on every security; trustlines that do not exist yet are skipped. */
  async grant(address: string): Promise<ComplianceSyncReport> {
    if (!this.enforcementEnabled()) return { address, enabled: false, outcomes: [] };
    const assets = this.authorizableAssets();
    const states = await this.sdex.trustlineStates(
      address,
      assets.map((a) => a.asset),
    );
    const outcomes: AuthorizationOutcome[] = [];
    // Sequential on purpose: every authorization is a tx from the same issuer sequence.
    for (let i = 0; i < assets.length; i++) {
      const { listingId, tokenTicker, asset } = assets[i];
      const line = states[i];
      try {
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
        await this.sdex.authorizeHolder(asset, address);
        outcomes.push({ listingId, tokenTicker, result: 'authorized' });
      } catch (err) {
        outcomes.push({ listingId, tokenTicker, result: 'failed', detail: errorMessage(err) });
      }
    }
    return { address, enabled: true, outcomes };
  }

  /**
   * Withdraws authorization everywhere. `allowUnwind` (lapsed KYC) lets the
   * holder close positions; a sanctions/fraud revocation is a hard freeze.
   */
  async revoke(address: string, opts?: { allowUnwind?: boolean }): Promise<ComplianceSyncReport> {
    if (!this.enforcementEnabled()) return { address, enabled: false, outcomes: [] };
    const assets = this.authorizableAssets();
    const states = await this.sdex.trustlineStates(
      address,
      assets.map((a) => a.asset),
    );
    const outcomes: AuthorizationOutcome[] = [];
    for (let i = 0; i < assets.length; i++) {
      const { listingId, tokenTicker, asset } = assets[i];
      try {
        if (!states[i].exists) {
          outcomes.push({ listingId, tokenTicker, result: 'skipped' });
          continue;
        }
        await this.sdex.deauthorizeHolder(asset, address, { allowUnwind: opts?.allowUnwind });
        outcomes.push({ listingId, tokenTicker, result: 'deauthorized' });
      } catch (err) {
        outcomes.push({ listingId, tokenTicker, result: 'failed', detail: errorMessage(err) });
      }
    }
    return { address, enabled: true, outcomes };
  }

  /** Reconciles the ledger with the compliance decision for one holder. Idempotent. */
  sync(address: string, approved: boolean): Promise<ComplianceSyncReport> {
    return approved ? this.grant(address) : this.revoke(address, { allowUnwind: true });
  }
}
