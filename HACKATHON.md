# Fractachain — pitch Genesis (Argentina Builder Challenge)

**Un problema.** El productor agropecuario argentino necesita dólares contra la campaña (semilla, fertilizante, flete) y el inversor quiere yield con respaldo real. El circuito banco / warrant / Caja de Valores es lento y casi no tiene secundario.

**Una solución, un flujo.** Fractachain pone esa campaña en Stellar: el inversor aporta USDC a una licitación, recibe un token respaldado y puede verlo en el portfolio. Contratos Soroban (factory, licitación, stock vault) ya están en testnet.

**Qué demoamos el 27/09**

1. Registrarse y elegir wallet (custodial o propia).
2. KYC in-app.
3. Abrir la licitación *Agropecuaria Las Lilas* (soja, Pergamino).
4. Aportar USDC. El cupo se actualiza. Si hay emisor y wallet custodial, la trustline sale en testnet (hash en Stellar Expert).
5. Ver la posición en Portfolio.

Forwards, warrants y Merval son el roadmap: hay contratos, la UI es maqueta y lo dice en pantalla.

**Building blocks Stellar:** Soroban 28, SAC USDC/XLM, Horizon, SDEX con `AUTH_REQUIRED`, Friendbot.

**No es.** Un DEX genérico, ni un token sin custodia. Es financiamiento de producción argentina.

Entrega: deck + este repo. Trabajo diario en el fork [Antony27c/fractachain](https://github.com/Antony27c/fractachain) y PR hacia [Erosmart/fractachain](https://github.com/Erosmart/fractachain).
