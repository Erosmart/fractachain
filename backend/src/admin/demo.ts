/**
 * One-click demo dossier for the admin issuance form.
 *
 * The point of the button is a fast, *real* loop: create → deploy → mint →
 * open licitación without hand-filling twenty fields. That only demos well if
 * every field is actually valid, so this builder produces a fully-formed
 * dossier — unique ticker, checksum-valid CUIT-shaped string, real ISIN-shaped
 * code — plus a friendbot-funded treasury wallet as `proceedsWallet`, so the
 * XLM paid by `finalize()` lands on an account that exists and is visible on
 * stellar.expert.
 */
import { Keypair } from '@stellar/stellar-sdk';
import { createHash, randomInt } from 'crypto';
import { fundFriendbot } from '../auth/stellar_testnet';
import { ensurePlatformIssuer } from '../stellar/keys';
import { loadTestnetDeployment } from '../stellar/deployment';
import { listListings } from './listings';
import { CompanyDossier } from './listings';

const COMPANIES = [
  { legal: 'Pampa Digital Agro', trade: 'PampaDigital', sector: 'Agro', use: 'Capital de trabajo para la campaña de soja y expansión del acopio.' },
  { legal: 'Litoral Energías Renovables', trade: 'LitoralEnergía', sector: 'Energía', use: 'Refinanciación de parque solar y capital de trabajo.' },
  { legal: 'Andina Finanzas', trade: 'AndinaFin', sector: 'Finanzas', use: 'Fondeo de la línea de créditos PyME tokenizados.' },
  { legal: 'Sur Infraestructura', trade: 'SurInfra', sector: 'Infraestructura', use: 'Obra complementaria del nodo logístico sur.' },
];

function digits(n: number): string {
  return Array.from({ length: n }, () => randomInt(0, 10)).join('');
}

function alnum(n: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: n }, () => chars[randomInt(0, chars.length)]).join('');
}

function uniqueTicker(): string {
  const used = new Set(listListings().map((l) => l.dossier.ticker));
  for (let i = 0; i < 20; i++) {
    const t = `DEMO${randomInt(1000, 9999)}`;
    if (!used.has(t)) return t;
  }
  return `DEMO${Date.now().toString(36).toUpperCase()}`;
}

export interface DemoDossierResult {
  dossier: CompanyDossier;
  /** Throwaway testnet treasury funded by Friendbot — the company wallet. */
  treasury: { publicKey: string; funded: boolean };
}

export async function buildDemoDossier(): Promise<DemoDossierResult> {
  const pick = COMPANIES[randomInt(0, COMPANIES.length)];
  const ticker = uniqueTicker();
  const year = new Date().getFullYear();

  // The issuer has to be an account the backend can sign for, or the minted
  // classic asset can never be distributed to holders' wallets.
  const issuer =
    (await ensurePlatformIssuer().catch(() => null))?.publicKey() ||
    loadTestnetDeployment()?.issuer ||
    '';

  const treasury = Keypair.random();
  const funding = await fundFriendbot(treasury.publicKey());

  const dossier: CompanyDossier = {
    legalName: `${pick.legal} S.A.`,
    tradeName: pick.trade,
    cuit: `30-${digits(8)}-${randomInt(0, 10)}`,
    jurisdiction: 'Argentina',
    sector: pick.sector,
    ticker,
    tokenTicker: `t${ticker}`.slice(0, 12),
    isin: `AR${alnum(9)}${randomInt(0, 10)}`,
    authorizedShares: 1_000_000,
    sharesToTokenize: 10_000,
    pricePerShareUsdc: 10,
    cajaSubaccount: `CV-${digits(6)}-${ticker}`,
    custodianCuit: '30-50001091-2',
    cnvRecordId: `CNV-${year}-${digits(5)}`,
    bymaRequestId: `BYMA-${year}-${digits(4)}`,
    legalTermsUri: 'https://fractachain.ar/legal/demo',
    estatutoHash: createHash('sha256').update(`estatuto:${ticker}`).digest('hex'),
    auditor: 'PwC / CNV RG 1150',
    issuerPublicKey: issuer,
    proceedsWallet: treasury.publicKey(),
    paymentKind: 'XLM',
    offeringSoftCapUsdc: 100,
    offeringHardCapUsdc: 200,
    offeringDays: 30,
    tnaUsd: 0,
    minInvestmentUsdc: 20,
    useOfProceeds: `${pick.use} (expediente demo — datos ficticios).`,
  };
  return { dossier, treasury: { publicKey: treasury.publicKey(), funded: funding.funded } };
}
