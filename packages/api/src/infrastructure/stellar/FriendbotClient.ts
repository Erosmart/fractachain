import { spawn } from 'child_process';
import { isStellarPublicKey } from '../../domain/stellar/StellarAddress';
import type { StellarClients } from './StellarClients';

export interface FriendbotResult {
  funded: boolean;
  already: boolean;
}

export interface IFriendbot {
  fund(publicKey: string): Promise<FriendbotResult>;
}

const ALREADY = /already|createAccountAlreadyExist|op_already_exists/i;

/**
 * Testnet faucet. Creates (never refills) an account with 10 000 XLM.
 *
 * Falls back to `curl` because Node's fetch fails on some Windows dev hosts.
 * The child is spawned without a shell and the address is validated first,
 * so the URL cannot smuggle arguments.
 */
export class FriendbotClient implements IFriendbot {
  private static readonly TIMEOUT_MS = 20_000;

  constructor(
    private readonly friendbotUrl: string,
    private readonly clients: StellarClients,
  ) {}

  async fund(publicKey: string): Promise<FriendbotResult> {
    if (!isStellarPublicKey(publicKey)) return { funded: false, already: false };
    const addr = encodeURIComponent(publicKey);
    const urls = [`${this.friendbotUrl}/?addr=${addr}`, `${this.clients.horizon().serverURL.toString().replace(/\/+$/, '')}/friendbot?addr=${addr}`];
    for (const url of urls) {
      const viaFetch = await this.viaFetch(url);
      if (viaFetch.funded) return viaFetch;
      const viaCurl = await this.viaCurl(url);
      if (viaCurl.funded) return viaCurl;
    }
    return { funded: false, already: false };
  }

  private async viaFetch(url: string): Promise<FriendbotResult> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FriendbotClient.TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      const body = await res.text();
      const already = ALREADY.test(body);
      return { funded: res.ok || already, already };
    } catch {
      return { funded: false, already: false };
    } finally {
      clearTimeout(timer);
    }
  }

  private viaCurl(url: string): Promise<FriendbotResult> {
    return new Promise((resolve) => {
      const bin = process.platform === 'win32' ? 'curl.exe' : 'curl';
      const child = spawn(bin, ['-sS', '--max-time', String(FriendbotClient.TIMEOUT_MS / 1000), url], {
        windowsHide: true,
        shell: false,
      });
      let body = '';
      child.stdout.on('data', (chunk) => {
        body += chunk.toString();
      });
      child.on('error', () => resolve({ funded: false, already: false }));
      child.on('close', (code) => {
        const already = ALREADY.test(body);
        resolve({ funded: code === 0 && (/successful/i.test(body) || already || /hash/i.test(body)), already });
      });
    });
  }
}
