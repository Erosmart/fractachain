#![cfg(test)]
//! Instaward 1, Deliverable 1: the tender settled in USDC.
//!
//! Circle's USDC on Stellar is a classic asset exposed through its Stellar
//! Asset Contract, which (like every SAC) uses 7 decimals. These tests run the
//! whole tender lifecycle against a test SAC with real 7-decimal amounts.
extern crate std;

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env, String,
};

use crate::kyc::InvestorType;
use crate::{FractachainLicitacionContract, FractachainLicitacionContractClient, LegalInfo, State};

/// Monday 8 Jan 2024 11:00 UTC (inside the KYC business window).
const NOW: u64 = 1_704_711_600;
const DAY: u64 = 86_400;
/// One USDC in SAC base units (7 decimals).
const USDC: i128 = 10_000_000;
const PRICE: i128 = 10 * USDC;
const SOFT_CAP: i128 = 100 * USDC;
const HARD_CAP: i128 = 200 * USDC;
const DEADLINE: u64 = NOW + 30 * DAY;

struct Usdc {
    env: Env,
    tender: FractachainLicitacionContractClient<'static>,
    admin: Address,
    fiduciary: Address,
    usdc: Address,
}

fn new_sac(env: &Env) -> Address {
    env.register_stellar_asset_contract_v2(Address::generate(env)).address()
}

fn setup() -> Usdc {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(NOW);
    let admin = Address::generate(&env);
    let fiduciary = Address::generate(&env);
    let usdc = new_sac(&env);
    let legal = LegalInfo {
        fideicomiso_hash: BytesN::from_array(&env, &[1u8; 32]),
        cnv_record_id: String::from_str(&env, "CNV-USDC"),
        legal_terms_uri: String::from_str(&env, "https://fractachain.example/usdc"),
    };
    let id = env.register(
        FractachainLicitacionContract,
        (
            &admin,
            &fiduciary,
            &usdc,
            SOFT_CAP,
            HARD_CAP,
            DEADLINE,
            PRICE,
            legal,
        ),
    );
    let tender = FractachainLicitacionContractClient::new(&env, &id);
    Usdc {
        env,
        tender,
        admin,
        fiduciary,
        usdc,
    }
}

fn investor(f: &Usdc, usdc: i128) -> Address {
    let who = Address::generate(&f.env);
    StellarAssetClient::new(&f.env, &f.usdc).mint(&who, &usdc);
    f.tender
        .verify_investor(&f.admin, &who, &32, &InvestorType::National, &(NOW + 365 * DAY));
    who
}

fn usdc_balance(f: &Usdc, who: &Address) -> i128 {
    TokenClient::new(&f.env, &f.usdc).balance(who)
}

#[test]
fn the_terms_are_readable_from_the_contract() {
    let f = setup();
    assert_eq!(TokenClient::new(&f.env, &f.usdc).decimals(), 7);
    assert_eq!(f.tender.get_payment_token(), f.usdc);
    assert_eq!(f.tender.get_caps(), (SOFT_CAP, HARD_CAP));
    assert_eq!(f.tender.get_deadline(), DEADLINE);
    assert_eq!(f.tender.get_price_per_unit(), PRICE);
    assert_eq!(f.tender.get_state(), State::Open);
}

#[test]
fn a_usdc_contribution_buys_whole_units() {
    let f = setup();
    let buyer = investor(&f, 50 * USDC);
    f.tender.contribute(&buyer, &(20 * USDC));
    assert_eq!(f.tender.get_rwa_balance(&buyer), 2);
    assert_eq!(f.tender.get_total_raised(), 20 * USDC);
    assert_eq!(usdc_balance(&f, &buyer), 30 * USDC);
    assert_eq!(usdc_balance(&f, &f.tender.address), 20 * USDC);
}

#[test]
fn a_contribution_that_is_not_a_whole_number_of_units_is_rejected() {
    let f = setup();
    let buyer = investor(&f, 50 * USDC);
    // 15 USDC at 10 USDC per unit would leave 5 USDC unaccounted for.
    assert!(f.tender.try_contribute(&buyer, &(15 * USDC)).is_err());
    assert_eq!(usdc_balance(&f, &buyer), 50 * USDC);
    assert_eq!(f.tender.get_total_raised(), 0);
}

#[test]
fn finalize_pays_the_fiduciary_in_usdc() {
    let f = setup();
    let a = investor(&f, 100 * USDC);
    let b = investor(&f, 100 * USDC);
    f.tender.contribute(&a, &(60 * USDC));
    f.tender.contribute(&b, &(50 * USDC));
    f.env.ledger().set_timestamp(DEADLINE);
    f.tender.finalize();
    assert_eq!(f.tender.get_state(), State::Successful);
    assert_eq!(usdc_balance(&f, &f.fiduciary), 110 * USDC);
    assert_eq!(usdc_balance(&f, &f.tender.address), 0);
    assert!(f.tender.proceeds_withdrawn());
}

#[test]
fn reaching_the_hard_cap_allows_closing_before_the_deadline() {
    let f = setup();
    let whale = investor(&f, HARD_CAP);
    f.tender.contribute(&whale, &HARD_CAP);
    f.tender.finalize();
    assert_eq!(f.tender.get_state(), State::Successful);
    assert_eq!(usdc_balance(&f, &f.fiduciary), HARD_CAP);
}

#[test]
fn a_failed_tender_refunds_usdc() {
    let f = setup();
    let buyer = investor(&f, 50 * USDC);
    f.tender.contribute(&buyer, &(20 * USDC));
    f.env.ledger().set_timestamp(DEADLINE);
    f.tender.finalize();
    assert_eq!(f.tender.get_state(), State::Failed);
    assert_eq!(usdc_balance(&f, &f.fiduciary), 0);
    f.tender.refund(&buyer);
    assert_eq!(usdc_balance(&f, &buyer), 50 * USDC);
    assert_eq!(usdc_balance(&f, &f.tender.address), 0);
    assert_eq!(f.tender.get_rwa_balance(&buyer), 0);
    // A second refund has nothing left to pay.
    assert!(f.tender.try_refund(&buyer).is_err());
}

#[test]
fn the_payment_token_switches_to_usdc_only_before_funding() {
    let f = setup();
    // A tender pointed at another asset (e.g. XLM's SAC)…
    let other = new_sac(&f.env);
    f.tender.set_payment_token(&f.admin, &other);
    assert_eq!(f.tender.get_payment_token(), other);
    // …is moved to USDC while nobody has paid in.
    f.tender.set_payment_token(&f.admin, &f.usdc);
    assert_eq!(f.tender.get_payment_token(), f.usdc);
    let buyer = investor(&f, 20 * USDC);
    f.tender.contribute(&buyer, &(10 * USDC));
    // Once money is in, the asset is frozen.
    assert!(f.tender.try_set_payment_token(&f.admin, &other).is_err());
    assert_eq!(f.tender.get_payment_token(), f.usdc);
}
