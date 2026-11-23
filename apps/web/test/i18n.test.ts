import { describe, expect, it } from 'vitest';
import { dictionaries } from '@/core/i18n/dictionaries';
import { interpolate, isLocale, lookup, translate } from '@/core/i18n/translate';

function keysOf(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keysOf(v, prefix ? `${prefix}.${k}` : k));
}

describe('i18n', () => {
  it('interpolates named placeholders and keeps unknown ones visible', () => {
    expect(interpolate('Hola {name}, tenés {n} USDC', { name: 'Ana', n: 10 })).toBe(
      'Hola Ana, tenés 10 USDC',
    );
    expect(interpolate('Falta {x}', {})).toBe('Falta {x}');
    expect(interpolate('Sin variables')).toBe('Sin variables');
  });

  it('looks up dotted keys and only returns strings', () => {
    expect(lookup(dictionaries.es, 'nav.market')).toBe('Licitaciones');
    expect(lookup(dictionaries.en, 'nav.market')).toBeTypeOf('string');
    expect(lookup(dictionaries.es, 'nav')).toBeUndefined();
    expect(lookup(dictionaries.es, 'nav.nope.deeper')).toBeUndefined();
  });

  it('falls back to the key so a missing string is visible', () => {
    expect(translate('es', 'does.not.exist')).toBe('does.not.exist');
    expect(translate('en', 'dash.hello', { name: 'Ana' })).toContain('Ana');
  });

  it('keeps both locales in sync', () => {
    expect(keysOf(dictionaries.en).sort()).toEqual(keysOf(dictionaries.es).sort());
  });

  it('validates locales', () => {
    expect(isLocale('es')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
