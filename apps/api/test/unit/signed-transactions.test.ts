import { describe, expect, it } from 'vitest';
import { Account, Address, Asset, Keypair, Networks, Operation, TransactionBuilder, nativeToScVal } from '@stellar/stellar-sdk';
import { SignedTransactionPolicy } from '../../src/infrastructure/stellar/SignedTransactionPolicy';
import { ForbiddenError, ValidationError } from '../../src/shared/errors';

const user = Keypair.random();
const other = Keypair.random();
const issuer = Keypair.random();
const USDC = new Asset('USDC', issuer.publicKey());
const CONTRACT = 'CDHKGEJNNFYKXW4XOEDXXE5LOF5HCYVORR2JT7AOK2FAN5B6I65X7JLM';

function tx(source: Keypair, ...ops: ReturnType<typeof Operation.payment>[]) {
  const builder = new TransactionBuilder(new Account(source.publicKey(), '1'), { fee: '100', networkPassphrase: Networks.TESTNET });
  ops.forEach((op) => builder.addOperation(op));
  return builder.setTimeout(60).build();
}

describe('SignedTransactionPolicy', () => {
  it('accepts the caller’s own trustline and rejects anything else on the USDC relay', () => {
    const ok = tx(user, Operation.changeTrust({ asset: USDC }));
    expect(() => SignedTransactionPolicy.assertSourcedBy(ok, user.publicKey())).not.toThrow();
    expect(() => SignedTransactionPolicy.assertTrustlineOnly(ok, USDC)).not.toThrow();

    const drain = tx(user, Operation.payment({ destination: other.publicKey(), asset: Asset.native(), amount: '100' }));
    expect(() => SignedTransactionPolicy.assertTrustlineOnly(drain, USDC)).toThrow(ValidationError);

    const wrongAsset = tx(user, Operation.changeTrust({ asset: new Asset('EVIL', issuer.publicKey()) }));
    expect(() => SignedTransactionPolicy.assertTrustlineOnly(wrongAsset, USDC)).toThrow(ValidationError);
  });

  it('refuses transactions sourced by — or containing ops of — another account', () => {
    expect(() => SignedTransactionPolicy.assertSourcedBy(tx(other, Operation.changeTrust({ asset: USDC })), user.publicKey())).toThrow(ForbiddenError);
    const smuggled = tx(user, Operation.changeTrust({ asset: USDC, source: other.publicKey() }));
    expect(() => SignedTransactionPolicy.assertSourcedBy(smuggled, user.publicKey())).toThrow(ForbiddenError);
  });

  it('only lets trustlines and offers through the SDEX relay', () => {
    const offer = tx(
      user,
      Operation.changeTrust({ asset: USDC }),
      Operation.manageSellOffer({ selling: Asset.native(), buying: USDC, amount: '1', price: '1' }),
    );
    expect(() => SignedTransactionPolicy.assertSdexOperations(offer)).not.toThrow();
    const pay = tx(user, Operation.payment({ destination: other.publicKey(), asset: USDC, amount: '1' }));
    expect(() => SignedTransactionPolicy.assertSdexOperations(pay)).toThrow(ValidationError);
  });

  it('checks contract, method and investor of a Soroban invocation', () => {
    const invoke = (method: string, investor: string, contract = CONTRACT) =>
      tx(
        user,
        Operation.invokeContractFunction({
          contract,
          function: method,
          args: [Address.fromString(investor).toScVal(), nativeToScVal(10_000_000n, { type: 'i128' })],
        }),
      );
    expect(() => SignedTransactionPolicy.assertContractInvocation(invoke('contribute', user.publicKey()), CONTRACT, 'contribute', user.publicKey())).not.toThrow();
    expect(() => SignedTransactionPolicy.assertContractInvocation(invoke('refund', user.publicKey()), CONTRACT, 'contribute', user.publicKey())).toThrow(ValidationError);
    expect(() => SignedTransactionPolicy.assertContractInvocation(invoke('contribute', other.publicKey()), CONTRACT, 'contribute', user.publicKey())).toThrow(ForbiddenError);
    const elsewhere = 'CD3MZ34ER36Z7WR66YIXH6MIYMY4OGFYVN3S5P7NNXGT6DZXVJUBDGL5';
    expect(() => SignedTransactionPolicy.assertContractInvocation(invoke('contribute', user.publicKey(), elsewhere), CONTRACT, 'contribute', user.publicKey())).toThrow(ValidationError);
  });
});
