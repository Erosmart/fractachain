export type ProductKind = 'LICITACION' | 'FORWARD' | 'WARRANT' | 'STOCK';
export type PaymentKind = 'XLM' | 'USDC' | 'USDT';

export interface IssuanceProduct {
  id: string;
  kind: ProductKind;
  name: string;
  paymentKind: PaymentKind;
  paymentTokenAddress: string;
  pricePerUnit: string;
  contractAddress: string;
  active: boolean;
  createdAt: string;
  notes?: string;
}

const products: IssuanceProduct[] = [];
let seq = 1;

/** Testnet defaults. Native XLM SAC is derived per-network; USDC SAC is Circle's testnet contract. USDT is set from admin. */
const DEFAULT_TESTNET_ASSETS: Record<PaymentKind, string> = {
  XLM: 'native',
  USDC: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
  USDT: '',
};

export function getPaymentAssets(): Record<PaymentKind, string> {
  return { ...DEFAULT_TESTNET_ASSETS };
}

export function setPaymentAsset(kind: PaymentKind, address: string) {
  DEFAULT_TESTNET_ASSETS[kind] = address;
  return DEFAULT_TESTNET_ASSETS[kind];
}

export function listProducts(): IssuanceProduct[] {
  return [...products];
}

export function createProduct(input: {
  kind: ProductKind;
  name: string;
  paymentKind: PaymentKind;
  pricePerUnit: string;
  contractAddress?: string;
  notes?: string;
}): IssuanceProduct {
  const product: IssuanceProduct = {
    id: `ISS-${String(seq).padStart(3, '0')}`,
    kind: input.kind,
    name: input.name,
    paymentKind: input.paymentKind,
    paymentTokenAddress: DEFAULT_TESTNET_ASSETS[input.paymentKind],
    pricePerUnit: input.pricePerUnit || '0',
    contractAddress: input.contractAddress || 'PENDING_DEPLOY',
    active: true,
    createdAt: new Date().toISOString(),
    notes: input.notes,
  };
  seq += 1;
  products.push(product);
  return product;
}

export function updateProductPrice(id: string, pricePerUnit: string): IssuanceProduct | null {
  const p = products.find((x) => x.id === id);
  if (!p) return null;
  p.pricePerUnit = pricePerUnit;
  return p;
}

export function bindContract(id: string, contractAddress: string): IssuanceProduct | null {
  const p = products.find((x) => x.id === id);
  if (!p) return null;
  p.contractAddress = contractAddress;
  return p;
}
