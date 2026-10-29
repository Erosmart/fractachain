import type { Router } from 'express';
import type { StockCatalogService } from '../../application/custody/StockCatalogService';
import type { IssuanceProductService } from '../../application/issuance/IssuanceProductService';
import type { MockGatewayService } from '../../application/mocks/MockGatewayService';
import { NotFoundError } from '../../shared/errors';
import { param, type AuditMiddleware } from '../middleware/AuditMiddleware';
import type { AuthMiddleware } from '../middleware/AuthMiddleware';
import { body, bodyOf, params } from '../middleware/validate';
import { ok } from '../respond';
import {
  ArsOnRampBody,
  CctpBody,
  CreateProductBody,
  CreateStockBody,
  CropParam,
  FiatOnRampBody,
  IdParam,
  NearIntentsBody,
  PaymentAssetBody,
  ProductBindBody,
  ProductPriceBody,
  StockActiveBody,
  StockPriceBody,
  TickerParam,
} from '../schemas';
import type { Controller } from './Controller';

/** Merval custody catalog, issuance products and the mocked rails of the home page. */
export class CatalogController implements Controller {
  constructor(
    private readonly stocks: StockCatalogService,
    private readonly products: IssuanceProductService,
    private readonly mocks: MockGatewayService,
    private readonly guard: AuthMiddleware,
    private readonly audit: AuditMiddleware,
  ) {}

  register(r: Router): void {
    /* ------------------------------- mocks ------------------------------- */
    r.post('/api/mocks/onramp/ars', body(ArsOnRampBody), (req, res) => {
      const b = bodyOf(req, ArsOnRampBody);
      res.json(this.mocks.arsOnRamp(b.arsAmount, b.destinationWallet));
    });
    r.post('/api/mocks/onramp/fiat', body(FiatOnRampBody), (req, res) => {
      const b = bodyOf(req, FiatOnRampBody);
      res.json(this.mocks.fiatOnRamp(b.fiatAmount, b.fiatCurrency, b.destinationWallet));
    });
    r.post('/api/mocks/bridge/cctp', body(CctpBody), (req, res) => {
      const b = bodyOf(req, CctpBody);
      res.json(this.mocks.cctpBridge(b.originChain, b.usdcAmount, b.destinationWallet));
    });
    r.post('/api/mocks/bridge/near-intents', body(NearIntentsBody), (req, res) => {
      const b = bodyOf(req, NearIntentsBody);
      res.json(this.mocks.nearIntentsSwap(b.depositAsset, b.depositAmount, b.destinationWallet));
    });
    r.get('/api/mocks/oracles/commodities', (_req, res) => {
      ok(res, this.mocks.commodities());
    });
    r.get('/api/mocks/oracles/commodities/:crop', params(CropParam), (req, res) => {
      const item = this.mocks.commodity(String(req.params.crop));
      if (!item) throw new NotFoundError('Cultivo no encontrado');
      ok(res, item);
    });
    r.get('/api/mocks/oracles/weather', (_req, res) => {
      ok(res, this.mocks.weather());
    });

    /* ------------------------------ custody ------------------------------ */
    r.get('/api/custody/stocks', (_req, res) => {
      ok(res, this.stocks.publicCatalog());
    });
    r.get('/api/custody/por', (_req, res) => {
      ok(res, this.stocks.proofOfReserve());
    });
    r.get('/api/admin/stocks', this.guard.requireAdmin, (_req, res) => {
      ok(res, this.stocks.adminCatalog());
    });
    r.post(
      '/api/admin/stocks',
      this.guard.requireAdmin,
      this.audit.route('stock.create'),
      body(CreateStockBody),
      (req, res) => {
        ok(res, this.stocks.create(bodyOf(req, CreateStockBody)), 201);
      },
    );
    r.post(
      '/api/admin/stocks/:ticker/active',
      this.guard.requireAdmin,
      this.audit.route('stock.active', param('ticker')),
      params(TickerParam),
      body(StockActiveBody),
      (req, res) => {
        ok(res, this.stocks.setActive(String(req.params.ticker), bodyOf(req, StockActiveBody).active));
      },
    );
    r.post(
      '/api/admin/stocks/:ticker/price',
      this.guard.requireAdmin,
      this.audit.route('stock.price', param('ticker')),
      params(TickerParam),
      body(StockPriceBody),
      (req, res) => {
        const b = bodyOf(req, StockPriceBody);
        ok(res, this.stocks.updatePrice(String(req.params.ticker), b.priceUsdc, b.change24hPct));
      },
    );

    /* ------------------------------ issuance ------------------------------ */
    r.get('/api/admin/issuance/assets', this.guard.requireAdmin, (_req, res) => {
      ok(res, this.products.paymentAssets());
    });
    r.post(
      '/api/admin/issuance/assets',
      this.guard.requireAdmin,
      this.audit.route('issuance.payment_asset'),
      body(PaymentAssetBody),
      (req, res) => {
        const { kind, address } = bodyOf(req, PaymentAssetBody);
        res.json({ success: true, kind, address: this.products.setPaymentAsset(kind, address) });
      },
    );
    r.get('/api/admin/issuance/products', this.guard.requireAdmin, (_req, res) => {
      ok(res, this.products.list());
    });
    r.post(
      '/api/admin/issuance/products',
      this.guard.requireAdmin,
      this.audit.route('issuance.product.create'),
      body(CreateProductBody),
      (req, res) => {
        const b = bodyOf(req, CreateProductBody);
        ok(res, this.products.create({ ...b, pricePerUnit: b.pricePerUnit || '0' }), 201);
      },
    );
    r.post(
      '/api/admin/issuance/products/:id/price',
      this.guard.requireAdmin,
      this.audit.route('issuance.product.price', param('id')),
      params(IdParam),
      body(ProductPriceBody),
      (req, res) => {
        const product = this.products.updatePrice(
          String(req.params.id),
          bodyOf(req, ProductPriceBody).pricePerUnit,
        );
        if (!product) throw new NotFoundError('Producto no encontrado');
        ok(res, product);
      },
    );
    r.post(
      '/api/admin/issuance/products/:id/bind',
      this.guard.requireAdmin,
      this.audit.route('issuance.product.bind', param('id')),
      params(IdParam),
      body(ProductBindBody),
      (req, res) => {
        const product = this.products.bindContract(
          String(req.params.id),
          bodyOf(req, ProductBindBody).contractAddress,
        );
        if (!product) throw new NotFoundError('Producto no encontrado');
        ok(res, product);
      },
    );
  }
}
