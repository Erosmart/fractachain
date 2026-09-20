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
}

/// Detects a crossing of the 50% control threshold (Art. 87) and, once the
/// tender-offer deadline lapses without an offer, suspends the holder's votes
/// (Art. 88).
///
/// Called from every path that can increase a holder's stake — primary
/// subscription, secondary fill, and OPA acceptance — so control cannot be
/// accumulated through a route that skips the check.
pub fn check_control_threshold(
    env: &Env,
    holder: &Address,
    holder_balance: i128,
    total_supply: i128,
) {
    if total_supply <= 0 {
        return;
    }

    let ownership_bps = (holder_balance * 10000) / total_supply;
    let current_record = get_record(env);

    if ownership_bps >= SQUEEZE_OUT_THRESHOLD_BPS {
        return;
    }

    if ownership_bps >= OPA_THRESHOLD_BPS {
        let now = env.ledger().timestamp();
        match current_record {
            None => {
                let rec = OpaRecord {
                    state: OpaState::Triggered,
                    acquirer: holder.clone(),
                    price_per_share: 0,
                    triggered_at: now,
                    deadline: now + OPA_DEADLINE_SECONDS,
                };
                set_record(env, &rec);
                env.events()
                    .publish((Symbol::new(env, "opa_trigger"), holder.clone()), ownership_bps);
            }
            Some(mut rec) => {
                if rec.acquirer == *holder
                    && rec.state == OpaState::Triggered
                    && now > rec.deadline
                {
                    write_voting_rights(env, holder, false);
                    rec.state = OpaState::SuspendedVotes;
                    set_record(env, &rec);
                    env.events().publish(
                        (Symbol::new(env, "votes_suspended"), holder.clone()),
                        ownership_bps,
                    );
                }
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
