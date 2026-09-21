/**
 * Cash dividends for tokenized shares.
 *
 * Mirrors `stock-vault::deposit_dividends` / `claim_dividends`: the company
 * deposits a USDC pool, it is split pro-rata across current economic holders
 * (tokens already in wallet plus tokens owed at close), and each investor
 * claims to their own cash balance. A holder minted after the deposit does
 * not inherit it — the snapshot is taken at distribution time.
 *
 * This is the sandbox ledger. On a live stock-vault the same split happens
 * on-chain against the payment token; the investor's receiving address is
 * whatever wallet they use to `claim_dividends`, not a second field at
 * issuance. The company's proceeds wallet is the treasury that *pays* the
 * dividend, not the wallet that receives it.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getListing } from '../admin/listings';
import { persistToPg } from '../data/pgstore';
import {
  accrueDividend,
  economicShares,
  listAccounts,
} from '../auth/accounts';

export interface DividendDistribution {
  id: string;
  listingId: string;
  tokenTicker: string;
  totalUsdc: number;
  sharesOutstanding: number;
  perShare: number;
  holdersPaid: number;
  createdAt: string;
}

const DATA = path.join(__dirname, '..', '..', 'data', 'dividends.json');
let distributions: DividendDistribution[] = [];

function load() {
  try {
    if (fs.existsSync(DATA)) {
      distributions = JSON.parse(fs.readFileSync(DATA, 'utf8'));
    }
  } catch {
    distributions = [];
  }
}

function save() {
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(distributions, null, 2));
  persistToPg('dividends.json', distributions);
}

load();

export function listDividends(listingId?: string) {
  const rows = listingId
    ? distributions.filter((d) => d.listingId === listingId)
    : distributions;
  return [...rows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function depositDividends(listingId: string, totalUsdc: number): DividendDistribution {
  const listing = getListing(listingId);
  if (!listing) throw new Error('Listing no encontrado');
  if (listing.status !== 'CLOSED_SUCCESS') {
    throw new Error('Los dividendos se pagan cuando la licitación ya cerró con éxito y hay accionistas');
  }
  if (!Number.isFinite(totalUsdc) || totalUsdc <= 0) {
    throw new Error('El monto del dividendo tiene que ser mayor a cero');
  }

  const holders = listAccounts()
    .map((a) => {
      const holding = (a.holdings || []).find((h) => h.listingId === listingId);
      const shares = holding ? economicShares(holding) : 0;
      return { accountId: a.id, shares };
    })
    .filter((h) => h.shares > 0);

  const sharesOutstanding = holders.reduce((s, h) => s + h.shares, 0);
  if (sharesOutstanding <= 0) {
    throw new Error('Todavía no hay tenedores para repartir. Esperá a que los inversores reclamen los tokens.');
  }

  const perShare = totalUsdc / sharesOutstanding;
  let distributed = 0;
  for (const h of holders) {
    const slice = Math.round(h.shares * perShare * 1e6) / 1e6;
    if (slice <= 0) continue;
    accrueDividend(h.accountId, listingId, slice);
    distributed += slice;
  }

  const row: DividendDistribution = {
    id: `DIV-${crypto.randomBytes(4).toString('hex')}`,
    listingId,
    tokenTicker: listing.dossier.tokenTicker,
    totalUsdc: Math.round(distributed * 1e6) / 1e6,
    sharesOutstanding,
    perShare: Math.round(perShare * 1e8) / 1e8,
    holdersPaid: holders.length,
    createdAt: new Date().toISOString(),
  };
  distributions.push(row);
  save();
  return row;
}
