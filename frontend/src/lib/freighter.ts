'use client';

import { isConnected, isAllowed, requestAccess, getAddress, signMessage } from '@stellar/freighter-api';

export type FreighterLoginPayload = { publicKey: string; message: string; signature: string };

export async function freighterAddress(): Promise<string> {
  const conn = await isConnected().catch(() => ({ isConnected: false }));
  if (!conn.isConnected) {
    throw new Error('No encontramos Freighter. Instalá la extensión desde freighter.app y recargá.');
  }
  const allowed = await isAllowed().catch(() => ({ isAllowed: false }));
  if (!allowed.isAllowed) {
    const acc = await requestAccess();
    if (acc.error) throw new Error(acc.error.message || 'Freighter rechazó la conexión');
  }
  const { address, error: addrErr } = await getAddress();
  if (addrErr || !address) throw new Error(addrErr?.message || 'Freighter no devolvió tu dirección');
  return address;
}

export async function freighterLoginPayload(): Promise<FreighterLoginPayload> {
  const address = await freighterAddress();
  const message = `fractachain-login:${Date.now()}`;
  const res = await signMessage(message, { address });
  if (res.error) throw new Error(res.error.message || 'Freighter no firmó el mensaje');
  const sig = res.signedMessage;
  if (!sig) throw new Error('Freighter no firmó el mensaje');

  const signature = typeof sig === 'string' ? sig : toBase64(sig);
  return { publicKey: address, message, signature };
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
