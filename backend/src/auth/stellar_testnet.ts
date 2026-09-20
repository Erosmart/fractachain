import { Horizon, Keypair, StrKey } from '@stellar/stellar-sdk';

const FRIENDBOT = process.env.STELLAR_FRIENDBOT_URL || 'https://friendbot.stellar.org';
const HORIZON = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';

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
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${FRIENDBOT}/?addr=${encodeURIComponent(publicKey)}`, { signal: ctrl.signal });
    const body = await res.text();
    const already =
      /already/i.test(body) ||
      /createAccountAlreadyExist/i.test(body) ||
      /op_already_exists/i.test(body);
    return { funded: res.ok || already, already };
  } catch {
    return { funded: false, already: false };
  } finally {
    clearTimeout(timer);
  }
}

export async function loadNativeXlm(publicKey: string): Promise<number> {
  try {
    const server = new Horizon.Server(HORIZON);
    const account = await server.loadAccount(publicKey);
    const native = account.balances.find((b) => b.asset_type === 'native');
    return native ? Number(native.balance) : 0;
  } catch {
    return 0;
  }
}
