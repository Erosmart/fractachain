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

/** Free-text fields of the dossier, in form order (labels: `admIss.f.<key>`). */
export const DOSSIER_TEXT_FIELDS = [
  'legalName',
  'tradeName',
  'cuit',
  'ticker',
  'tokenTicker',
  'isin',
  'sector',
  'cajaSubaccount',
  'cnvRecordId',
  'bymaRequestId',
  'legalTermsUri',
  'estatutoHash',
  'auditor',
  'issuerPublicKey',
  'useOfProceeds',
] as const satisfies readonly (keyof DossierForm)[];

/** Numeric fields with their label key. */
export const DOSSIER_NUMBER_FIELDS = [
  ['sharesToTokenize', 'admIss.shares'],
  ['pricePerShareUsdc', 'admIss.priceShare'],
  ['minInvestmentUsdc', 'admIss.minInvest'],
  ['offeringSoftCapUsdc', null],
  ['offeringHardCapUsdc', null],
  ['offeringDays', 'admIss.days'],
] as const satisfies readonly (readonly [keyof DossierForm, string | null])[];

export const EMPTY_STOCK: NewStockInput = {
  ticker: '',
  tokenTicker: '',
  companyName: '',
  isin: '',
  sector: 'General',
  priceUsdc: 10,
  custodiedShares: 10000,
};

export const STOCK_TEXT_FIELDS = ['ticker', 'tokenTicker', 'companyName', 'isin', 'sector'] as const satisfies readonly (keyof NewStockInput)[];

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
