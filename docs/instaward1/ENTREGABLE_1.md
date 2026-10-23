# Instaward 1 · Entregable 1: licitación liquidada en USDC

Registro de progreso del Entregable 1 del SOW (sprint desde el 19/10/2026, testnet).

## Tareas

| # | Tarea | Estado |
|---|---|---|
| 1 | Registrar el SAC de USDC de Circle (testnet) en la factory con `set_payment_asset(PaymentKind::USDC)` | Hecho (23/10) |
| 2 | Configurar el token de pago de la licitación con el SAC de Circle | Hecho (23/10): las instancias nuevas se inicializan con el SAC derivado del USDC configurado |
| 3 | Normalizar decimales (7 en el SAC) y recalcular `price_per_unit` | Hecho (23/10): ver detalle abajo |
| 4 | `contributeOnChain` en USDC | Hecho (23/10), verificado on-chain |
| 5 | `finalizeOnChain` en USDC | Hecho (23/10), verificado on-chain |
| 6 | `refundOnChain` en USDC | Hecho (23/10), verificado on-chain |
| 7 | Sacar el camino sandbox (`cashUsdc`) de los listings on-chain | Hecho (23/10): ver detalle abajo |
| 8 | Tests unitarios en Rust con `soroban_sdk::testutils` y un SAC de prueba | Escritos (23/10), pendiente de correr: falta Rust local y la conexión no alcanza para bajar el toolchain |
| — | CI en GitHub Actions con `cargo test`, tests y typecheck | Workflow escrito (`.github/workflows/ci.yml`), corre en el primer push |
| — | Flujo E2E en CI sobre una red Stellar local | Pendiente (semana 4 del SOW); hoy el E2E corre contra testnet con `npm run e2e:usdc` |

### Detalle de la tarea 3: decimales y precio

- `toStroops` convierte de decimal a unidades del SAC sin pasar por punto flotante (antes `0.1 + 0.2` perdía una unidad). Lo cubren 8 tests nuevos en `backend/src/test_runner.ts`.
- Antes de desplegar una licitación, el backend lee `decimals()` del SAC y aborta si no es 7. Contra el SAC de Circle en testnet devuelve 7.
- El backend rechaza, antes de firmar, los aportes que no son múltiplo del precio, con el mismo criterio que `require_divisible` del contrato.
- `price_per_unit` se inicializa en USD reales del USDC de Circle. Defaults de demo: precio 1 USDC, inversión mínima 1, soft cap 3, hard cap 5. Entran en los 5 USDC que la tesorería da a cada wallet.

### Detalle de la tarea 7: sin camino sandbox en licitaciones

- Se eliminó el aporte sandbox (`contributeListing` + `debitCash`). El endpoint de aporte rechaza los listings sin contrato Soroban.
- Una licitación solo abre si su contrato se desplegó; ya no se genera un contract ID ficticio.
- Las licitaciones nuevas son siempre en USDC de Circle. Las que ya existen en XLM siguen funcionando hasta cerrar.
- El saldo `cashUsdc` sigue en el orderbook sandbox y en el dashboard; sacarlo es parte del Entregable 3.

### Detalle de la tarea 8: tests en Rust

En `contracts/fractachain-licitacion/src/test.rs` hay 9 tests nuevos con un SAC de prueba en la escala de Circle (7 decimales) y los montos de demo:

- aporte en USDC: el saldo pasa al escrow y se acreditan las unidades;
- cierre por hard cap: el fiduciario cobra en USDC y el escrow queda en 0;
- licitación fallida: refund devuelve todo y un segundo refund falla;
- refund bloqueado mientras está abierta o si cerró con éxito;
- aportes que no son múltiplo del precio (2.5 USDC, 1 unidad menos de 1 USDC);
- aportes por encima del hard cap;
- aporte sin fondos no mueve nada;
- cambio de token antes del primer aporte: se liquida en el token nuevo (el mismo cambio que se hizo de USDC propio a Circle);
- token y precio quedan fijos después del primer aporte.

Los tests de la factory (`issuance-factory/src/test.rs`) ya cubrían registrar productos en USDC y detectar productos con un SAC rotado.

## Configuración on-chain (testnet)

| Elemento | Valor |
|---|---|
| USDC (Circle) | `USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |
| SAC USDC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| Factory | `CDF7VE4JMPQYR6Q76MYFEEG64CZIZLOJLGSUQN5NXTZSP3U5JTWHNJGW` |
| USDC anterior (emisor propio, fallback) | `USDC:GCASKV25GUVZTFZ6HFTJPKNYKW3OUOWCSAM3I5JAR7MWH6ZCLYV7R7MB` |
| Tesorería de demo (pool del faucet de Circle) | `GAHC3C4JHEDUO2FQIDP52UEWALKABRXKJ4Z4PKYFKRFI456RW3ETVM2N` |

- Cambio de la factory al SAC de Circle: [a55fa2e3…](https://stellar.expert/explorer/testnet/tx/a55fa2e37e859148ad6108b2a3b4260a5c1cd2d21e6cbcf5d828735259957ef5)
- Trustline de la tesorería a Circle: [42d1455f…](https://stellar.expert/explorer/testnet/tx/42d1455fc39169b3acf24f2511d2339bc937c5781675efb9886a6544c1fb8912)

Comandos:
- `npm run usdc:set -- circle` (o `platform` para volver al emisor propio; `--dry-run` para ver el plan).
- `npm run e2e:usdc` corre el flujo completo y devuelve los USDC a la tesorería.

## Evidencia E2E (23/10/2026)

Corrida de `npm run e2e:usdc`. Todas las transacciones mueven `USDC-GBBD47…` (Circle).

**Licitación A, cierra con éxito**: [`CAPQERMX…`](https://stellar.expert/explorer/testnet/contract/CAPQERMX3G3USC2KGFAHBF7VNWQ546QFVRNHO22QJ3GS5O42CHP7W6SD), producto #10 en la factory

| Paso | Transacción |
|---|---|
| initialize con el SAC de Circle | [19ebbe0c…](https://stellar.expert/explorer/testnet/tx/19ebbe0c53156f4981fb5f336c99f4a34b6793f2fa43377b91fe5b6876ea4bae) |
| register_product (token vigente: true) | [40177c9c…](https://stellar.expert/explorer/testnet/tx/40177c9c0bf3033b5ef5e9c6db2422003f02a227fe974f51a8de376db6b9533e) |
| contribute 3 USDC, firmado por el inversor | [ee177400…](https://stellar.expert/explorer/testnet/tx/ee177400f23cb73e7d643525888aa3c92c783e742afcd687f7a9466524e1ce27) |
| finalize → Successful, paga 3 USDC al fiduciario | [ac55053b…](https://stellar.expert/explorer/testnet/tx/ac55053b1cc36b42bb7c4ff06aade17a848b20f8b26e9fe29ea87d91c2a238c4) |

**Licitación B, fracasa y reembolsa**: [`CCUWQIAW…`](https://stellar.expert/explorer/testnet/contract/CCUWQIAWGQOSKWKFR3IRSCRPK5NB3QZNN3O2Z3KTOK5CEEYTOM7UKNUN), producto #11 en la factory

| Paso | Transacción |
|---|---|
| initialize con el SAC de Circle | [ecb71202…](https://stellar.expert/explorer/testnet/tx/ecb71202bfe179500758f480493bfe2c0f928c629fabbc4d268e31f3f1e25e3f) |
| register_product (token vigente: true) | [cc70cee7…](https://stellar.expert/explorer/testnet/tx/cc70cee74463e59b60e78b49fa73d6c4f2e7a985db644b9291fb2d127f7b0134) |
| contribute 2 USDC, firmado por el inversor | [dbcf87ca…](https://stellar.expert/explorer/testnet/tx/dbcf87ca91b37e7a3ab4c43c3387bc238478f198a382ffdd975ecfe0c2dccc7e) |
| finalize → Failed (no llegó al soft cap) | [c78919b6…](https://stellar.expert/explorer/testnet/tx/c78919b6af47c366847b99d11a00ee46e2a5fa56f6ddb5182eee7d6c75ab943c) |
| refund 2 USDC, firmado por el inversor | [4a422865…](https://stellar.expert/explorer/testnet/tx/4a42286559c74040fe6b1a94ec69711b4b377d9c6a8820693250ecd8dd208fd9) |

Fondeo y devolución:
- Tesorería → inversor, 8 USDC: [76050225…](https://stellar.expert/explorer/testnet/tx/76050225418bd5a3226e618f119a639d5b823ae1ff61f09585cf5908901f9811)
- Inversor → tesorería, 5 USDC: [758483c8…](https://stellar.expert/explorer/testnet/tx/758483c8aa99355536fc04716fba1867544dbcb16473f0a68501087c4ae26b28)
- Fiduciario → tesorería, 3 USDC: [9265e24e…](https://stellar.expert/explorer/testnet/tx/9265e24e8b1aef4a84ba84b430efe7cc12494c42b3f2cae253262239cf7a1d8b)

La tesorería terminó con los mismos 20 USDC con los que empezó.

## Notas

- El faucet de Circle da 20 USDC cada 2 horas. Por eso el fondeo por wallet de demo es de 5 USDC (`STELLAR_USDC_GRANT`).
- Las licitaciones creadas antes del cambio siguen con el USDC propio. El contrato no permite cambiar el token después del primer aporte.
- La demo en Railway necesita `STELLAR_USDC_TREASURY_SECRET` (una tesorería con USDC de Circle) cuando se despliegue este código.
