import { Keypair } from '@stellar/stellar-sdk';
import { custodialSigningKey, getAccount } from '../auth/accounts';
import { loadNativeXlm } from '../auth/stellar_testnet';
import { Listing } from '../admin/listings';
import { licitacionAdminKeypair } from './keys';
import {
  AnyClient,
  contractClient,
  fromStroops,
  invoke,
  isLiveContractId,
  read,
  toStroops,
} from './soroban';

const ARGENTINA = 32;
const INVESTOR_NATIONAL = 0;
const YEAR_SECS = 365 * 24 * 3600;

function licitacionId(listing: Listing): string {
  if (!isLiveContractId(listing.licitacionContract)) {
    throw new Error('Esta licitación no tiene un contrato Soroban real');
  }
  return listing.licitacionContract;
}

async function adminClient(listing: Listing): Promise<{ client: AnyClient; admin: Keypair }> {
  const admin = await licitacionAdminKeypair();
  return { client: await contractClient(licitacionId(listing), admin), admin };
}

export async function isInvestorVerified(listing: Listing, investor: string): Promise<boolean> {
  const client = await contractClient(licitacionId(listing));
  return Boolean(await read<boolean>(client, 'is_verified', { investor }));
}

export async function verifyInvestorOnChain(listing: Listing, investor: string): Promise<string | null> {
  if (!isLiveContractId(listing.licitacionContract) || !investor) return null;
  if (await isInvestorVerified(listing, investor)) return null;
  const { client, admin } = await adminClient(listing);
  const expiry = BigInt(Math.floor(Date.now() / 1000) + YEAR_SECS);
  const { hash } = await invoke(client, 'verify_investor', {
    admin: admin.publicKey(),
    investor,
    country_code: ARGENTINA,
    investor_type: INVESTOR_NATIONAL,
    expiry,
  });
  return hash;
}

export async function contributeOnChain(
  listing: Listing,
  accountId: string,
  amount: number,
): Promise<{
  hash: string;
  raised: number;
  tokens: number;
  licitacion: string;
}> {
  const account = getAccount(accountId);
  if (!account) throw new Error('Inversor no encontrado');
  if (account.custodyMode !== 'CUSTODIAL' || !account.publicKey) {
    throw new Error(
      'El aporte on-chain de esta demo se firma con custodia de la plataforma. Las wallets propias (Freighter) vienen después del 27/09.',
    );
  }
  const buyer = Keypair.fromSecret(custodialSigningKey(accountId));
  const xlm = await loadNativeXlm(buyer.publicKey());
  if (xlm < amount + 2) {
    throw new Error(
      `La wallet tiene ${xlm.toFixed(2)} XLM y el aporte es ${amount}. Friendbot o recargá XLM de testnet.`,
    );
  }

  await verifyInvestorOnChain(listing, buyer.publicKey());

  const stroops = toStroops(amount);
  const client = await contractClient(licitacionId(listing), buyer);
  const { hash } = await invoke(client, 'contribute', {
    buyer: buyer.publicKey(),
    payment_amount: stroops,
  });
  if (!hash) throw new Error('El aporte se envió pero no volvió hash de transacción');

  const raisedStroops = await read<bigint>(client, 'get_total_raised');
  const rwa = await read<bigint>(client, 'get_rwa_balance', { user: buyer.publicKey() });
  return {
    hash,
    raised: fromStroops(raisedStroops),
    tokens: Number(rwa),
    licitacion: listing.licitacionContract,
  };
}

export async function finalizeOnChain(listing: Listing): Promise<{
  hash: string | null;
  state: number;
  raised: number;
}> {
  const { client } = await adminClient(listing);
  const { hash } = await invoke(client, 'finalize');
  const state = Number(await read<number>(client, 'get_state'));
  const raised = fromStroops(await read<bigint>(client, 'get_total_raised'));
  return { hash, state, raised };
}

export async function readLicitacion(listing: Listing) {
  const client = await contractClient(licitacionId(listing));
  const [state, raised, price] = await Promise.all([
    read<number>(client, 'get_state'),
    read<bigint>(client, 'get_total_raised'),
    read<bigint>(client, 'get_price_per_unit'),
  ]);
  return {
    state: Number(state),
    raised: fromStroops(raised),
    price: fromStroops(price),
  };
}
