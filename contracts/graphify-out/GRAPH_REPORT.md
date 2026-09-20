# Graph Report - contracts  (2026-09-18)

## Corpus Check
- 112 files · ~141,363 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 386 nodes · 1150 edges · 14 communities
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 105 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Env
- fractachain-licitacion/src/test.rs
- Env
- Env
- forward-contract/src/test.rs
- bump_persistent
- stock-vault/src/test.rs
- Env
- warrant-vault/src/test.rs
- issuance-factory/src/test.rs
- fractachain-core/src/test.rs
- kyc.rs
- orderbook.rs
- fractachain-core

## God Nodes (most connected - your core abstractions)
1. `FractachainLicitacionContract` - 36 edges
2. `setup()` - 28 edges
3. `token_client()` - 26 edges
4. `setup()` - 22 edges
5. `require_positive()` - 22 edges
6. `investor()` - 21 edges
7. `bump_persistent()` - 20 edges
8. `setup()` - 20 edges
9. `ForwardContract` - 17 edges
10. `StockVaultContract` - 17 edges

## Surprising Connections (you probably didn't know these)
- `bump_all()` --calls--> `bump_instance()`  [INFERRED]
  forward-contract/src/lib.rs → fractachain-core/src/lib.rs
- `bump_all()` --calls--> `bump_persistent()`  [INFERRED]
  forward-contract/src/lib.rs → fractachain-core/src/lib.rs
- `bump_all()` --calls--> `bump_instance()`  [INFERRED]
  warrant-vault/src/lib.rs → fractachain-core/src/lib.rs
- `accrue()` --calls--> `bump_persistent()`  [INFERRED]
  stock-vault/src/lib.rs → fractachain-core/src/lib.rs
- `set_meta()` --calls--> `bump_persistent()`  [INFERRED]
  stock-vault/src/lib.rs → fractachain-core/src/lib.rs

## Import Cycles
- None detected.

## Communities (14 total, 0 thin omitted)

### Community 0 - "Env"
Cohesion: 0.10
Nodes (35): Client, require_positive(), Address, token_client(), DataKey, equitable_price_floor(), FractachainLicitacionContract, LegalInfo (+27 more)

### Community 1 - "fractachain-licitacion/src/test.rs"
Cohesion: 0.16
Nodes (34): a_failed_issuance_keeps_the_money_for_refunds(), a_successful_issuance_pays_the_fiduciary(), a_tender_offer_is_escrowed_and_acceptable_unilaterally(), admin_can_set_price_and_token_before_funding(), an_underpriced_tender_offer_is_rejected(), balance(), cancelling_an_order_restores_the_free_balance(), contribute_mints_rwa_and_secondary_market_settles() (+26 more)

### Community 2 - "Env"
Cohesion: 0.22
Nodes (15): accrue(), balance_of(), meta(), payment_token(), Registry, require_admin(), Address, BytesN (+7 more)

### Community 3 - "Env"
Cohesion: 0.24
Nodes (14): acceptance_deadline(), addr(), bump_all(), delivered(), disputed(), escrow_total(), ForwardContract, ForwardKey (+6 more)

### Community 4 - "forward-contract/src/test.rs"
Cohesion: 0.17
Nodes (27): a_deadline_in_the_past_is_rejected(), a_falsely_marked_delivery_does_not_trap_the_buyer(), a_position_pending_acceptance_cannot_be_sold(), a_tiny_escrow_still_owes_a_penalty(), an_overflowing_deadline_is_rejected(), arbiter_can_also_rule_for_the_producer(), balance(), buyer_recovers_everything_when_the_producer_never_delivers() (+19 more)

### Community 5 - "bump_persistent"
Cohesion: 0.21
Nodes (13): bump_instance(), bump_persistent(), Env, FactoryKey, IssuanceFactoryContract, PaymentKind, Product, ProductKind (+5 more)

### Community 6 - "stock-vault/src/test.rs"
Cohesion: 0.20
Nodes (26): a_holder_minted_after_a_dividend_cannot_touch_it(), a_stale_proof_of_reserve_blocks_minting(), attest(), cannot_mint_before_any_attestation(), cannot_mint_beyond_attested_custody(), claiming_twice_pays_only_once(), custodian_cannot_be_the_por_oracle(), dividends_split_pro_rata_between_existing_holders() (+18 more)

### Community 7 - "Env"
Cohesion: 0.19
Nodes (11): bump_all(), Registry, require_active(), require_deposited(), Address, BytesN, Env, status() (+3 more)

### Community 8 - "warrant-vault/src/test.rs"
Cohesion: 0.19
Nodes (21): a_funded_loan_cannot_be_funded_twice(), a_non_allowlisted_payment_token_is_rejected(), a_stale_collateral_attestation_cannot_be_funded(), an_unaccredited_warrantera_is_rejected(), an_unbounded_interest_rate_is_rejected(), an_unfunded_vault_cannot_be_liquidated(), double_initialization_is_rejected(), Fixture (+13 more)

### Community 9 - "issuance-factory/src/test.rs"
Cohesion: 0.21
Nodes (19): a_non_admin_cannot_accredit_a_warrantera(), a_non_admin_cannot_administer_the_registry(), admin_can_be_rotated(), admin_registers_product_with_usdc(), double_initialization_is_rejected(), Fixture, negative_prices_are_rejected(), only_configured_sacs_count_as_payment_assets() (+11 more)

### Community 10 - "fractachain-core/src/test.rs"
Cohesion: 0.15
Nodes (14): pct_bps(), pct_bps_ceil(), prorated_interest(), require_divisible(), accrual_stops_at_the_day_ceiling(), divisible_amounts_pass_and_remainders_do_not(), huge_principal_at_max_rate_does_not_overflow(), indivisible_amount_is_rejected() (+6 more)

### Community 11 - "kyc.rs"
Cohesion: 0.32
Nodes (16): get_investor_info(), has_voting_rights(), InvestorInfo, InvestorType, is_argentina_business_hours(), is_gafi_blacklisted(), is_investor_verified(), kyc_hours_enforced() (+8 more)

### Community 12 - "orderbook.rs"
Cohesion: 0.40
Nodes (10): cancel_order(), create_order(), get_order(), get_order_count(), Order, OrderbookKey, Address, Env (+2 more)

### Community 13 - "fractachain-core"
Cohesion: 0.33
Nodes (6): forward-contract, fractachain-core, fractachain-licitacion, issuance-factory, stock-vault, warrant-vault

## Knowledge Gaps
- **8 isolated node(s):** `forward-contract`, `fractachain-licitacion`, `OpaKey`, `OrderbookKey`, `issuance-factory` (+3 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 29 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `token_client()` connect `Env` to `Env`, `Env`, `bump_persistent`, `Env`, `fractachain-core/src/test.rs`?**
  _High betweenness centrality (0.121) - this node is a cross-community bridge._
- **Why does `require_positive()` connect `Env` to `Env`, `Env`, `bump_persistent`, `Env`, `fractachain-core/src/test.rs`?**
  _High betweenness centrality (0.112) - this node is a cross-community bridge._
- **Why does `is_investor_verified()` connect `kyc.rs` to `Env`, `orderbook.rs`?**
  _High betweenness centrality (0.102) - this node is a cross-community bridge._
- **Are the 22 inferred relationships involving `token_client()` (e.g. with `.accept_delivery()` and `.claim_unaccepted()`) actually correct?**
  _`token_client()` has 22 INFERRED edges - model-reasoned connections that need verification._
- **What connects `forward-contract`, `fractachain-licitacion`, `OpaKey` to the rest of the system?**
  _8 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Env` be split into smaller, more focused modules?**
  _Cohesion score 0.09780907668231612 - nodes in this community are weakly interconnected._
- **Should `fractachain-core/src/test.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.14619883040935672 - nodes in this community are weakly interconnected._