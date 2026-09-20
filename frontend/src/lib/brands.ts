export const INSTITUTION_SLOTS = [
  { slug: 'cnv', label: 'CNV' },
  { slug: 'caja-de-valores', label: 'Caja de Valores' },
  { slug: 'byma', label: 'BYMA' },
  { slug: 'stellar', label: 'Stellar' },
  { slug: 'alfred-pay', label: 'Alfred Pay' },
  { slug: 'matba-rofex', label: 'Matba Rofex' },
  { slug: 'anclap', label: 'Anclap' },
  { slug: 'circle', label: 'Circle CCTP' },
  { slug: 'scf', label: 'Stellar Community Fund' },
  { slug: 'gafi', label: 'GAFI' },
] as const;

export function partnerSlug(name: string) {
  const map: Record<string, string> = {
    BYMA: 'byma',
    'Caja de Valores': 'caja-de-valores',
    'Stellar Foundation': 'stellar',
    'Alfred Pay': 'alfred-pay',
    'Matba Rofex': 'matba-rofex',
    Anclap: 'anclap',
    'Circle CCTP': 'circle',
    'Stellar Community Fund': 'scf',
  };
  return map[name] || name.toLowerCase().replace(/\s+/g, '-');
}
