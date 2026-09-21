/**
 * Demo visibility filter: hides the seeded/filled offerings from the public
 * market views so only the live demo listing (TSUWU) shows. Admin screens and
 * direct links are unaffected — this only filters the listing pickers.
 */
export const HIDDEN_LISTING_IDS = new Set([
  'IPO-SOJA-PERGAMINO-2026', // Las Lilas — licitación ya llena
  'IPO-T02942-mu6ex9gh', // Demo SA — cerrada
]);

export const isVisibleListing = (id?: string | null) => !!id && !HIDDEN_LISTING_IDS.has(id);
