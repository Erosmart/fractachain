import crypto from 'crypto';

/**
 * Simulated rails shown on the home page (on/off-ramps, bridges, oracles).
 * Nothing here touches a real provider or moves funds: every response is
 * labelled as a mock so the UI can say so.
 */

export type FiatCurrency = 'USD' | 'EUR' | 'GBP' | 'BRL';
export type BridgeChain = 'ethereum' | 'arbitrum' | 'base' | 'solana' | 'polygon';
export type IntentAsset = 'BTC' | 'ETH' | 'SOL' | 'USDT';

const now = () => new Date().toISOString();
const rand = (bytes = 4) => crypto.randomBytes(bytes).toString('hex');

const COMMODITIES = {
  soja: { crop: 'Soja (Rosario)', priceUsd: 350.0, unit: 'USD/ton', marketReference: 'Matba Rofex' },
  maiz: { crop: 'Maíz', priceUsd: 180.0, unit: 'USD/ton', marketReference: 'Matba Rofex' },
  trigo: { crop: 'Trigo Pan', priceUsd: 220.0, unit: 'USD/ton', marketReference: 'Bolsa de Cereales Bs As' },
  tabaco: {
    crop: 'Tabaco Virginia',
    priceUsd: 4500.0,
    unit: 'USD/ton',
    marketReference: 'Cámara del Tabaco Salta',
  },
  tomate: { crop: 'Tomate Redondo', priceUsd: 0.8, unit: 'USD/kg', marketReference: 'Mercado Central Bs As' },
  cebolla: {
    crop: 'Cebolla Sintética',
    priceUsd: 0.45,
    unit: 'USD/kg',
    marketReference: 'Mercado Mayorista Mendoza',
  },
} as const;

const WEATHER = {
  salta: {
    region: 'Valle de Lerma, Salta',
    crop: 'Tabaco Virginia',
    rainfallMm: 120,
    minTempCelsius: 8,
    hailDetected: false,
  },
  pampa: {
    region: 'Pampa Húmeda, Pergamino',
    crop: 'Soja 1ra',
    rainfallMm: 95,
    minTempCelsius: 5,
    hailDetected: false,
  },
  mendoza: {
    region: 'Valle de Uco, Mendoza',
    crop: 'Vid (Malbec)',
    rainfallMm: 40,
    minTempCelsius: -2,
    hailDetected: true,
  },
} as const;

const INTENT_RATES: Record<IntentAsset, number> = { BTC: 65000, ETH: 3400, SOL: 150, USDT: 1 };

export class MockGatewayService {
  arsOnRamp(arsAmount: number, destinationWallet: string) {
    const exchangeRate = 1450.0;
    return {
      success: true,
      arsAmount,
      usdcAmount: Number((arsAmount / exchangeRate).toFixed(2)),
      exchangeRate,
      destinationWallet,
      txHash: `mock_stellar_tx_${Date.now()}_${rand()}`,
      settlementTimeSeconds: 3,
      provider: 'Alfred Pay (CBU/CVU)' as const,
    };
  }

  fiatOnRamp(fiatAmount: number, fiatCurrency: FiatCurrency, destinationWallet: string) {
    const fee = Number((fiatAmount * 0.01).toFixed(2));
    return {
      success: true,
      fiatAmount,
      fiatCurrency,
      usdcAmount: Number((fiatAmount - fee).toFixed(2)),
      processingFeeUsdc: fee,
      destinationWallet,
      txHash: `mock_card_tx_${Date.now()}_${rand()}`,
      provider: 'MoonPay' as const,
    };
  }

  cctpBridge(originChain: BridgeChain, usdcAmount: number, _destinationWallet: string) {
    return {
      success: true,
      originChain,
      destinationChain: 'stellar' as const,
      usdcAmount,
      bridgeFee: 0 as const,
      timeSeconds: 3,
      messageHash: `0x${rand(16)}`,
      stellarMintTx: `cctp_mint_${Date.now()}_stellar_testnet`,
    };
  }

  nearIntentsSwap(depositAsset: IntentAsset, depositAmount: number, _destinationWallet: string) {
    return {
      success: true,
      depositAsset,
      depositAmount,
      estimatedUsdcReceiving: Number((depositAmount * (INTENT_RATES[depositAsset] ?? 1)).toFixed(2)),
      depositAddress: `intents_deposit_${depositAsset.toLowerCase()}_${rand()}`,
      swapStatus: 'COMPLETED_MOCK' as const,
      stellarSettlementTx: `near_intent_tx_${Date.now()}_stellar`,
    };
  }

  commodities() {
    return Object.values(COMMODITIES).map((c) => ({ ...c, lastUpdated: now() }));
  }

  commodity(key: string) {
    const c = (COMMODITIES as Record<string, (typeof COMMODITIES)[keyof typeof COMMODITIES]>)[
      key.toLowerCase()
    ];
    return c ? { ...c, lastUpdated: now() } : undefined;
  }

  weather() {
    return Object.values(WEATHER).map((w) => ({
      ...w,
      insuranceClaimTriggered: w.hailDetected,
      status: w.hailDetected ? ('SINIESTRO_DISPARADO' as const) : ('NORMAL' as const),
      timestamp: now(),
    }));
  }
}
