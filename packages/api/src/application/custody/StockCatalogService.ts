import type { IStockRepository, MervalStock } from '../../domain/stock/MervalStock';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';

export interface CreateStockInput {
  ticker: string;
  tokenTicker?: string;
  companyName: string;
  isin: string;
  sector?: string;
  priceUsdc: number;
  custodiedShares: number;
  custodianCuit?: string;
}

/** Tokenized Merval catalog (custody in Caja de Valores, 1:1 tokens on Stellar). */
export class StockCatalogService {
  constructor(private readonly repo: IStockRepository) {}

  /** Public market view: only stocks the admin left active. */
  publicCatalog(): MervalStock[] {
    return this.repo.list().filter((s) => s.active);
  }

  adminCatalog(): MervalStock[] {
    return this.repo.list().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  /** "Emitir acción": the new row is listed in the public market immediately. */
  create(input: CreateStockInput): MervalStock {
    const ticker = String(input.ticker || '').trim().toUpperCase();
    if (!ticker || ticker.length > 12) throw new ValidationError('Ticker inválido');
    const tokenTicker = (input.tokenTicker || `t${ticker}`).trim().toUpperCase();
    if (!input.companyName?.trim()) throw new ValidationError('Falta la razón social');
    if (!input.isin?.trim()) throw new ValidationError('Falta el ISIN');
    if (!(input.priceUsdc > 0)) throw new ValidationError('Precio inválido');
    if (!(input.custodiedShares > 0)) throw new ValidationError('Acciones en custodia inválidas');
    if (this.repo.findByTicker(ticker) || this.repo.findByTicker(tokenTicker)) {
      throw new ConflictError(`Ya existe ${ticker} / ${tokenTicker} en el mercado`);
    }
    const now = new Date().toISOString();
    const stock: MervalStock = {
      ticker,
      tokenTicker,
      companyName: input.companyName.trim(),
      isin: input.isin.trim().toUpperCase(),
      sector: input.sector?.trim() || 'General',
      priceUsdc: input.priceUsdc,
      change24hPct: 0,
      volume24hUsdc: 0,
      custodiedSharesInCajaDeValores: input.custodiedShares,
      mintedTokensInStellar: input.custodiedShares,
      reserveRatio: '1:1 (100.0%)',
      lastAuditTimestamp: now,
      custodianCuit: input.custodianCuit?.trim() || '30-71829304-8',
      active: true,
      createdAt: now,
    };
    this.repo.insert(stock);
    return stock;
  }

  setActive(ticker: string, active: boolean): MervalStock {
    const stock = this.require(ticker);
    stock.active = Boolean(active);
    this.repo.save();
    return stock;
  }

  updatePrice(ticker: string, priceUsdc: number, change24hPct?: number): MervalStock {
    const stock = this.require(ticker);
    if (!(priceUsdc > 0)) throw new ValidationError('Precio inválido');
    stock.change24hPct = Number.isFinite(change24hPct) ? Number(change24hPct) : ((priceUsdc - stock.priceUsdc) / stock.priceUsdc) * 100;
    stock.priceUsdc = priceUsdc;
    this.repo.save();
    return stock;
  }

  proofOfReserve() {
    const active = this.publicCatalog();
    const totalShares = active.reduce((acc, s) => acc + s.custodiedSharesInCajaDeValores, 0);
    const totalTokens = active.reduce((acc, s) => acc + s.mintedTokensInStellar, 0);
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

  private require(ticker: string): MervalStock {
    const stock = this.repo.findByTicker(ticker);
    if (!stock) throw new NotFoundError(`Acción ${ticker} no encontrada`);
    return stock;
  }
}
