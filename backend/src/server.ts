import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import {
  getAllKycRecords,
  getKycById,
  registerKyc,
  approveKyc,
  rejectKyc,
  revokeKyc,
  KycStatus,
} from './admin/kyc_review';
import {
  processArsOnRamp,
  processFiatOnRamp,
  processCctpBridge,
  processNearIntentsSwap,
} from './mocks/payment_gateway';
import { getAllCommodityPrices, getCommodityPrice } from './mocks/fiat_oracle';
import { getAllWeatherData, getWeatherData } from './mocks/weather_oracle';
import { getMervalStocks, getProofOfReserveAudit } from './custody/stocks';
import {
  bindContract,
  createProduct,
  getPaymentAssets,
  listProducts,
  PaymentKind,
  ProductKind,
  setPaymentAsset,
  updateProductPrice,
} from './admin/issuance';
import {
  contributeListing,
  createListing,
  deployListing,
  getListing,
  listListings,
  listedPools,
  mintListingTokens,
  openLicitacion,
  closeListing,
  setListingProceedsWallet,
  setListingSettle,
  validationPack,
  isOnChainListing,
  recordOnChainContribution,
  markListingClosed,
} from './admin/listings';
import { cancelOrder, getBook, listMarkets, placeOrder } from './market/orderbook';
import { depositDividends, listDividends } from './market/dividends';
import { buildPortfolio } from './market/prices';
import {
  getSdexBook,
  openCustodialTrustline,
  placeCustodialOrder,
  prepareCancel,
  prepareOrder,
  prepareTrustline,
  sdexAvailable,
} from './market/sdex_book';
import { configureIssuerForRegulatedAsset, submitSignedXdr } from './stellar/sdex';
import { syncHolderAuthorization } from './stellar/compliance';
import { getTestnetConfig, setTestnetConfig } from './admin/testnet';
import { isOnChainDeployed, loadTestnetDeployment } from './stellar/deployment';
import { getOnChainStatus, listingChainMeta, receiptAfterContribute, explorerTx } from './stellar/onchain';
import {
  alreadyClosedOnChain,
  closeStatusFromChain,
  contributeOnChain,
  finalizeOnChain,
  refundOnChain,
  snapshotLicitacion,
  withdrawProceedsOnChain,
} from './stellar/licitacion';
import {
  authenticateWithGoogle,
  getUserByToken,
  revokeSession,
} from './auth/google_auth';
import {
  authenticateWithFirebase,
  getFirebaseUserByToken,
} from './auth/firebase_auth';
import {
  addTrustline,
  claimListingTokens,
  claimPendingDividend,
  markHoldingRefunded,
  getAccountByToken,
  hydrateTestnetWallet,
  isAdminAccount,
  listPendingKyc,
  readSelfie,
  revokeToken,
  setCustody,
  setKycStatusByKycId,
  submitOnboardingKyc,
  toPublic,
  upsertLogin,
} from './auth/accounts';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '8mb' }));

function requireAdmin(req: Request, res: Response) {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) {
    res.status(401).json({ success: false, message: 'Iniciá sesión' });
    return null;
  }
  if (!isAdminAccount(account)) {
    res.status(403).json({ success: false, message: 'Solo el admin puede hacer esto' });
    return null;
  }
  return account;
}

// Health Check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    service: 'Fractachain Admin & Mocks Backend',
    protocol: 'Stellar & Soroban Protocol 28',
    network: isOnChainDeployed()
      ? 'Stellar Testnet (on-chain contracts loaded)'
      : 'Stellar Testnet (sandbox until deployments/testnet.json exists)',
    onChain: isOnChainDeployed(),
    timestamp: new Date().toISOString(),
  });
});

// --- Google Authentication Routes ---
app.post('/api/auth/google', (req: Request, res: Response) => {
  const result = authenticateWithGoogle(req.body);
  res.json(result);
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const account = getAccountByToken(authHeader);
  if (account) {
    return res.json({ success: true, user: toPublic(account) });
  }
  const user = getUserByToken(authHeader) || getFirebaseUserByToken(authHeader);
  if (!user) {
    return res.status(401).json({ success: false, message: 'No autenticado' });
  }
  res.json({ success: true, user });
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  revokeToken(authHeader);
  const revoked = revokeSession(authHeader);
  res.json({ success: true, revoked, message: 'Sesión finalizada con éxito' });
});

app.post('/api/auth/email', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body as { email: string; password: string; name?: string };
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email y contraseña requeridos' });
    }
    const result = upsertLogin({ email, password, name });
    res.json(result);
    void hydrateTestnetWallet(result.user.id).catch(() => undefined);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.post('/api/auth/wallet', async (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'No autenticado' });
  try {
    const { mode } = req.body as { mode: 'CUSTODIAL' | 'SELF' };
    if (mode !== 'CUSTODIAL' && mode !== 'SELF') {
      return res.status(400).json({ success: false, message: 'Modo inválido' });
    }
    const result = setCustody(account.id, mode);
    const user = (await hydrateTestnetWallet(account.id)) || result.user;
    res.json({ success: true, user, secretOnce: result.secretOnce });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.post('/api/kyc/onboard', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'No autenticado' });
  try {
    const user = submitOnboardingKyc(account.id, req.body);
    registerKyc({
      id: user.kycId,
      userId: account.id,
      fullName: user.legalName || user.name,
      documentNumber: user.cuit || '',
      taxId: user.cuit,
      countryCode: 32,
      countryName: 'Argentina',
      address: 'Onboarding in-app',
      investorType: 'National',
      stellarAddress: user.publicKey,
      documentFrontUrl: user.selfieUrl || '',
      selfieUrl: `/api/kyc/selfie/${account.id}`,
    });
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.get('/api/kyc/selfie/:id', (req: Request, res: Response) => {
  const file = readSelfie(req.params.id);
  if (!file) return res.status(404).end();
  res.sendFile(path.resolve(file));
});

// --- Firebase Authentication Routes ---
app.post('/api/auth/firebase', async (req: Request, res: Response) => {
  const result = authenticateWithFirebase(req.body);
  res.json(result);
  if (result.user?.id) void hydrateTestnetWallet(result.user.id).catch(() => undefined);
});

app.get('/api/auth/firebase/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const user = getFirebaseUserByToken(authHeader);
  if (!user) {
    return res.status(401).json({ success: false, message: 'No autenticado con Firebase' });
  }
  res.json({ success: true, user });
});

// --- KYC Admin Routes ---
app.get('/api/kyc', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const status = (req.query.status as string | undefined)?.toUpperCase();
  const fromAccounts = listPendingKyc()
    .filter((u) => u.kycStatus !== 'UNREGISTERED')
    .map((u) => ({
      id: u.kycId || u.id,
      fullName: u.legalName || u.name,
      docType: 'CUIT' as const,
      docNumber: u.cuit || '',
      country: 'Argentina',
      walletAddress: u.publicKey,
      userType: 'INVESTOR' as const,
      status: u.kycStatus === 'APPROVED' ? 'APPROVED' : u.kycStatus === 'REJECTED' ? 'REJECTED' : 'PENDING',
      isGafiHighRisk: false,
      createdAt: u.createdAt,
      selfieUrl: u.selfieUrl,
      userId: u.id,
      email: u.email,
    }));
  const fromLegacy = getAllKycRecords()
    .filter((r) => r.userId)
    .filter((r) => !fromAccounts.some((a) => a.id === r.id || a.userId === r.userId))
    .map((r) => ({
      id: r.id,
      fullName: r.fullName,
      docType: r.taxId ? 'CUIT' : 'DNI',
      docNumber: r.taxId || r.documentNumber,
      country: r.countryName,
      walletAddress: r.stellarAddress,
      userType: 'INVESTOR' as const,
      status: r.status === 'APROBADO' ? 'APPROVED' : r.status === 'RECHAZADO' ? 'REJECTED' : r.status === 'REVOCADO' ? 'REVOKED' : 'PENDING',
      isGafiHighRisk: false,
      createdAt: r.createdAt,
      selfieUrl: r.selfieUrl,
      userId: r.userId,
      email: '',
    }));
  let data = [...fromAccounts, ...fromLegacy];
  if (status && status !== 'ALL') data = data.filter((r) => r.status === status);
  data.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  res.json({ success: true, count: data.length, data });
});

app.get('/api/kyc/:id', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const record = getKycById(req.params.id);
  if (!record) return res.status(404).json({ success: false, error: 'KYC no encontrado' });
  res.json({ success: true, data: record });
});

app.post('/api/kyc/register', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const result = registerKyc(req.body);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.status(201).json(result);
});

app.post('/api/kyc/:id/approve', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const result = approveKyc(req.params.id);
  try {
    const user = setKycStatusByKycId(req.params.id, 'APPROVED');
    return res.json({ success: true, user, record: result.record });
  } catch {
    if (!result.success) return res.status(400).json({ success: false, message: result.error });
    return res.json(result);
  }
});

app.post('/api/kyc/:id/reject', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { reason } = req.body;
  const result = rejectKyc(req.params.id, reason || 'Documentación ilegible o inconsistente');
  try {
    const user = setKycStatusByKycId(req.params.id, 'REJECTED');
    return res.json({ success: true, user, record: result.record });
  } catch {
    if (!result.success) return res.status(400).json({ success: false, message: result.error });
    return res.json(result);
  }
});

app.post('/api/kyc/:id/revoke', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { reason } = req.body;
  const result = revokeKyc(req.params.id, reason || 'Revocación preventiva por compliance');
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

// --- Mock Payment Gateways ---
app.post('/api/mocks/onramp/ars', (req: Request, res: Response) => {
  const { arsAmount, destinationWallet } = req.body;
  if (!arsAmount || !destinationWallet) {
    return res.status(400).json({ success: false, error: 'Faltan parámetros arsAmount y destinationWallet' });
  }
  const result = processArsOnRamp(Number(arsAmount), destinationWallet);
  res.json(result);
});

app.post('/api/mocks/onramp/fiat', (req: Request, res: Response) => {
  const { fiatAmount, fiatCurrency, destinationWallet } = req.body;
  if (!fiatAmount || !destinationWallet) {
    return res.status(400).json({ success: false, error: 'Faltan parámetros fiatAmount y destinationWallet' });
  }
  const result = processFiatOnRamp(Number(fiatAmount), fiatCurrency || 'USD', destinationWallet);
  res.json(result);
});

app.post('/api/mocks/bridge/cctp', (req: Request, res: Response) => {
  const { originChain, usdcAmount, destinationWallet } = req.body;
  if (!originChain || !usdcAmount || !destinationWallet) {
    return res.status(400).json({ success: false, error: 'Faltan parámetros de bridge CCTP' });
  }
  const result = processCctpBridge(originChain, Number(usdcAmount), destinationWallet);
  res.json(result);
});

app.post('/api/mocks/bridge/near-intents', (req: Request, res: Response) => {
  const { depositAsset, depositAmount, destinationWallet } = req.body;
  if (!depositAsset || !depositAmount || !destinationWallet) {
    return res.status(400).json({ success: false, error: 'Faltan parámetros de swap NEAR Intents' });
  }
  const result = processNearIntentsSwap(depositAsset, Number(depositAmount), destinationWallet);
  res.json(result);
});

// --- Oracles ---
app.get('/api/mocks/oracles/commodities', (_req: Request, res: Response) => {
  res.json({ success: true, data: getAllCommodityPrices() });
});

app.get('/api/mocks/oracles/commodities/:crop', (req: Request, res: Response) => {
  const item = getCommodityPrice(req.params.crop);
  if (!item) return res.status(404).json({ success: false, error: 'Cultivo no encontrado' });
  res.json({ success: true, data: item });
});

app.get('/api/mocks/oracles/weather', (_req: Request, res: Response) => {
  res.json({ success: true, data: getAllWeatherData() });
});

// --- Merval Stocks Custody ---
app.get('/api/custody/stocks', (_req: Request, res: Response) => {
  res.json({ success: true, data: getMervalStocks() });
});

app.get('/api/custody/por', (_req: Request, res: Response) => {
  res.json({ success: true, data: getProofOfReserveAudit() });
});

app.get('/api/admin/issuance/assets', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  res.json({ success: true, data: getPaymentAssets() });
});

app.post('/api/admin/issuance/assets', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { kind, address } = req.body as { kind: PaymentKind; address: string };
  if (!kind || !address) {
    return res.status(400).json({ success: false, error: 'kind y address requeridos' });
  }
  const saved = setPaymentAsset(kind, address);
  res.json({ success: true, kind, address: saved });
});

app.get('/api/admin/issuance/products', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  res.json({ success: true, data: listProducts() });
});

app.post('/api/admin/issuance/products', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { kind, name, paymentKind, pricePerUnit, contractAddress, notes } = req.body as {
    kind: ProductKind;
    name: string;
    paymentKind: PaymentKind;
    pricePerUnit?: string;
    contractAddress?: string;
    notes?: string;
  };
  if (!kind || !name || !paymentKind) {
    return res.status(400).json({ success: false, error: 'kind, name y paymentKind requeridos' });
  }
  const product = createProduct({ kind, name, paymentKind, pricePerUnit: pricePerUnit || '0', contractAddress, notes });
  res.status(201).json({ success: true, data: product });
});

app.post('/api/admin/issuance/products/:id/price', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { pricePerUnit } = req.body as { pricePerUnit: string };
  const product = updateProductPrice(req.params.id, String(pricePerUnit));
  if (!product) return res.status(404).json({ success: false, error: 'Producto no encontrado' });
  res.json({ success: true, data: product });
});

app.post('/api/admin/issuance/products/:id/bind', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { contractAddress } = req.body as { contractAddress: string };
  if (!contractAddress) {
    return res.status(400).json({ success: false, error: 'contractAddress requerido' });
  }
  const product = bindContract(req.params.id, contractAddress);
  if (!product) return res.status(404).json({ success: false, error: 'Producto no encontrado' });
  res.json({ success: true, data: product });
});

function wrap(fn: () => unknown, res: Response, code = 200) {
  try {
    const data = fn();
    res.status(code).json({ success: true, data });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
}

/**
 * Async sibling of `wrap`. Anything that talks to Horizon needs this: passing
 * a promise to `wrap` would serialize it as `{}` and report success.
 */
async function wrapAsync(fn: () => Promise<unknown>, res: Response, code = 200) {
  try {
    const data = await fn();
    res.status(code).json({ success: true, data });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
}

/**
 * On-chain close: invoke `finalize()` unless the contract is already closed
 * (then we just sync the listing). Rule: hard cap or deadline — not soft cap
 * alone. Success pays the fiduciary in the same tx; failure unlocks `refund()`.
 */
async function finalizeListedOffering(listingId: string) {
  const listing = getListing(listingId);
  if (!listing) throw new Error('Listing no encontrado');
  if (!isOnChainListing(listing)) return closeListing(listing.id);

  const live = await snapshotLicitacion(listing);
  if (alreadyClosedOnChain(live)) {
    const status = closeStatusFromChain(live, listing);
    if (!status) throw new Error('Estado on-chain ilegible');
    const updated = markListingClosed(listing.id, status, live.raised, {
      finalizeHash: listing.finalizeHash,
      proceedsPaidTo: live.fiduciary,
    });
    return {
      ...updated,
      onChain: {
        ...listingChainMeta(updated),
        ...live,
        hash: listing.finalizeHash || null,
        explorer: explorerTx(listing.finalizeHash),
        alreadyClosed: true,
        note:
          live.state === 1
            ? 'La emisión ya estaba Successful. El XLM de testnet fue a la wallet fiduciaria en finalize(); no hay un segundo payout al inversor.'
            : 'La emisión ya estaba Failed. El inversor puede llamar refund() para recuperar XLM.',
      },
    };
  }

  const result = await finalizeOnChain(listing);
  const success = result.state === 1;
  const updated = markListingClosed(
    listing.id,
    success ? 'CLOSED_SUCCESS' : 'CLOSED_FAILED',
    result.raised,
    {
      finalizeHash: result.hash,
      proceedsPaidTo: result.fiduciary,
    },
  );
  return {
    ...updated,
    onChain: {
      ...listingChainMeta(updated),
      ...result,
      explorer: explorerTx(result.hash),
      alreadyClosed: false,
      note: success
        ? 'finalize() pagó el XLM recaudado a la wallet fiduciaria (proceeds). Las unidades RWA ya se mintearon en contribute(); no hay claim on-chain extra para el inversor.'
        : 'finalize() dejó Failed (no se llegó al soft cap). El inversor recupera XLM con refund().',
    },
  };
}

async function listingPayload(listingId: string, investor?: string) {
  const listing = getListing(listingId);
  if (!listing) return null;
  const live = await snapshotLicitacion(listing, investor);
  let current = listing;
  if (isOnChainListing(listing) && alreadyClosedOnChain(live) && listing.status === 'LISTED') {
    const status = closeStatusFromChain(live, listing);
    if (status) {
      current = markListingClosed(listing.id, status, live.raised, {
        proceedsPaidTo: live.fiduciary,
      });
    }
  }
  return {
    listing: current,
    validation: validationPack(current),
    onChain: {
      ...listingChainMeta(current),
      ...live,
      hash: current.finalizeHash || null,
      explorer: current.finalizeHash ? explorerTx(current.finalizeHash) : listingChainMeta(current).explorer,
      finalizeExplorer: explorerTx(current.finalizeHash),
    },
  };
}

app.get('/api/listings', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrap(() => listListings(), res);
});

app.get('/api/listings/:id', async (req: Request, res: Response) => {
  try {
    const account = getAccountByToken(req.headers.authorization);
    const payload = await listingPayload(req.params.id, account?.publicKey);
    if (!payload) return res.status(404).json({ success: false, message: 'Listing no encontrado' });
    res.json({
      success: true,
      data: { ...payload.listing, onChain: payload.onChain },
      validation: payload.validation,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.get('/api/listings/:id/validation', (req: Request, res: Response) => {
  const listing = getListing(req.params.id);
  if (!listing) return res.status(404).json({ success: false, message: 'Listing no encontrado' });
  res.json({ success: true, data: validationPack(listing) });
});

app.post('/api/listings', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrap(() => createListing(req.body), res, 201);
});

app.post('/api/listings/:id/deploy', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrap(() => deployListing(req.params.id), res);
});

app.post('/api/listings/:id/mint', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrap(() => mintListingTokens(req.params.id, Number(req.body.amount), req.body.cvDepositHash), res);
});

app.post('/api/listings/:id/licitacion', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrap(() => openLicitacion(req.params.id, req.body || {}), res);
});

app.post('/api/listings/:id/settle', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrap(() => setListingSettle(req.params.id, req.body || {}), res);
});

app.post('/api/listings/:id/close', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrapAsync(() => finalizeListedOffering(req.params.id), res);
});

/**
 * Same on-chain `finalize()` as /close, but any logged-in user can trigger it.
 * The contract itself is permissionless; the gate is hard cap or deadline.
 */
app.post('/api/listings/:id/finalize', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión' });
  wrapAsync(async () => {
    const listing = getListing(req.params.id);
    if (!listing) throw new Error('Listing no encontrado');
    if (!isOnChainListing(listing)) {
      throw new Error('Esta licitación sandbox cierra con el endpoint admin /close');
    }
    return finalizeListedOffering(listing.id);
  }, res);
});

app.post('/api/listings/:id/refund', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión' });
  wrapAsync(async () => {
    const listing = getListing(req.params.id);
    if (!listing) throw new Error('Listing no encontrado');
    if (!isOnChainListing(listing)) {
      throw new Error('El reembolso on-chain solo existe en licitaciones XLM / Soroban');
    }
    const live = await snapshotLicitacion(listing, account.publicKey);
    if (live.state !== 2 && listing.status !== 'CLOSED_FAILED') {
      throw new Error('refund() solo corre si finalize() dejó la emisión en Failed');
    }
    const result = await refundOnChain(listing, account.id);
    const user = markHoldingRefunded(account.id, listing.id, { hash: result.hash });
    return {
      user,
      refunded: result.refunded,
      rwa: result.rwa,
      onChain: {
        ...listingChainMeta(listing),
        ...live,
        hash: result.hash,
        explorer: explorerTx(result.hash),
        note: 'refund() devolvió el XLM de testnet a tu wallet custodial y quemó las unidades RWA en el contrato.',
      },
    };
  }, res);
});

app.post('/api/listings/:id/withdraw-proceeds', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrapAsync(async () => {
    const listing = getListing(req.params.id);
    if (!listing) throw new Error('Listing no encontrado');
    if (!isOnChainListing(listing)) {
      throw new Error('withdraw_proceeds es el reintento on-chain; esta listing no es XLM/Soroban');
    }
    const result = await withdrawProceedsOnChain(listing);
    return {
      ...listing,
      onChain: {
        ...listingChainMeta(listing),
        hash: result.hash,
        explorer: explorerTx(result.hash),
        amount: result.amount,
        note: 'Reintento de pago a la wallet fiduciaria. En el camino feliz finalize() ya pagó.',
      },
    };
  }, res);
});

app.post('/api/listings/:id/trustline', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión' });
  wrapAsync(async () => {
    const user = addTrustline(account.id, req.params.id);
    const listing = getListing(req.params.id);
    if (listing && sdexAvailable(listing) && account.custodyMode === 'CUSTODIAL') {
      await openCustodialTrustline({ listingId: listing.id, accountId: account.id });
    } else if (listing && sdexAvailable(listing) && account.publicKey && account.kycStatus === 'APPROVED') {
      await syncHolderAuthorization(account.publicKey, true);
    }
    return user;
  }, res);
});

app.post('/api/listings/:id/claim', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión' });
  wrapAsync(async () => {
    const listing = getListing(req.params.id);
    const user = claimListingTokens(account.id, req.params.id, listing?.status === 'CLOSED_SUCCESS');
    const live = listing ? await snapshotLicitacion(listing, account.publicKey) : null;
    return {
      ...user,
      onChain: listing
        ? {
            ...listingChainMeta(listing),
            ...live,
            note:
              listing.dossier.paymentKind === 'XLM'
                ? 'Anotar en el portfolio no mueve XLM. Las unidades RWA ya existen en el contrato desde contribute(); finalize() pagó a la empresa.'
                : 'Tokens acreditados en el ledger de la plataforma.',
          }
        : undefined,
    };
  }, res);
});

app.get('/api/admin/testnet', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrap(() => {
    const deployment = loadTestnetDeployment();
    return {
      ...getTestnetConfig(),
      onChain: isOnChainDeployed(),
      deployment,
    };
  }, res);
});

app.post('/api/admin/testnet', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrap(() => setTestnetConfig(req.body || {}), res);
});

app.post('/api/admin/testnet/configure-issuer', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrapAsync(async () => {
    const r: any = await configureIssuerForRegulatedAsset({ clawback: Boolean(req.body?.clawback) });
    return { hash: r.hash, ledger: r.ledger };
  }, res);
});

app.post('/api/listings/:id/contribute', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión para suscribir' });
  wrapAsync(async () => {
    const listing = getListing(req.params.id);
    if (!listing) throw new Error('Listing no encontrado');
    const amount = Number(req.body.usdcAmount);
    if (isOnChainListing(listing)) {
      const chain = await contributeOnChain(listing, account.id, amount);
      const updated = recordOnChainContribution(listing.id, account.id, {
        amount,
        tokens: chain.tokens,
        raised: chain.raised,
      });
      const onChain = await receiptAfterContribute(listing.id, account.id, {
        contributeHash: chain.hash,
      });
      return { ...updated, onChain };
    }
    const updated = contributeListing(listing.id, amount, account.id);
    const onChain = await receiptAfterContribute(listing.id, account.id);
    return { ...updated, onChain };
  }, res);
});

app.get('/api/onchain/status', (_req: Request, res: Response) => {
  wrapAsync(() => getOnChainStatus(), res);
});

app.get('/api/market/pools', (_req: Request, res: Response) => {
  wrap(() => listedPools(), res);
});

app.get('/api/orderbook/markets', (_req: Request, res: Response) => {
  wrap(() => listMarkets(), res);
});

app.get('/api/orderbook/:listingId', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  wrap(() => getBook(req.params.listingId, account?.id), res);
});

app.post('/api/orderbook/:listingId/orders', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión para operar' });
  const { side, price, amount } = req.body as { side: 'BUY' | 'SELL'; price: number; amount: number };
  wrap(() => placeOrder(req.params.listingId, account.id, side, Number(price), Number(amount)), res);
});

app.post('/api/orderbook/orders/:id/cancel', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión' });
  wrap(() => cancelOrder(req.params.id, account.id), res);
});

/* ---------------------------------------------------------------- *
 * Stellar DEX — the real central limit order book
 *
 * The `/api/orderbook/*` routes above remain the sandbox book for demos
 * without funded testnet accounts. These routes trade on-ledger, and the
 * backend never holds the investor's keys: order endpoints return an
 * unsigned XDR that the wallet signs, and `/submit` relays it.
 * ---------------------------------------------------------------- */

app.get('/api/sdex/:listingId', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  wrapAsync(() => getSdexBook(req.params.listingId, account?.id), res);
});

app.post('/api/sdex/:listingId/orders/prepare', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión para operar' });
  const { side, price, quantity, offerId } = req.body as {
    side: 'BUY' | 'SELL';
    price: number;
    quantity: number;
    offerId?: string;
  };
  wrapAsync(
    () =>
      prepareOrder({
        listingId: req.params.listingId,
        accountId: account.id,
        side,
        price: Number(price),
        quantity: Number(quantity),
        offerId,
      }),
    res,
  );
});

/** One-shot path for platform-custodied wallets: build, sign and submit. */
app.post('/api/sdex/:listingId/orders', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión para operar' });
  const { side, price, quantity, offerId } = req.body as {
    side: 'BUY' | 'SELL';
    price: number;
    quantity: number;
    offerId?: string;
  };
  wrapAsync(
    () =>
      placeCustodialOrder({
        listingId: req.params.listingId,
        accountId: account.id,
        side,
        price: Number(price),
        quantity: Number(quantity),
        offerId,
      }),
    res,
  );
});

app.post('/api/sdex/:listingId/orders/cancel', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión' });
  const { side, offerId, price } = req.body as { side: 'BUY' | 'SELL'; offerId: string; price: number };
  wrapAsync(
    () =>
      prepareCancel({
        listingId: req.params.listingId,
        accountId: account.id,
        side,
        offerId: String(offerId),
        price: Number(price),
      }),
    res,
  );
});

app.post('/api/sdex/:listingId/trustline/prepare', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión' });
  wrapAsync(
    () =>
      prepareTrustline({
        listingId: req.params.listingId,
        accountId: account.id,
        limit: req.body?.limit ? Number(req.body.limit) : undefined,
      }),
    res,
  );
});

app.post('/api/sdex/submit', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión' });
  const xdr = String(req.body?.xdr || '');
  if (!xdr) return res.status(400).json({ success: false, message: 'Falta el XDR firmado' });
  wrapAsync(() => submitSignedXdr(xdr), res);
});

/** Repoints the wallet the company receives the raise in. */
app.post('/api/listings/:id/proceeds-wallet', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrap(() => setListingProceedsWallet(req.params.id, String(req.body?.wallet || '')), res);
});

app.post('/api/listings/:id/dividends', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrap(() => depositDividends(req.params.id, Number(req.body?.amountUsdc ?? req.body?.amount)), res, 201);
});

app.get('/api/listings/:id/dividends', (req: Request, res: Response) => {
  wrap(() => listDividends(req.params.id), res);
});

app.post('/api/listings/:id/dividends/claim', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión' });
  wrap(() => claimPendingDividend(account.id, req.params.id), res);
});

app.get('/api/portfolio', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión' });
  wrapAsync(() => buildPortfolio(account.id), res);
});

/**
 * Reconciles one holder's on-chain authorization with their KYC status.
 *
 * Needed because the two drift in normal operation — an investor approved
 * before they created their trustline, or a Horizon call that failed during
 * the approval sweep.
 */
app.post('/api/admin/compliance/sync', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { address, approved } = req.body as { address: string; approved: boolean };
  if (!address) return res.status(400).json({ success: false, message: 'Falta la dirección' });
  wrapAsync(() => syncHolderAuthorization(address, Boolean(approved)), res);
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`[Fractachain Backend] API Server corriendo en puerto ${PORT}`);
});
