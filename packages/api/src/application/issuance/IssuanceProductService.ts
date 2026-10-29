import type { IssuanceProduct, PaymentKind, ProductKind } from '../../domain/issuance/IssuanceProduct';
import type { DeploymentRegistryLike } from '../../infrastructure/stellar/types';

/**
 * Admin registry of issuance products and payment assets (process-local, as
 * in v1: it mirrors the on-chain factory for the demo console).
 */
export class IssuanceProductService {
  private readonly products: IssuanceProduct[] = [];
  private seq = 1;
  /** Native XLM is per-network; USDC defaults to the deployment's SAC; USDT is set by the admin. */
  private readonly assets: Record<PaymentKind, string> = { XLM: 'native', USDC: '', USDT: '' };

  constructor(private readonly deployments: DeploymentRegistryLike) {}

  paymentAssets(): Record<PaymentKind, string> {
    return { ...this.assets, USDC: this.assets.USDC || this.deployments.load()?.usdcSac || '' };
  }

  setPaymentAsset(kind: PaymentKind, address: string): string {
    this.assets[kind] = address;
    return this.assets[kind];
  }

  list(): IssuanceProduct[] {
    return [...this.products];
  }

  create(input: { kind: ProductKind; name: string; paymentKind: PaymentKind; pricePerUnit: string; contractAddress?: string; notes?: string }): IssuanceProduct {
    const product: IssuanceProduct = {
      id: `ISS-${String(this.seq++).padStart(3, '0')}`,
      kind: input.kind,
      name: input.name,
      paymentKind: input.paymentKind,
      paymentTokenAddress: this.paymentAssets()[input.paymentKind],
      pricePerUnit: input.pricePerUnit || '0',
      contractAddress: input.contractAddress || 'PENDING_DEPLOY',
      active: true,
      createdAt: new Date().toISOString(),
      notes: input.notes,
    };
    this.products.push(product);
    return product;
  }

  updatePrice(id: string, pricePerUnit: string): IssuanceProduct | null {
    const p = this.products.find((x) => x.id === id);
    if (!p) return null;
    p.pricePerUnit = pricePerUnit;
    return p;
  }

  bindContract(id: string, contractAddress: string): IssuanceProduct | null {
    const p = this.products.find((x) => x.id === id);
    if (!p) return null;
    p.contractAddress = contractAddress;
    return p;
  }
}
