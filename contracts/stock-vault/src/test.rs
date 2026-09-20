#![cfg(test)]
extern crate std;

use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env, String, Symbol,
};

use crate::{StockVaultContract, StockVaultContractClient};

/// Stand-in for `issuance-factory`'s payment-asset allowlist.
#[contract]
pub struct MockRegistry;

#[contractimpl]
impl MockRegistry {
    pub fn seed(env: Env, token: Address) {
        env.storage().instance().set(&0u32, &token);
    }

    pub fn is_payment_asset(env: Env, token: Address) -> bool {
        env.storage()
            .instance()
            .get::<_, Address>(&0u32)
            .map_or(false, |a| a == token)
    }
}

const T0: u64 = 1_000;
const DAY: u64 = 86_400;

struct Fixture {
    env: Env,
    client: StockVaultContractClient<'static>,
    token_id: Address,
    admin: Address,
    oracle: Address,
    registry: Address,
}

fn setup() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(T0);

    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let sac_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(sac_admin).address();
    StellarAssetClient::new(&env, &token_id).mint(&admin, &10_000_000);

    let registry = env.register(MockRegistry, ());
    MockRegistryClient::new(&env, &registry).seed(&token_id);

    let id = env.register(StockVaultContract, ());
    let client = StockVaultContractClient::new(&env, &id);
    client.initialize_stock(
        &admin,
        &oracle,
        &registry,
        &token_id,
        &Symbol::new(&env, "GGAL"),
        &String::from_str(&env, "Grupo Financiero Galicia"),
        &String::from_str(&env, "ARP495251018"),
        &String::from_str(&env, "30-11111111-1"),
    );

    Fixture {
        env,
        client,
        token_id,
        admin,
        oracle,
        registry,
    }
}

fn attest(f: &Fixture, shares: i128) {
    f.client
        .update_proof_of_reserve(&f.oracle, &shares, &BytesN::from_array(&f.env, &[9u8; 32]));
}

fn mint(f: &Fixture, to: &Address, amount: i128) {
    f.client
        .mint_backed_stock(&f.admin, to, &amount, &BytesN::from_array(&f.env, &[7u8; 32]));
}

/// C-02 regression, and the single most important test in this file.
///
/// `mint_backed_stock` never sealed the new holder's accumulator checkpoint, so
/// a holder issued tokens *after* a dividend deposit inherited the entire
/// historical accumulator and drained the pool belonging to earlier holders.
#[test]
fn a_holder_minted_after_a_dividend_cannot_touch_it() {
    let f = setup();
    attest(&f, 200);

    let a = Address::generate(&f.env);
    let b = Address::generate(&f.env);

    mint(&f, &a, 100);
    f.client.deposit_dividends(&f.admin, &10_000);

    // B arrives only after the dividend was already funded.
    mint(&f, &b, 100);

    assert_eq!(f.client.get_claimable(&b), 0);
    assert_eq!(f.client.claim_dividends(&b), 0);

    // A's dividend is intact and actually payable.
    assert_eq!(f.client.get_claimable(&a), 10_000);
    assert_eq!(f.client.claim_dividends(&a), 10_000);
    assert_eq!(TokenClient::new(&f.env, &f.token_id).balance(&a), 10_000);
}

/// A dividend deposited while both hold tokens splits by balance.
#[test]
fn dividends_split_pro_rata_between_existing_holders() {
    let f = setup();
    attest(&f, 300);
    let a = Address::generate(&f.env);
    let b = Address::generate(&f.env);
    mint(&f, &a, 100);
    mint(&f, &b, 200);

    f.client.deposit_dividends(&f.admin, &9_000);

    assert_eq!(f.client.claim_dividends(&a), 3_000);
    assert_eq!(f.client.claim_dividends(&b), 6_000);
}

/// A-04 regression: burning used to drop the balance without accruing, so the
/// holder silently forfeited what they had already earned.
#[test]
fn redeeming_does_not_forfeit_already_earned_dividends() {
    let f = setup();
    attest(&f, 200);
    let a = Address::generate(&f.env);
    mint(&f, &a, 100);
    f.client.deposit_dividends(&f.admin, &10_000);

    f.client.burn_for_redemption(
        &a,
        &100,
        &String::from_str(&f.env, "comitente-123"),
    );
    assert_eq!(f.client.get_balance(&a), 0);

    // The dividend survived the redemption.
    assert_eq!(f.client.claim_dividends(&a), 10_000);
}

#[test]
fn claiming_twice_pays_only_once() {
    let f = setup();
    attest(&f, 100);
    let a = Address::generate(&f.env);
    mint(&f, &a, 100);
    f.client.deposit_dividends(&f.admin, &5_000);

    assert_eq!(f.client.claim_dividends(&a), 5_000);
    assert_eq!(f.client.claim_dividends(&a), 0);
}

/// M-05 regression: minting used to increment the very counter the
/// proof-of-reserve was supposed to verify, and overwrote the audit timestamp.
#[test]
fn minting_neither_creates_backing_nor_refreshes_the_audit() {
    let f = setup();
    attest(&f, 100);
    let audit_ts = f.client.get_metadata().last_audit_timestamp;

    f.env.ledger().set_timestamp(T0 + 5 * DAY);
    let a = Address::generate(&f.env);
    mint(&f, &a, 100);

    let m = f.client.get_metadata();
    assert_eq!(m.total_shares_custodied, 100);
    assert_eq!(m.total_tokens_minted, 100);
    assert_eq!(m.last_audit_timestamp, audit_ts);
}

#[test]
#[should_panic(expected = "Mint would exceed attested custody")]
fn cannot_mint_beyond_attested_custody() {
    let f = setup();
    attest(&f, 100);
    let a = Address::generate(&f.env);
    mint(&f, &a, 101);
}

#[test]
#[should_panic(expected = "Mint would exceed attested custody")]
fn cannot_mint_before_any_attestation() {
    let f = setup();
    let a = Address::generate(&f.env);
    mint(&f, &a, 1);
}

#[test]
#[should_panic(expected = "Proof of reserve is stale")]
fn a_stale_proof_of_reserve_blocks_minting() {
    let f = setup();
    attest(&f, 100);
    f.env.ledger().set_timestamp(T0 + 91 * DAY);
    let a = Address::generate(&f.env);
    mint(&f, &a, 100);
}

#[test]
fn reserve_falling_below_supply_pauses_minting() {
    let f = setup();
    attest(&f, 200);
    let a = Address::generate(&f.env);
    mint(&f, &a, 200);
    assert!(!f.client.is_mint_paused());

    // Shares get seized or the deposit is voided.
    attest(&f, 50);
    assert!(f.client.is_mint_paused());

    let b = Address::generate(&f.env);
    assert!(f
        .client
        .try_mint_backed_stock(
            &f.admin,
            &b,
            &1,
            &BytesN::from_array(&f.env, &[7u8; 32])
        )
        .is_err());
}

/// M-07 regression: `total_shares_custodied` is signed, so an unguarded
/// subtraction drove it negative and corrupted every downstream report.
#[test]
#[should_panic(expected = "Custody shortfall")]
fn redemption_cannot_drive_custody_negative() {
    let f = setup();
    attest(&f, 100);
    let a = Address::generate(&f.env);
    mint(&f, &a, 100);
    attest(&f, 0);
    f.client
        .burn_for_redemption(&a, &100, &String::from_str(&f.env, "comitente-1"));
}

#[test]
#[should_panic(expected = "Custodian cannot audit its own reserve")]
fn custodian_cannot_be_the_por_oracle() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let sac_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(sac_admin).address();
    let registry = env.register(MockRegistry, ());
    MockRegistryClient::new(&env, &registry).seed(&token_id);

    let id = env.register(StockVaultContract, ());
    StockVaultContractClient::new(&env, &id).initialize_stock(
        &admin,
        &admin,
        &registry,
        &token_id,
        &Symbol::new(&env, "GGAL"),
        &String::from_str(&env, "Galicia"),
        &String::from_str(&env, "ARP495251018"),
        &String::from_str(&env, "30-11111111-1"),
    );
}

#[test]
fn only_the_por_oracle_can_update_the_reserve() {
    let f = setup();
    let hash = BytesN::from_array(&f.env, &[1u8; 32]);
    assert!(f
        .client
        .try_update_proof_of_reserve(&f.admin, &100, &hash)
        .is_err());
    let stranger = Address::generate(&f.env);
    assert!(f
        .client
        .try_update_proof_of_reserve(&stranger, &100, &hash)
        .is_err());
}

/// M-06 regression: the contract had no way to move a stranded balance out,
/// and no way to tell committed dividends from genuine excess.
#[test]
fn sweep_cannot_touch_dividends_owed_to_holders() {
    let f = setup();
    attest(&f, 100);
    let a = Address::generate(&f.env);
    mint(&f, &a, 100);
    f.client.deposit_dividends(&f.admin, &10_000);

    let treasury = Address::generate(&f.env);
    // Every unit in the contract is owed to A, even though nothing has
    // been check-pointed yet.
    assert!(f
        .client
        .try_sweep_unallocated(&f.admin, &treasury, &1)
        .is_err());

    assert_eq!(f.client.claim_dividends(&a), 10_000);
}

#[test]
fn sweep_releases_genuine_excess() {
    let f = setup();
    attest(&f, 100);
    let a = Address::generate(&f.env);
    mint(&f, &a, 100);
    f.client.deposit_dividends(&f.admin, &10_000);
    assert_eq!(f.client.claim_dividends(&a), 10_000);

    // Someone transfers the payment token straight to the contract.
    TokenClient::new(&f.env, &f.token_id).transfer(&f.admin, &f.client.address, &777);

    let treasury = Address::generate(&f.env);
    f.client.sweep_unallocated(&f.admin, &treasury, &777);
    assert_eq!(TokenClient::new(&f.env, &f.token_id).balance(&treasury), 777);
}

#[test]
#[should_panic(expected = "Payment token not allowlisted")]
fn payment_token_must_be_allowlisted() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let sac_admin = Address::generate(&env);
    let real = env.register_stellar_asset_contract_v2(sac_admin.clone()).address();
    let fake = env.register_stellar_asset_contract_v2(sac_admin).address();
    let registry = env.register(MockRegistry, ());
    MockRegistryClient::new(&env, &registry).seed(&real);

    let id = env.register(StockVaultContract, ());
    StockVaultContractClient::new(&env, &id).initialize_stock(
        &admin,
        &oracle,
        &registry,
        &fake,
        &Symbol::new(&env, "GGAL"),
        &String::from_str(&env, "Galicia"),
        &String::from_str(&env, "ARP495251018"),
        &String::from_str(&env, "30-11111111-1"),
    );
}

/// M-11 regression: the deposit-slip hash was accepted and thrown away.
#[test]
fn every_mint_records_its_custody_attestation() {
    let f = setup();
    attest(&f, 100);
    let a = Address::generate(&f.env);
    let hash = BytesN::from_array(&f.env, &[42u8; 32]);
    f.client.mint_backed_stock(&f.admin, &a, &100, &hash);

    let (to, amount, recorded) = f.client.get_mint_proof(&1);
    assert_eq!(to, a);
    assert_eq!(amount, 100);
    assert_eq!(recorded, hash);
}

#[test]
#[should_panic(expected = "Already initialized")]
fn double_initialization_is_rejected() {
    let f = setup();
    f.client.initialize_stock(
        &f.admin,
        &f.oracle,
        &f.registry,
        &f.token_id,
        &Symbol::new(&f.env, "GGAL"),
        &String::from_str(&f.env, "Galicia"),
        &String::from_str(&f.env, "ARP495251018"),
        &String::from_str(&f.env, "30-11111111-1"),
    );
}

#[test]
fn unauthorized_caller_cannot_mint() {
    let f = setup();
    attest(&f, 100);
    let stranger = Address::generate(&f.env);
    let a = Address::generate(&f.env);
    assert!(f
        .client
        .try_mint_backed_stock(
            &stranger,
            &a,
            &100,
            &BytesN::from_array(&f.env, &[7u8; 32])
        )
        .is_err());
}
