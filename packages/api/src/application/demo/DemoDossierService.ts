/**
 * One-click demo dossier for the admin issuance form.
 *
 * The point is a fast, *real* loop (create → deploy → mint → open) without
 * hand-filling twenty fields, so every field is valid and the company wallet
 * is a Friendbot-funded treasury that exists on testnet. The treasury secret
 * stays in process memory only, so the deploy step can open its USDC
 * trustline; it never reaches storage or a response.
 */
import { Keypair } from '@stellar/stellar-sdk';
import { createHash, randomInt } from 'crypto';
import type { CompanyDossier } from '../../domain/listing/Listing';
import { normalizeAddress } from '../../domain/stellar/StellarAddress';
import type { IFriendbot } from '../../infrastructure/stellar/FriendbotClient';
import type { PlatformKeyring } from '../../infrastructure/stellar/PlatformKeyring';
import type { DeploymentRegistryLike } from '../../infrastructure/stellar/types';
import type { ListingLedger } from '../listing/ListingLedger';

const COMPANIES = [
  {
    legal: 'Pampa Digital Agro',
    trade: 'PampaDigital',
    sector: 'Agro',
    use: 'Capital de trabajo para la campaña de soja y expansión del acopio.',
  },
  {
    legal: 'Litoral Energías Renovables',
    trade: 'LitoralEnergía',
    sector: 'Energía',
    use: 'Refinanciación de parque solar y capital de trabajo.',
  },
  {
    legal: 'Andina Finanzas',
    trade: 'AndinaFin',
    sector: 'Finanzas',
    use: 'Fondeo de la línea de créditos PyME tokenizados.',
  },
  {
    legal: 'Sur Infraestructura',
    trade: 'SurInfra',
    sector: 'Infraestructura',
    use: 'Obra complementaria del nodo logístico sur.',
  },
];

export interface DemoDossierResult {
  dossier: CompanyDossier;
  treasury: { publicKey: string; funded: boolean };
}

/** Lookup of throwaway treasury secrets, used when deploying a demo offering. */
export interface ITreasurySecrets {
  secretFor(publicKey?: string | null): string | undefined;
}

export class DemoDossierService implements ITreasurySecrets {
  private readonly treasurySecrets = new Map<string, string>();

  constructor(
    private readonly listings: ListingLedger,
    private readonly keyring: PlatformKeyring,
    private readonly deployments: DeploymentRegistryLike,
    private readonly friendbot: IFriendbot,
  ) {}

  secretFor(publicKey?: string | null): string | undefined {
    const key = normalizeAddress(publicKey);
    return key ? this.treasurySecrets.get(key) : undefined;
  }

  async build(): Promise<DemoDossierResult> {
    const pick = COMPANIES[randomInt(0, COMPANIES.length)];
    const ticker = this.uniqueTicker();
    const year = new Date().getFullYear();
    const issuer =
      (await this.keyring.ensurePlatformIssuer().catch(() => null))?.publicKey() ||
      this.deployments.load()?.issuer ||
      '';
    const treasury = Keypair.random();
    const funding = await this.friendbot.fund(treasury.publicKey());
    this.treasurySecrets.set(treasury.publicKey(), treasury.secret());

    const dossier: CompanyDossier = {
      legalName: `${pick.legal} S.A.`,
      tradeName: pick.trade,
      cuit: `30-${DemoDossierService.digits(8)}-${randomInt(0, 10)}`,
      jurisdiction: 'Argentina',
      sector: pick.sector,
      ticker,
      tokenTicker: `t${ticker}`.slice(0, 12),
      isin: `AR${DemoDossierService.alnum(9)}${randomInt(0, 10)}`,
      authorizedShares: 1_000_000,
      sharesToTokenize: 10_000,
      pricePerShareUsdc: 10,
      cajaSubaccount: `CV-${DemoDossierService.digits(6)}-${ticker}`,
      custodianCuit: '30-50001091-2',
      cnvRecordId: `CNV-${year}-${DemoDossierService.digits(5)}`,
      bymaRequestId: `BYMA-${year}-${DemoDossierService.digits(4)}`,
      legalTermsUri: 'https://fractachain.ar/legal/demo',
      estatutoHash: createHash('sha256').update(`estatuto:${ticker}`).digest('hex'),
      auditor: 'PwC / CNV RG 1150',
      issuerPublicKey: issuer,
      proceedsWallet: treasury.publicKey(),
      paymentKind: 'USDC',
      offeringSoftCapUsdc: 100,
      offeringHardCapUsdc: 200,
      offeringDays: 30,
      tnaUsd: 0,
      minInvestmentUsdc: 20,
      useOfProceeds: `${pick.use} (expediente demo — datos ficticios).`,
    };
    return { dossier, treasury: { publicKey: treasury.publicKey(), funded: funding.funded } };
  }

  private uniqueTicker(): string {
    const used = new Set(this.listings.list().map((l) => l.dossier.ticker));
    for (let i = 0; i < 20; i++) {
      const t = `DEMO${randomInt(1000, 9999)}`;
      if (!used.has(t)) return t;
    }
    return `DEMO${Date.now().toString(36).toUpperCase()}`;
  }

  private static digits(n: number): string {
    return Array.from({ length: n }, () => randomInt(0, 10)).join('');
  }

  private static alnum(n: number): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: n }, () => chars[randomInt(0, chars.length)]).join('');
  }
}
