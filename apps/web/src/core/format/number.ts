/** Pins the es-AR separators so server and browser render the same digits. */
export function formatAmount(n: number, digits = 0): string {
  return Number(n).toLocaleString('es-AR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatInt(n: number): string {
  return formatAmount(n, 0);
}

export const EXPLORER = 'https://stellar.expert/explorer/testnet';

export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerContract = (id: string) => `${EXPLORER}/contract/${id}`;
export const explorerAccount = (id: string) => `${EXPLORER}/account/${id}`;
