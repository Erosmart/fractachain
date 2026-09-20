export interface CommodityPrice {
  crop: string;
  priceUsd: number;
  unit: string;
  marketReference: string;
  lastUpdated: string;
}

export const COMMODITY_PRICES: Record<string, CommodityPrice> = {
  soja: { crop: 'Soja (Rosario)', priceUsd: 350.0, unit: 'USD/ton', marketReference: 'Matba Rofex', lastUpdated: new Date().toISOString() },
  maiz: { crop: 'Maíz', priceUsd: 180.0, unit: 'USD/ton', marketReference: 'Matba Rofex', lastUpdated: new Date().toISOString() },
  trigo: { crop: 'Trigo Pan', priceUsd: 220.0, unit: 'USD/ton', marketReference: 'Bolsa de Cereales Bs As', lastUpdated: new Date().toISOString() },
  tabaco: { crop: 'Tabaco Virginia', priceUsd: 4500.0, unit: 'USD/ton', marketReference: 'Cámara del Tabaco Salta', lastUpdated: new Date().toISOString() },
  tomate: { crop: 'Tomate Redondo', priceUsd: 0.80, unit: 'USD/kg', marketReference: 'Mercado Central Bs As', lastUpdated: new Date().toISOString() },
  cebolla: { crop: 'Cebolla Sintética', priceUsd: 0.45, unit: 'USD/kg', marketReference: 'Mercado Mayorista Mendoza', lastUpdated: new Date().toISOString() },
};

export function getCommodityPrice(cropKey: string): CommodityPrice | undefined {
  return COMMODITY_PRICES[cropKey.toLowerCase()];
}

export function getAllCommodityPrices(): CommodityPrice[] {
  return Object.values(COMMODITY_PRICES);
}
