/* Testnet market maker: seeds ~4,000 real SDEX trades (1,000 per token)
 * with extreme volatility. Each round = one tx seeding a ladder of offers
 * + one tx sweeping it. Three agent pairs work the four tokens in parallel. */
import 'dotenv/config';
import { Asset, Horizon, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';

const H = new Horizon.Server('https://horizon-testnet.stellar.org');
const PASS = 'Test SDF Network ; September 2015';
const agents: { email: string; publicKey: string; secret: string }[] =
  require('C:/Users/eros_/Downloads/agents_secrets.json').agents;

const TOKEN_ISSUER = 'GAGPWEIFYS54Y5WY3WJ6IWXK4YAPSNRVOEWEGBL7W3BKR6YL4VUYE653';
const USDC = new Asset('USDC', 'GCASKV25GUVZTFZ6HFTJPKNYKW3OUOWCSAM3I5JAR7MWH6ZCLYV7R7MB');
const usdcKp = Keypair.fromSecret(process.env.STELLAR_USDC_ISSUER_SECRET!);
const tokKp = Keypair.fromSecret(process.env.STELLAR_ISSUER_SECRET!);

const TOKENS = [
  { code: 'TDEMO', center: 10 },
  { code: 'TDEMO4021', center: 1 },
  { code: 'TDEMO3698', center: 1 },
  { code: 'TUWU', center: 80 },
].map((t) => ({ ...t, asset: new Asset(t.code, TOKEN_ISSUER), fills: 0 }));

const TARGET = 1000;
const seqs = new Map<string, string>();
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const kpOf = (pk: string) => agents.find((a) => a.publicKey === pk)!;

async function seqFor(pk: string): Promise<string> {
  if (!seqs.has(pk)) seqs.set(pk, (await H.loadAccount(pk)).sequence);
  const s = seqs.get(pk)!;
  seqs.set(pk, (BigInt(s) + BigInt(1)).toString());
  return s;
}

async function send(source: Keypair, ops: any[], tries = 3): Promise<any> {
  for (let i = 0; i < tries; i++) {
    try {
      const acc = new (require('@stellar/stellar-sdk').Account)(source.publicKey(), (await seqFor(source.publicKey())).toString());
      const tx = new TransactionBuilder(acc as any, { fee: '100000', networkPassphrase: PASS });
      ops.forEach((o) => tx.addOperation(o));
      const built = tx.setTimeout(120).build();
      built.sign(source);
      return await H.submitTransaction(built);
    } catch (e: any) {
      const codes = e?.response?.data?.extras?.result_codes;
      const code = e?.response?.data?.title || e.message;
      if (i === tries - 1 || (!/bad_seq|timeout|503|429/i.test(String(code) + JSON.stringify(codes || '')))) throw e;
      seqs.delete(source.publicKey());
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
}

/** Grants raw balances so the demo never stalls: USDC grant + token inventory. */
async function fund() {
  const flags: any[] = [];
  const pays: any[] = [];
  const usdcPays: any[] = [];
  for (const a of agents) {
    let acc: any;
    for (let i = 0; i < 5; i++) {
      try { acc = await H.loadAccount(a.publicKey); break; }
      catch { await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
    }
    if (!acc) throw new Error('loadAccount failed ' + a.publicKey);
    const has = (code: string, iss: string) =>
      acc.balances.some((b: any) => b.asset_code === code && b.asset_issuer === iss);
    const ct: any[] = [];
    if (!has('USDC', USDC.getIssuer()!)) ct.push(Operation.changeTrust({ asset: USDC, source: a.publicKey }));
    for (const t of TOKENS) {
      if (!has(t.code, TOKEN_ISSUER)) {
        ct.push(Operation.changeTrust({ asset: t.asset, source: a.publicKey }));
        flags.push(
          Operation.setTrustLineFlags({
            trustor: a.publicKey, asset: t.asset, flags: { authorized: true }, source: tokKp.publicKey(),
          }),
        );
      }
      pays.push(Operation.payment({ destination: a.publicKey, asset: t.asset, amount: '20000', source: tokKp.publicKey() }));
    }
    if (ct.length) await send(Keypair.fromSecret(a.secret), ct);
    usdcPays.push(Operation.payment({ destination: a.publicKey, asset: USDC, amount: '400000', source: usdcKp.publicKey() }));
  }
  for (const chunk of chunkArr(flags, 90)) await send(tokKp, chunk);
  for (const chunk of chunkArr(pays, 90)) await send(tokKp, chunk);
  await send(usdcKp, usdcPays);
  console.log('funded: 6 agents, trustlines+auth, 20k/token each, 400k USDC each');
}
const chunkArr = <T,>(a: T[], n: number) =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** Latest paging token of a pair's trade tape (counting baseline). */
async function tapeCursor(asset: Asset) {
  try {
    const r = await H.trades().forAssetPair(asset, USDC).order('desc').limit(1).call();
    return r.records[0]?.paging_token || 'now';
  } catch {
    return 'now';
  }
}

const codeOf = (x: any) => (x.asset_type === 'native' ? 'XLM' : x.asset_code);

/** Cancel every offer `pk` has on token/USDC with side `side` ('ask'|'bid'), retrying on races. */
async function clearSide(pk: string, kp: Keypair, tk: (typeof TOKENS)[number], side: 'ask' | 'bid') {
  for (let i = 0; i < 4; i++) {
    const open = await H.offers().forAccount(pk).limit(200).call();
    const mine = open.records.filter((o: any) => {
      const sellsTok = codeOf(o.selling) === tk.code && codeOf(o.buying) === 'USDC';
      const buysTok = codeOf(o.buying) === tk.code && codeOf(o.selling) === 'USDC';
      return side === 'ask' ? sellsTok : buysTok;
    });
    if (!mine.length) return;
    const ops = mine.map((o: any) =>
      side === 'ask'
        ? Operation.manageSellOffer({ selling: tk.asset, buying: USDC, amount: '0', price: '1', offerId: o.id })
        : Operation.manageBuyOffer({ buying: tk.asset, selling: USDC, buyAmount: '0', price: '1', offerId: o.id }),
    );
    try {
      await send(kp, ops);
      return;
    } catch {}
  }
}

/** One round on a token for a worker pair: ladder + sweep, random direction. */
async function round(tk: (typeof TOKENS)[number], maker: string, taker: string, leaveResting: boolean) {
  const drift = rnd(-0.45, 0.5);
  tk.center = Math.min(600, Math.max(0.4, tk.center * (1 + drift)));
  const up = Math.random() < 0.5;
  const n = Math.round(rnd(15, 40));
  const makerKp = Keypair.fromSecret(kpOf(maker).secret);
  const takerKp = Keypair.fromSecret(kpOf(taker).secret);
  // The maker's own opposite-side offers would cross the new ladder.
  await clearSide(maker, makerKp, tk, up ? 'bid' : 'ask');
  const ops: any[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const qty = +rnd(0.1, 9).toFixed(3);
    const spike = Math.random() < 0.08 ? rnd(2, 4) : 1; // occasional extreme wick
    const p = up
      ? tk.center * (0.4 + (0.9 * i) / n) * spike
      : tk.center * (1.4 - (0.9 * i) / n) / spike;
    total += qty;
    ops.push(
      up
        ? Operation.manageSellOffer({ selling: tk.asset, buying: USDC, amount: qty.toFixed(7), price: p.toFixed(6), source: maker })
        : Operation.manageBuyOffer({ buying: tk.asset, selling: USDC, buyAmount: qty.toFixed(7), price: p.toFixed(6), source: maker }),
    );
  }
  await send(makerKp, ops);
  // Leave some rounds' edges resting so the book stays alive between sweeps.
  const sweepQty = leaveResting ? total * rnd(0.6, 0.85) : total + rnd(0, 3);
  const crossPrice = up ? tk.center * 2 : Math.max(0.05, tk.center * 0.3);
  // The sweep would hit the taker's own resting offers on the swept side.
  await clearSide(taker, takerKp, tk, up ? 'ask' : 'bid');
  await send(
    takerKp,
    [
      up
        ? Operation.manageBuyOffer({ buying: tk.asset, selling: USDC, buyAmount: sweepQty.toFixed(7), price: crossPrice.toFixed(6) })
        : Operation.manageSellOffer({ selling: tk.asset, buying: USDC, amount: sweepQty.toFixed(7), price: crossPrice.toFixed(6) }),
    ],
  );
  tk.fills += Math.min(n, Math.max(0, Math.round(sweepQty > total ? n : (sweepQty / total) * n)));
}

async function worker(pair: [number, number], tag: string) {
  const [a, b] = pair;
  while (TOKENS.some((t) => t.fills < TARGET)) {
    const tk = TOKENS.find((t) => t.fills < TARGET);
    if (!tk) break;
    const leave = Math.random() < 0.18;
    const [m, k] = Math.random() < 0.5 ? [agents[a].publicKey, agents[b].publicKey] : [agents[b].publicKey, agents[a].publicKey];
    try {
      await round(tk, m, k, leave);
      if (tk.fills % 100 < 40) console.log(`[${tag}] ${tk.code}: ~${tk.fills} fills, center ${tk.center.toFixed(2)}`);
    } catch (e: any) {
      const codes = e?.response?.data?.extras?.result_codes;
      console.warn(`[${tag}] round failed:`, codes || e.message);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

async function main() {
  const cursors = new Map(TOKENS.map((t) => [t.code, '']));
  await fund();
  for (const t of TOKENS) cursors.set(t.code, await tapeCursor(t.asset));
  await Promise.all([worker([0, 1], 'W1'), worker([2, 3], 'W2'), worker([4, 5], 'W3')]);
  for (const t of TOKENS) {
    const real = await countSince(t.asset, cursors.get(t.code)!);
    console.log(`${t.code}: ${real} real trades on tape (target ${TARGET})`);
  }
  console.log('DONE');
}

async function countSince(asset: Asset, cursor: string) {
  let n = 0;
  let c = cursor === 'now' ? 'now' : cursor;
  for (let i = 0; i < 60; i++) {
    let r: any;
    try {
      r = await H.trades().forAssetPair(asset, USDC).cursor(c).order('asc').limit(200).call();
    } catch {
      break;
    }
    n += r.records.length;
    if (r.records.length < 200) break;
    c = r.records[r.records.length - 1].paging_token;
  }
  return n;
}

main().catch((e) => { console.error(e); process.exit(1); });
