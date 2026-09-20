#![no_std]
use soroban_sdk::{
    contract, contractclient, contractimpl, contracttype, Address, Env, String, Symbol,
};
use fractachain_core::{
    bump_instance, bump_persistent, pct_bps_ceil, require_positive, token_client, SECONDS_PER_DAY,
};

/// Subset of `issuance-factory` used to validate the payment asset.
#[contractclient(name = "RegistryClient")]
pub trait Registry {
    fn is_payment_asset(env: Env, token: Address) -> bool;
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ForwardState {
    Active = 0,
    Fulfilled = 1,
    Cancelled = 2,
}

#[contracttype]
pub enum ForwardKey {
    Registry,
    Producer,
    Buyer,
    /// Resolves a disputed delivery. Set once, at initialize.
    Arbiter,
    PaymentToken,
    CropName,
    TotalKilos,
    OriginalPrice,
    HarvestDeadline,
    State,
    BonusKilosPct,
    ProducerDelivered,
    /// When delivery was marked, which starts the buyer's acceptance window.
    DeliveredAt,
    Disputed,
    RolloverCount,
}

#[contract]
pub struct ForwardContract;

const DELIVERY_GRACE_DAYS: u64 = 15;
/// How long the buyer has to accept or dispute a marked delivery. Past this,
/// silence counts as acceptance — otherwise a buyer could stall forever.
const ACCEPTANCE_WINDOW_DAYS: u64 = 10;
const ROLLOVER_DAYS: u64 = 90;
const MAX_ROLLOVERS: u32 = 2;
const PENALTY_BPS: u32 = 2_000;
/// Two campaigns. Bounds `harvest_deadline` so the grace and rollover
/// additions below cannot be pushed into an overflow panic.
const MAX_HORIZON_DAYS: u64 = 730;

fn require_state(env: &Env, expected: ForwardState) {
    let state: ForwardState = env.storage().persistent().get(&ForwardKey::State).unwrap();
    if state != expected {
        panic!("Forward not in required state");
    }
}

fn delivered(env: &Env) -> bool {
    env.storage()
        .persistent()
        .get(&ForwardKey::ProducerDelivered)
        .unwrap_or(false)
}

fn disputed(env: &Env) -> bool {
    env.storage()
        .persistent()
        .get(&ForwardKey::Disputed)
        .unwrap_or(false)
}

fn addr(env: &Env, key: ForwardKey) -> Address {
    env.storage().persistent().get(&key).unwrap()
}

fn escrow_total(env: &Env) -> i128 {
    env.storage().persistent().get(&ForwardKey::OriginalPrice).unwrap()
}

/// Deadline for the buyer to accept or dispute after delivery is marked.
fn acceptance_deadline(env: &Env) -> u64 {
    let delivered_at: u64 = env
        .storage()
        .persistent()
        .get(&ForwardKey::DeliveredAt)
        .unwrap_or_else(|| panic!("Delivery not marked"));
    delivered_at
        .checked_add(ACCEPTANCE_WINDOW_DAYS * SECONDS_PER_DAY)
        .expect("overflow")
}

/// Renews the whole escrow footprint. `bump_instance` does not reach
/// persistent storage, where all of this contract's state lives, so a forward
/// running past the default TTL would archive with the buyer's money inside.
fn bump_all(env: &Env) {
    bump_instance(env);
    bump_persistent(env, &ForwardKey::Registry);
    bump_persistent(env, &ForwardKey::Producer);
    bump_persistent(env, &ForwardKey::Buyer);
    bump_persistent(env, &ForwardKey::Arbiter);
    bump_persistent(env, &ForwardKey::PaymentToken);
    bump_persistent(env, &ForwardKey::CropName);
    bump_persistent(env, &ForwardKey::TotalKilos);
    bump_persistent(env, &ForwardKey::OriginalPrice);
    bump_persistent(env, &ForwardKey::HarvestDeadline);
    bump_persistent(env, &ForwardKey::State);
    bump_persistent(env, &ForwardKey::BonusKilosPct);
    bump_persistent(env, &ForwardKey::ProducerDelivered);
    bump_persistent(env, &ForwardKey::RolloverCount);
}

#[contractimpl]
impl ForwardContract {
    #[allow(clippy::too_many_arguments)]
    pub fn initialize(
        env: Env,
        registry: Address,
        producer: Address,
        buyer: Address,
        arbiter: Address,
        payment_token: Address,
        crop_name: String,
        total_kilos: i128,
        price_per_kilo: i128,
        harvest_deadline: u64,
    ) {
        if env.storage().persistent().has(&ForwardKey::Producer) {
            panic!("Already initialized");
        }
        // Without this a single account could sit on both sides, escrowing and
        // recovering its own funds to inflate platform volume.
        if producer == buyer {
            panic!("Producer and buyer must differ");
        }
        if arbiter == producer || arbiter == buyer {
            panic!("Arbiter must be independent");
        }
        require_positive(total_kilos);
        require_positive(price_per_kilo);

        let now = env.ledger().timestamp();
        if harvest_deadline <= now {
            panic!("Harvest deadline must be in the future");
        }
        let max_deadline = now
            .checked_add(MAX_HORIZON_DAYS * SECONDS_PER_DAY)
            .expect("overflow");
        if harvest_deadline > max_deadline {
            panic!("Harvest deadline too far in the future");
        }

        producer.require_auth();
        buyer.require_auth();
        if !RegistryClient::new(&env, &registry).is_payment_asset(&payment_token) {
            panic!("Payment token not allowlisted");
        }

        let total = total_kilos.checked_mul(price_per_kilo).expect("overflow");

        env.storage().persistent().set(&ForwardKey::Registry, &registry);
        env.storage().persistent().set(&ForwardKey::Producer, &producer);
        env.storage().persistent().set(&ForwardKey::Buyer, &buyer);
        env.storage().persistent().set(&ForwardKey::Arbiter, &arbiter);
        env.storage().persistent().set(&ForwardKey::PaymentToken, &payment_token);
        env.storage().persistent().set(&ForwardKey::CropName, &crop_name);
        env.storage().persistent().set(&ForwardKey::TotalKilos, &total_kilos);
        env.storage().persistent().set(&ForwardKey::OriginalPrice, &total);
        env.storage().persistent().set(&ForwardKey::HarvestDeadline, &harvest_deadline);
        env.storage().persistent().set(&ForwardKey::State, &ForwardState::Active);
        env.storage().persistent().set(&ForwardKey::BonusKilosPct, &10u32);
        env.storage().persistent().set(&ForwardKey::ProducerDelivered, &false);
        env.storage().persistent().set(&ForwardKey::Disputed, &false);
        env.storage().persistent().set(&ForwardKey::RolloverCount, &0u32);
        bump_all(&env);

        token_client(&env, &payment_token).transfer(
            &buyer,
            &env.current_contract_address(),
            &total,
        );
        env.events()
            .publish((Symbol::new(&env, "opened"), producer), total);
    }

    pub fn get_payment_token(env: Env) -> Address {
        addr(&env, ForwardKey::PaymentToken)
    }

    pub fn pre_cancel(env: Env, caller: Address) {
        let buyer = addr(&env, ForwardKey::Buyer);
        if caller != buyer {
            panic!("Only buyer can request precancellation");
        }
        buyer.require_auth();
        require_state(&env, ForwardState::Active);

        if delivered(&env) {
            panic!("Cannot cancel after producer marked delivery");
        }

        let now = env.ledger().timestamp();
        let deadline: u64 = env.storage().persistent().get(&ForwardKey::HarvestDeadline).unwrap();
        if now >= deadline {
            panic!("Cannot precancel after harvest deadline");
        }

        let total = escrow_total(&env);
        // Rounded up so a small escrow does not make the penalty free.
        let penalty = pct_bps_ceil(total, PENALTY_BPS);
        let refund = total - penalty;
        let token = addr(&env, ForwardKey::PaymentToken);
        let producer = addr(&env, ForwardKey::Producer);
        let contract = env.current_contract_address();

        env.storage().persistent().set(&ForwardKey::State, &ForwardState::Cancelled);

        let client = token_client(&env, &token);
        client.transfer(&contract, &producer, &penalty);
        client.transfer(&contract, &buyer, &refund);
        env.events()
            .publish((Symbol::new(&env, "pre_cancel"), buyer), penalty);
    }

    /// Producer asserts the grain was delivered, opening the buyer's
    /// acceptance window.
    pub fn mark_delivered(env: Env, producer: Address) {
        let stored = addr(&env, ForwardKey::Producer);
        if producer != stored {
            panic!("Only producer can mark delivery");
        }
        producer.require_auth();
        require_state(&env, ForwardState::Active);
        if delivered(&env) {
            panic!("Delivery already marked");
        }

        let now = env.ledger().timestamp();
        env.storage().persistent().set(&ForwardKey::ProducerDelivered, &true);
        env.storage().persistent().set(&ForwardKey::DeliveredAt, &now);
        env.storage().persistent().set(&ForwardKey::Disputed, &false);
        bump_all(&env);
        bump_persistent(&env, &ForwardKey::DeliveredAt);
        bump_persistent(&env, &ForwardKey::Disputed);
        env.events()
            .publish((Symbol::new(&env, "delivered"), producer), now);
    }

    /// Buyer accepts physical delivery; escrow is released to the producer.
    pub fn accept_delivery(env: Env, buyer: Address) {
        let stored = addr(&env, ForwardKey::Buyer);
        if buyer != stored {
            panic!("Only buyer can accept delivery");
        }
        buyer.require_auth();
        require_state(&env, ForwardState::Active);
        if !delivered(&env) {
            panic!("Producer has not marked delivery");
        }

        let total = escrow_total(&env);
        let token = addr(&env, ForwardKey::PaymentToken);
        let producer = addr(&env, ForwardKey::Producer);
        env.storage().persistent().set(&ForwardKey::State, &ForwardState::Fulfilled);

        token_client(&env, &token).transfer(&env.current_contract_address(), &producer, &total);
        env.events()
            .publish((Symbol::new(&env, "fulfilled"), producer), total);
    }

    /// Buyer contests a delivery that was marked but not actually made.
    ///
    /// This is the counterweight to `mark_delivered`: without it, marking
    /// delivery closed every exit and left the escrow frozen indefinitely,
    /// which handed the producer a lever worth the full escrow.
    pub fn dispute_delivery(env: Env, buyer: Address) {
        let stored = addr(&env, ForwardKey::Buyer);
        if buyer != stored {
            panic!("Only buyer can dispute");
        }
        buyer.require_auth();
        require_state(&env, ForwardState::Active);
        if !delivered(&env) {
            panic!("No delivery to dispute");
        }
        if env.ledger().timestamp() > acceptance_deadline(&env) {
            panic!("Acceptance window closed");
        }
        env.storage().persistent().set(&ForwardKey::Disputed, &true);
        bump_persistent(&env, &ForwardKey::Disputed);
        env.events()
            .publish((Symbol::new(&env, "disputed"), buyer), escrow_total(&env));
    }

    /// Producer collects once the acceptance window lapses undisputed.
    ///
    /// Guarantees the escrow always has an exit, so a silent buyer cannot
    /// strand a producer who did deliver.
    pub fn claim_unaccepted(env: Env, producer: Address) {
        let stored = addr(&env, ForwardKey::Producer);
        if producer != stored {
            panic!("Only producer can claim");
        }
        producer.require_auth();
        require_state(&env, ForwardState::Active);
        if !delivered(&env) {
            panic!("Delivery not marked");
        }
        if disputed(&env) {
            panic!("Under dispute: arbiter must resolve");
        }
        if env.ledger().timestamp() <= acceptance_deadline(&env) {
            panic!("Acceptance window still open");
        }

        let total = escrow_total(&env);
        let token = addr(&env, ForwardKey::PaymentToken);
        env.storage().persistent().set(&ForwardKey::State, &ForwardState::Fulfilled);

        token_client(&env, &token).transfer(&env.current_contract_address(), &producer, &total);
        env.events()
            .publish((Symbol::new(&env, "unaccepted"), producer), total);
    }

    /// Arbiter settles a disputed delivery, releasing escrow to one side.
    pub fn resolve_dispute(env: Env, arbiter: Address, pay_producer: bool) {
        let stored = addr(&env, ForwardKey::Arbiter);
        if arbiter != stored {
            panic!("Not the arbiter");
        }
        arbiter.require_auth();
        require_state(&env, ForwardState::Active);
        if !disputed(&env) {
            panic!("Nothing disputed");
        }

        let total = escrow_total(&env);
        let token = addr(&env, ForwardKey::PaymentToken);
        let to = if pay_producer {
            env.storage().persistent().set(&ForwardKey::State, &ForwardState::Fulfilled);
            addr(&env, ForwardKey::Producer)
        } else {
            env.storage().persistent().set(&ForwardKey::State, &ForwardState::Cancelled);
            addr(&env, ForwardKey::Buyer)
        };

        token_client(&env, &token).transfer(&env.current_contract_address(), &to, &total);
        env.events()
            .publish((Symbol::new(&env, "resolved"), arbiter), (to, total));
    }

    /// If the producer never marks delivery, buyer recovers 100% after deadline + grace.
    pub fn refund_on_non_delivery(env: Env, buyer: Address) {
        let stored = addr(&env, ForwardKey::Buyer);
        if buyer != stored {
            panic!("Only buyer can refund");
        }
        buyer.require_auth();
        require_state(&env, ForwardState::Active);
        if delivered(&env) {
            panic!("Delivery already marked");
        }
        let deadline: u64 = env.storage().persistent().get(&ForwardKey::HarvestDeadline).unwrap();
        let grace_end = deadline
            .checked_add(DELIVERY_GRACE_DAYS * SECONDS_PER_DAY)
            .expect("overflow");
        if env.ledger().timestamp() < grace_end {
            panic!("Delivery grace period has not expired");
        }

        let total = escrow_total(&env);
        let token = addr(&env, ForwardKey::PaymentToken);
        env.storage().persistent().set(&ForwardKey::State, &ForwardState::Cancelled);

        token_client(&env, &token).transfer(&env.current_contract_address(), &buyer, &total);
        env.events()
            .publish((Symbol::new(&env, "refunded"), buyer), total);
    }

    /// Keeps the forward Active: +bonus kilos and +90 days. Does not lock escrow.
    ///
    /// A rollover renegotiates both sides' obligations, so it needs both
    /// signatures and a hard cap. Unauthenticated, it let anyone push the
    /// buyer's refund right out indefinitely.
    pub fn execute_rollover_in_kind(env: Env, producer: Address, buyer: Address) {
        let stored_p = addr(&env, ForwardKey::Producer);
        let stored_b = addr(&env, ForwardKey::Buyer);
        if producer != stored_p || buyer != stored_b {
            panic!("Rollover requires both counterparties");
        }
        producer.require_auth();
        buyer.require_auth();

        require_state(&env, ForwardState::Active);
        if delivered(&env) {
            panic!("Cannot rollover after delivery marked");
        }
        let now = env.ledger().timestamp();
        let deadline: u64 = env.storage().persistent().get(&ForwardKey::HarvestDeadline).unwrap();
        if now < deadline {
            panic!("Deadline not yet reached for rollover");
        }

        let count: u32 = env
            .storage()
            .persistent()
            .get(&ForwardKey::RolloverCount)
            .unwrap_or(0);
        if count >= MAX_ROLLOVERS {
            panic!("Rollover limit reached");
        }

        // Reads the stored bonus instead of hardcoding 110, so the configured
        // value is actually the one applied.
        let pct: u32 = env
            .storage()
            .persistent()
            .get(&ForwardKey::BonusKilosPct)
            .unwrap_or(10);
        let kilos: i128 = env.storage().persistent().get(&ForwardKey::TotalKilos).unwrap();
        let bonus = kilos
            .checked_mul(100i128 + pct as i128)
            .expect("overflow")
            / 100;
        let new_deadline = deadline
            .checked_add(ROLLOVER_DAYS * SECONDS_PER_DAY)
            .expect("overflow");

        env.storage().persistent().set(&ForwardKey::TotalKilos, &bonus);
        env.storage().persistent().set(&ForwardKey::HarvestDeadline, &new_deadline);
        env.storage().persistent().set(&ForwardKey::RolloverCount, &(count + 1));
        bump_all(&env);
        env.events()
            .publish((Symbol::new(&env, "rollover"), producer), (bonus, new_deadline));
    }

    pub fn transfer_position(
        env: Env,
        current_buyer: Address,
        new_buyer: Address,
        transfer_price: i128,
    ) {
        current_buyer.require_auth();
        new_buyer.require_auth();
        require_state(&env, ForwardState::Active);

        let stored = addr(&env, ForwardKey::Buyer);
        if current_buyer != stored {
            panic!("Unauthorized buyer");
        }
        if new_buyer == addr(&env, ForwardKey::Producer) {
            panic!("Producer cannot buy the position");
        }
        // A position awaiting acceptance or under dispute is mid-settlement.
        // Allowing its sale let the original buyer hand a frozen escrow to a
        // third party who had no way to see the problem.
        if delivered(&env) {
            panic!("Cannot transfer a position pending acceptance or dispute");
        }
        require_positive(transfer_price);
        let original = escrow_total(&env);
        if transfer_price > original {
            panic!("Price cannot exceed original price");
        }

        let token = addr(&env, ForwardKey::PaymentToken);
        env.storage().persistent().set(&ForwardKey::Buyer, &new_buyer);
        bump_all(&env);

        token_client(&env, &token).transfer(&new_buyer, &current_buyer, &transfer_price);
        env.events().publish(
            (Symbol::new(&env, "transfer"), current_buyer),
            (new_buyer, transfer_price),
        );
    }

    pub fn get_state(env: Env) -> ForwardState {
        env.storage().persistent().get(&ForwardKey::State).unwrap()
    }

    pub fn get_total_kilos(env: Env) -> i128 {
        env.storage().persistent().get(&ForwardKey::TotalKilos).unwrap()
    }

    pub fn get_crop_name(env: Env) -> String {
        env.storage().persistent().get(&ForwardKey::CropName).unwrap()
    }

    pub fn get_arbiter(env: Env) -> Address {
        addr(&env, ForwardKey::Arbiter)
    }

    /// `(state, delivered, delivered_at, disputed, harvest_deadline, rollover_count, escrow)`.
    ///
    /// A counterparty considering `transfer_position` needs all of this to
    /// judge the position; previously `delivered` was invisible on-chain.
    pub fn get_position(env: Env) -> (ForwardState, bool, u64, bool, u64, u32, i128) {
        (
            env.storage().persistent().get(&ForwardKey::State).unwrap(),
            delivered(&env),
            env.storage().persistent().get(&ForwardKey::DeliveredAt).unwrap_or(0),
            disputed(&env),
            env.storage().persistent().get(&ForwardKey::HarvestDeadline).unwrap(),
            env.storage().persistent().get(&ForwardKey::RolloverCount).unwrap_or(0),
            escrow_total(&env),
        )
    }
}

#[cfg(test)]
mod test;
