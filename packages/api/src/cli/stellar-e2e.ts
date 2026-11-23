/**
 * End-to-end check of Instaward 1 against a running API (local network in CI,
 * or testnet for the completion evidence):
 *
 *   issuer (admin) opens two USDC tenders through the API
 *   → an investor whose key never leaves this process (it plays Freighter)
 *     logs in with a SEP-53 signature, passes KYC, opens its USDC trustline,
 *     gets test USDC from the demo pool, and contributes — every transaction
 *     built by POST /api/tx/build, signed here, submitted by POST /api/tx/submit
 *   → the chain views (GET /api/chain/tenders/:id) show the position
 *   → after the deadline: finalize (USDC to the trustee) on one tender,
 *     finalize (Failed) + refund (USDC back) on the other
 *   → the API refuses a tampered transaction, a wrong-network signature and a
 *     resubmission.
 *
 *   npm run stellar:e2e -- --network testnet --api http://localhost:4603 \
 *     [--out <deployment.json>] [--env-out <.env>] [--evidence docs/instaward-1/evidence-run.md]
 *     [--deadline-minutes 4]
 *
 * Admin credentials: ADMIN_EMAIL / ADMIN_PASSWORD, else the first of
 * ADMIN_EMAILS with ADMIN_BOOTSTRAP_PASSWORD (env or --env-out file).
 */
import fs from 'fs';
import path from 'path';
import { Asset, Keypair, TransactionBuilder, type Transaction } from '@stellar/stellar-sdk';
import { balanceOf } from './stellar/classic';
import { readEnvFile } from './stellar/env-file';
import {
  accountExists,
  defaultPaths,
  fundAccount,
  log,
  networkArg,
  networkPreset,
  parseArgs,
  stellarContext,
} from './stellar/network';
import { runCli } from './toolkit';

const cwd = process.env.INIT_CWD || process.cwd();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ApiError extends Error {
  status: number;
  code?: string;
  body?: unknown;
}

class Api {
  constructor(private readonly base: string) {}

  async call<T = Record<string, unknown>>(
    method: 'GET' | 'POST',
    url: string,
    body?: unknown,
    token?: string,
  ): Promise<T> {
    const res = await fetch(`${this.base}${url}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      json = { message: text.slice(0, 200) };
    }
    if (!res.ok || json.success === false) {
      const err = new Error(
        `${method} ${url} → ${res.status} ${String(json.code ?? '')} ${String(json.message ?? '')}`.trim(),
      ) as ApiError;
      err.status = res.status;
      err.code = typeof json.code === 'string' ? json.code : undefined;
      err.body = json;
      throw err;
    }
    return json as T;
  }

  /** Unwraps `{ success, data }` envelopes (falls back to the whole body). */
  async data<T>(method: 'GET' | 'POST', url: string, body?: unknown, token?: string): Promise<T> {
    const json = await this.call<Record<string, unknown>>(method, url, body, token);
    return ('data' in json ? json.data : json) as T;
  }
}

interface TxBuild {
  buildId: string;
  xdr: string;
  networkPassphrase: string;
  source: string;
  contractId?: string;
  function?: string;
}
interface TxResult {
  hash: string;
  status: string;
  explorer?: string;
}
interface TenderView {
  contractId: string;
  state: { name: string };
  totalRaised: number;
  deadline: string | null;
  paymentToken: { code: string; contractId: string; issuer: string | null };
  holder?: { rwaBalance: number; paymentBalance: number };
}

interface EvidenceTx {
  step: string;
  hash: string;
  explorer: string | null;
  signer?: string;
}
interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

runCli(async () => {
  const args = parseArgs(process.argv.slice(2));
  const network = networkArg(args);
  const preset = networkPreset(network);
  const defaults = defaultPaths(network);
  const deploymentFile = path.resolve(
    cwd,
    String(args.out ?? process.env.STELLAR_DEPLOYMENT_FILE ?? defaults.deployment),
  );
  const envFile = path.resolve(cwd, String(args['env-out'] ?? defaults.env));
  const env = { ...readEnvFile(envFile), ...(process.env as Record<string, string>) };
  const apiUrl = String(args.api ?? env.API_URL ?? 'http://localhost:4603').replace(/\/+$/, '');
  const deadlineMinutes = Number(args['deadline-minutes'] ?? 8);
  const evidenceFile = args.evidence ? path.resolve(cwd, String(args.evidence)) : null;
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8')) as Record<string, unknown>;
  const ctx = stellarContext(preset, deploymentFile);
  const api = new Api(apiUrl);

  const txs: EvidenceTx[] = [];
  const checks: Check[] = [];
  const check = (name: string, ok: boolean, detail = '') => {
    checks.push({ name, ok, detail });
    log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) throw new Error(`Falló: ${name} ${detail}`);
  };
  const started = new Date().toISOString();

  /* ------------------------------------------------------------ setup */
  await api.call('GET', '/health');
  const usdc = deployment.usdc as { code: string; issuer: string; sac: string; decimals: number };
  if (!usdc?.sac) throw new Error(`${deploymentFile} no tiene usdc (corré stellar:deploy)`);
  const usdcAsset = new Asset(usdc.code, usdc.issuer);
  const trustee = String(deployment.trustee ?? '');
  log(`E2E Instaward 1 → ${apiUrl} (${network}) · USDC ${usdc.issuer.slice(0, 6)}… SAC ${usdc.sac}`);

  const net = await api.data<{ networkPassphrase?: string; usdc?: { contractId?: string } }>(
    'GET',
    '/api/chain/network',
  );
  check(
    'GET /api/chain/network expone la red y el USDC',
    net.networkPassphrase === preset.passphrase && net.usdc?.contractId === usdc.sac,
    `${net.networkPassphrase} · ${net.usdc?.contractId}`,
  );

  const adminEmail = env.ADMIN_EMAIL || (env.ADMIN_EMAILS || '').split(',')[0]?.trim();
  const adminPassword = env.ADMIN_PASSWORD || env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!adminEmail || !adminPassword)
    throw new Error('Definí ADMIN_EMAIL/ADMIN_PASSWORD (o ADMIN_EMAILS + ADMIN_BOOTSTRAP_PASSWORD)');
  const adminLogin = await api.call<{ token?: string; twoFactorRequired?: boolean }>(
    'POST',
    '/api/auth/email',
    {
      email: adminEmail,
      password: adminPassword,
    },
  );
  if (!adminLogin.token) throw new Error('El admin tiene 2FA: usá un admin sin 2FA en el entorno de prueba');
  const admin = adminLogin.token;

  /* ------------------------------------------- issuer opens two tenders */
  const tag = String(Date.now()).slice(-5);
  const openTender = async (label: string, soft: number, hard: number) => {
    const ticker = `E${label[0].toUpperCase()}${tag}`;
    const created = await api.data<{ id: string }>(
      'POST',
      '/api/listings',
      {
        legalName: `Instaward E2E ${label} S.A.`,
        tradeName: `E2E ${label}`,
        cuit: '30681920149',
        jurisdiction: 'Pergamino, Buenos Aires',
        sector: 'Soja',
        ticker,
        tokenTicker: ticker,
        isin: `AR${ticker}0001`.slice(0, 12),
        authorizedShares: 10_000,
        sharesToTokenize: 1_000,
        pricePerShareUsdc: 10,
        cajaSubaccount: `CV-E2E-${ticker}`,
        custodianCuit: '30700000000',
        cnvRecordId: 'CNV-SANDBOX-INSTAWARD-1',
        bymaRequestId: 'BYMA-E2E',
        legalTermsUri: 'https://github.com/Erosmart/fractachain/blob/macroupdate/docs/instaward-1/plan.md',
        estatutoHash: 'instaward1e2e',
        auditor: 'E2E',
        issuerPublicKey: '',
        proceedsWallet: trustee,
        paymentKind: 'USDC',
        offeringSoftCapUsdc: soft,
        offeringHardCapUsdc: hard,
        offeringDays: 1,
        tnaUsd: 12,
        useOfProceeds: 'E2E Instaward 1',
        minInvestmentUsdc: 10,
      },
      admin,
    );
    await api.data('POST', `/api/listings/${created.id}/deploy`, {}, admin);
    await api.data('POST', `/api/listings/${created.id}/mint`, { amount: 1_000 }, admin);
    // The deadline counts from the opening, so slow deploys don't eat the investor's window.
    const settleAt = new Date(Date.now() + deadlineMinutes * 60_000).toISOString();
    await api.data(
      'POST',
      `/api/listings/${created.id}/licitacion`,
      { settlePolicy: 'ON_DATE', settleAt },
      admin,
    );
    const detail = await api.data<{ licitacionContract: string; status: string }>(
      'GET',
      `/api/listings/${created.id}`,
    );
    log(`  licitación ${label}: ${created.id} → ${detail.licitacionContract} (cierra ${settleAt})`);
    return { id: created.id, contract: detail.licitacionContract, settleAt };
  };
  log('Emisor:');
  const success = await openTender('exito', 20, 100);
  const refund = await openTender('reembolso', 100, 100);

  /* ------------------------------------------------ investor (Freighter) */
  log('Inversor:');
  const investor = Keypair.random();
  if (!(await accountExists(ctx, investor.publicKey())))
    await fundAccount(ctx, investor.publicKey(), 'inversor');
  const message = `fractachain-login:${Date.now()}`;
  const login = await api.call<{ token: string; user: { id: string; custodyMode: string; kycId?: string } }>(
    'POST',
    '/api/auth/freighter',
    {
      publicKey: investor.publicKey(),
      message,
      signature: Buffer.from(investor.signMessage(message)).toString('base64'),
    },
  );
  const token = login.token;
  check(
    'login con firma SEP-53 de la wallet',
    Boolean(token) && login.user.custodyMode === 'SELF',
    investor.publicKey(),
  );

  // Wallet sign-ups accept the Terms of Service and Privacy Policy before KYC.
  const legal = await api.data<{ termsVersion: string }>('GET', '/api/legal');
  const accepted = await api.call<{ user: { termsAccepted: boolean } }>(
    'POST',
    '/api/auth/terms/accept',
    { version: legal.termsVersion },
    token,
  );
  check('términos y privacidad aceptados', accepted.user.termsAccepted, legal.termsVersion);

  await api.call(
    'POST',
    '/api/kyc/onboard',
    { legalName: 'Inversor E2E', cuit: '20123456786', email: `e2e+${tag}@example.com` },
    token,
  );
  let me = (
    await api.call<{ user: { kycStatus: string; kycId?: string } }>('GET', '/api/auth/me', undefined, token)
  ).user;
  if (me.kycStatus !== 'APPROVED' && me.kycId) {
    await api.call('POST', `/api/kyc/${me.kycId}/approve`, {}, admin);
    me = (await api.call<{ user: { kycStatus: string } }>('GET', '/api/auth/me', undefined, token)).user;
  }
  check('KYC aprobado', me.kycStatus === 'APPROVED', me.kycStatus);

  /** build → sign with the investor key (as Freighter would) → submit. */
  const signBuild = (build: TxBuild, passphrase = build.networkPassphrase) => {
    const tx = TransactionBuilder.fromXDR(build.xdr, passphrase) as Transaction;
    tx.sign(investor);
    return tx.toXDR();
  };
  const run = async (
    step: string,
    request: Record<string, unknown>,
  ): Promise<TxResult & { buildId: string; signedXdr: string }> => {
    const build = await api.data<TxBuild>('POST', '/api/tx/build', request, token);
    if (build.source !== investor.publicKey())
      throw new Error(`${step}: la tx no la origina la wallet del inversor`);
    if (build.networkPassphrase !== preset.passphrase) throw new Error(`${step}: passphrase inesperada`);
    const signedXdr = signBuild(build);
    const result = await api.data<TxResult>(
      'POST',
      '/api/tx/submit',
      { buildId: build.buildId, signedXdr },
      token,
    );
    // The signer of record is the investor's own G… address, never a backend key.
    const onChain = await ctx.horizon.transactions().transaction(result.hash).call();
    txs.push({ step, hash: result.hash, explorer: ctx.txLink(result.hash), signer: onChain.source_account });
    check(
      `${step} (firmada por el inversor)`,
      result.status === 'SUCCESS' && onChain.source_account === investor.publicKey(),
      result.hash,
    );
    return { ...result, buildId: build.buildId, signedXdr };
  };
  /** Contributions need the KYC whitelisting on-chain, which the API sends right after approval. */
  const runWhenVerified = async (step: string, request: Record<string, unknown>) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await run(step, request);
      } catch (err) {
        const msg = String((err as Error).message);
        // Also transient: the API's admin account racing its own KYC whitelisting (tx_bad_seq).
        if (attempt >= 12 || !/verif|kyc|whitelist|investor|bad_seq|UPSTREAM_FAILED/i.test(msg)) throw err;
        log(`  esperando el alta on-chain del KYC… (${msg.slice(0, 80)})`);
        await sleep(10_000);
      }
    }
  };

  await run('trustline USDC', { action: 'usdc_trustline' });
  await api.data('POST', '/api/wallet/usdc/fund', {}, token);
  let usdcBalance = 0;
  for (let i = 0; i < 20 && usdcBalance < 40; i++) {
    usdcBalance = (await balanceOf(ctx, investor.publicKey(), usdcAsset)) ?? 0;
    if (usdcBalance < 40) await sleep(3_000);
  }
  check('USDC de prueba desde el pool (no faucet)', usdcBalance >= 40, `${usdcBalance} ${usdc.code}`);

  const contributeOk = await runWhenVerified('contribute 20 USDC (licitación éxito)', {
    action: 'contribute',
    listingId: success.id,
    amount: 20,
  });
  await runWhenVerified('contribute 20 USDC (licitación reembolso)', {
    action: 'contribute',
    listingId: refund.id,
    amount: 20,
  });

  const tenderA = await api.data<TenderView>(
    'GET',
    `/api/chain/tenders/${success.contract}?holder=${investor.publicKey()}`,
  );
  check(
    'GET /api/chain/tenders: posición y recaudado leídos del contrato, en USDC',
    tenderA.holder?.rwaBalance === 2 &&
      tenderA.totalRaised === 20 &&
      tenderA.paymentToken.contractId === usdc.sac,
    `rwa=${tenderA.holder?.rwaBalance} raised=${tenderA.totalRaised} ${tenderA.paymentToken.code} ${tenderA.paymentToken.contractId}`,
  );

  /* -------------------------------------------------- security negatives */
  log('Rechazos esperados:');
  const expectRefusal = async (name: string, attempt: () => Promise<unknown>, codes: string[]) => {
    try {
      await attempt();
      check(name, false, 'el API la aceptó');
    } catch (err) {
      const e = err as ApiError;
      if (!e.status) throw err;
      check(
        name,
        e.status >= 400 && e.status < 500 && (!e.code || codes.includes(e.code)),
        `${e.status} ${e.code ?? ''}`,
      );
    }
  };
  const b1 = await api.data<TxBuild>(
    'POST',
    '/api/tx/build',
    { action: 'contribute', listingId: success.id, amount: 20 },
    token,
  );
  const b2 = await api.data<TxBuild>(
    'POST',
    '/api/tx/build',
    { action: 'contribute', listingId: success.id, amount: 30 },
    token,
  );
  await expectRefusal(
    'XDR distinto del construido (monto alterado)',
    () => api.data('POST', '/api/tx/submit', { buildId: b1.buildId, signedXdr: signBuild(b2) }, token),
    ['TX_MISMATCH', 'VALIDATION_FAILED', 'BAD_REQUEST'],
  );
  const b3 = await api.data<TxBuild>(
    'POST',
    '/api/tx/build',
    { action: 'contribute', listingId: success.id, amount: 20 },
    token,
  );
  await expectRefusal(
    'firma para otra red (passphrase de mainnet)',
    () =>
      api.data(
        'POST',
        '/api/tx/submit',
        { buildId: b3.buildId, signedXdr: signBuild(b3, 'Public Global Stellar Network ; September 2015') },
        token,
      ),
    ['TX_BAD_SIGNATURE', 'TX_MISMATCH', 'VALIDATION_FAILED', 'BAD_REQUEST'],
  );
  await expectRefusal(
    'reenvío de una transacción ya enviada',
    () =>
      api.data(
        'POST',
        '/api/tx/submit',
        { buildId: contributeOk.buildId, signedXdr: contributeOk.signedXdr },
        token,
      ),
    ['TX_ALREADY_SUBMITTED', 'TX_EXPIRED', 'NOT_FOUND', 'TX_MISMATCH', 'CONFLICT'],
  );

  /* --------------------------------------------------- deadline: settle */
  const tenderB = await api.data<TenderView>('GET', `/api/chain/tenders/${refund.contract}`);
  const deadlineMs = Math.max(
    Date.parse(tenderA.deadline ?? success.settleAt),
    Date.parse(tenderB.deadline ?? refund.settleAt),
  );
  const waitMs = deadlineMs - Date.now() + 15_000;
  if (waitMs > 0) {
    log(`Esperando el cierre de las licitaciones (${Math.ceil(waitMs / 1000)} s)…`);
    await sleep(waitMs);
  }
  const trusteeBefore = (await balanceOf(ctx, trustee, usdcAsset)) ?? 0;
  await run('finalize (mínimo alcanzado → USDC al fiduciario)', {
    action: 'finalize',
    listingId: success.id,
  });
  const settledA = await api.data<TenderView>('GET', `/api/chain/tenders/${success.contract}`);
  const trusteeAfter = (await balanceOf(ctx, trustee, usdcAsset)) ?? 0;
  check(
    'licitación Successful y 20 USDC en la cuenta del fiduciario',
    settledA.state.name === 'Successful' && Math.round((trusteeAfter - trusteeBefore) * 1e7) === 20 * 1e7,
    `${settledA.state.name} · fiduciario +${(trusteeAfter - trusteeBefore).toFixed(2)} ${usdc.code}`,
  );

  await run('finalize (no alcanzó el mínimo → Failed)', { action: 'finalize', listingId: refund.id });
  const failedB = await api.data<TenderView>(
    'GET',
    `/api/chain/tenders/${refund.contract}?holder=${investor.publicKey()}`,
  );
  check('licitación Failed', failedB.state.name === 'Failed', failedB.state.name);
  const beforeRefund = (await balanceOf(ctx, investor.publicKey(), usdcAsset)) ?? 0;
  await run('refund 20 USDC', { action: 'refund', listingId: refund.id });
  const afterRefund = (await balanceOf(ctx, investor.publicKey(), usdcAsset)) ?? 0;
  const refundedB = await api.data<TenderView>(
    'GET',
    `/api/chain/tenders/${refund.contract}?holder=${investor.publicKey()}`,
  );
  check(
    'reembolso: 20 USDC de vuelta y posición en cero',
    Math.round((afterRefund - beforeRefund) * 1e7) === 20 * 1e7 && refundedB.holder?.rwaBalance === 0,
    `+${(afterRefund - beforeRefund).toFixed(2)} ${usdc.code} · rwa=${refundedB.holder?.rwaBalance}`,
  );

  /* ------------------------------------------------------------ evidence */
  const summary = {
    network,
    api: apiUrl,
    started,
    finished: new Date().toISOString(),
    investor: investor.publicKey(),
    trustee,
    usdc: { ...usdc, explorer: ctx.contractLink(usdc.sac) },
    factory: deployment.factory,
    tenders: {
      success: {
        listing: success.id,
        contract: success.contract,
        explorer: ctx.contractLink(success.contract),
      },
      refund: { listing: refund.id, contract: refund.contract, explorer: ctx.contractLink(refund.contract) },
    },
    transactions: txs,
    checks,
  };
  log(`\n${checks.filter((c) => c.ok).length}/${checks.length} chequeos OK`);
  if (evidenceFile) {
    fs.mkdirSync(path.dirname(evidenceFile), { recursive: true });
    fs.writeFileSync(evidenceFile.replace(/\.md$/, '') + '.json', `${JSON.stringify(summary, null, 2)}\n`);
    const link = (label: string, url: string | null) => (url ? `[${label}](${url})` : `\`${label}\``);
    const md = [
      `# Evidencia E2E — Instaward 1 (${network})`,
      '',
      `Corrida: ${started} → ${summary.finished} · API ${apiUrl}`,
      '',
      `- Inversor (firma todas sus transacciones): ${link(investor.publicKey(), network === 'testnet' ? `${preset.explorerUrl}/account/${investor.publicKey()}` : null)}`,
      `- Fiduciario (cobra el finalize): ${link(trustee, network === 'testnet' ? `${preset.explorerUrl}/account/${trustee}` : null)}`,
      `- USDC: ${usdc.code} · emisor \`${usdc.issuer}\` · SAC ${link(usdc.sac, ctx.contractLink(usdc.sac))} · ${usdc.decimals} decimales`,
      `- Licitación éxito: ${link(success.contract, ctx.contractLink(success.contract))} (listing \`${success.id}\`)`,
      `- Licitación reembolso: ${link(refund.contract, ctx.contractLink(refund.contract))} (listing \`${refund.id}\`)`,
      '',
      '## Transacciones',
      '',
      '| Paso | Hash | Firmante |',
      '|---|---|---|',
      ...txs.map(
        (t) => `| ${t.step} | ${link(t.hash.slice(0, 12) + '…', t.explorer)} | \`${t.signer ?? ''}\` |`,
      ),
      '',
      '## Chequeos',
      '',
      ...checks.map((c) => `- ${c.ok ? '✅' : '❌'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`),
      '',
    ].join('\n');
    fs.writeFileSync(evidenceFile, md);
    log(`Evidencia: ${evidenceFile}`);
  }
});
