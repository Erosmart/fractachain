# Revisión de seguridad — octubre 2026 (rama `macroupdate`)

**Alcance:** API (`backend/` → `apps/api`), web (`frontend/` → `apps/web`),
contratos Soroban (`contracts/`, lectura de código), configuración de
despliegue (Docker, Compose, Railway) y repositorio.
**Método:** revisión manual del código completo, pruebas automatizadas de cada
corrección (`apps/api/test`) y prueba end-to-end contra Stellar testnet
(registro → custodia → KYC → emisión → vault → mint → licitación → aporte →
finalize → reparto).

Severidad: **Crítica** (toma de cuentas / robo o emisión de valor sin
autenticación) · **Alta** · **Media** · **Baja**.

## Resumen

| # | Severidad | Hallazgo | Estado |
|---|---|---|---|
| C1 | Crítica | Login con Google confiaba en `{uid, email}` enviados por el cliente | ✅ Corregido |
| C2 | Crítica | Toma de cuentas sin contraseña vía `/api/auth/email` | ✅ Corregido |
| C3 | Crítica | Cualquiera podía volverse admin registrando primero un email de `ADMIN_EMAILS` | ✅ Corregido |
| C4 | Crítica | Tokens de sesión falsificables con el pepper por defecto y sin expiración | ✅ Corregido |
| C5 | Crítica | Monto de aportes on-chain tomado del body → tokens pagados sin respaldo | ✅ Corregido |
| H1 | Alta | Endpoint mock `/api/auth/google` emitía sesiones sin verificar firma | ✅ Eliminado (410) |
| H2 | Alta | Selfies de KYC (datos personales) públicas y sin validar el tipo de archivo | ✅ Corregido |
| H3 | Alta | Contraseñas con SHA-256 sin sal | ✅ scrypt + migración transparente |
| H4 | Alta | `GET /api/wallet/state` sin auth disparaba fondeos (XLM/USDC) de la plataforma | ✅ Corregido |
| H5 | Alta | Vincular cualquier wallet ajena como "self-custody" sin firmar | ✅ Corregido |
| H6 | Alta | Relays de XDR abiertos (`/api/sdex/submit`, `/api/wallet/usdc/submit`) | ✅ Corregido |
| H7 | Alta | CORS reflejaba cualquier origen con `credentials: true` | ✅ Allowlist |
| H8 | Alta | Doble pago on-chain por requests concurrentes (`/distribute`, aportes) | ✅ Lock por cuenta+listing |
| H9 | Alta | Firma de login de Freighter reutilizable durante 5 minutos (replay) | ✅ Un solo uso |
| M1 | Media | Sin rate limiting (fuerza bruta de login, abuso de faucets, export de clave) | ✅ Corregido |
| M2 | Media | Sin headers de seguridad; `X-Powered-By` expuesto | ✅ helmet / CSP |
| M3 | Media | Límite de body de 8 MB en todas las rutas | ✅ 100 kB (8 MB solo KYC) |
| M4 | Media | Sin validación de entrada (mass assignment en config de red y listings) | ✅ DTOs zod |
| M5 | Media | Mensajes de excepciones internas devueltos al cliente | ✅ Handler central |
| M6 | Media | Cuenta `test@fractachain.dev / test1234` sembrada también en producción | ✅ Solo fuera de prod |
| M7 | Media | Email personal hardcodeado como admin por defecto | ✅ Solo por config |
| M8 | Media | Registros de KYC en memoria: tras un redeploy, aprobar no autorizaba on-chain | ✅ Persistidos |
| M9 | Media | Clave de cifrado de wallets custodiales con default público y sin rotación | ✅ Fail-fast + rotación |
| M10 | Media | Escrituras JSON no atómicas (un crash truncaba la base) | ✅ Escritura atómica |
| M11 | Media | Web sin CSP ni headers; logout no revocaba la sesión en el servidor | ✅ Middleware Astro + logout real |
| L1 | Baja | Script con ruta a `C:/Users/eros_/Downloads/agents_secrets.json` | ✅ Parametrizado |
| L2 | Baja | `bin/soroban` symlink al home de otro desarrollador | ✅ Eliminado |
| L3 | Baja | `graphify-out/` versionado pese al `.gitignore` | ✅ Eliminado |
| L4 | Baja | `@grpc/grpc-js` vulnerable (transitiva de `firebase` → Firestore, que no se usa) | ✅ `firebase` reemplazado por `@firebase/app` + `@firebase/auth` (`npm audit`: 0) |
| L5 | Baja | Logs sin redacción de secretos | ✅ pino redact |

## Detalle

### C1 — Login con Google sin verificación (Crítica)
`POST /api/auth/firebase` hacía `upsertLogin({ uid, email })` con lo que mandaba
el navegador; el `idToken` se recibía pero nunca se verificaba.
**Explotación:** `curl -d '{"email":"<admin>"}' /api/auth/firebase` → sesión de admin.
**Corrección:** `FirebaseTokenVerifier` valida el ID token contra las claves
públicas de Google (firma RS256, `iss`, `aud` = `FIREBASE_PROJECT_ID`, expiración,
`auth_time`) y exige `email_verified`. Sin `FIREBASE_PROJECT_ID` el endpoint
responde 503. Test: `api.test.ts › refuses Google sign-in…`.

### C2 — Toma de cuentas sin contraseña (Crítica)
`upsertLogin` con un email existente sin `passwordHash` (cuentas de Google o
wallet) **guardaba** la contraseña recibida y abría sesión.
**Corrección:** esas cuentas sólo ingresan por su método original; el mensaje
de credenciales inválidas es genérico. Test: `does not let anyone claim…`.

### C3 — Escalada a admin por email (Crítica)
Admin = email en `ADMIN_EMAILS`, pero ningún email se verifica. Quien
registrara primero ese email (o lo cargara en el formulario de KYC de una
cuenta Freighter) era admin.
**Corrección:** `AccountBootstrapper` **reserva** las cuentas admin al arrancar;
sólo abren con `ADMIN_BOOTSTRAP_PASSWORD` o Google verificado. El KYC rechaza
emails reservados. Test: `reserves admin emails…`.

### C4 — Sesiones falsificables y eternas (Crítica)
Token = `fc1.<id>.<ts>.<HMAC truncado a 96 bits>` con `AUTH_PEPPER` por defecto
`fractachain-dev-auth` (público en el repo). Sin la variable, cualquiera podía
firmar tokens para cualquier cuenta. Además no expiraban, se comparaban con
`===` y el logout no los invalidaba.
**Corrección:** `HmacTokenService` (`fc2.<claims>.<HMAC-SHA256 completo>`),
comparación en tiempo constante, `exp` (12 h por defecto), revocación por `jti`
persistida; en producción el API no arranca sin `AUTH_SECRET` (≥ 32 caracteres,
no de ejemplo). Los tokens v1 se rechazan (re-login único).

### C5 — Aportes on-chain inflados (Crítica)
`/contribute/submit` reenviaba cualquier XDR firmado y registraba el
`usdcAmount` **del body**. Con un aporte real de 1 se podía bookear 1 000 000,
reclamarlo y que el emisor pagara esos tokens on-ledger (`distribute`).
**Corrección:** `SignedTransactionPolicy` exige que la tx sea exactamente
`contribute(<wallet del usuario>, …)` sobre el contrato de *ese* listing, y el
monto se calcula del propio contrato (unidades RWA antes/después × precio).
Igual para `refund/submit`. Tests: `signed-transactions.test.ts`; verificado
en testnet.

### H2 — Selfies de KYC públicas (Alta)
`GET /api/kyc/selfie/:id` servía la foto a cualquiera; el tipo se tomaba del
data URL del cliente.
**Corrección:** sólo titular o admin, `Cache-Control: no-store`,
`Content-Security-Policy: default-src 'none'; sandbox`, `nosniff`, y el
archivo se acepta sólo si sus *magic bytes* son PNG/JPEG/WEBP (≤ 5 MB). La web
las muestra con un `AuthenticatedImage` (fetch con Bearer → blob URL).

### H4 — Fondeo disparado sin autenticación (Alta)
`GET /api/wallet/state?account=G…` de cualquier wallet registrada ejecutaba
Friendbot, recarga de XLM desde el deployer y grant de USDC. Un script podía
vaciar las cuentas de la plataforma y saturar Horizon.
**Corrección:** los efectos sólo corren para la wallet del usuario autenticado;
el resto recibe saldos (dato público de la red).

### H5 / H6 — Wallets y relays (Alta)
`POST /api/auth/wallet {mode:'SELF', publicKey}` asociaba cualquier clave
pública sin probar posesión (p. ej. la wallet de cobro de una empresa, cuyos
fondos sandbox se acreditan a la cuenta dueña de esa clave). Los relays
aceptaban cualquier XDR, y `usdc/submit` pagaba el grant sin mirar qué se
había enviado.
**Corrección:** vincular una wallet existente exige firma (flujo `link`) y la
clave no puede pertenecer a otra cuenta; los relays exigen que la tx la origine
la wallet del usuario, sólo admiten `changeTrust`/ofertas (SDEX) o exactamente
el `changeTrust` de USDC (faucet).

### H8 — Doble pago por concurrencia (Alta)
`distributeClaimedTokens` calculaba lo pendiente, esperaba el pago on-chain y
recién después lo registraba: dos requests simultáneas pagaban dos veces.
**Corrección:** `KeyedMutex` por `cuenta:listing` en pagos, aportes y refunds.

### M9 — Clave de cifrado de wallets custodiales (Media)
`WALLET_PEPPER` tenía default público y no había forma de rotarlo sin perder
las wallets. Ahora producción exige un valor propio y existe
`WALLET_PEPPER_PREVIOUS`: lo cifrado con la clave anterior se abre y se
re-cifra con la nueva al primer uso.

## Endurecimiento adicional (implementado)

Lo que la primera versión de este informe dejaba como recomendación, ya
implementado y con tests (`packages/api/test/http/security-features.test.ts`):

| Tema | Implementación |
|---|---|
| Sesión robable por XSS (`localStorage`) | La web y el API comparten origen: la sesión vive en una cookie `HttpOnly; SameSite=Strict` (`__Host-` + `Secure` en producción). El navegador nunca ve el token. **CSRF:** las escrituras con cookie exigen `X-Requested-With: fractachain` y mismo origen. |
| Sin segundo factor | **2FA TOTP** (RFC 6238, apps de autenticación): alta con QR, 10 códigos de recuperación de un solo uso, anti-replay por paso de tiempo, secreto cifrado con AES-GCM. Login en dos pasos (`challenge` + código). **Obligatorio para el panel de admin en producción** (`ADMIN_REQUIRE_2FA`). |
| Emails sin verificar | Link firmado (24 h) al registrarse; en producción el KYC exige email confirmado (`REQUIRE_EMAIL_VERIFICATION`). Envío por SMTP (`SMTP_URL`) o al log en desarrollo. |
| Sin recuperación de cuenta | **Reseteo de contraseña** por email: respuesta idéntica exista o no la cuenta (sin enumeración), link de 30 min que muere al cambiar la contraseña, y el reseteo **cierra todas las sesiones**. También "cerrar todas las sesiones" a pedido. |
| Sin trazabilidad | **Auditoría** append-only (`audit.json`, espejada en Postgres): logins y fallos, 2FA, reseteos, exportación de clave custodial, vistas de selfies de KYC y todas las acciones de admin, con actor, IP, request id y resultado. Nunca guarda secretos. Panel `/admin/audit`. |
| Lock solo en memoria | `ILockProvider`: con `DATABASE_URL`, **advisory locks de Postgres** (`pg_advisory_lock`) para pagos y aportes; varias réplicas no pueden pagar dos veces. |
| Wallet healing en cada request | El auto-fondeo (Friendbot/Horizon) corre como mucho cada 5 min por wallet. |

## Riesgos que quedan (requieren decisiones o servicios externos)

1. **Custodia de claves en el mismo host.** Las wallets custodiales (y los
   secretos 2FA) se cifran con AES-256-GCM con una clave del entorno. Para
   mainnet: envelope encryption con KMS/HSM (AWS KMS, GCP KMS) o MPC, y
   límites de retiro. Requiere cuenta cloud y política de custodia.
2. **KYC auto-aprobado en testnet** (no hay proveedor). `KYC_AUTO_APPROVE=false`
   lo desactiva; en producción hace falta contratar un proveedor (Onfido,
   Veriff, Renaper vía integrador…).
3. **Factory compartida de testnet** sin el `usdcSac` actual registrado: su
   admin tiene que llamar `set_payment_asset(1, <usdcSac>)`. Para desarrollo:
   `testnet:clone-factory` + `testnet:setup-usdc`.
4. **Contratos ya desplegados:** las correcciones aplican a instancias nuevas
   tras subir el WASM (`scripts/testnet/02-build.sh` + `testnet:upload-wasm`).

## Contratos Soroban

Revisión de lectura de los seis crates (`fractachain-licitacion`, `issuance-factory`,
`stock-vault`, `warrant-vault`, `forward-contract`, `fractachain-core`). Todos
los hallazgos están corregidos con su test de regresión (`cargo test`:
**135 tests OK**), además de los ítems informativos (`set_price_per_unit`
reinicia el precio equitativo; el polvo de redondeo de dividendos se puede
barrer). Quedan como mejora de diseño: fijar la factory on-chain y migrar a
`__constructor`.

> Los contratos ya desplegados en testnet **no cambian** hasta subir el WASM
> nuevo (`scripts/testnet/02-build.sh` + `03-deploy.sh`) y actualizar los hashes
> en `deployments/testnet.json`.

| # | Sev. | Contrato · función | Hallazgo | Estado |
|---|---|---|---|---|
| SC-01 | Alta | licitación · `fill_order` | Auto-fill (`buyer == seller`) sin costo (fee truncado a 0 bajo 400) subía `HighestPrice`, el piso que paga toda OPA/squeeze-out | ✅ Auto-fill bloqueado + fee redondeado hacia arriba (tests `an_order_cannot_be_filled_by_its_own_seller`, `small_fills_still_pay_the_platform_fee`) |
| SC-02 | Alta | warrant-vault · `initialize` (también forward, stock-vault) | `registry` lo elige quien inicializa: un registry falso responde `is_warrantera = true` y se financia colateral inexistente | ✅ `get_registry` (+ `get_parties`/`get_producer`) en los tres contratos; el API y los scripts verifican el registry de cada instancia; warrant re-chequea `is_warrantera` al fondear y un warrantera revocado no liquida. ⚠️ Fijar la factory on-chain queda como cambio de diseño |
| SC-03 | Alta | licitación · control 50 % (Art. 87/88) | Registro de OPA único que nunca se resetea; `contribute`/`fill_order` miran saldo libre (no `OrderEscrow`); suspensión de votos perezosa | ✅ El registro pasa a quien controla hoy; tenencia total (libre + escrow) en `contribute`, `fill_order`, `cancel_sale_order` y `accept_opa`; `has_votes` aplica la sanción vencida y `enforce_opa_deadline` la persiste |
| SC-04 | Media | licitación · `execute_squeeze_out` | Sobrescribe `rec.acquirer`: un nuevo adquirente podía cobrar el escrow de la OPA anterior con `reclaim_opa_escrow` | ✅ `OpaEscrowOwner`: el escrow sólo vuelve a su dueño y se devuelve antes de cualquier relevo |
| SC-05 | Media | licitación · `launch_opa` / `accept_opa` | Funcionaban en estado `Open`: un aceptante cobraba la OPA y además el `refund` si la emisión fallaba | ✅ Exigen `Successful` (test `a_tender_offer_waits_for_a_successful_issuance`) |
| SC-06 | Media | todos · `initialize` | Deploy e init en transacciones separadas: front-running del init (p. ej. vault con admin/oráculo del atacante). `03-deploy.sh` guarda el ID antes de inicializar | ✅ `get_admin` en licitación y stock-vault; el API, los CLIs y `03-deploy.sh` verifican admin/registry después del init y descartan la instancia si no coinciden. ⚠️ Migrar a `__constructor` queda como mejora |
| SC-07 | Media | forward · `transfer_position` | El árbitro podía comprar la posición del comprador y fallar su propia disputa | ✅ Rechazado (test `the_arbiter_cannot_buy_the_position`) |
| SC-08 | Baja | licitación · `cancel_sale_order` | Tras un squeeze-out, cancelar una orden vuelve a acreditar RWA (saldo fantasma; no cobrable hoy) | ✅ Sólo con el mercado en `Successful` |
| SC-09 | Baja | licitación · `verify_investor` (kyc.rs) | Renovar el KYC restauraba votos suspendidos por Art. 88 | ✅ Conserva `voting_rights` (test `kyc_renewal_keeps_a_suspended_vote_suspended`) |
| SC-10 | Baja | warrant-vault · `execute_liquidation` | En `now == due + gracia` el préstamo era pagable y liquidable a la vez (front-running del prestamista) | ✅ Liquidación desde el segundo siguiente (test `repayment_and_liquidation_do_not_overlap_at_the_grace_boundary`) |
| SC-11 | Baja | forward · `mark_delivered` / disputas | Sin límite temporal para marcar entrega ni timeout de disputa: escrow congelado si el árbitro desaparece | ✅ `mark_delivered` cierra cuando abre el refund; `refund_unresolved_dispute` tras 30 días sin fallo; una sola disputa por entrega |
| SC-12 | Baja | licitación, stock-vault, warrant-vault | Claves `persistent` sin `extend_ttl` (Admin, State, TotalRaised, OpaEscrow, MintSeq…): pueden archivarse (se restauran pagando, no se pierden fondos) | ✅ `bump_core` en cada entry point y `bump_persistent_if_present` en core |

**Lo que está bien resuelto:** todos los caminos de admin comparan contra el
admin guardado y llaman `require_auth`; la factory rota admin con doble firma;
Soroban impide reentradas y el estado se escribe antes de transferir;
`overflow-checks = true`; en licitación el payout es único y bloqueado mientras
está `Open`, fiduciaria/precio/token se congelan con el primer aporte, el
refund no se paga dos veces y cada entrega de unidades chequea KYC
(vencimiento, activo, país); en stock-vault los dividendos se devengan antes
de cada cambio de saldo, el sweep no toca lo adeudado y el mint está topeado
por la custodia atestada; en warrant-vault el plazo arranca al fondear y la
tasa está acotada.
