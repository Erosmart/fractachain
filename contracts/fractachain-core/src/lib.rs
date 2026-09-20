#![no_std]
use soroban_sdk::{token, Address, Env, IntoVal, Val};

pub const DAY_IN_LEDGERS: u32 = 17_280;
pub const BUMP_THRESHOLD: u32 = 30 * DAY_IN_LEDGERS;
pub const BUMP_TO: u32 = 120 * DAY_IN_LEDGERS;
pub const SECONDS_PER_DAY: u64 = 86_400;
pub const BPS_DENOM: i128 = 10_000;

/// Ceiling on any configurable annual rate: 150%. Rates are operator input,
/// so without a cap `prorated_interest` can be driven to overflow.
pub const MAX_RATE_BPS: u32 = 15_000;

/// Interest stops accruing after 10 years. Bounds the `days` factor so the
/// multiplication below cannot be pushed past `i128::MAX` by a stale loan.
pub const MAX_LOAN_DAYS: i128 = 3_650;

pub fn require_positive(amount: i128) {
    if amount <= 0 {
        panic!("Amount must be positive");
    }
}

pub fn require_divisible(amount: i128, unit_price: i128) {
    require_positive(amount);
    require_positive(unit_price);
    if amount % unit_price != 0 {
        panic!("Amount must be a multiple of unit price");
    }
}

pub fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(BUMP_THRESHOLD, BUMP_TO);
}

/// Renews the TTL of a single `persistent` entry.
///
/// `bump_instance` does not cover persistent storage, so every contract that
/// keeps state there has to extend those entries explicitly or they archive
/// out from under a live position.
pub fn bump_persistent<K>(env: &Env, key: &K)
where
    K: IntoVal<Env, Val>,
{
    env.storage()
        .persistent()
        .extend_ttl(key, BUMP_THRESHOLD, BUMP_TO);
}

pub fn token_client<'a>(env: &'a Env, token: &Address) -> token::Client<'a> {
    token::Client::new(env, token)
}

/// `amount * bps / 10_000`, truncating toward zero.
pub fn pct_bps(amount: i128, bps: u32) -> i128 {
    amount
        .checked_mul(bps as i128)
        .expect("bps overflow")
        / BPS_DENOM
}

/// `amount * bps / 10_000`, rounding up.
///
/// Use where the remainder must not silently favour the debtor — penalties and
/// interest. Truncating division makes small amounts free.
pub fn pct_bps_ceil(amount: i128, bps: u32) -> i128 {
    let scaled = amount
        .checked_mul(bps as i128)
        .expect("bps overflow");
    if scaled <= 0 {
        return 0;
    }
    (scaled - 1) / BPS_DENOM + 1
}

/// Simple interest prorated by elapsed full days, minimum 1 day if any time passed.
///
/// Every step is checked: this runs inside `repay_loan`, so an overflow here
/// would leave a borrower unable to ever settle their debt.
pub fn prorated_interest(principal: i128, rate_bps: u32, start_ts: u64, now: u64) -> i128 {
    require_positive(principal);
    if rate_bps > MAX_RATE_BPS {
        panic!("Interest rate out of range");
    }
    if now <= start_ts {
        return 0;
    }
    let mut days = ((now - start_ts) / SECONDS_PER_DAY) as i128;
    if days == 0 {
        days = 1;
    }
    if days > MAX_LOAN_DAYS {
        days = MAX_LOAN_DAYS;
    }
    principal
        .checked_mul(rate_bps as i128)
        .expect("interest overflow")
        .checked_mul(days)
        .expect("interest overflow")
        / (BPS_DENOM * 365)
}

#[cfg(test)]
mod test;
