export interface MervalStock {
  ticker: string;
  tokenTicker: string;
  companyName: string;
  isin: string;
  sector: string;
  priceUsdc: number;
  change24hPct: number;
  volume24hUsdc: number;
  custodiedSharesInCajaDeValores: number;
  mintedTokensInStellar: number;
  reserveRatio: string; // '1:1 (100.0%)'
  lastAuditTimestamp: string;
  custodianCuit: string;
}

export const MERVAL_CATALOG: MervalStock[] = [
  {
    ticker: 'YPFD',
    tokenTicker: 'tYPF',
    companyName: 'YPF Sociedad Anónima (Clase D)',
    isin: 'ARP9897X1319',
    sector: 'Energía y Petróleo',
    priceUsdc: 24.50,
    change24hPct: 3.42,
    volume24hUsdc: 482900,
    custodiedSharesInCajaDeValores: 50000,
    mintedTokensInStellar: 50000,
    reserveRatio: '1:1 (100.0%)',
    lastAuditTimestamp: new Date().toISOString(),
    custodianCuit: '30-71829304-8',
  },
  {
    ticker: 'GGAL',
    tokenTicker: 'tGGAL',
    companyName: 'Grupo Financiero Galicia S.A.',
    isin: 'ARP432631215',
    sector: 'Banca y Finanzas',
    priceUsdc: 38.20,
    change24hPct: -0.85,
    volume24hUsdc: 615000,
    custodiedSharesInCajaDeValores: 80000,
    mintedTokensInStellar: 80000,
    reserveRatio: '1:1 (100.0%)',
    lastAuditTimestamp: new Date().toISOString(),
    custodianCuit: '30-71829304-8',
  },
  {
    ticker: 'PAMP',
    tokenTicker: 'tPAMP',
    companyName: 'Pampa Energía S.A.',
    isin: 'ARP7346A1033',
    sector: 'Generación Eléctrica y Gas',
    priceUsdc: 52.10,
    change24hPct: 1.75,
    volume24hUsdc: 230400,
    custodiedSharesInCajaDeValores: 25000,
    mintedTokensInStellar: 25000,
    reserveRatio: '1:1 (100.0%)',
    lastAuditTimestamp: new Date().toISOString(),
    custodianCuit: '30-71829304-8',
  },
  {
    ticker: 'ALUA',
    tokenTicker: 'tALUA',
    companyName: 'Aluar Aluminio Argentino S.A.',
    isin: 'ARP017251016',
    sector: 'Materiales e Industria',
    priceUsdc: 0.95,
    change24hPct: 0.20,
    volume24hUsdc: 98000,
    custodiedSharesInCajaDeValores: 200000,
    mintedTokensInStellar: 200000,
    reserveRatio: '1:1 (100.0%)',
    lastAuditTimestamp: new Date().toISOString(),
    custodianCuit: '30-71829304-8',
  },
  {
    ticker: 'BMA',
    tokenTicker: 'tBMA',
    companyName: 'Banco Macro S.A. (Clase B)',
    isin: 'ARP125991090',
    sector: 'Banca y Finanzas',
    priceUsdc: 64.80,
    change24hPct: -1.20,
    volume24hUsdc: 175000,
    custodiedSharesInCajaDeValores: 15000,
    mintedTokensInStellar: 15000,
    reserveRatio: '1:1 (100.0%)',
    lastAuditTimestamp: new Date().toISOString(),
    custodianCuit: '30-71829304-8',
  },
  {
    ticker: 'CRES',
    tokenTicker: 'tCRES',
    companyName: 'Cresud S.A.C.I.F. y A.',
    isin: 'ARP315071179',
    sector: 'Agro e Inmuebles',
    priceUsdc: 9.40,
    change24hPct: 2.10,
    volume24hUsdc: 142000,
    custodiedSharesInCajaDeValores: 40000,
    mintedTokensInStellar: 40000,
    reserveRatio: '1:1 (100.0%)',
    lastAuditTimestamp: new Date().toISOString(),
    custodianCuit: '30-71829304-8',
  },
];

export function getMervalStocks(): MervalStock[] {
  return MERVAL_CATALOG;
}

export function getProofOfReserveAudit() {
  const totalShares = MERVAL_CATALOG.reduce((acc, s) => acc + s.custodiedSharesInCajaDeValores, 0);
  const totalTokens = MERVAL_CATALOG.reduce((acc, s) => acc + s.mintedTokensInStellar, 0);

  return {
    verified: totalShares === totalTokens,
    totalSharesCustodied: totalShares,
    totalTokensCirculating: totalTokens,
    custodianEntity: 'Fractachain PSAV Custodio Oficial (CNV RG 1058/2024)',
    depositoryAgent: 'Caja de Valores S.A. (Subcuenta Comitente Fiduciaria 94921-A)',
    lastAuditDate: new Date().toISOString(),
    sha256AuditHash: 'a7b8c9d0e1f23456789abcdef0123456789abcdef0123456789abcdef0123456',
    onChainAttestation: 'https://stellar.expert/explorer/testnet/tx/mock_por_attestation_daily',
  };
}
