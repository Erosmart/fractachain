#![cfg(test)]
extern crate std;

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env, String,
};

use crate::kyc::{is_argentina_business_hours, InvestorType};
use crate::opa::OpaState;
use crate::{FractachainLicitacionContract, FractachainLicitacionContractClient, LegalInfo, State};

/// Monday 8 Jan 2024 11:00 UTC = 08:00 ART, inside the KYC business window.
const BIZ_TS: u64 = 1_704_711_600;
const DAY: u64 = 86_400;
const SOFT_CAP: i128 = 100_000;
const PRICE: i128 = 100;

struct Fixture {
    env: Env,
    client: FractachainLicitacionContractClient<'static>,
    admin: Address,
    fiduciary: Address,
    token_id: Address,
}

fn setup() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(BIZ_TS);

    let admin = Address::generate(&env);
    let fiduciary = Address::generate(&env);
    let sac_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(sac_admin).address();

    let contract_id = env.register(FractachainLicitacionContract, ());
    let client = FractachainLicitacionContractClient::new(&env, &contract_id);

    let legal = LegalInfo {
        fideicomiso_hash: BytesN::from_array(&env, &[7u8; 32]),
        cnv_record_id: String::from_str(&env, "CNV-1"),
        legal_terms_uri: String::from_str(&env, "https://fractachain.example/legal"),
    };

    client.initialize(
        &admin,
        &fiduciary,
        &token_id,
        &SOFT_CAP,
        &500_000,
        &(BIZ_TS + 30 * DAY),
        &PRICE,
        &legal,
    );

    Fixture {
        env,
        client,
        admin,
        fiduciary,
        token_id,
    }
}

/// Funded, KYC-approved investor.
fn investor(f: &Fixture, funds: i128) -> Address {
    let who = Address::generate(&f.env);
    StellarAssetClient::new(&f.env, &f.token_id).mint(&who, &funds);
    f.client.verify_investor(
        &f.admin,
        &who,
        &32,
        &InvestorType::National,
        &(BIZ_TS + 365 * DAY),
    );
    who
}

fn balance(f: &Fixture, who: &Address) -> i128 {
    TokenClient::new(&f.env, &f.token_id).balance(who)
}

/// Raises the soft cap and closes the issuance successfully.
fn fund_and_finalize(f: &Fixture) -> Address {
    let buyer = investor(f, 1_000_000);
    f.client.contribute(&buyer, &SOFT_CAP);
    f.env.ledger().set_timestamp(BIZ_TS + 31 * DAY);
    f.client.finalize();
    assert_eq!(f.client.get_state(), State::Successful);
    buyer
}

#[test]
fn contribute_mints_rwa_and_secondary_market_settles() {
    let f = setup();
    let seller = fund_and_finalize(&f);
    assert_eq!(f.client.get_rwa_balance(&seller), 1_000);

    let order_id = f.client.place_order(&seller, &40, &200);
    // Escrowed units leave the free balance but still belong to the seller.
    assert_eq!(f.client.get_rwa_balance(&seller), 960);
    assert_eq!(f.client.get_order_escrow(&seller), 40);
    assert_eq!(f.client.get_total_holding(&seller), 1_000);

    let other = investor(&f, 50_000);
    f.client.fill_order(&other, &order_id);

    assert_eq!(f.client.get_rwa_balance(&other), 40);
    assert_eq!(f.client.get_rwa_balance(&seller), 960);
    assert_eq!(f.client.get_order_escrow(&seller), 0);
}

/// FL-01 regression, and the single most consequential fix in this contract.
///
/// No function moved the raise anywhere: a licitación that met its soft cap
/// left every peso locked in the contract permanently, so the issuer was never
/// paid. Closing now pays the company wallet configured at `initialize`.
#[test]
fn a_successful_issuance_pays_the_fiduciary() {
    let f = setup();
    fund_and_finalize(&f);

    assert_eq!(balance(&f, &f.fiduciary), SOFT_CAP);
    assert_eq!(balance(&f, &f.client.address), 0);
    assert!(f.client.proceeds_withdrawn());
}

#[test]
fn proceeds_cannot_be_drained_twice() {
    let f = setup();
    fund_and_finalize(&f);
    assert!(f.client.try_withdraw_proceeds(&f.admin).is_err());
}

#[test]
fn proceeds_are_locked_while_the_issuance_is_open() {
    let f = setup();
    let buyer = investor(&f, 1_000_000);
    f.client.contribute(&buyer, &SOFT_CAP);
    assert!(f.client.try_withdraw_proceeds(&f.admin).is_err());
}

#[test]
fn a_failed_issuance_keeps_the_money_for_refunds() {
    let f = setup();
    let buyer = investor(&f, 1_000_000);
    f.client.contribute(&buyer, &1_000);
    f.env.ledger().set_timestamp(BIZ_TS + 31 * DAY);
    f.client.finalize();
    assert_eq!(f.client.get_state(), State::Failed);

    // The admin must not be able to take a failed raise.
    assert!(f.client.try_withdraw_proceeds(&f.admin).is_err());

    let before = balance(&f, &buyer);
    f.client.refund(&buyer);
    assert_eq!(balance(&f, &buyer) - before, 1_000);
    assert_eq!(f.client.get_rwa_balance(&buyer), 0);
}

#[test]
fn the_company_wallet_can_be_set_before_anyone_pays_in() {
    let f = setup();
    let treasury = Address::generate(&f.env);
    f.client.set_fiduciary(&f.admin, &treasury);
    assert_eq!(f.client.get_fiduciary(), treasury);

    let buyer = investor(&f, 1_000_000);
    f.client.contribute(&buyer, &SOFT_CAP);
    f.env.ledger().set_timestamp(BIZ_TS + 31 * DAY);
    f.client.finalize();
    assert_eq!(balance(&f, &treasury), SOFT_CAP);
}

#[test]
fn the_company_wallet_freezes_once_money_is_in() {
    let f = setup();
    let buyer = investor(&f, 1_000_000);
    f.client.contribute(&buyer, &10_000);
    let other = Address::generate(&f.env);
    assert!(f.client.try_set_fiduciary(&f.admin, &other).is_err());
}

#[test]
fn only_the_admin_withdraws_proceeds() {
    let f = setup();
    fund_and_finalize(&f);
    let stranger = Address::generate(&f.env);
    assert!(f.client.try_withdraw_proceeds(&stranger).is_err());
}

/// FL-02 regression.
///
/// Crossing 50% and letting the offer deadline lapse routes through the
/// vote-suspension branch. That branch used to call a helper that demanded the
/// *admin's* signature while the *buyer* was the one signing, so the whole fill
/// reverted and the holder was locked out of the secondary market for good.
///
/// The assertion that matters is that the admin is never asked to authorize
/// anything during the buyer's transaction.
#[test]
fn crossing_fifty_percent_suspends_votes_without_admin_signature() {
    let f = setup();
    let whale = fund_and_finalize(&f);
    let minority = investor(&f, 1_000_000);

    // Move 400 of 1000 units to the minority so the whale sits at 60%.
    let o1 = f.client.place_order(&whale, &400, &PRICE);
    f.client.fill_order(&minority, &o1);
    assert_eq!(f.client.get_rwa_balance(&whale), 600);

    // The whale buys back above 50%, which arms the tender-offer clock.
    let o2 = f.client.place_order(&minority, &100, &PRICE);
    f.client.fill_order(&whale, &o2);
    let rec = f.client.get_opa_record().expect("OPA should be triggered");
    assert_eq!(rec.state, OpaState::Triggered);
    assert_eq!(rec.acquirer, whale);
    assert!(f.client.has_votes(&whale));

    // The 30-day window lapses with no offer launched.
    f.env
        .ledger()
        .set_timestamp(BIZ_TS + 31 * DAY + crate::opa::OPA_DEADLINE_SECONDS + 1);

    let o3 = f.client.place_order(&minority, &50, &PRICE);
    f.client.fill_order(&whale, &o3);

    // The fill went through and the sanction was applied.
    assert_eq!(f.client.get_rwa_balance(&whale), 750);
    assert_eq!(
        f.client.get_opa_record().unwrap().state,
        OpaState::SuspendedVotes
    );
    assert!(!f.client.has_votes(&whale));

    // Nothing in that transaction required the admin.
    let required: std::vec::Vec<Address> =
        f.env.auths().iter().map(|(addr, _)| addr.clone()).collect();
    assert!(
        !required.contains(&f.admin),
        "vote suspension must not depend on an admin signature"
    );
}

/// FL-06 regression: the threshold check ran only on secondary fills, so a
/// subscriber could take a majority of the primary without arming the offer.
#[test]
fn the_primary_also_arms_the_tender_offer() {
    let f = setup();
    let small = investor(&f, 1_000_000);
    let whale = investor(&f, 1_000_000);

    // Seed the register so the whale is not the only holder.
    f.client.contribute(&small, &40_000); // 400 units
    assert!(f.client.get_opa_record().is_none());

    // 600 of 1000 units = 60%, taken entirely in the primary.
    f.client.contribute(&whale, &60_000);

    let rec = f
        .client
        .get_opa_record()
        .expect("primary subscription must arm the OPA");
    assert_eq!(rec.acquirer, whale);
}

/// FL-03 regression: the acquirer named the price, so the final 5% could be
/// taken for a single stroop.
#[test]
fn squeeze_out_is_floored_at_the_equitable_price() {
    let f = setup();
    let whale = investor(&f, 1_000_000);
    let minority = investor(&f, 1_000_000);

    f.client.contribute(&whale, &96_000); // 960 units
    f.client.contribute(&minority, &4_000); // 40 units
    f.env.ledger().set_timestamp(BIZ_TS + 31 * DAY);
    f.client.finalize();

    assert_eq!(f.client.get_equitable_price_floor(), PRICE);
    // One stroop per share used to be accepted.
    assert!(f.client.try_execute_squeeze_out(&whale, &1).is_err());
    assert!(f
        .client
        .try_execute_squeeze_out(&whale, &(PRICE - 1))
        .is_err());

    f.client.execute_squeeze_out(&whale, &PRICE);
    assert_eq!(f.client.get_state(), State::Terminated);

    let before = balance(&f, &minority);
    f.client.claim_squeeze_out(&minority);
    assert_eq!(balance(&f, &minority) - before, 40 * PRICE);
    assert_eq!(f.client.get_rwa_balance(&minority), 0);
}

/// FL-05 regression: units parked in an open sale order were counted in the
/// supply but not in the holder's balance, so a buyout paid them for less than
/// they actually owned.
#[test]
fn squeeze_out_pays_for_units_locked_in_open_orders() {
    let f = setup();
    let whale = investor(&f, 1_000_000);
    let minority = investor(&f, 1_000_000);

    f.client.contribute(&whale, &96_000); // 960 units
    f.client.contribute(&minority, &4_000); // 40 units
    f.env.ledger().set_timestamp(BIZ_TS + 31 * DAY);
    f.client.finalize();

    // The minority has a live offer for most of their position.
    f.client.place_order(&minority, &30, &(PRICE * 2));
    assert_eq!(f.client.get_rwa_balance(&minority), 10);
    assert_eq!(f.client.get_total_holding(&minority), 40);

    // The floor now reflects the higher asking price seen on-chain only once
    // it trades, so the primary price still governs here.
    f.client.execute_squeeze_out(&whale, &PRICE);

    let before = balance(&f, &minority);
    f.client.claim_squeeze_out(&minority);
    // Paid for all 40 units, not just the 10 that were free.
    assert_eq!(balance(&f, &minority) - before, 40 * PRICE);
}

/// FL-04 regression: acceptance required the acquirer's signature, so the
/// "firm" offer was revocable at will. It is now funded up front.
#[test]
fn a_tender_offer_is_escrowed_and_acceptable_unilaterally() {
    let f = setup();
    let whale = fund_and_finalize(&f);
    let minority = investor(&f, 1_000_000);

    let o1 = f.client.place_order(&whale, &400, &PRICE);
    f.client.fill_order(&minority, &o1);
    let o2 = f.client.place_order(&minority, &100, &PRICE);
    f.client.fill_order(&whale, &o2);
    assert_eq!(
        f.client.get_opa_record().unwrap().state,
        OpaState::Triggered
    );

    // 1000 total, whale 700, so 300 outstanding at PRICE each.
    f.client.launch_opa(&whale, &PRICE);
    assert_eq!(f.client.get_opa_escrow(), 300 * PRICE);

    let before = balance(&f, &minority);
    f.client.accept_opa(&minority);
    assert_eq!(balance(&f, &minority) - before, 300 * PRICE);
    assert_eq!(f.client.get_rwa_balance(&minority), 0);
    assert_eq!(f.client.get_opa_escrow(), 0);
}

#[test]
fn an_underpriced_tender_offer_is_rejected() {
    let f = setup();
    let whale = fund_and_finalize(&f);
    let minority = investor(&f, 1_000_000);
    let o1 = f.client.place_order(&whale, &400, &PRICE);
    f.client.fill_order(&minority, &o1);
    let o2 = f.client.place_order(&minority, &100, &PRICE);
    f.client.fill_order(&whale, &o2);

    assert!(f.client.try_launch_opa(&whale, &(PRICE - 1)).is_err());
}

#[test]
fn unspent_tender_offer_escrow_returns_to_the_acquirer() {
    let f = setup();
    let whale = fund_and_finalize(&f);
    let minority = investor(&f, 1_000_000);
    let o1 = f.client.place_order(&whale, &400, &PRICE);
    f.client.fill_order(&minority, &o1);
    let o2 = f.client.place_order(&minority, &100, &PRICE);
    f.client.fill_order(&whale, &o2);

    f.client.launch_opa(&whale, &PRICE);
    let escrowed = f.client.get_opa_escrow();

    // Nobody accepts and the offer lapses.
    assert!(f.client.try_reclaim_opa_escrow(&whale).is_err());
    f.env
        .ledger()
        .set_timestamp(BIZ_TS + 31 * DAY + crate::opa::OPA_DEADLINE_SECONDS + 1);

    let before = balance(&f, &whale);
    let returned = f.client.reclaim_opa_escrow(&whale);
    assert_eq!(returned, escrowed);
    assert_eq!(balance(&f, &whale) - before, escrowed);
}

#[test]
fn unverified_investors_cannot_contribute_or_trade() {
    let f = setup();
    let seller = fund_and_finalize(&f);
    let stranger = Address::generate(&f.env);
    StellarAssetClient::new(&f.env, &f.token_id).mint(&stranger, &100_000);

    assert!(!f.client.is_verified(&stranger));
    let order_id = f.client.place_order(&seller, &10, &PRICE);
    assert!(f.client.try_fill_order(&stranger, &order_id).is_err());
}

#[test]
fn revoked_sellers_cannot_have_their_orders_filled() {
    let f = setup();
    let seller = fund_and_finalize(&f);
    let buyer = investor(&f, 100_000);
    let order_id = f.client.place_order(&seller, &10, &PRICE);

    f.client.revoke_investor(&f.admin, &seller);
    assert!(f.client.try_fill_order(&buyer, &order_id).is_err());
}

#[test]
fn cancelling_an_order_restores_the_free_balance() {
    let f = setup();
    let seller = fund_and_finalize(&f);
    let order_id = f.client.place_order(&seller, &250, &PRICE);
    assert_eq!(f.client.get_rwa_balance(&seller), 750);
    assert_eq!(f.client.get_order_escrow(&seller), 250);

    f.client.cancel_sale_order(&seller, &order_id);
    assert_eq!(f.client.get_rwa_balance(&seller), 1_000);
    assert_eq!(f.client.get_order_escrow(&seller), 0);
}

#[test]
fn admin_can_set_price_and_token_before_funding() {
    let f = setup();
    f.client.set_price_per_unit(&f.admin, &250);
    assert_eq!(f.client.get_price_per_unit(), 250);
    f.client.set_payment_token(&f.admin, &f.token_id);
    assert_eq!(f.client.get_payment_token(), f.token_id);
}

#[test]
fn price_is_frozen_once_money_is_in() {
    let f = setup();
    let buyer = investor(&f, 1_000_000);
    f.client.contribute(&buyer, &10_000);
    assert!(f.client.try_set_price_per_unit(&f.admin, &250).is_err());
    assert!(f.client.try_set_payment_token(&f.admin, &f.token_id).is_err());
}

#[test]
#[should_panic(expected = "Already initialized")]
fn double_initialization_is_rejected() {
    let f = setup();
    let legal = LegalInfo {
        fideicomiso_hash: BytesN::from_array(&f.env, &[7u8; 32]),
        cnv_record_id: String::from_str(&f.env, "CNV-1"),
        legal_terms_uri: String::from_str(&f.env, "https://fractachain.example/legal"),
    };
    f.client.initialize(
        &f.admin,
        &f.fiduciary,
        &f.token_id,
        &SOFT_CAP,
        &500_000,
        &(BIZ_TS + 30 * DAY),
        &PRICE,
        &legal,
    );
}

#[test]
fn contributions_must_be_a_whole_number_of_units() {
    let f = setup();
    let buyer = investor(&f, 1_000_000);
    assert!(f.client.try_contribute(&buyer, &150).is_err());
}

#[test]
fn contributions_cannot_exceed_the_hard_cap() {
    let f = setup();
    let buyer = investor(&f, 1_000_000);
    assert!(f.client.try_contribute(&buyer, &500_100).is_err());
}

#[test]
fn the_secondary_market_is_closed_until_the_issuance_succeeds() {
    let f = setup();
    let buyer = investor(&f, 1_000_000);
    f.client.contribute(&buyer, &10_000);
    assert!(f.client.try_place_order(&buyer, &10, &PRICE).is_err());
}

/// Sunday 14 Jan 2024 12:00 ART — after `setup()`'s Monday ledger, so time
/// only moves forward.
const SUNDAY_ART: u64 = 1_705_244_400;
/// Monday 8 Jan 2024 17:00 ART, after the bank window.
const AFTER_HOURS_ART: u64 = 1_704_744_000;
/// Monday 15 Jan 2024 08:00 ART, inside the window and after `SUNDAY_ART`.
const NEXT_BIZ_TS: u64 = 1_705_316_400;
/// SHA-256 of `Public Global Stellar Network ; September 2015`.
const PUBNET_NETWORK_ID: [u8; 32] = [
    0x7a, 0xc3, 0x39, 0x97, 0x54, 0x4e, 0x31, 0x75, 0xd2, 0x66, 0xbd, 0x02, 0x24, 0x39, 0xb2, 0x2c,
    0xdb, 0x16, 0x50, 0x8c, 0x01, 0x16, 0x3f, 0x26, 0xe5, 0xcb, 0x2a, 0x3e, 0x10, 0x45, 0xa9, 0x79,
];

#[test]
fn business_hours_helper_matches_the_argentine_window() {
    assert!(is_argentina_business_hours(BIZ_TS));
    assert!(!is_argentina_business_hours(SUNDAY_ART));
    assert!(!is_argentina_business_hours(AFTER_HOURS_ART));
}

/// Local Env and testnet have a network_id other than pubnet, so a Sunday
/// whitelist must go through. Otherwise we cannot demo or run CI off-hours.
#[test]
fn local_and_testnet_can_verify_an_investor_on_a_sunday() {
    let f = setup();
    assert!(!f.client.kyc_hours_enforced());
    f.env.ledger().set_timestamp(SUNDAY_ART);
    let who = Address::generate(&f.env);
    f.client.verify_investor(
        &f.admin,
        &who,
        &32,
        &InvestorType::National,
        &(SUNDAY_ART + 365 * DAY),
    );
    assert!(f.client.is_verified(&who));
}

#[test]
fn pubnet_rejects_kyc_outside_argentine_business_hours() {
    let f = setup();
    f.env.ledger().set_network_id(PUBNET_NETWORK_ID);
    assert!(f.client.kyc_hours_enforced());

    f.env.ledger().set_timestamp(SUNDAY_ART);
    let who = Address::generate(&f.env);
    assert!(f
        .client
        .try_verify_investor(
            &f.admin,
            &who,
            &32,
            &InvestorType::National,
            &(SUNDAY_ART + 365 * DAY),
        )
        .is_err());

    f.env.ledger().set_timestamp(NEXT_BIZ_TS);
    f.client.verify_investor(
        &f.admin,
        &who,
        &32,
        &InvestorType::National,
        &(NEXT_BIZ_TS + 365 * DAY),
    );
    assert!(f.client.is_verified(&who));
}
