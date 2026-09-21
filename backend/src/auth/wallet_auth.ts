import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { upsertWalletLogin } from './accounts';

const LOGIN_PREFIX = 'fractachain-login:';
const MAX_AGE_MS = 5 * 60 * 1000;

export function authenticateWithWallet(payload: {
  publicKey?: string;
  message?: string;
  signature?: string;
}) {
  const publicKey = String(payload.publicKey || '');
  const message = String(payload.message || '');
  const signature = String(payload.signature || '');

  if (!StrKey.isValidEd25519PublicKey(publicKey)) {
    return { success: false, message: 'Public key Stellar inválida' };
  }
  const ts = Number(message.slice(LOGIN_PREFIX.length));
  if (!message.startsWith(LOGIN_PREFIX) || !Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_AGE_MS) {
    return { success: false, message: 'Mensaje de firma inválido o vencido' };
  }
  let ok = false;
  try {
    ok = Keypair.fromPublicKey(publicKey).verify(
      Buffer.from(message, 'utf8'),
      Buffer.from(signature, 'base64')
    );
  } catch {
    ok = false;
  }
  if (!ok) return { success: false, message: 'Firma inválida' };

  const result = upsertWalletLogin(publicKey);
  return { success: true, token: result.token, user: result.user };
}
