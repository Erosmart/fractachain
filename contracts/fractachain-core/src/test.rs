#![cfg(test)]
extern crate std;

use crate::{
    pct_bps, pct_bps_ceil, prorated_interest, require_divisible, require_positive, MAX_LOAN_DAYS,
    MAX_RATE_BPS, SECONDS_PER_DAY,
};

#[test]
fn interest_is_zero_before_any_time_passes() {
    assert_eq!(prorated_interest(100_000, 800, 1_000, 1_000), 0);
    assert_eq!(prorated_interest(100_000, 800, 1_000, 500), 0);
}

#[test]
fn partial_day_counts_as_one_full_day() {
    let one_day = prorated_interest(1_000_000, 800, 0, SECONDS_PER_DAY);
    let one_second = prorated_interest(1_000_000, 800, 0, 1);
    assert_eq!(one_second, one_day);
    // 1_000_000 * 800 * 1 / (10_000 * 365)
    assert_eq!(one_day, 219);
}

#[test]
fn interest_scales_linearly_with_elapsed_days() {
    let thirty = prorated_interest(1_000_000, 800, 0, 30 * SECONDS_PER_DAY);
    // 1_000_000 * 800 * 30 / 3_650_000
    assert_eq!(thirty, 6_575);
}

#[test]
fn accrual_stops_at_the_day_ceiling() {
    let at_cap = prorated_interest(1_000_000, 800, 0, (MAX_LOAN_DAYS as u64) * SECONDS_PER_DAY);
    let past_cap = prorated_interest(1_000_000, 800, 0, 50_000 * SECONDS_PER_DAY);
    assert_eq!(at_cap, past_cap);
}

/// A loan that would otherwise overflow must stay repayable. Before the cap,
/// a large principal combined with a huge rate panicked inside `repay_loan`,
/// which left the borrower unable to ever settle.
#[test]
#[should_panic(expected = "Interest rate out of range")]
fn rate_above_the_ceiling_is_rejected() {
    prorated_interest(1_000_000, MAX_RATE_BPS + 1, 0, SECONDS_PER_DAY);
}

#[test]
fn huge_principal_at_max_rate_does_not_overflow() {
    let principal = i128::MAX / 10_i128.pow(20);
    let interest = prorated_interest(principal, MAX_RATE_BPS, 0, 365 * SECONDS_PER_DAY);
    assert!(interest > 0);
}

#[test]
#[should_panic(expected = "Amount must be positive")]
fn zero_principal_is_rejected() {
    prorated_interest(0, 800, 0, SECONDS_PER_DAY);
}

#[test]
fn require_positive_accepts_only_strictly_positive() {
    require_positive(1);
    require_positive(i128::MAX);
}

#[test]
#[should_panic(expected = "Amount must be positive")]
fn require_positive_rejects_negative() {
    require_positive(-1);
}

#[test]
fn divisible_amounts_pass_and_remainders_do_not() {
    require_divisible(1_000, 100);
}

#[test]
#[should_panic(expected = "Amount must be a multiple of unit price")]
fn indivisible_amount_is_rejected() {
    require_divisible(1_050, 100);
}

#[test]
fn pct_bps_truncates_and_ceil_rounds_up() {
    // 20% of 4 is 0.8: truncation hands the debtor a free pass.
    assert_eq!(pct_bps(4, 2_000), 0);
    assert_eq!(pct_bps_ceil(4, 2_000), 1);

    // Exact multiples agree.
    assert_eq!(pct_bps(1_000, 2_000), 200);
    assert_eq!(pct_bps_ceil(1_000, 2_000), 200);
}

#[test]
fn pct_bps_ceil_of_zero_is_zero() {
    assert_eq!(pct_bps_ceil(0, 2_000), 0);
}
