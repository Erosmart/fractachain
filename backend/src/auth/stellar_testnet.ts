import { Asset, BASE_FEE, Horizon, Keypair, Operation, StrKey, TransactionBuilder } from '@stellar/stellar-sdk';
import { spawn } from 'child_process';
import { getTestnetConfig } from '../admin/testnet';

const FRIENDBOT = process.env.STELLAR_FRIENDBOT_URL || 'https://friendbot.stellar.org';

function horizonUrl() {
  return process.env.STELLAR_HORIZON_URL || getTestnetConfig().horizonUrl;
}

export function isStellarPublicKey(pk?: string) {
  if (!pk) return false;
  try {
    return StrKey.isValidEd25519PublicKey(pk);
  } catch {
    return false;
  }
}

export function createStellarKeypair() {
  const kp = Keypair.random();
  return { publicKey: kp.publicKey(), secretKey: kp.secret() };
}

export async function fundFriendbot(publicKey: string) {
  const urls = [
    `${FRIENDBOT}/?addr=${encodeURIComponent(publicKey)}`,
    `${horizonUrl()}/friendbot?addr=${encodeURIComponent(publicKey)}`,
  ];
  for (const url of urls) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      const body = await res.text();
      const already =
        /already/i.test(body) ||
        /createAccountAlreadyExist/i.test(body) ||
        /op_already_exists/i.test(body);
      if (res.ok || already) return { funded: true, already };
    } catch {
      // Node fetch on this Windows host often fails; fall through to curl.
    } finally {
      clearTimeout(timer);
    }
    const viaCurl = await fundFriendbotCurl(url);
    if (viaCurl.funded) return viaCurl;
  }
  return { funded: false, already: false };
}

function fundFriendbotCurl(url: string): Promise<{ funded: boolean; already: boolean }> {
  return new Promise((resolve) => {
    const bin = process.platform === 'win32' ? 'curl.exe' : 'curl';
    const child = spawn(bin, ['-sS', url], { windowsHide: true });
    let body = '';
    child.stdout.on('data', (chunk) => {
      body += chunk.toString();
    });
    child.on('error', () => resolve({ funded: false, already: false }));
    child.on('close', (code) => {
      const already =
        /already/i.test(body) ||
        /createAccountAlreadyExist/i.test(body) ||
        /op_already_exists/i.test(body);
      resolve({ funded: code === 0 && (/successful/i.test(body) || already || /hash/i.test(body)), already });
    });
  });
}

let horizon: Horizon.Server | null = null;
let horizonBound = '';

function horizonServer() {
  const url = horizonUrl();
  if (!horizon || horizonBound !== url) {
    horizon = new Horizon.Server(url);
    horizonBound = url;
  }
  return horizon;
}

export async function loadNativeXlm(publicKey: string): Promise<number> {
  try {
    const account = await horizonServer().loadAccount(publicKey);
    const native = account.balances.find((b) => b.asset_type === 'native');
    return native ? Number(native.balance) : 0;
  } catch {
    return 0;
  }
}

/**
 * Friendbot only creates accounts once — it never refills. A wallet that was
 * created but spent its XLM below `floor` can't even pay fees, so the
 * platform tops it up from the deployer. Plain payments need no recipient
 * signature, which makes this safe for self-custody wallets too.
 */
const XLM_FLOOR = Math.max(0, Number(process.env.STELLAR_XLM_FLOOR || 5));
const XLM_TOPUP = Math.max(XLM_FLOOR, Number(process.env.STELLAR_XLM_TOPUP || 50));

export async function topUpXlm(publicKey: string): Promise<{ topped: boolean; balance: number; hash?: string }> {
  if (!isStellarPublicKey(publicKey)) return { topped: false, balance: 0 };
  let balance: number;
  try {
    const account = await horizonServer().loadAccount(publicKey);
    balance = Number(account.balances.find((b) => b.asset_type === 'native')?.balance || 0);
  } catch {
    return { topped: false, balance: 0 }; // not on-ledger yet — friendbot creates those
  }
  if (balance >= XLM_FLOOR) return { topped: false, balance };
  const { deployerKeypair } = await import('../stellar/keys'); // dynamic: keys imports fundFriendbot back
  const payer = deployerKeypair();
  const source = await horizonServer().loadAccount(payer.publicKey());
  const tx = new TransactionBuilder(source, {
    fee: String(Number(BASE_FEE) * 100),
    networkPassphrase: getTestnetConfig().networkPassphrase,
  })
    .addOperation(Operation.payment({ destination: publicKey, asset: Asset.native(), amount: String(XLM_TOPUP) }))
    .setTimeout(60)
    .build();
  tx.sign(payer);
  const res = await horizonServer().submitTransaction(tx);
  return { topped: true, balance: balance + XLM_TOPUP, hash: (res as any)?.hash };
}

export async function loadAssetBalance(
  publicKey: string,
  code: string,
  issuer: string,
): Promise<number> {
  try {
    const account = await horizonServer().loadAccount(publicKey);
    const bal = account.balances.find(
      (b) =>
        (b.asset_type === 'credit_alphanum4' || b.asset_type === 'credit_alphanum12') &&
        b.asset_code === code &&
        b.asset_issuer === issuer,
    );
    return bal ? Number(bal.balance) : 0;
  } catch {
    return 0;
  }
}
