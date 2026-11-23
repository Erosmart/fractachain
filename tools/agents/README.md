# tools/agents

Scripts de operación para **testnet** (no forman parte del API ni de la web).
Generan actividad de mercado para que el orderbook y las velas tengan datos.

| Script | Qué hace | Cómo |
|---|---|---|
| `agents_lilas.mjs` | Crea N inversores vía API, aportan a una licitación y operan el orderbook sandbox | `npm run dev` y `ADMIN_EMAIL=… ADMIN_PASSWORD=… node tools/agents/agents_lilas.mjs` |
| `agents_trade_tuwu.mjs` | Agentes que compran/venden en el SDEX firmando directo | `STELLAR_ISSUER_SECRET=S… node tools/agents/agents_trade_tuwu.mjs` |
| `market_maker.ts` | Siembra miles de trades SDEX con volatilidad | `npx tsx tools/agents/market_maker.ts` |

Todos leen/escriben las claves de los agentes en `agents_secrets.json` (raíz del
repo, gitignored) o en `AGENTS_SECRETS_FILE`. **Ese archivo tiene claves
privadas: no lo subas nunca.**
