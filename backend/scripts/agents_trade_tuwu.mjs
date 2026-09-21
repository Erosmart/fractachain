#!/usr/bin/env node
/**
 * Agentes demo on-chain: compran y venden TUWU contra USDC en el SDEX de
 * testnet para que el orderbook/sparkline del frontend muestre el precio
 * moviéndose. No usa el backend: firma directo con las claves de cada agente.
 *
 *   cd backend
 *   STELLAR_ISSUER_SECRET=SC37… node scripts/agents_trade_tuwu.mjs
 *
 * Env opcionales: AGENTS (default 6), ROUNDS (default 16), PRICE (default 10),
 * TUWU_CODE (default TUWU), USDC_ISSUER (Circle testnet).
 *
 * Reusa las wallets de ../../agents_secrets.json si existe (o lo crea).
 * ESE ARCHIVO TIENE CLAVES PRIVADAS — no commitear.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Asset,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  BASE_FEE,
} from '@stellar/stellar-sdk';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(DIR, '..', '..', 'agents_secrets.json');

const HORIZON = 'https://horizon-testnet.stellar.org';
const PASSPHRASE = Networks.TESTNET;
const server = new Horizon.Server(HORIZON);

const TUWU_CODE = process.env.TUWU_CODE || 'TUWU';
const USDC_CODE = 'USDC';
const USDC_ISSUER =
  process.env.USDC_ISSUER || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const N_AGENTS = Number(process.env.AGENTS || 6);
const ROUNDS = Number(process.env.ROUNDS || 16);
const START_PRICE = Number(process.env.PRICE || 10);
const TUWU_PER_AGENT = 8;
const USDC_AMMO_XLM = 60; // XLM que cada agente swapea a USDC para comprar

const rnd = (a, b) => a + Math.random() * (b - a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const txOpts = { fee: BASE_FEE, networkPassphrase: PASSPHRASE };

async function submit(kp, ops) {
  const acct = await server.loadAccount(kp.publicKey());
  const tx = new TransactionBuilder(acct, txOpts);
  for (const op of ops) tx.addOperation(op);
  const built = tx.setTimeout(60).build();
  built.sign(kp);
  return server.submitTransaction(built);
}

async function accountExists(pub) {
  try {
    await server.loadAccount(pub);
    return true;
  } catch {
    return false;
  }
}

async function fundFriendbot(pub) {
  const r = await fetch(`https://friendbot.stellar.org/?addr=${pub}`);
  if (!r.ok) throw new Error(`friendbot ${pub.slice(0, 8)}: HTTP ${r.status}`);
}

function loadAgents() {
  try {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    const saved = (prev.agents || []).filter((a) => a.secret && a.publicKey);
    if (saved.length) {
      console.log(`reusando ${saved.length} wallets de agents_secrets.json`);
      return saved.map((a) => ({ email: a.email, kp: Keypair.fromSecret(a.secret) }));
    }
  } catch {
    // sin archivo o sin secrets: genera nuevas
  }
  const agents = Array.from({ length: N_AGENTS }, (_, i) => ({
    email: `agente${i + 1}@fractachain.demo`,
    kp: Keypair.random(),
  }));
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note: 'CLAVES PRIVADAS de las wallets demo (testnet). No commitear.',
        listing: `${TUWU_CODE}/USDC on-chain`,
        agents: agents.map((a) => ({
          email: a.email,
          publicKey: a.kp.publicKey(),
          secret: a.kp.secret(),
        })),
      },
      null,
      2,
    ),
  );
  console.log(`generadas ${agents.length} wallets nuevas → ${OUT}`);
  return agents;
}

async function setup(agents, issuer, TUWU, USDC) {
  // 1) XLM para todas (friendbot solo si la cuenta no existe)
  for (const a of agents) {
    if (await accountExists(a.kp.publicKey())) continue;
    await fundFriendbot(a.kp.publicKey());
    console.log(`  friendbot → ${a.kp.publicKey().slice(0, 10)}`);
    await sleep(300);
  }

  // 2) trustlines USDC + TUWU firmadas por cada agente
  for (const a of agents) {
    const acct = await server.loadAccount(a.kp.publicKey());
    const bal = acct.balances.map((b) => (b.asset_type === 'native' ? 'XLM' : b.asset_code));
    const ops = [];
    if (!bal.includes('USDC')) ops.push(Operation.changeTrust({ asset: USDC }));
    if (!bal.includes(TUWU_CODE)) ops.push(Operation.changeTrust({ asset: TUWU }));
    if (ops.length) {
      await submit(a.kp, ops);
      console.log(`  trustlines ${a.email}`);
    }
  }

  // 3) issuer autoriza las trustlines TUWU (AUTH_REQUIRED) y reparte tokens
  const issuerAcct = await server.loadAccount(issuer.publicKey());
  const tx = new TransactionBuilder(issuerAcct, txOpts);
  for (const a of agents) {
    tx.addOperation(
      Operation.setTrustLineFlags({
        trustor: a.kp.publicKey(),
        asset: TUWU,
        flags: { authorized: true },
      }),
    );
    tx.addOperation(
      Operation.payment({
        destination: a.kp.publicKey(),
        asset: TUWU,
        amount: String(TUWU_PER_AGENT),
      }),
    );
  }
  const built = tx.setTimeout(60).build();
  built.sign(issuer);
  await server.submitTransaction(built);
  console.log(`  issuer autorizó + repartió ${TUWU_PER_AGENT} ${TUWU_CODE} a cada agente`);

  // 4) cada agente swapea XLM→USDC por el DEX (munición para comprar)
  for (const a of agents) {
    try {
      await submit(a.kp, [
        Operation.pathPaymentStrictSend({
          sendAsset: Asset.native(),
          sendAmount: String(USDC_AMMO_XLM),
          destination: a.kp.publicKey(),
          destAsset: USDC,
          destMin: '0.0000001',
          path: [],
        }),
      ]);
    } catch (e) {
      console.error(`  swap XLM→USDC ${a.email}: ${e.message?.slice(0, 120)}`);
    }
  }
}

async function trade(agents, TUWU, USDC) {
  let mid = START_PRICE;
  let fills = 0;
  for (let r = 0; r < ROUNDS; r++) {
    // caminata: precio de la ronda alrededor del anterior
    mid = Math.max(0.5, mid * (1 + rnd(-0.06, 0.06)));
    const price = mid.toFixed(4);
    const seller = agents[Math.floor(Math.random() * agents.length)];
    let buyer = seller;
    while (buyer === seller) buyer = agents[Math.floor(Math.random() * agents.length)];
    const qty = rnd(0.5, 4).toFixed(3);

    try {
      // el comprador cruza al vendedor: ambos a `price` → trade inmediato
      await submit(seller.kp, [
        Operation.manageSellOffer({
          selling: TUWU,
          buying: USDC,
          amount: qty,
          price,
        }),
      ]);
      await submit(buyer.kp, [
        Operation.manageBuyOffer({
          selling: USDC,
          buying: TUWU,
          buyAmount: qty,
          price,
        }),
      ]);
      fills++;
      console.log(`  ronda ${r + 1}: ${qty} ${TUWU_CODE} @ ${price} USDC (${seller.email} → ${buyer.email})`);
    } catch (e) {
      console.error(`  ronda ${r + 1} falló: ${e.message?.slice(0, 140)}`);
    }
    await sleep(Number(process.env.DELAY_MS || 1500));
  }
  console.log(`listo — ${fills} trades on-chain en ${TUWU_CODE}/USDC`);
}

const issuerSecret = process.env.STELLAR_ISSUER_SECRET;
if (!issuerSecret) {
  console.error('Falta STELLAR_ISSUER_SECRET (la S… de fc-issuer) para autorizar y repartir TUWU');
  process.exit(1);
}
const issuer = Keypair.fromSecret(issuerSecret);
const TUWU = new Asset(TUWU_CODE, issuer.publicKey());
const USDC = new Asset(USDC_CODE, USDC_ISSUER);
console.log(`issuer ${issuer.publicKey()}`);

const agents = await loadAgents();
console.log('setup…');
await setup(agents, issuer, TUWU, USDC);
console.log('trading…');
await trade(agents, TUWU, USDC);
