---
name: raven
description: Stellar Raven MCP gateway and real-time intelligence for Stellar and Soroban. Use when querying live Stellar blockchain data, inspecting Soroban smart contracts, diagnosing failed transactions, researching latest protocol updates, looking up real-time documentation, or interacting with the Stellar Raven MCP server tools (search and execute).
---

# Stellar Raven

Stellar Raven is the remote Model Context Protocol (MCP) server providing AI agents with live, authenticated access to the Stellar and Soroban development ecosystem.

- **MCP Endpoint**: `POST https://raven.stellar.org/mcp` (or `https://raven.stellar.buzz/mcp`)
- **Documentation**: `https://raven.stellar.org/docs`
- **Playground**: `https://raven.stellar.buzz/playground`
- **Repository**: `stellar-experimental/stellar-raven`

## How Raven Works

Raven unifies Stellar ecosystem services and skills over two primary tools:

1. **`search`**: Used to discover capabilities, contracts, live account states, transaction hashes, and documentation across catalog families.
2. **`execute`**: Executes sandboxed JavaScript queries against host-side Stellar adapters with full context.

## Complementary Workflow: Raven + Local Skills

- **Durable Local Knowledge**: Use local skills (`smart-contracts`, `assets`, `dapp`, `data`, `standards`) for writing Rust contracts, SDK APIs, testing patterns, and security best practices.
- **Live Ecosystem Intelligence**: Use **Raven** for real-time lookups:
  - Checking account balances, trustlines, and signers on Mainnet/Testnet.
  - Inspecting deployed Soroban contract specs, storage entries, and instance TTL.
  - Decoding and diagnosing transaction simulation failures and diagnostic events.
  - Getting the latest network parameters (protocol version, fee rates, ledger limits).

## Using Raven MCP

When connected via MCP:
- Call `search` with natural language queries like `"Find Soroban contract address for token SAC"` or `"Explain transaction failure <hash>"`.
- Review the source-family micro-map returned to plan execution.
- Call `execute` with query scripts to fetch precise ledger records or simulate operations.

## CLI & Local Development Reference

- Local Stellar CLI is available via `stellar` / `soroban` (or `./bin/stellar`).
- Run `stellar contract init <name>` to bootstrap a new contract.
- Run `stellar contract build` to compile to WebAssembly.
- Run `cargo test` to execute Soroban unit and integration tests.
