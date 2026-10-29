import { isOnChainListing, listingDeadline, poolStatus, type Listing } from '../../domain/listing/Listing';
import { isStellarPublicKey } from '../../domain/stellar/StellarAddress';
import { DAY_MS } from '../../shared/numbers';
import type { ListingLedger } from './ListingLedger';

/** Read models derived from listings: validation pack, market pools and tradeable markets. */
export class ListingPresenter {
  constructor(private readonly listings: ListingLedger) {}

  validationPack(listing: Listing) {
    const d = listing.dossier;
    const backing =
      listing.tokensMinted === 0
        ? 'sin mint'
        : listing.sharesCustodied === listing.tokensMinted
          ? '1:1 (100%)'
          : `${listing.sharesCustodied}:${listing.tokensMinted}`;
    return {
      listingId: listing.id,
      status: listing.status,
      token: {
        ticker: d.tokenTicker,
        underlying: d.ticker,
        isin: d.isin,
        pricePerShareUsdc: d.pricePerShareUsdc,
        paymentKind: d.paymentKind,
        tokensMinted: listing.tokensMinted,
        sharesCustodied: listing.sharesCustodied,
        backing,
      },
      company: {
        legalName: d.legalName,
        tradeName: d.tradeName,
        cuit: d.cuit,
        jurisdiction: d.jurisdiction,
        sector: d.sector,
        authorizedShares: d.authorizedShares,
        sharesToTokenize: d.sharesToTokenize,
      },
      custody: {
        cajaSubaccount: d.cajaSubaccount,
        custodianCuit: d.custodianCuit,
        cvDepositHash: listing.cvDepositHash,
        auditor: d.auditor,
      },
      regulator: {
        cnvRecordId: d.cnvRecordId,
        bymaRequestId: d.bymaRequestId,
        legalTermsUri: d.legalTermsUri,
        estatutoHash: d.estatutoHash,
      },
      payout: {
        proceedsWallet: d.proceedsWallet,
        proceedsPaidTo: listing.proceedsPaidTo || null,
        proceedsPaidAt: listing.proceedsPaidAt || null,
        issuerPublicKey: d.issuerPublicKey,
        // Locked once the first investor pays in: the destination is part of the deal.
        editable: listing.raisedUsdc === 0,
      },
      contracts: {
        stockVault: listing.stockContract,
        licitacion: listing.licitacionContract,
        factoryProductId: listing.factoryProductId,
        wasmStock: listing.wasmStock,
        wasmLicitacion: listing.wasmLicitacion,
      },
      offering: {
        softCapUsdc: d.offeringSoftCapUsdc,
        hardCapUsdc: d.offeringHardCapUsdc,
        raisedUsdc: listing.raisedUsdc,
        days: d.offeringDays,
        tnaUsd: d.tnaUsd,
        useOfProceeds: d.useOfProceeds,
        deadline:
          listing.settleAt ||
          (listing.listedAt
            ? new Date(new Date(listing.listedAt).getTime() + d.offeringDays * DAY_MS).toISOString()
            : null),
        settlePolicy: listing.settlePolicy || 'ON_MIN',
        settleAt: listing.settleAt || null,
      },
      checks: [
        { key: 'cuit', ok: d.cuit.replace(/[^\d]/g, '').length >= 10, label: 'CUIT emisor' },
        { key: 'isin', ok: Boolean(d.isin), label: 'ISIN' },
        { key: 'cnv', ok: Boolean(d.cnvRecordId), label: 'Expediente CNV' },
        { key: 'caja', ok: Boolean(d.cajaSubaccount), label: 'Subcuenta Caja de Valores' },
        { key: 'deploy', ok: Boolean(listing.stockContract), label: 'Contrato stock vault deployado' },
        { key: 'mint', ok: listing.tokensMinted > 0, label: 'Tokens 1:1 minteados' },
        {
          key: 'por',
          ok: listing.tokensMinted === listing.sharesCustodied && listing.tokensMinted > 0,
          label: 'Proof of reserve 1:1',
        },
        { key: 'payout', ok: isStellarPublicKey(d.proceedsWallet), label: 'Wallet de cobro de la empresa' },
        {
          key: 'paid',
          ok: Boolean(listing.proceedsPaidAt) || listing.status !== 'CLOSED_SUCCESS',
          label: 'Fondos acreditados a la empresa',
        },
        { key: 'licitacion', ok: listing.status === 'LISTED', label: 'Licitación abierta' },
      ],
    };
  }

  /** Offerings shown in the public market. */
  pools() {
    return this.listings
      .list()
      .filter(
        (l) =>
          l.status === 'LISTED' ||
          (isOnChainListing(l) && (l.status === 'CLOSED_SUCCESS' || l.status === 'CLOSED_FAILED')),
      )
      .map((l) => {
        const d = l.dossier;
        const deadline = listingDeadline(l) ?? new Date();
        return {
          id: l.id,
          title: `Oferta primaria ${d.tokenTicker} · ${d.legalName}`,
          producerName: `${d.legalName} (CUIT ${d.cuit})`,
          location: d.jurisdiction,
          targetAmount: d.offeringHardCapUsdc,
          raisedAmount: l.raisedUsdc,
          softCap: d.offeringSoftCapUsdc,
          hardCap: d.offeringHardCapUsdc,
          tna: d.tnaUsd,
          durationMonths: Math.max(1, Math.round(d.offeringDays / 30)),
          daysRemaining: Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / DAY_MS)),
          commodityType: d.sector,
          riskScore: 'AA+',
          isSoftCapReached: l.raisedUsdc >= d.offeringSoftCapUsdc,
          minInvestment: d.minInvestmentUsdc || d.pricePerShareUsdc,
          status: poolStatus(l),
          tokenTicker: d.tokenTicker,
          ticker: d.ticker,
          isin: d.isin,
          paymentKind: d.paymentKind || 'USDC',
          finalizeHash: l.finalizeHash || null,
          validation: this.validationPack(l),
        };
      });
  }

  /** Markets the secondary book lists. */
  tradeableMarkets() {
    return this.listings
      .list()
      .filter((l) => l.status === 'LISTED' || l.status === 'CLOSED_SUCCESS' || l.tokensMinted > 0)
      .map((l) => ({
        listingId: l.id,
        tokenTicker: l.dossier.tokenTicker,
        ticker: l.dossier.ticker,
        legalName: l.dossier.legalName,
        pricePerShareUsdc: l.dossier.pricePerShareUsdc,
        status: l.status,
      }));
  }
}
