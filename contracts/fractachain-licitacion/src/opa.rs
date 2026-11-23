use soroban_sdk::{contracttype, Address, Env, Symbol};
use crate::kyc::write_voting_rights;

pub const OPA_THRESHOLD_BPS: i128 = 5000;
pub const SQUEEZE_OUT_THRESHOLD_BPS: i128 = 9500;
pub const OPA_DEADLINE_SECONDS: u64 = 30 * 86400;

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum OpaState {
    None = 0,
    Triggered = 1,
    ActiveOffer = 2,
    SuspendedVotes = 3,
    SqueezedOut = 4,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OpaRecord {
    pub state: OpaState,
    pub acquirer: Address,
    pub price_per_share: i128,
    pub triggered_at: u64,
    pub deadline: u64,
}

#[contracttype]
pub enum OpaKey {
    Record,
}

pub fn get_record(env: &Env) -> Option<OpaRecord> {
    env.storage().persistent().get(&OpaKey::Record)
}

pub fn set_record(env: &Env, rec: &OpaRecord) {
    env.storage().persistent().set(&OpaKey::Record, rec);
    env.storage().persistent().extend_ttl(
        &OpaKey::Record,
        fractachain_core::BUMP_THRESHOLD,
        fractachain_core::BUMP_TO,
    );
}

/// Share of the supply held, in basis points.
pub fn ownership_bps(holding: i128, total_supply: i128) -> i128 {
    if total_supply <= 0 {
        return 0;
    }
    (holding * 10000) / total_supply
}

/// True when `rec`'s acquirer let the tender-offer deadline lapse without
/// launching an offer while still holding control: the Art. 88 sanction is
/// owed whether or not anything has written it down yet.
pub fn sanction_due(env: &Env, rec: &OpaRecord, acquirer_holding: i128, total_supply: i128) -> bool {
    rec.state == OpaState::Triggered
        && env.ledger().timestamp() > rec.deadline
        && ownership_bps(acquirer_holding, total_supply) >= OPA_THRESHOLD_BPS
}

/// Persists the Art. 88 vote suspension for `rec`'s acquirer.
pub fn apply_sanction(env: &Env, mut rec: OpaRecord, ownership: i128) -> OpaRecord {
    write_voting_rights(env, &rec.acquirer, false);
    rec.state = OpaState::SuspendedVotes;
    set_record(env, &rec);
    env.events().publish(
        (Symbol::new(env, "votes_suspended"), rec.acquirer.clone()),
        ownership,
    );
    rec
}

fn trigger(env: &Env, holder: &Address, ownership: i128) {
    let now = env.ledger().timestamp();
    set_record(
        env,
        &OpaRecord {
            state: OpaState::Triggered,
            acquirer: holder.clone(),
            price_per_share: 0,
            triggered_at: now,
            deadline: now + OPA_DEADLINE_SECONDS,
        },
    );
    env.events()
        .publish((Symbol::new(env, "opa_trigger"), holder.clone()), ownership);
}

/// Detects a crossing of the 50% control threshold (Art. 87) and, once the
/// tender-offer deadline lapses without an offer, suspends the holder's votes
/// (Art. 88).
///
/// `holder_holding` must be the holder's **total** position (free balance plus
/// units escrowed in open sale orders): measuring only the free balance let a
/// holder park units in unfillable orders, buy past 50% and cancel afterwards
/// without ever arming the offer.
///
/// Called from every path that can change a holder's position — primary
/// subscription, secondary fill, order cancellation and OPA acceptance — so
/// control cannot be accumulated through a route that skips the check.
///
/// ## One record, but not first-come-forever
///
/// There is a single record, and it belongs to whoever holds control *now*.
/// When a different holder crosses 50%, the existing record is superseded if
/// its acquirer no longer holds 50% (two holders can only both be "in control"
/// at exactly 50/50, in which case the first one keeps the obligation). A
/// squeezed-out issuance is terminal and never re-armed. A superseded acquirer
/// keeps any vote suspension already applied (lifting it stays an admin
/// decision) and can reclaim any escrow it had funded.
pub fn check_control_threshold(
    env: &Env,
    holder: &Address,
    holder_holding: i128,
    total_supply: i128,
    holding_of: &dyn Fn(&Address) -> i128,
) {
    if total_supply <= 0 {
        return;
    }

    let ownership = ownership_bps(holder_holding, total_supply);
    if ownership >= SQUEEZE_OUT_THRESHOLD_BPS || ownership < OPA_THRESHOLD_BPS {
        return;
    }

    match get_record(env) {
        None => trigger(env, holder, ownership),
        Some(rec) if rec.acquirer == *holder => {
            if sanction_due(env, &rec, holder_holding, total_supply) {
                apply_sanction(env, rec, ownership);
            }
        }
        Some(rec) if rec.state == OpaState::SqueezedOut => {}
        Some(rec) => {
            let previous = ownership_bps(holding_of(&rec.acquirer), total_supply);
            if previous < OPA_THRESHOLD_BPS {
                env.events().publish(
                    (Symbol::new(env, "opa_superseded"), rec.acquirer.clone()),
                    holder.clone(),
                );
                trigger(env, holder, ownership);
            }
        }
    }
}

pub fn require_can_launch_opa(rec: &OpaRecord, acquirer: &Address) {
    if rec.acquirer != *acquirer {
        panic!("Not the OPA acquirer");
    }
    if rec.state != OpaState::Triggered && rec.state != OpaState::SuspendedVotes {
        panic!("OPA cannot be launched in current state");
    }
}
