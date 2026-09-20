#![cfg(test)]
extern crate std;

use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env, String,
};

use crate::{ForwardContract, ForwardContractClient, ForwardState};

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
const DEADLINE: u64 = T0 + 100 * DAY;

struct Fixture {
    env: Env,
    client: ForwardContractClient<'static>,
    token_id: Address,
    producer: Address,
    buyer: Address,
    arbiter: Address,
    registry: Address,
}

fn setup() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(T0);

    let producer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let arbiter = Address::generate(&env);
    let sac_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(sac_admin).address();
    StellarAssetClient::new(&env, &token_id).mint(&buyer, &10_000_000);

    let registry = env.register(MockRegistry, ());
    MockRegistryClient::new(&env, &registry).seed(&token_id);

    let id = env.register(ForwardContract, ());
    let client = ForwardContractClient::new(&env, &id);

    Fixture {
        env,
        client,
        token_id,
        producer,
        buyer,
        arbiter,
        registry,
    }
}

/// 1_000 kilos at 100 per kilo = 100_000 escrowed.
fn init_default(f: &Fixture) {
    f.client.initialize(
        &f.registry,
        &f.producer,
        &f.buyer,
        &f.arbiter,
        &f.token_id,
        &String::from_str(&f.env, "soja"),
        &1_000,
        &100,
        &DEADLINE,
    );
}

fn balance(f: &Fixture, who: &Address) -> i128 {
    TokenClient::new(&f.env, &f.token_id).balance(who)
}

#[test]
fn escrow_is_funded_then_released_on_acceptance() {
    let f = setup();
    let before = balance(&f, &f.buyer);
    init_default(&f);
    assert_eq!(before - balance(&f, &f.buyer), 100_000);
    assert_eq!(f.client.get_state(), ForwardState::Active);

    f.client.mark_delivered(&f.producer);
    f.client.accept_delivery(&f.buyer);

    assert_eq!(f.client.get_state(), ForwardState::Fulfilled);
    assert_eq!(balance(&f, &f.producer), 100_000);
    assert_eq!(balance(&f, &f.client.address), 0);
}

/// C-01 regression, the headline fix.
///
/// Marking delivery used to close `pre_cancel`, `refund_on_non_delivery` and
/// the rollover all at once, with no way to lower the flag: the buyer's only
/// remaining action was to pay the producer in full. The escrow now always has
/// an exit through dispute plus arbitration.
#[test]
fn a_falsely_marked_delivery_does_not_trap_the_buyer() {
    let f = setup();
    init_default(&f);

    // Producer claims delivery without shipping anything.
    f.client.mark_delivered(&f.producer);

    let (_, is_delivered, delivered_at, _, _, _, escrow) = f.client.get_position();
    assert!(is_delivered);
    assert_eq!(delivered_at, T0);
    assert_eq!(escrow, 100_000);

    // The buyer contests instead of being forced to accept.
    f.client.dispute_delivery(&f.buyer);
    let (_, _, _, is_disputed, _, _, _) = f.client.get_position();
    assert!(is_disputed);

    // While disputed, the producer cannot sweep the escrow by waiting.
    f.env.ledger().set_timestamp(T0 + 11 * DAY);
    assert!(f.client.try_claim_unaccepted(&f.producer).is_err());

    // The arbiter rules for the buyer and the money goes back.
    f.client.resolve_dispute(&f.arbiter, &false);
    assert_eq!(f.client.get_state(), ForwardState::Cancelled);
    assert_eq!(balance(&f, &f.buyer), 10_000_000);
    assert_eq!(balance(&f, &f.producer), 0);
}

/// The other half of C-01: a producer who really delivered must not be held
/// hostage by a buyer who simply never responds.
#[test]
fn silence_past_the_acceptance_window_pays_the_producer() {
    let f = setup();
    init_default(&f);
    f.client.mark_delivered(&f.producer);

    // Still inside the window.
    f.env.ledger().set_timestamp(T0 + 10 * DAY);
    assert!(f.client.try_claim_unaccepted(&f.producer).is_err());

    f.env.ledger().set_timestamp(T0 + 10 * DAY + 1);
    f.client.claim_unaccepted(&f.producer);
    assert_eq!(f.client.get_state(), ForwardState::Fulfilled);
    assert_eq!(balance(&f, &f.producer), 100_000);
}

#[test]
#[should_panic(expected = "Acceptance window closed")]
fn disputing_after_the_window_is_rejected() {
    let f = setup();
    init_default(&f);
    f.client.mark_delivered(&f.producer);
    f.env.ledger().set_timestamp(T0 + 10 * DAY + 1);
    f.client.dispute_delivery(&f.buyer);
}

#[test]
fn arbiter_can_also_rule_for_the_producer() {
    let f = setup();
    init_default(&f);
    f.client.mark_delivered(&f.producer);
    f.client.dispute_delivery(&f.buyer);
    f.client.resolve_dispute(&f.arbiter, &true);
    assert_eq!(f.client.get_state(), ForwardState::Fulfilled);
    assert_eq!(balance(&f, &f.producer), 100_000);
}

#[test]
fn only_the_arbiter_resolves_disputes() {
    let f = setup();
    init_default(&f);
    f.client.mark_delivered(&f.producer);
    f.client.dispute_delivery(&f.buyer);
    assert!(f.client.try_resolve_dispute(&f.producer, &true).is_err());
    assert!(f.client.try_resolve_dispute(&f.buyer, &false).is_err());
}

#[test]
#[should_panic(expected = "Delivery already marked")]
fn delivery_cannot_be_marked_twice() {
    let f = setup();
    init_default(&f);
    f.client.mark_delivered(&f.producer);
    f.client.mark_delivered(&f.producer);
}

/// A-01 regression: the rollover took no address and called no `require_auth`,
/// so anyone could extend the deadline by 90 days, indefinitely, pushing the
/// buyer's refund out of reach.
#[test]
fn rollover_needs_both_counterparties_and_is_capped() {
    let f = setup();
    init_default(&f);
    f.env.ledger().set_timestamp(DEADLINE);

    let stranger = Address::generate(&f.env);
    assert!(f
        .client
        .try_execute_rollover_in_kind(&stranger, &f.buyer)
        .is_err());
    assert!(f
        .client
        .try_execute_rollover_in_kind(&f.producer, &stranger)
        .is_err());

    // First rollover: +10% kilos, +90 days, taken from the stored bonus.
    f.client
        .execute_rollover_in_kind(&f.producer, &f.buyer);
    assert_eq!(f.client.get_total_kilos(), 1_100);
    let (_, _, _, _, deadline, count, _) = f.client.get_position();
    assert_eq!(deadline, DEADLINE + 90 * DAY);
    assert_eq!(count, 1);

    // Second is allowed.
    f.env.ledger().set_timestamp(DEADLINE + 90 * DAY);
    f.client.execute_rollover_in_kind(&f.producer, &f.buyer);
    assert_eq!(f.client.get_total_kilos(), 1_210);

    // Third exceeds the cap, so the buyer's refund cannot be deferred forever.
    f.env.ledger().set_timestamp(DEADLINE + 180 * DAY);
    assert!(f
        .client
        .try_execute_rollover_in_kind(&f.producer, &f.buyer)
        .is_err());
}

#[test]
fn buyer_recovers_everything_when_the_producer_never_delivers() {
    let f = setup();
    init_default(&f);
    f.env.ledger().set_timestamp(DEADLINE + 15 * DAY);
    f.client.refund_on_non_delivery(&f.buyer);
    assert_eq!(f.client.get_state(), ForwardState::Cancelled);
    assert_eq!(balance(&f, &f.buyer), 10_000_000);
}

#[test]
fn refund_is_unavailable_before_grace_expires() {
    let f = setup();
    init_default(&f);
    f.env.ledger().set_timestamp(DEADLINE + 15 * DAY - 1);
    assert!(f.client.try_refund_on_non_delivery(&f.buyer).is_err());
}

#[test]
fn pre_cancel_splits_the_escrow_twenty_eighty() {
    let f = setup();
    init_default(&f);
    let buyer_before = balance(&f, &f.buyer);

    f.env.ledger().set_timestamp(T0 + DAY);
    f.client.pre_cancel(&f.buyer);

    assert_eq!(f.client.get_state(), ForwardState::Cancelled);
    assert_eq!(balance(&f, &f.producer), 20_000);
    assert_eq!(balance(&f, &f.buyer) - buyer_before, 80_000);
}

/// B-01 regression: truncating the penalty made it zero on small escrows, so
/// the buyer walked away whole and the producer absorbed the cancellation.
#[test]
fn a_tiny_escrow_still_owes_a_penalty() {
    let f = setup();
    f.client.initialize(
        &f.registry,
        &f.producer,
        &f.buyer,
        &f.arbiter,
        &f.token_id,
        &String::from_str(&f.env, "soja"),
        &1,
        &4,
        &DEADLINE,
    );
    f.env.ledger().set_timestamp(T0 + DAY);
    f.client.pre_cancel(&f.buyer);
    // 20% of 4 rounds up to 1 rather than down to 0.
    assert_eq!(balance(&f, &f.producer), 1);
}

#[test]
fn pre_cancel_is_closed_once_delivery_is_marked() {
    let f = setup();
    init_default(&f);
    f.client.mark_delivered(&f.producer);
    assert!(f.client.try_pre_cancel(&f.buyer).is_err());
}

/// M-08 regression: a position awaiting acceptance used to be sellable, which
/// let the original buyer offload a frozen escrow onto someone who had no way
/// to detect it.
#[test]
fn a_position_pending_acceptance_cannot_be_sold() {
    let f = setup();
    init_default(&f);
    let new_buyer = Address::generate(&f.env);
    StellarAssetClient::new(&f.env, &f.token_id).mint(&new_buyer, &1_000_000);

    // Transferable while nothing is marked.
    f.client.transfer_position(&f.buyer, &new_buyer, &90_000);
    let (_, _, _, _, _, _, escrow) = f.client.get_position();
    assert_eq!(escrow, 100_000);

    f.client.mark_delivered(&f.producer);
    let third = Address::generate(&f.env);
    StellarAssetClient::new(&f.env, &f.token_id).mint(&third, &1_000_000);
    assert!(f
        .client
        .try_transfer_position(&new_buyer, &third, &90_000)
        .is_err());
}

#[test]
#[should_panic(expected = "Producer and buyer must differ")]
fn one_account_cannot_be_both_sides() {
    let f = setup();
    f.client.initialize(
        &f.registry,
        &f.producer,
        &f.producer,
        &f.arbiter,
        &f.token_id,
        &String::from_str(&f.env, "soja"),
        &1_000,
        &100,
        &DEADLINE,
    );
}

#[test]
#[should_panic(expected = "Arbiter must be independent")]
fn the_arbiter_cannot_be_a_counterparty() {
    let f = setup();
    f.client.initialize(
        &f.registry,
        &f.producer,
        &f.buyer,
        &f.buyer,
        &f.token_id,
        &String::from_str(&f.env, "soja"),
        &1_000,
        &100,
        &DEADLINE,
    );
}

/// M-02 regression: a deadline in the past enabled an immediate rollover, and
/// `u64::MAX` made the refund path panic on overflow.
#[test]
#[should_panic(expected = "Harvest deadline must be in the future")]
fn a_deadline_in_the_past_is_rejected() {
    let f = setup();
    f.client.initialize(
        &f.registry,
        &f.producer,
        &f.buyer,
        &f.arbiter,
        &f.token_id,
        &String::from_str(&f.env, "soja"),
        &1_000,
        &100,
        &(T0 - 1),
    );
}

#[test]
#[should_panic(expected = "Harvest deadline too far in the future")]
fn an_overflowing_deadline_is_rejected() {
    let f = setup();
    f.client.initialize(
        &f.registry,
        &f.producer,
        &f.buyer,
        &f.arbiter,
        &f.token_id,
        &String::from_str(&f.env, "soja"),
        &1_000,
        &100,
        &u64::MAX,
    );
}

#[test]
#[should_panic(expected = "Already initialized")]
fn double_initialization_is_rejected() {
    let f = setup();
    init_default(&f);
    init_default(&f);
}
