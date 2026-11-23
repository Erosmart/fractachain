import { describe, expect, it } from 'vitest';
import { DEFAULT_SIMULATION, issuerContactHref, parsePositive, simulate } from '@/features/issuers/simulator';
import { MESSAGE_MAX, prefillFromParams } from '@/features/support/model';

describe('issuer simulator → contact form', () => {
  it('links to the issuer topic with the cap and the summary', () => {
    const href = issuerContactHref('Lote: 250 tn', 250_000.4);
    const q = new URL(href, 'http://x').searchParams;
    expect(href.startsWith('/contact?')).toBe(true);
    expect(q.get('topic')).toBe('issuer');
    expect(q.get('amount')).toBe('250000');
    expect(q.get('message')).toBe('Lote: 250 tn');
  });

  it('prefills topic, amount and message, sanitized and capped', () => {
    const params = new URLSearchParams({
      topic: 'issuer',
      amount: '250.000<script>',
      message: `  ${'x'.repeat(MESSAGE_MAX + 50)}  `,
    });
    const p = prefillFromParams((n) => params.get(n));
    expect(p.topic).toBe('issuer');
    expect(p.amount).toBe('250.000');
    expect(p.message?.length).toBe(MESSAGE_MAX);
    expect(prefillFromParams(() => null)).toEqual({ topic: 'general' });
  });
});

const NOW = Date.UTC(2026, 10, 2);

describe('issuer simulator', () => {
  it('parses es-AR and plain decimals, and rejects non-positive input', () => {
    expect(parsePositive('1.500,5')).toBe(1500.5);
    expect(parsePositive('1500.5')).toBe(1500.5);
    expect(parsePositive('0')).toBe(0);
    expect(parsePositive('-3')).toBe(0);
    expect(parsePositive('abc')).toBe(0);
  });

  it('derives the numbers of the default offering', () => {
    const r = simulate(DEFAULT_SIMULATION, NOW);
    expect(r.sold).toBe(250_000);
    expect(r.kept).toBe(0);
    expect(r.perUnit).toBe(1000);
    expect(r.closeAt).toBe(NOW + 30 * 86_400_000);
    expect(r.errors).toEqual({});
  });

  it('flags the same conditions the licitación contract rejects', () => {
    const short = simulate({ ...DEFAULT_SIMULATION, supply: '100000' }, NOW);
    expect(short.errors.supply).toEqual({ needed: 250_000, supply: 100_000 });
    const caps = simulate({ ...DEFAULT_SIMULATION, softCap: '300000' }, NOW);
    expect(caps.errors.caps).toBe(true);
  });

  it('keeps the unsold tokens with the issuer', () => {
    const r = simulate({ ...DEFAULT_SIMULATION, supply: '400000' }, NOW);
    expect(r.kept).toBe(150_000);
  });
});
