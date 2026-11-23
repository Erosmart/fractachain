import type { PaymentKind, ProductKind } from '@fractachain/shared';

export type { PaymentKind, ProductKind };

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
