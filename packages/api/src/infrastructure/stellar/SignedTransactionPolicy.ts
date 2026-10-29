import { Address, Asset, scValToNative, xdr, type Transaction } from '@stellar/stellar-sdk';
import { ForbiddenError, ValidationError } from '../../shared/errors';

/**
 * Checks on transactions that a user signed in their own wallet and asks the
 * platform to relay.
 *
 * v1 relayed any signed XDR and then trusted what the request body *said* it
 * did — e.g. `contribute/submit` recorded `usdcAmount` from the body, so a
 * 1-USDC on-chain contribution could be booked as one million, then claimed
 * and paid out on-ledger by the issuer. The relay endpoints now verify the
 * transaction belongs to the caller and does exactly what the endpoint is for.
 */
export class SignedTransactionPolicy {
  /** Every operation must act on the caller's own account. */
  static assertSourcedBy(tx: Transaction, publicKey: string): void {
    if (tx.source !== publicKey) {
      throw new ForbiddenError('La transacción no está firmada por tu wallet');
    }
    for (const op of tx.operations) {
      if (op.source && op.source !== publicKey) {
        throw new ForbiddenError('La transacción incluye operaciones de otra cuenta');
      }
    }
  }

  /** The only allowed content is a `changeTrust` for `asset` (trustline opt-in). */
  static assertTrustlineOnly(tx: Transaction, asset: Asset): void {
    if (tx.operations.length !== 1) throw new ValidationError('Se esperaba solo la trustline');
    const op = tx.operations[0];
    if (op.type !== 'changeTrust') throw new ValidationError('Se esperaba una operación changeTrust');
    const line = op.line;
    if (!(line instanceof Asset) || !line.equals(asset)) {
      throw new ValidationError(`La trustline no es para ${asset.getCode()}`);
    }
  }

  /** Allowed on the SDEX relay: trustlines and offers on the caller's account, nothing that moves funds out. */
  static assertSdexOperations(tx: Transaction): void {
    const allowed = new Set(['changeTrust', 'manageSellOffer', 'manageBuyOffer']);
    for (const op of tx.operations) {
      if (!allowed.has(op.type)) {
        throw new ValidationError(`Operación no permitida en el relay del DEX: ${op.type}`);
      }
    }
  }

  /**
   * The transaction is a single Soroban invocation of `method` on `contractId`,
   * and its first argument (the investor address) is the caller's wallet.
   */
  static assertContractInvocation(
    tx: Transaction,
    contractId: string,
    method: string,
    investor: string,
  ): void {
    if (tx.operations.length !== 1 || tx.operations[0].type !== 'invokeHostFunction') {
      throw new ValidationError('Se esperaba una única invocación de contrato');
    }
    const fn = (tx.operations[0] as { func: xdr.HostFunction }).func;
    if (fn.type !== 'hostFunctionTypeInvokeContract') {
      throw new ValidationError('La operación no invoca un contrato');
    }
    const call = fn.invokeContract;
    const target = Address.fromScAddress(call.contractAddress).toString();
    const name = call.functionName.toString();
    if (target !== contractId) throw new ValidationError('La transacción invoca otro contrato');
    if (name !== method) throw new ValidationError(`Se esperaba ${method}(), no ${name}()`);
    const [first] = call.args;
    let caller: unknown;
    try {
      caller = first ? scValToNative(first) : undefined;
    } catch {
      caller = undefined;
    }
    if (caller !== investor) throw new ForbiddenError('La invocación no corresponde a tu wallet');
  }
}
