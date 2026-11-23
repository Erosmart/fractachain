import { describe, expect, it } from 'vitest';
import type { Listing } from '@fractachain/shared';
import type { KycQueueRow } from '@/core/api/AdminApi';
import type { AuditEntry } from '@/core/api/types';
import { translatorFor } from '@/core/i18n/translate';
import { auditToCsv, csvCell } from '@/features/admin/audit/csv';
import { closingAt, nextAction, stageOf } from '@/features/admin/issuance/model';
import {
  checkTone,
  composeReason,
  countByStatus,
  filterRows,
  namesMatch,
  providerTone,
  slaTone,
  sortForReview,
} from '@/features/admin/kyc/model';
import { percentOfCap, summarize } from '@/features/admin/overview/model';
import { hoursSince, relativeAge, relativeUntil } from '@/features/admin/shared/datetime';

const H = 3_600_000;
const NOW = Date.parse('2026-10-30T12:00:00Z');
const ago = (h: number) => new Date(NOW - h * H).toISOString();

function row(p: Partial<KycQueueRow> & Pick<KycQueueRow, 'id' | 'status'>): KycQueueRow {
  return {
    fullName: 'Ana Paz',
    docType: 'CUIT',
    docNumber: '27-22333444-1',
    country: 'Argentina',
    walletAddress: 'GABC',
    isGafiHighRisk: false,
    createdAt: ago(1),
    ...p,
  };
}

function listing(
  p: Partial<Listing> & { status: Listing['status'] },
  dossier: Partial<Listing['dossier']> = {},
): Listing {
  return {
    id: `L-${Math.random().toString(36).slice(2, 8)}`,
    stockContract: '',
    licitacionContract: '',
    factoryProductId: null,
    wasmStock: '',
    wasmLicitacion: '',
    tokensMinted: 0,
    sharesCustodied: 0,
    cvDepositHash: '',
    raisedUsdc: 0,
    createdAt: ago(100),
    ...p,
    dossier: {
      legalName: 'Co SA',
      tradeName: 'Co',
      cuit: '30',
      jurisdiction: 'AR',
      sector: 'Agro',
      ticker: 'CO',
      tokenTicker: 'tCO',
      isin: 'AR',
      authorizedShares: 1,
      sharesToTokenize: 1,
      pricePerShareUsdc: 1,
      cajaSubaccount: '',
      custodianCuit: '',
      cnvRecordId: '',
      bymaRequestId: '',
      legalTermsUri: '',
      estatutoHash: '',
      auditor: '',
      issuerPublicKey: '',
      proceedsWallet: 'GPAYOUT',
      paymentKind: 'USDC',
      offeringSoftCapUsdc: 100,
      offeringHardCapUsdc: 200,
      offeringDays: 10,
      tnaUsd: 0,
      useOfProceeds: '',
      ...dossier,
    },
  };
}

describe('admin KYC queue model', () => {
  const rows = [
    row({ id: 'a', status: 'PENDING', createdAt: ago(5), fullName: 'Zoe' }),
    row({ id: 'b', status: 'PENDING', createdAt: ago(80), email: 'old@example.com' }),
    row({ id: 'c', status: 'APPROVED', createdAt: ago(200) }),
    row({ id: 'd', status: 'REVOKED' }),
  ];

  it('counts, filters and searches across name, email and the document name', () => {
    expect(countByStatus(rows)).toMatchObject({ PENDING: 2, APPROVED: 1, REJECTED: 0, REVOKED: 1, ALL: 4 });
    expect(filterRows(rows, 'PENDING', 'old@').map((r) => r.id)).toEqual(['b']);
    const didit = row({
      id: 'e',
      status: 'PENDING',
      verification: {
        provider: 'didit',
        status: 'Approved',
        identity: { fullName: 'MARIA GOMEZ' },
        updatedAt: ago(1),
      },
    });
    expect(filterRows([didit], 'ALL', 'maria').map((r) => r.id)).toEqual(['e']);
  });

  it('works the queue oldest-pending first', () => {
    expect(sortForReview(rows).map((r) => r.id)).toEqual(['b', 'a', 'd', 'c']);
  });

  it('ages pending requests against the 72 h SLA only', () => {
    expect(slaTone('PENDING', 10)).toBe('neutral');
    expect(slaTone('PENDING', 48)).toBe('warn');
    expect(slaTone('PENDING', 72)).toBe('bad');
    expect(slaTone('APPROVED', 500)).toBe('neutral');
  });

  it('maps Didit statuses and checks to tones', () => {
    expect(providerTone('Approved')).toBe('good');
    expect(providerTone('Declined')).toBe('bad');
    expect(providerTone('In Review')).toBe('warn');
    expect(providerTone('Not Started')).toBe('sky');
    expect(providerTone('Kyc Expired')).toBe('peach');
    expect(checkTone('Approved')).toBe('good');
    expect(checkTone('Declined')).toBe('bad');
    expect(checkTone('In Review')).toBe('warn');
    expect(checkTone(undefined)).toBe('neutral');
  });

  it('compares names loosely (accents, case, order, middle names)', () => {
    expect(namesMatch('María Gómez', 'MARIA GOMEZ')).toBe(true);
    expect(namesMatch('Gómez María', 'MARIA ELENA GOMEZ')).toBe(true);
    expect(namesMatch('Juan Pérez', 'JUAN CARLOS PEREIRA')).toBe(false);
    expect(namesMatch('Ana', undefined)).toBe(true);
  });

  it('composes the reason and requires text for "other"', () => {
    const opts = ['Documento vencido', 'Otro motivo'];
    expect(composeReason(opts, 0, '')).toBe('Documento vencido');
    expect(composeReason(opts, 0, ' venció en 2025 ')).toBe('Documento vencido: venció en 2025');
    expect(composeReason(opts, 1, '  ')).toBeNull();
    expect(composeReason(opts, 1, 'pedido judicial')).toBe('pedido judicial');
    expect(composeReason(opts, 5, 'x')).toBeNull();
  });
});

describe('issuance pipeline model', () => {
  it('places listings in stages, dividends turning "closed" into "paying"', () => {
    expect(stageOf({ status: 'DRAFT' })).toBe('draft');
    expect(stageOf({ status: 'TOKENS_MINTED' })).toBe('deployed');
    expect(stageOf({ status: 'LISTED' })).toBe('open');
    expect(stageOf({ status: 'CLOSED_SUCCESS' })).toBe('closed');
    expect(stageOf({ status: 'CLOSED_SUCCESS' }, true)).toBe('paying');
    expect(stageOf({ status: 'CLOSED_FAILED' })).toBe('failed');
  });

  it('suggests the next lifecycle action', () => {
    expect(nextAction({ status: 'DRAFT' })).toBe('deploy');
    expect(nextAction({ status: 'DEPLOYED' })).toBe('mint');
    expect(nextAction({ status: 'TOKENS_MINTED' })).toBe('licitacion');
    expect(nextAction({ status: 'LISTED' })).toBe('close');
    expect(nextAction({ status: 'CLOSED_SUCCESS' })).toBeNull();
  });

  it('computes closing dates from the window or the configured date', () => {
    const windowed = listing({ status: 'LISTED', listedAt: ago(24) }, { offeringDays: 10 });
    expect(closingAt(windowed)?.toISOString()).toBe(new Date(NOW - 24 * H + 10 * 24 * H).toISOString());
    const dated = listing({
      status: 'LISTED',
      settlePolicy: 'ON_DATE',
      settleAt: '2026-11-15T00:00:00.000Z',
    });
    expect(closingAt(dated)?.toISOString()).toBe('2026-11-15T00:00:00.000Z');
    expect(closingAt(listing({ status: 'CLOSED_SUCCESS' }))).toBeNull();
  });
});

describe('console overview summary', () => {
  it('never adds XLM and USDC together and flags missing payout wallets', () => {
    const usdc = listing({ id: 'u', status: 'LISTED', raisedUsdc: 50, listedAt: ago(1) });
    const xlm = listing(
      { id: 'x', status: 'LISTED', raisedUsdc: 70, listedAt: ago(2) },
      { paymentKind: 'XLM' },
    );
    const draft = listing({ id: 'd', status: 'DRAFT' }, { proceedsWallet: '' });
    const done = listing({ id: 'c', status: 'CLOSED_SUCCESS', raisedUsdc: 200 });
    const s = summarize(
      [usdc, xlm, draft, done],
      [row({ id: 'k', status: 'PENDING', createdAt: ago(9) })],
      new Set(['c']),
    );
    expect(s.openUsdc).toEqual({ count: 1, raised: 50, cap: 200 });
    expect(s.openXlm).toEqual({ count: 1, raised: 70, cap: 200 });
    expect(s.closedUsdc.raised).toBe(200);
    expect(s.stageCounts).toMatchObject({ open: 2, draft: 1, paying: 1, closed: 0 });
    expect(s.missingWallet.map((l) => l.id)).toEqual(['d']);
    expect(s.closings.map((c) => c.listing.id)).toEqual(['x', 'u']);
    expect(s.pendingKyc).toHaveLength(1);
    expect(percentOfCap(s.openUsdc)).toBe(25);
    expect(percentOfCap({ count: 0, raised: 0, cap: 0 })).toBe(0);
  });
});

describe('audit CSV export', () => {
  it('quotes cells and neutralizes spreadsheet formulas', () => {
    expect(csvCell('a "b"')).toBe('"a ""b"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-1')).toBe(`"'-1"`);
    expect(csvCell(null)).toBe('""');
  });

  it('writes a header and one CRLF line per entry', () => {
    const entry: AuditEntry = {
      id: '1',
      at: '2026-10-30T00:00:00.000Z',
      actorId: null,
      actorEmail: 'admin@x.test',
      action: 'kyc.approve',
      target: 'kyc-1',
      ip: '127.0.0.1',
      requestId: 'r1',
      outcome: 'success',
      details: { status: 200 },
    };
    const csv = auditToCsv([entry]).split('\r\n');
    expect(csv[0]).toBe('"at","actor","action","target","ip","requestId","outcome","details"');
    expect(csv[1]).toContain('"admin@x.test","kyc.approve","kyc-1"');
    expect(csv[1]).toContain('"{""status"":200}"');
  });
});

describe('console relative times', () => {
  const t = translatorFor('es');
  it('formats ages and deadlines', () => {
    expect(hoursSince(ago(5), NOW)).toBe(5);
    expect(relativeAge(ago(0), NOW, t)).toBe('recién');
    expect(relativeAge(ago(3), NOW, t)).toBe('hace 3 h');
    expect(relativeAge(ago(72), NOW, t)).toBe('hace 3 d');
    expect(relativeUntil(new Date(NOW + 5 * H), NOW, t)).toBe('en 5 h');
    expect(relativeUntil(new Date(NOW + 72 * H), NOW, t)).toBe('en 3 días');
    expect(relativeUntil(new Date(NOW - H), NOW, t)).toBe('vencida');
  });
});
