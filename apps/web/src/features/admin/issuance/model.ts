import type { Listing } from '@fractachain/shared';
import type { Tone } from '@/components/ui/kit';
import type { NewStockInput } from '@/core/api/types';

/** Blank issuance dossier with the defaults the issuer form starts from. */
export const EMPTY_DOSSIER = {
  legalName: '',
  tradeName: '',
  cuit: '',
  jurisdiction: 'Argentina',
  sector: 'Energía',
  ticker: '',
  tokenTicker: '',
  isin: '',
  authorizedShares: 1000000,
  sharesToTokenize: 10000,
  pricePerShareUsdc: 10,
  cajaSubaccount: '',
  custodianCuit: '30-50001091-2',
  cnvRecordId: '',
  bymaRequestId: '',
  legalTermsUri: 'https://fractachain.ar/legal/',
  estatutoHash: '',
  auditor: 'PwC / CNV RG 1150',
  issuerPublicKey: '',
  proceedsWallet: '',
  paymentKind: 'USDC',
  offeringSoftCapUsdc: 15000,
  offeringHardCapUsdc: 100000,
  offeringDays: 21,
  tnaUsd: 0,
  minInvestmentUsdc: 100,
  useOfProceeds: 'Capital de trabajo y listado primario de acciones tokenizadas.',
};

export type DossierForm = typeof EMPTY_DOSSIER;

type DossierKey = keyof DossierForm;

/** A form field: label is an i18n key; `number` fields are parsed on change. */
export interface DossierField {
  key: DossierKey;
  label: string;
  type?: 'number' | 'textarea';
  mono?: boolean;
}

/** The dossier form, grouped the way compliance reads it. */
export const DOSSIER_GROUPS: readonly { title: string; fields: readonly DossierField[] }[] = [
  {
    title: 'admin.issuance.groupCompany',
    fields: [
      { key: 'legalName', label: 'admIss.f.legalName' },
      { key: 'tradeName', label: 'admIss.f.tradeName' },
      { key: 'cuit', label: 'admIss.f.cuit' },
      { key: 'sector', label: 'admIss.f.sector' },
      { key: 'auditor', label: 'admIss.f.auditor' },
    ],
  },
  {
    title: 'admin.issuance.groupSecurity',
    fields: [
      { key: 'ticker', label: 'admIss.f.ticker' },
      { key: 'tokenTicker', label: 'admIss.f.tokenTicker' },
      { key: 'isin', label: 'admIss.f.isin', mono: true },
      { key: 'cajaSubaccount', label: 'admIss.f.cajaSubaccount' },
      { key: 'cnvRecordId', label: 'admIss.f.cnvRecordId' },
      { key: 'bymaRequestId', label: 'admIss.f.bymaRequestId' },
      { key: 'legalTermsUri', label: 'admIss.f.legalTermsUri' },
      { key: 'estatutoHash', label: 'admIss.f.estatutoHash', mono: true },
      { key: 'issuerPublicKey', label: 'admIss.f.issuerPublicKey', mono: true },
    ],
  },
  {
    title: 'admin.issuance.groupOffering',
    fields: [
      { key: 'sharesToTokenize', label: 'admIss.shares', type: 'number' },
      { key: 'pricePerShareUsdc', label: 'admIss.priceShare', type: 'number' },
      { key: 'minInvestmentUsdc', label: 'admIss.minInvest', type: 'number' },
      { key: 'offeringSoftCapUsdc', label: 'admin.issuance.softCap', type: 'number' },
      { key: 'offeringHardCapUsdc', label: 'admin.issuance.hardCap', type: 'number' },
      { key: 'offeringDays', label: 'admIss.days', type: 'number' },
      { key: 'useOfProceeds', label: 'admIss.f.useOfProceeds', type: 'textarea' },
    ],
  },
];

export const EMPTY_STOCK: NewStockInput = {
  ticker: '',
  tokenTicker: '',
  companyName: '',
  isin: '',
  sector: 'General',
  priceUsdc: 10,
  custodiedShares: 10000,
};

export const STOCK_TEXT_FIELDS = [
  'ticker',
  'tokenTicker',
  'companyName',
  'isin',
  'sector',
] as const satisfies readonly (keyof NewStockInput)[];

/** Cheap shape check before a round-trip; the API validates the checksum. */
export function looksLikeStellarAccount(value: string): boolean {
  const v = value.trim();
  return v.startsWith('G') && v.length >= 56;
}

export function randomDemoStock(): NewStockInput {
  const n = Math.floor(1000 + Math.random() * 9000);
  return {
    ticker: `DEMO${n}`,
    tokenTicker: `tDEMO${n}`,
    companyName: `Empresa Demo ${n} S.A.`,
    isin: `AR${Math.random().toString(36).slice(2, 11).toUpperCase()}0`,
    sector: 'General',
    priceUsdc: 10,
    custodiedShares: 10000,
  };
}

/* --------------------------- pipeline (console) --------------------------- */

/** Where a listing is in its life, as the console groups it. */
export type IssuanceStage = 'draft' | 'deployed' | 'open' | 'closed' | 'paying' | 'failed';

export const ISSUANCE_STAGES: readonly IssuanceStage[] = [
  'draft',
  'deployed',
  'open',
  'closed',
  'paying',
  'failed',
];

export const STAGE_TONE: Record<IssuanceStage, Tone> = {
  draft: 'neutral',
  deployed: 'sky',
  open: 'sky',
  closed: 'good',
  paying: 'butter',
  failed: 'warn',
};

/** `paysDividends`: the listing already distributed at least one dividend. */
export function stageOf(listing: Pick<Listing, 'status'>, paysDividends = false): IssuanceStage {
  switch (listing.status) {
    case 'DRAFT':
      return 'draft';
    case 'DEPLOYED':
    case 'TOKENS_MINTED':
      return 'deployed';
    case 'LISTED':
      return 'open';
    case 'CLOSED_SUCCESS':
      return paysDividends ? 'paying' : 'closed';
    case 'CLOSED_FAILED':
      return 'failed';
    default:
      return 'draft';
  }
}

const DAY = 86_400_000;

/**
 * When an open offering closes: the configured date for ON_DATE, else the
 * offering window from the moment it was listed. `null` if unknown.
 */
export function closingAt(listing: Listing): Date | null {
  if (listing.status !== 'LISTED') return null;
  if (listing.settlePolicy === 'ON_DATE' && listing.settleAt) {
    const d = new Date(listing.settleAt);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const from = listing.listedAt ? Date.parse(listing.listedAt) : Number.NaN;
  const days = Number(listing.dossier.offeringDays);
  if (Number.isNaN(from) || !Number.isFinite(days) || days <= 0) return null;
  return new Date(from + days * DAY);
}

/** The lifecycle action that moves a listing forward, if any. */
export function nextAction(
  listing: Pick<Listing, 'status'>,
): 'deploy' | 'mint' | 'licitacion' | 'close' | null {
  switch (listing.status) {
    case 'DRAFT':
      return 'deploy';
    case 'DEPLOYED':
      return 'mint';
    case 'TOKENS_MINTED':
      return 'licitacion';
    case 'LISTED':
      return 'close';
    default:
      return null;
  }
}
