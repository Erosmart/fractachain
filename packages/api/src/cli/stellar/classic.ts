/**
 * Classic Stellar operations the operator commands need around the payment
 * asset: trustlines, payments, balances, and buying Circle's testnet USDC on
 * the testnet DEX (Friendbot only gives XLM; Circle's faucet is rate-limited
 * and behind a captcha).
 */
import { Asset, BASE_FEE, Keypair, Operation, TransactionBuilder, type Horizon } from '@stellar/stellar-sdk';
import { fundAccount, loadAccountReady, log, type StellarContext } from './network';

const TIMEOUT = 120;

/** Builds, signs and submits classic operations from `source` (extra signers optional). */
export async function submitClassic(
  ctx: StellarContext,
  source: Keypair,
  ops: ReturnType<typeof Operation.payment>[],
  extraSigners: Keypair[] = [],
): Promise<string> {
  // Horizon can lag a just-funded account (404) or still be starting (503).
  const account = await loadAccountReady(ctx, source.publicKey());
  const builder = new TransactionBuilder(account, {
    fee: String(Number(BASE_FEE) * 10),
    networkPassphrase: ctx.preset.passphrase,
  });
  for (const op of ops) builder.addOperation(op);
  const tx = builder.setTimeout(TIMEOUT).build();
  tx.sign(source, ...extraSigners);
  try {
    const res = await ctx.horizon.submitTransaction(tx);
    return res.hash;
  } catch (err) {
    const codes = (err as { response?: { data?: { extras?: { result_codes?: unknown } } } }).response?.data
      ?.extras?.result_codes;
    throw new Error(`Horizon rechazó la transacción: ${JSON.stringify(codes ?? String(err))}`);
  }
}

export async function balanceOf(
  ctx: StellarContext,
  publicKey: string,
  asset: Asset,
): Promise<number | null> {
  let account: Horizon.AccountResponse;
  try {
    account = await ctx.horizon.loadAccount(publicKey);
  } catch {
    return null;
  }
  for (const b of account.balances) {
    if (asset.isNative() && b.asset_type === 'native') return Number(b.balance);
    if (
      !asset.isNative() &&
      'asset_code' in b &&
      b.asset_code === asset.getCode() &&
      b.asset_issuer === asset.getIssuer()
    ) {
      return Number(b.balance);
    }
  }
  return null;
}

/** Opens a trustline to `asset` when missing (`null` balance = no trustline). */
export async function ensureTrustline(
  ctx: StellarContext,
  kp: Keypair,
  asset: Asset,
): Promise<string | null> {
  if ((await balanceOf(ctx, kp.publicKey(), asset)) !== null) return null;
  return submitClassic(ctx, kp, [Operation.changeTrust({ asset })]);
}

export async function pay(
  ctx: StellarContext,
  from: Keypair,
  to: string,
  asset: Asset,
  amount: number,
): Promise<string> {
  return submitClassic(ctx, from, [Operation.payment({ destination: to, asset, amount: amount.toFixed(7) })]);
}

/**
 * Sells XLM for `asset` on the DEX. Uses Horizon's path finder for the
 * expected amount and accepts up to 2 % slippage.
 */
export async function swapXlmFor(
  ctx: StellarContext,
  kp: Keypair,
  asset: Asset,
  xlmToSell: number,
): Promise<{ hash: string; received: number }> {
  const sendAmount = xlmToSell.toFixed(7);
  const paths = await ctx.horizon.strictSendPaths(Asset.native(), sendAmount, [asset]).call();
  const best = paths.records
    .filter(
      (p) => p.destination_asset_code === asset.getCode() && p.destination_asset_issuer === asset.getIssuer(),
    )
    .sort((a, b) => Number(b.destination_amount) - Number(a.destination_amount))[0];
  if (!best || Number(best.destination_amount) <= 0) {
    throw new Error(`No hay liquidez XLM → ${asset.getCode()} en el DEX de esta red`);
  }
  const before = (await balanceOf(ctx, kp.publicKey(), asset)) ?? 0;
  const destMin = (Number(best.destination_amount) * 0.98).toFixed(7);
  const hash = await submitClassic(ctx, kp, [
    Operation.pathPaymentStrictSend({
      sendAsset: Asset.native(),
      sendAmount,
      destination: kp.publicKey(),
      destAsset: asset,
      destMin,
      path: best.path.map((p) =>
        p.asset_type === 'native'
          ? Asset.native()
          : new Asset(p.asset_code as string, p.asset_issuer as string),
      ),
    }),
  ]);
  const after = (await balanceOf(ctx, kp.publicKey(), asset)) ?? 0;
  return { hash, received: Math.round((after - before) * 1e7) / 1e7 };
}

/**
 * Buys about `wanted` units of `asset` with XLM from Friendbot-funded
 * throwaway accounts and sends them to `recipient` (which must hold the
 * trustline). Each throwaway is merged back into the recipient afterwards,
 * so its leftover XLM is not lost. Returns the amount delivered.
 */
export async function buyWithFriendbotXlm(
  ctx: StellarContext,
  recipient: Keypair,
  asset: Asset,
  wanted: number,
  maxAccounts = 8,
): Promise<{ delivered: number; hashes: string[] }> {
  let delivered = 0;
  const hashes: string[] = [];
  for (let i = 0; i < maxAccounts && delivered < wanted; i++) {
    const tmp = Keypair.random();
    await fundAccount(ctx, tmp.publicKey(), 'cuenta temporal');
    await submitClassic(ctx, tmp, [Operation.changeTrust({ asset })]);
    // Keep 15 XLM for reserves and fees.
    const { hash } = await swapXlmFor(ctx, tmp, asset, 9_985);
    hashes.push(hash);
    // Send the exact balance (7 decimals) so the trustline can be removed and the account merged.
    const amount = (await balanceOf(ctx, tmp.publicKey(), asset)) ?? 0;
    hashes.push(
      await submitClassic(ctx, tmp, [
        Operation.payment({ destination: recipient.publicKey(), asset, amount: amount.toFixed(7) }),
        Operation.changeTrust({ asset, limit: '0' }),
        Operation.accountMerge({ destination: recipient.publicKey() }),
      ]),
    );
    delivered += amount;
    log(`  + ${amount.toFixed(2)} ${asset.getCode()} (cuenta temporal ${i + 1})`, { swap: hash });
  }
  return { delivered, hashes };
}
