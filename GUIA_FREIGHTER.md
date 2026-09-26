# Guía — operar FractaChain con Freighter y ver el token en la wallet

Dos partes: (1) qué operaciones firma el inversor desde Freighter y (2) cómo lograr que el
token aparezca en la wallet y cuándo puede mostrar un valor en dinero.

Red de la demo: **Stellar Testnet** (`Test SDF Network ; September 2015`).

---

## 1. Operaciones con Freighter

Arquitectura: el backend **arma la transacción sin firmar**, Freighter la firma en el navegador
y el backend la retransmite a la red. La clave privada nunca sale de la extensión.

```
frontend --> POST .../prepare   (backend construye + simula) --> XDR sin firmar
frontend --> Freighter.signTransaction(XDR)                  --> XDR firmada
frontend --> POST .../submit                                 --> hash on-chain
```

| Operación | Cuenta self-custody (Freighter) | Cuenta custodial |
|---|---|---|
| Login | firma un mensaje (`signMessage`) | email + password |
| Aportar a una licitación (`contribute`) | `POST /api/listings/:id/contribute/prepare` → firma → `/contribute/submit` | el backend firma |
| Reembolso (`refund`, emisión Failed) | `/api/listings/:id/refund/prepare` → firma → `/refund/submit` | el backend firma |
| Trustline del token clásico | `/api/sdex/:id/trustline/prepare` → firma → `/api/sdex/submit` | el backend abre la trustline |
| Orden en el DEX (SDEX) | `/api/sdex/:id/orders/prepare` → firma → `/api/sdex/submit` | `/api/sdex/:id/orders` (one-shot) |
| Cancelar orden SDEX | `/api/sdex/:id/orders/cancel` devuelve XDR → firma → `/api/sdex/submit` | el backend ya la envía |
| `finalize()` de la licitación | la dispara el backend automáticamente (hard cap o deadline) | ídem |

Requisitos antes de operar:

1. Instalar Freighter y **cambiar la red a Testnet** (si está en Mainnet la app corta con un aviso).
2. Fondear la cuenta con Friendbot: `https://friendbot.stellar.org/?addr=G...`.
3. Conectar la wallet en FractaChain (botón "Conectar Freighter") y completar KYC:
   con `AUTH_REQUIRED` el emisor sólo autoriza trustlines de cuentas aprobadas.

Notas:

- `finalize()` es una operación administrativa del emisor; no se firma desde Freighter.
- Cada firma abre el popup de Freighter: es obligatorio por protocolo, no se puede saltear.
- Si Freighter rechaza la firma, el backend nunca recibe una XDR y no se registra nada.

---

## 2. Que el token se vea en la wallet

Las unidades RWA del contrato Soroban **no** son un token que Freighter liste: viven en el storage
del contrato. Lo que sí se ve es el **asset clásico** del emisor de la licitación.

### 2.1 Emisor y código del asset

Cada expediente define en el dossier:

- `tokenTicker` → el código del asset (1–12 caracteres alfanuméricos, p.ej. `LILAS`).
- `issuerPublicKey` → la cuenta emisora `G...` (clave secreta sólo por entorno, `STELLAR_ISSUER_SECRET`).

Ese par `(código, emisor)` **es** la identidad del token. Dos assets con el mismo código y distinto
emisor son tokens distintos: siempre verificá el emisor antes de confiar en un saldo.

Recomendado en el emisor para un RWA regulado: `AUTH_REQUIRED` + `AUTH_REVOCABLE` (y `CLAWBACK_ENABLED`
si el marco regulatorio lo pide), y `SET_OPTIONS` con home domain apuntando al dominio que publica el
`stellar.toml`.

### 2.2 Trustline

Antes de recibir el token, la wallet tiene que aceptarlo (operación `changeTrust`):

- **Custodial:** lo hace el backend, sin intervención del usuario.
- **Freighter:** botón "Aprobar recepción del token" → firma la trustline → el emisor la autoriza
  cuando el KYC está aprobado (`allowTrust`). Sin autorización la línea existe pero queda inerte.

### 2.3 Agregar el asset a mano en Freighter

Freighter muestra automáticamente cualquier asset con trustline y saldo. Si no aparece:

1. Freighter → *Manage Assets* → *Add another asset*.
2. Pegar el **código** y la **clave del emisor** (o buscar por código si el asset está en el
   directorio de assets, lo que exige `stellar.toml` publicado en el home domain del emisor).
3. Confirmar que arriba dice **Test Net** si estás en la demo.

Para que la wallet muestre nombre, ícono y decimales, el emisor debe publicar un
`https://<home-domain>/.well-known/stellar.toml` con la sección `[[CURRENCIES]]`
(`code`, `issuer`, `name`, `image`, `desc`) — SEP-1.

### 2.4 Ver un **valor** (no sólo el saldo)

Hay que separar dos cosas:

- **Saldo:** cuántas unidades tenés. Aparece apenas hay trustline y el emisor te pagó el token.
- **Valuación:** cuánto vale ese saldo en XLM/USD. Freighter **no** inventa un precio: necesita una
  fuente de mercado. Tener saldo no implica ver un monto en dólares.

Para que exista precio:

1. El asset tiene que **cotizar en el SDEX** contra un par reconocido (XLM o USDC): alguien debe
   poner órdenes de compra y venta. Sin libro no hay precio.
2. Con liquidez en el libro, exploradores (Stellar Expert, StellarX) y las wallets que consultan el
   último trade / mid price pueden mostrar una valuación aproximada.
3. Un precio "oficial" en USD depende de que el proveedor de datos de la wallet incluya ese par;
   para un RWA de nicho lo habitual es que muestre el saldo y no una valuación en fiat.

Por eso en FractaChain la valuación confiable se muestra en la app (portfolio, con la fuente de precio
explícita) y en el DEX; la wallet es la prueba de *tenencia*, no el oráculo de precio.

### 2.5 Checklist de verificación

- ¿La red de Freighter coincide con la de la app (Testnet)?
- ¿El emisor del asset que ves es exactamente `issuerPublicKey` del expediente?
- ¿La trustline está **autorizada** (no sólo creada)?
- ¿El hash de la transacción aparece en Stellar Expert testnet?
- Para el precio: ¿hay órdenes vivas en el par `TOKEN/XLM` o `TOKEN/USDC`?
