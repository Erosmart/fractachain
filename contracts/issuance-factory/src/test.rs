#![cfg(test)]
extern crate std;

use soroban_sdk::{testutils::Address as _, Address, Env, String};

use crate::{IssuanceFactoryContract, IssuanceFactoryContractClient, PaymentKind, ProductKind};

struct Fixture {
    env: Env,
    client: IssuanceFactoryContractClient<'static>,
    admin: Address,
    usdc: Address,
}

fn setup() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);

    let id = env.register(IssuanceFactoryContract, ());
    let client = IssuanceFactoryContractClient::new(&env, &id);
    client.initialize(&admin);
    client.set_payment_asset(&admin, &PaymentKind::Usdc, &usdc);

    Fixture {
        env,
        client,
        admin,
        usdc,
    }
}

fn register(f: &Fixture, name: &str) -> u64 {
    let child = Address::generate(&f.env);
    f.client.register_product(
        &f.admin,
        &ProductKind::Licitacion,
        &child,
        &PaymentKind::Usdc,
        &0,
        &String::from_str(&f.env, name),
    )
}

#[test]
fn admin_registers_product_with_usdc() {
    let f = setup();
    let pid = register(&f, "Campana Soja");
    assert_eq!(pid, 1);

    f.client.set_product_price(&f.admin, &pid, &1_000_0000);
    let p = f.client.get_product(&pid);
    assert_eq!(p.price_per_unit, 1_000_0000);
    assert_eq!(p.payment_token, f.usdc);
    assert!(p.active);
}

#[test]
fn product_ids_increment() {
    let f = setup();
    assert_eq!(register(&f, "uno"), 1);
    assert_eq!(register(&f, "dos"), 2);
    assert_eq!(f.client.get_product_count(), 2);
}

#[test]
fn a_non_admin_cannot_administer_the_registry() {
    let f = setup();
    let stranger = Address::generate(&f.env);
    let token = Address::generate(&f.env);
    let child = Address::generate(&f.env);

    assert!(f
        .client
        .try_set_payment_asset(&stranger, &PaymentKind::Xlm, &token)
        .is_err());
    assert!(f
        .client
        .try_register_product(
            &stranger,
            &ProductKind::Forward,
            &child,
            &PaymentKind::Usdc,
            &0,
            &String::from_str(&f.env, "x"),
        )
        .is_err());
}

#[test]
fn registering_against_an_unconfigured_asset_is_rejected() {
    let f = setup();
    let child = Address::generate(&f.env);
    // USDT was never mapped to a SAC.
    assert!(f
        .client
        .try_register_product(
            &f.admin,
            &ProductKind::Stock,
            &child,
            &PaymentKind::Usdt,
            &0,
            &String::from_str(&f.env, "GGAL"),
        )
        .is_err());
}

#[test]
fn unknown_products_and_assets_are_rejected() {
    let f = setup();
    assert!(f.client.try_get_product(&99).is_err());
    assert!(f.client.try_get_payment_asset(&PaymentKind::Usdt).is_err());
    assert!(f.client.try_touch_product(&99).is_err());
}

#[test]
fn products_can_be_deactivated() {
    let f = setup();
    let pid = register(&f, "uno");
    f.client.set_product_active(&f.admin, &pid, &false);
    assert!(!f.client.get_product(&pid).active);
    f.client.set_product_active(&f.admin, &pid, &true);
    assert!(f.client.get_product(&pid).active);
}

#[test]
fn negative_prices_are_rejected() {
    let f = setup();
    let pid = register(&f, "uno");
    assert!(f.client.try_set_product_price(&f.admin, &pid, &-1).is_err());
    let child = Address::generate(&f.env);
    assert!(f
        .client
        .try_register_product(
            &f.admin,
            &ProductKind::Forward,
            &child,
            &PaymentKind::Usdc,
            &-5,
            &String::from_str(&f.env, "neg"),
        )
        .is_err());
}

/// M-04 support: product contracts rely on this to reject look-alike tokens.
#[test]
fn only_configured_sacs_count_as_payment_assets() {
    let f = setup();
    assert!(f.client.is_payment_asset(&f.usdc));

    let impostor = Address::generate(&f.env);
    assert!(!f.client.is_payment_asset(&impostor));

    let xlm = Address::generate(&f.env);
    f.client.set_payment_asset(&f.admin, &PaymentKind::Xlm, &xlm);
    assert!(f.client.is_payment_asset(&xlm));
}

/// A-03 support: `warrant-vault` refuses to initialize unless its oracle is
/// accredited here, which is what stops a producer attesting their own grain.
#[test]
fn warranteras_must_be_accredited_and_can_be_revoked() {
    let f = setup();
    let warrantera = Address::generate(&f.env);
    assert!(!f.client.is_warrantera(&warrantera));

    f.client.set_warrantera(&f.admin, &warrantera, &true);
    assert!(f.client.is_warrantera(&warrantera));

    f.client.set_warrantera(&f.admin, &warrantera, &false);
    assert!(!f.client.is_warrantera(&warrantera));
}

#[test]
fn a_non_admin_cannot_accredit_a_warrantera() {
    let f = setup();
    let stranger = Address::generate(&f.env);
    let warrantera = Address::generate(&f.env);
    assert!(f
        .client
        .try_set_warrantera(&stranger, &warrantera, &true)
        .is_err());
}

/// I-02 regression: a lost admin key used to be terminal for the registry.
#[test]
fn admin_can_be_rotated() {
    let f = setup();
    let next = Address::generate(&f.env);
    f.client.transfer_admin(&f.admin, &next);
    assert_eq!(f.client.get_admin(), next);

    // The old admin loses control immediately.
    let token = Address::generate(&f.env);
    assert!(f
        .client
        .try_set_payment_asset(&f.admin, &PaymentKind::Xlm, &token)
        .is_err());
    f.client.set_payment_asset(&next, &PaymentKind::Xlm, &token);
}

/// B-05 regression: rotating a SAC silently left existing products pinned to
/// the old address with no way to notice.
#[test]
fn rotating_a_sac_flags_products_pinned_to_the_old_one() {
    let f = setup();
    let pid = register(&f, "uno");
    assert!(f.client.product_token_is_current(&pid));

    let new_usdc = Address::generate(&f.env);
    f.client
        .set_payment_asset(&f.admin, &PaymentKind::Usdc, &new_usdc);

    assert!(!f.client.product_token_is_current(&pid));
    assert_eq!(f.client.get_product(&pid).payment_token, f.usdc);
    assert_eq!(f.client.get_payment_asset(&PaymentKind::Usdc), new_usdc);
}

#[test]
#[should_panic(expected = "Already initialized")]
fn double_initialization_is_rejected() {
    let f = setup();
    f.client.initialize(&f.admin);
}
