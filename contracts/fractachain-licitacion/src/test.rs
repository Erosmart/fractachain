#![cfg(test)]
extern crate std;

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env, IntoVal, String,
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

    let legal = LegalInfo {
        fideicomiso_hash: BytesN::from_array(&env, &[7u8; 32]),
        cnv_record_id: String::from_str(&env, "CNV-1"),
        legal_terms_uri: String::from_str(&env, "https://fractachain.example/legal"),
    };

    let contract_id = env.register(
        FractachainLicitacionContract,
        (
            &admin,
            &fiduciary,
            &token_id,
            SOFT_CAP,
            500_000i128,
            BIZ_TS + 30 * DAY,
            PRICE,
            legal,
        ),
    );
    let client = FractachainLicitacionContractClient::new(&env, &contract_id);

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
/// paid. Closing now pays the company wallet configured at construction.
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

/// SC-06: the licitación is constructed with the deploy, so there is no
/// `initialize` to front-run, and the host refuses to run the constructor
/// again (admin, fiduciary and caps can't be rewritten).
#[test]
fn the_constructor_cannot_be_run_again() {
    let f = setup();
    let attacker = Address::generate(&f.env);
    let legal = LegalInfo {
        fideicomiso_hash: BytesN::from_array(&f.env, &[7u8; 32]),
        cnv_record_id: String::from_str(&f.env, "CNV-1"),
        legal_terms_uri: String::from_str(&f.env, "https://fractachain.example/legal"),
    };
    let again = f.env.try_invoke_contract::<(), soroban_sdk::Error>(
        &f.client.address,
        &soroban_sdk::Symbol::new(&f.env, "__constructor"),
        (
            &attacker,
            &attacker,
            &f.token_id,
            SOFT_CAP,
            500_000i128,
            BIZ_TS + 30 * DAY,
            PRICE,
            legal,
        )
            .into_val(&f.env),
    );
    assert!(again.is_err());
    assert_eq!(f.client.get_admin(), f.admin);
    assert_eq!(f.client.get_fiduciary(), f.fiduciary);
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

/// SC-01 (security review 2026-10): a self-fill moved nothing but recorded a
/// print, a free way to raise the equitable price floor every OPA pays.
#[test]
fn an_order_cannot_be_filled_by_its_own_seller() {
    let f = setup();
    let seller = fund_and_finalize(&f);
    let order_id = f.client.place_order(&seller, &1, &1_000_000);
    assert!(f.client.try_fill_order(&seller, &order_id).is_err());
    assert_eq!(f.client.get_equitable_price_floor(), PRICE);
}

/// SC-01: the 0.25% fee truncated to zero on every fill under 400.
#[test]
fn small_fills_still_pay_the_platform_fee() {
    let f = setup();
    let seller = fund_and_finalize(&f);
    let buyer = investor(&f, 50_000);
    let order_id = f.client.place_order(&seller, &1, &PRICE);
    let before = balance(&f, &f.admin);
    f.client.fill_order(&buyer, &order_id);
    assert_eq!(balance(&f, &f.admin) - before, 1);
}

/// SC-05: during `Open` an acceptor could be paid by the tender offer and
/// still refunded in full if the issuance then failed.
#[test]
fn a_tender_offer_waits_for_a_successful_issuance() {
    let f = setup();
    let small = investor(&f, 1_000_000);
    let whale = investor(&f, 1_000_000);
    f.client.contribute(&small, &40_000);
    f.client.contribute(&whale, &60_000);
    assert!(f.client.get_opa_record().is_some(), "the primary still arms the OPA");
    assert!(f.client.try_launch_opa(&whale, &PRICE).is_err());
    assert!(f.client.try_accept_opa(&small).is_err());
}

/// SC-09: re-verifying a KYC silently restored votes Art. 88 had suspended.
#[test]
fn kyc_renewal_keeps_a_suspended_vote_suspended() {
    let f = setup();
    let whale = fund_and_finalize(&f);
    let minority = investor(&f, 1_000_000);
    let o1 = f.client.place_order(&whale, &400, &PRICE);
    f.client.fill_order(&minority, &o1);
    let o2 = f.client.place_order(&minority, &100, &PRICE);
    f.client.fill_order(&whale, &o2);
    f.env
        .ledger()
        .set_timestamp(BIZ_TS + 31 * DAY + crate::opa::OPA_DEADLINE_SECONDS + 1);
    let o3 = f.client.place_order(&minority, &50, &PRICE);
    f.client.fill_order(&whale, &o3);
    assert!(!f.client.has_votes(&whale));

    f.client.verify_investor(
        &f.admin,
        &whale,
        &32,
        &InvestorType::National,
        &(BIZ_TS + 400 * DAY),
    );
    assert!(!f.client.has_votes(&whale));
}

/// Moves `units` from `from` to `to` through the order book at `PRICE`.
fn sell(f: &Fixture, from: &Address, to: &Address, units: i128) {
    let order = f.client.place_order(from, &units, &PRICE);
    f.client.fill_order(to, &order);
}

/// Whale at 70%, minority at 30%, OPA armed for the whale.
fn whale_in_control(f: &Fixture) -> (Address, Address) {
    let whale = fund_and_finalize(f);
    let minority = investor(f, 1_000_000);
    sell(f, &whale, &minority, 400);
    sell(f, &minority, &whale, 100);
    let rec = f.client.get_opa_record().unwrap();
    assert_eq!((rec.acquirer.clone(), rec.state), (whale.clone(), OpaState::Triggered));
    (whale, minority)
}

/// SC-03a (security review 2026-10): the first holder to cross 50% owned the
/// single OPA record forever, so anyone who took control later never had to
/// make an offer.
#[test]
fn a_new_controller_supersedes_a_stale_opa_record() {
    let f = setup();
    let (whale, minority) = whale_in_control(&f);
    let newcomer = investor(&f, 1_000_000);

    sell(&f, &whale, &newcomer, 450); // whale 250 (25%), newcomer 450 (45%)
    assert_eq!(f.client.get_opa_record().unwrap().acquirer, whale);
    sell(&f, &minority, &newcomer, 100); // newcomer 550 (55%)

    let rec = f.client.get_opa_record().unwrap();
    assert_eq!(rec.acquirer, newcomer);
    assert_eq!(rec.state, OpaState::Triggered);
}

/// SC-03a: at exactly 50/50 both "hold control"; the first record stands.
#[test]
fn a_tie_at_fifty_percent_keeps_the_existing_record() {
    let f = setup();
    let (whale, minority) = whale_in_control(&f);
    let other = investor(&f, 1_000_000);
    sell(&f, &whale, &other, 200); // whale 500
    sell(&f, &minority, &other, 300); // other 500
    assert_eq!(f.client.get_total_holding(&other), 500);
    assert_eq!(f.client.get_opa_record().unwrap().acquirer, whale);
}

/// SC-03b: units parked in open sale orders were invisible to the control
/// check, so a holder could cross 50% while showing only a small free balance.
#[test]
fn parking_units_in_orders_does_not_dodge_the_tender_offer() {
    let f = setup();
    let whale = fund_and_finalize(&f);
    let parker = investor(&f, 1_000_000);
    sell(&f, &whale, &parker, 450);
    // 400 of the 450 go into an order nobody will fill.
    f.client.place_order(&parker, &400, &(PRICE * 1_000));
    assert_eq!(f.client.get_rwa_balance(&parker), 50);
    assert!(f.client.get_opa_record().is_none());

    sell(&f, &whale, &parker, 100); // free 150, total 550 = 55%
    let rec = f.client.get_opa_record().expect("total holding must arm the OPA");
    assert_eq!(rec.acquirer, parker);
}

/// SC-03c: the vote suspension was only written when the acquirer's stake
/// grew again, so simply sitting on control kept the votes.
#[test]
fn an_acquirer_sitting_on_control_loses_votes_at_the_deadline() {
    let f = setup();
    let (whale, _) = whale_in_control(&f);
    assert!(f.client.has_votes(&whale));

    f.env
        .ledger()
        .set_timestamp(BIZ_TS + 31 * DAY + crate::opa::OPA_DEADLINE_SECONDS + 1);
    // Nothing was bought: the sanction is still reported...
    assert!(!f.client.has_votes(&whale));
    // ...and anyone can persist it.
    assert!(f.client.enforce_opa_deadline());
    assert_eq!(f.client.get_opa_record().unwrap().state, OpaState::SuspendedVotes);
    assert!(!f.client.enforce_opa_deadline());
}

/// SC-03c: an acquirer that sold below 50% before the deadline no longer owes
/// the offer, so no sanction applies.
#[test]
fn selling_below_control_before_the_deadline_avoids_the_sanction() {
    let f = setup();
    let (whale, _) = whale_in_control(&f);
    let other = investor(&f, 1_000_000);
    sell(&f, &whale, &other, 300); // whale 400, other 300, minority 300: nobody in control
    assert_eq!(f.client.get_opa_record().unwrap().acquirer, whale);
    f.env
        .ledger()
        .set_timestamp(BIZ_TS + 31 * DAY + crate::opa::OPA_DEADLINE_SECONDS + 1);
    assert!(f.client.has_votes(&whale));
    assert!(!f.client.enforce_opa_deadline());
}

/// SC-04: a squeeze-out by a later acquirer overwrote the record, and the new
/// acquirer could then reclaim the escrow the previous one had funded.
#[test]
fn a_new_acquirer_cannot_collect_someone_elses_opa_escrow() {
    let f = setup();
    let (whale, minority) = whale_in_control(&f);
    f.client.launch_opa(&whale, &PRICE);
    let escrow = f.client.get_opa_escrow();
    assert_eq!(escrow, 300 * PRICE);
    assert_eq!(f.client.get_opa_escrow_owner(), Some(whale.clone()));

    let buyer = investor(&f, 10_000_000);
    sell(&f, &whale, &buyer, 700);
    sell(&f, &minority, &buyer, 250); // buyer 950 = 95%
    assert_eq!(f.client.get_opa_record().unwrap().acquirer, buyer);

    let whale_before = balance(&f, &whale);
    f.client.execute_squeeze_out(&buyer, &PRICE);
    // The whale's escrow went back to the whale, not to the new acquirer.
    assert_eq!(balance(&f, &whale) - whale_before, escrow);
    assert_eq!(f.client.get_opa_escrow(), 0);
    assert!(f.client.try_reclaim_opa_escrow(&buyer).is_err());
}

/// SC-04: once the record moved on to a new controller, the previous
/// acquirer's offer is dead and its escrow is reclaimable right away.
#[test]
fn a_superseded_acquirer_reclaims_its_escrow_immediately() {
    let f = setup();
    let (whale, minority) = whale_in_control(&f);
    f.client.launch_opa(&whale, &PRICE);
    let escrow = f.client.get_opa_escrow();
    // While the whale's own offer is live, nothing can be reclaimed.
    assert!(f.client.try_reclaim_opa_escrow(&whale).is_err());

    let newcomer = investor(&f, 10_000_000);
    sell(&f, &whale, &newcomer, 450);
    sell(&f, &minority, &newcomer, 100);
    assert_eq!(f.client.get_opa_record().unwrap().acquirer, newcomer);
    assert!(f.client.try_reclaim_opa_escrow(&newcomer).is_err());

    let before = balance(&f, &whale);
    assert_eq!(f.client.reclaim_opa_escrow(&whale), escrow);
    assert_eq!(balance(&f, &whale) - before, escrow);
}

/// SC-08: after a squeeze-out the holder is paid for units in open orders;
/// cancelling those orders afterwards re-credited units that no longer exist.
#[test]
fn cancelling_after_a_squeeze_out_cannot_recreate_units() {
    let f = setup();
    let whale = investor(&f, 1_000_000);
    let minority = investor(&f, 1_000_000);
    f.client.contribute(&whale, &96_000);
    f.client.contribute(&minority, &4_000);
    f.env.ledger().set_timestamp(BIZ_TS + 31 * DAY);
    f.client.finalize();

    let order = f.client.place_order(&minority, &30, &(PRICE * 2));
    f.client.execute_squeeze_out(&whale, &PRICE);
    f.client.claim_squeeze_out(&minority);
    assert!(f.client.try_cancel_sale_order(&minority, &order).is_err());
    assert_eq!(f.client.get_total_holding(&minority), 0);
}

/// Info: `HighestPrice` was seeded with the initial price and never lowered,
/// so repricing down before any money came in left an inflated floor.
#[test]
fn repricing_before_funding_resets_the_equitable_floor() {
    let f = setup();
    f.client.set_price_per_unit(&f.admin, &(PRICE / 2));
    assert_eq!(f.client.get_equitable_price_floor(), PRICE / 2);
}

/// The stored admin stays readable (deploy scripts verify it on legacy
/// instances, which were initialized in a separate transaction).
#[test]
fn the_stored_admin_is_readable() {
    let f = setup();
    assert_eq!(f.client.get_admin(), f.admin);
}

/// SC-12: core persistent entries had no TTL extension and could archive
/// under an idle issuance.
#[test]
fn entry_points_keep_the_critical_state_alive() {
    use soroban_sdk::testutils::storage::Persistent as _;
    let f = setup();
    let whale = fund_and_finalize(&f);
    let minority = investor(&f, 1_000_000);
    sell(&f, &whale, &minority, 400);
    sell(&f, &minority, &whale, 100);
    f.client.launch_opa(&whale, &PRICE);

    let id = f.client.address.clone();
    let ttl = |key: &crate::DataKey| {
        f.env
            .as_contract(&id, || f.env.storage().persistent().get_ttl(key))
    };
    for (i, key) in [
        crate::DataKey::Admin,
        crate::DataKey::State,
        crate::DataKey::TotalRaised,
        crate::DataKey::TotalRwaMinted,
        crate::DataKey::PaymentToken,
        crate::DataKey::HighestPrice,
        crate::DataKey::OpaEscrow,
        crate::DataKey::OpaEscrowOwner,
    ]
    .iter()
    .enumerate()
    {
        let live = ttl(key);
        assert!(live > fractachain_core::BUMP_THRESHOLD, "TTL of key #{i} not extended: {live}");
    }
    let record_ttl = f
        .env
        .as_contract(&id, || f.env.storage().persistent().get_ttl(&crate::opa::OpaKey::Record));
    assert!(record_ttl > fractachain_core::BUMP_THRESHOLD);
}
