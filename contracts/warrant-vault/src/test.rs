#![cfg(test)]
extern crate std;

use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env, IntoVal,
};

use crate::{WarrantStatus, WarrantVaultContract, WarrantVaultContractClient};

/// Stand-in for `issuance-factory`: holds one accredited warrantera and one
/// allowlisted payment asset so the vault's registry checks can be exercised
/// without pulling the factory crate into this test.
#[contract]
pub struct MockRegistry;

#[contractimpl]
impl MockRegistry {
    pub fn seed(env: Env, warrantera: Address, token: Address) {
        env.storage().instance().set(&0u32, &warrantera);
        env.storage().instance().set(&1u32, &token);
    }

    pub fn is_warrantera(env: Env, who: Address) -> bool {
        env.storage()
            .instance()
            .get::<_, Address>(&0u32)
            .map_or(false, |a| a == who)
    }

    pub fn is_payment_asset(env: Env, token: Address) -> bool {
        env.storage()
            .instance()
            .get::<_, Address>(&1u32)
            .map_or(false, |a| a == token)
    }
}

const T0: u64 = 1_000;
const DAY: u64 = 86_400;

struct Fixture {
    env: Env,
    client: WarrantVaultContractClient<'static>,
    token_id: Address,
    producer: Address,
    oracle: Address,
    lender: Address,
    registry: Address,
}

/// Registers the registry, a SAC, and the vault. Does **not** initialize the
/// vault, so individual tests can vary the arguments.
fn setup() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(T0);

    let producer = Address::generate(&env);
    let oracle = Address::generate(&env);
    let lender = Address::generate(&env);
    let sac_admin = Address::generate(&env);
    let token_id = env
        .register_stellar_asset_contract_v2(sac_admin)
        .address();
    StellarAssetClient::new(&env, &token_id).mint(&lender, &1_000_000);
    StellarAssetClient::new(&env, &token_id).mint(&producer, &1_000_000);

    let registry = env.register(MockRegistry, ());
    MockRegistryClient::new(&env, &registry).seed(&oracle, &token_id);

    let id = env.register(WarrantVaultContract, ());
    let client = WarrantVaultContractClient::new(&env, &id);

    Fixture {
        env,
        client,
        token_id,
        producer,
        oracle,
        lender,
        registry,
    }
}

fn init_default(f: &Fixture, duration_days: u64) {
    f.client.initialize(
        &f.registry,
        &f.producer,
        &f.oracle,
        &f.token_id,
        &BytesN::from_array(&f.env, &[1u8; 32]),
        &100_000,
        &5000,
        &800,
        &duration_days,
    );
}

#[test]
fn fund_repay_happy_path_charges_the_exact_prorated_interest() {
    let f = setup();
    init_default(&f, 30);
    assert_eq!(f.client.get_status(), WarrantStatus::Deposited);
    assert_eq!(f.client.get_loan_amount(), 50_000);

    let producer_before = TokenClient::new(&f.env, &f.token_id).balance(&f.producer);
    f.client.fund_loan(&f.lender);
    let producer_after = TokenClient::new(&f.env, &f.token_id).balance(&f.producer);
    assert_eq!(producer_after - producer_before, 50_000);
    assert_eq!(f.client.get_status(), WarrantStatus::ActiveLoan);

    let lender_before = TokenClient::new(&f.env, &f.token_id).balance(&f.lender);
    f.env.ledger().set_timestamp(T0 + 10 * DAY);
    f.client.repay_loan(&f.producer);
    let lender_after = TokenClient::new(&f.env, &f.token_id).balance(&f.lender);

    // 50_000 * 800bps * 10d / (10_000 * 365) = 109
    assert_eq!(lender_after - lender_before, 50_109);
    assert_eq!(f.client.get_status(), WarrantStatus::Repaid);
    assert_eq!(f.client.get_collateral_holder(), f.producer);
}

/// C-03 regression. `DueDate` used to be pinned at `initialize`, so a lender
/// could wait out the original term plus grace, then fund and liquidate in the
/// same ledger and keep collateral worth twice the principal.
#[test]
fn funding_late_in_the_window_still_grants_the_producer_a_full_term() {
    let f = setup();
    init_default(&f, 30);

    // Fund on day 20 of a 30-day offer window.
    let funded_at = T0 + 20 * DAY;
    f.env.ledger().set_timestamp(funded_at);
    f.client.fund_loan(&f.lender);

    // The term runs from disbursement, not from initialize.
    let (_, _, _, start_ts, due_date, _) = f.client.get_terms();
    assert_eq!(start_ts, funded_at);
    assert_eq!(due_date, funded_at + 30 * DAY);

    // Liquidating in the funding ledger is exactly the old exploit.
    assert!(f.client.try_execute_liquidation(&f.lender).is_err());

    // Still protected one second before grace lapses.
    f.env.ledger().set_timestamp(funded_at + 45 * DAY - 1);
    assert!(f.client.try_execute_liquidation(&f.lender).is_err());

    // And the producer can still repay right up to the cutoff.
    f.client.repay_loan(&f.producer);
    assert_eq!(f.client.get_status(), WarrantStatus::Repaid);
}

#[test]
#[should_panic(expected = "Warrant offer expired")]
fn a_stale_collateral_attestation_cannot_be_funded() {
    let f = setup();
    init_default(&f, 30);
    f.env.ledger().set_timestamp(T0 + 31 * DAY);
    f.client.fund_loan(&f.lender);
}

#[test]
fn liquidation_after_grace_records_the_surplus_owed_to_the_producer() {
    let f = setup();
    init_default(&f, 10);
    f.client.fund_loan(&f.lender);

    f.env.ledger().set_timestamp(T0 + 26 * DAY);
    f.client.execute_liquidation(&f.lender);

    assert_eq!(f.client.get_status(), WarrantStatus::Liquidated);
    assert_eq!(f.client.get_collateral_holder(), f.lender);

    // 50_000 principal + 26 days of interest at 800bps = 50_284.
    let debt = f.client.get_debt_at_liquidation();
    assert_eq!(debt, 50_284);
    // Collateral was attested at 100_000, so the excess belongs to the producer.
    assert_eq!(f.client.get_surplus_owed_to_producer(), 100_000 - debt);
}

/// A-02: liquidation had no authorization at all, so any account could destroy
/// the producer's position for free.
#[test]
fn only_the_lender_or_warrantera_may_liquidate() {
    let f = setup();
    init_default(&f, 10);
    f.client.fund_loan(&f.lender);
    f.env.ledger().set_timestamp(T0 + 26 * DAY);

    let stranger = Address::generate(&f.env);
    assert!(f.client.try_execute_liquidation(&stranger).is_err());

    // The warrantera is a legitimate liquidator.
    f.client.execute_liquidation(&f.oracle);
    assert_eq!(f.client.get_status(), WarrantStatus::Liquidated);
}

/// The role check is not enough on its own: the caller must also have signed.
#[test]
fn liquidation_requires_the_callers_signature() {
    let f = setup();
    init_default(&f, 10);
    f.client.fund_loan(&f.lender);
    f.env.ledger().set_timestamp(T0 + 26 * DAY);

    // Authorize the lender for a *different* function only.
    f.env.mock_auths(&[MockAuth {
        address: &f.lender,
        invoke: &MockAuthInvoke {
            contract: &f.client.address,
            fn_name: "repay_loan",
            args: (&f.lender,).into_val(&f.env),
            sub_invokes: &[],
        },
    }]);

    assert!(f.client.try_execute_liquidation(&f.lender).is_err());
}

#[test]
#[should_panic(expected = "Grace period expired")]
fn repaying_after_grace_is_rejected_so_the_state_is_unambiguous() {
    let f = setup();
    init_default(&f, 10);
    f.client.fund_loan(&f.lender);
    f.env.ledger().set_timestamp(T0 + 26 * DAY);
    f.client.repay_loan(&f.producer);
}

/// A-03: the oracle was a caller-chosen parameter, so a producer could pass
/// their own address and attest grain that never existed.
#[test]
#[should_panic(expected = "Producer cannot attest its own collateral")]
fn producer_cannot_be_its_own_warrantera() {
    let f = setup();
    f.client.initialize(
        &f.registry,
        &f.producer,
        &f.producer,
        &f.token_id,
        &BytesN::from_array(&f.env, &[1u8; 32]),
        &100_000,
        &5000,
        &800,
        &30,
    );
}

#[test]
#[should_panic(expected = "Warrantera not accredited")]
fn an_unaccredited_warrantera_is_rejected() {
    let f = setup();
    let impostor = Address::generate(&f.env);
    f.client.initialize(
        &f.registry,
        &f.producer,
        &impostor,
        &f.token_id,
        &BytesN::from_array(&f.env, &[1u8; 32]),
        &100_000,
        &5000,
        &800,
        &30,
    );
}

/// M-04: a look-alike token whose `transfer` is a no-op would let a loan
/// "fund" without moving value.
#[test]
#[should_panic(expected = "Payment token not allowlisted")]
fn a_non_allowlisted_payment_token_is_rejected() {
    let f = setup();
    let fake_admin = Address::generate(&f.env);
    let fake_token = f
        .env
        .register_stellar_asset_contract_v2(fake_admin)
        .address();
    f.client.initialize(
        &f.registry,
        &f.producer,
        &f.oracle,
        &fake_token,
        &BytesN::from_array(&f.env, &[1u8; 32]),
        &100_000,
        &5000,
        &800,
        &30,
    );
}

#[test]
#[should_panic(expected = "Interest rate out of range")]
fn an_unbounded_interest_rate_is_rejected() {
    let f = setup();
    f.client.initialize(
        &f.registry,
        &f.producer,
        &f.oracle,
        &f.token_id,
        &BytesN::from_array(&f.env, &[1u8; 32]),
        &100_000,
        &5000,
        &u32::MAX,
        &30,
    );
}

#[test]
#[should_panic(expected = "Already initialized")]
fn double_initialization_is_rejected() {
    let f = setup();
    init_default(&f, 30);
    init_default(&f, 30);
}

#[test]
fn a_funded_loan_cannot_be_funded_twice() {
    let f = setup();
    init_default(&f, 30);
    f.client.fund_loan(&f.lender);
    let second = Address::generate(&f.env);
    assert!(f.client.try_fund_loan(&second).is_err());
}

#[test]
fn an_unfunded_vault_cannot_be_liquidated() {
    let f = setup();
    init_default(&f, 30);
    f.env.ledger().set_timestamp(T0 + 100 * DAY);
    assert!(f.client.try_execute_liquidation(&f.lender).is_err());
}
