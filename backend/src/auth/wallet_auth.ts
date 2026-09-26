import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { upsertWalletLogin, linkSelfCustodyWallet } from './accounts';

const LOGIN_PREFIX = 'fractachain-login:';
const LINK_PREFIX = 'fractachain-link:';
const MAX_AGE_MS = 5 * 60 * 1000;

function verifySignature(publicKey: string, message: string, signature: string, prefix: string) {
  if (!StrKey.isValidEd25519PublicKey(publicKey)) {
    return 'Public key Stellar inválida';
  }
  const ts = Number(message.slice(prefix.length));
  if (!message.startsWith(prefix) || !Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_AGE_MS) {
    return 'Mensaje de firma inválido o vencido';
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
  return ok ? null : 'Firma inválida';
}

export function authenticateWithWallet(payload: {
  publicKey?: string;
  message?: string;
  signature?: string;
}) {
  const publicKey = String(payload.publicKey || '');
  const message = String(payload.message || '');
  const signature = String(payload.signature || '');

  const error = verifySignature(publicKey, message, signature, LOGIN_PREFIX);
  if (error) return { success: false, message: error };

  const result = upsertWalletLogin(publicKey);
  return { success: true, token: result.token, user: result.user };
}

/**
 * Vincula una wallet Freighter a una cuenta ya logueada (email/Google).
 * La firma prueba que el inversor controla la clave antes de guardarla.
 */
export function linkWalletSignature(
  accountId: string,
  payload: { publicKey?: string; message?: string; signature?: string },
) {
  const publicKey = String(payload.publicKey || '');
  const message = String(payload.message || '');
  const signature = String(payload.signature || '');

  const error = verifySignature(publicKey, message, signature, LINK_PREFIX);
  if (error) throw new Error(error);

  const user = linkSelfCustodyWallet(accountId, publicKey);
  return { success: true, user };
}
