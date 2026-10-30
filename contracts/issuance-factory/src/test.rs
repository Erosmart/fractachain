#![cfg(test)]
extern crate std;

use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, symbol_short,
    testutils::EnvTestConfig,
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
    token::StellarAssetClient,
    vec, Address, Bytes, BytesN, ContractExecutable, Env, IntoVal, String, Symbol, Val, Vec,
};

use crate::{
    ForwardTerms, IssuanceFactoryContract, IssuanceFactoryContractClient, PaymentKind, ProductKind,
    StockTerms, WarrantTerms,
};

struct Fixture {
    env: Env,
    client: IssuanceFactoryContractClient<'static>,
    admin: Address,
    usdc: Address,
}

fn setup() -> Fixture {
    setup_in(Env::default())
}

fn setup_in(env: Env) -> Fixture {
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);

    let id = env.register(IssuanceFactoryContract, (&admin,));
    let client = IssuanceFactoryContractClient::new(&env, &id);
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

/// SC-06: the admin is set by the constructor, atomically with the deploy.
/// There is no `initialize` left to front-run, and the host refuses to run the
/// constructor a second time.
#[test]
fn the_constructor_cannot_be_run_again() {
    let f = setup();
    assert_eq!(f.client.get_admin(), f.admin);
    let attacker = Address::generate(&f.env);
    let again = f.env.try_invoke_contract::<(), soroban_sdk::Error>(
        &f.client.address,
        &Symbol::new(&f.env, "__constructor"),
        vec![&f.env, attacker.into_val(&f.env)],
    );
    assert!(again.is_err());
    assert_eq!(f.client.get_admin(), f.admin);
}

#[test]
fn products_are_indexed_by_address_and_registered_once() {
    let f = setup();
    let child = Address::generate(&f.env);
    let name = String::from_str(&f.env, "uno");
    let pid = f.client.register_product(
        &f.admin,
        &ProductKind::Licitacion,
        &child,
        &PaymentKind::Usdc,
        &0,
        &name,
    );
    assert_eq!(f.client.product_id_of(&child), Some(pid));
    assert_eq!(f.client.product_id_of(&Address::generate(&f.env)), None);
    assert!(f
        .client
        .try_register_product(&f.admin, &ProductKind::Licitacion, &child, &PaymentKind::Usdc, &0, &name)
        .is_err());
}

/* -------------------------------------------------------------------------- *
 * Typed deployers with the real product WASMs (SC-02 / SC-06).
 *
 * The WASMs are read at runtime from `contracts/target/wasm32v1-none/release`
 * (`npm run contracts:build`); without them these tests are skipped with a
 * notice, so a plain `cargo test` keeps working.
 * -------------------------------------------------------------------------- */

/// These tests embed whole WASMs in the ledger: no snapshot files (they would
/// churn with every build).
fn wasm_env() -> Env {
    Env::new_with_config(EnvTestConfig {
        capture_snapshot_at_drop: false,
    })
}

fn wasm_bytes(file: &str) -> Option<std::vec::Vec<u8>> {
    let path = std::format!(
        "{}/../target/wasm32v1-none/release/{}",
        env!("CARGO_MANIFEST_DIR"),
        file
    );
    let bytes = std::fs::read(&path).ok();
    if bytes.is_none() {
        std::eprintln!("skipping: {path} not built (npm run contracts:build)");
    }
    bytes
}

fn product_wasm(env: &Env, file: &str) -> Option<BytesN<32>> {
    wasm_bytes(file).map(|bytes| {
        env.deployer()
            .upload_contract_wasm(Bytes::from_slice(env, &bytes))
    })
}

fn stock_terms(env: &Env) -> StockTerms {
    StockTerms {
        ticker: symbol_short!("TDEMO"),
        company_name: String::from_str(env, "Demo SA"),
        isin: String::from_str(env, "ARDEMO000001"),
        custodian_cuit: String::from_str(env, "30700000000"),
    }
}

fn stock_ctor_args(env: &Env, custodian: &Address, oracle: &Address, registry: &Address, token: &Address) -> Vec<Val> {
    let t = stock_terms(env);
    (
        custodian.clone(),
        oracle.clone(),
        registry.clone(),
        token.clone(),
        t.ticker,
        t.company_name,
        t.isin,
        t.custodian_cuit,
    )
        .into_val(env)
}

fn view(env: &Env, contract: &Address, fn_name: &str) -> Address {
    env.invoke_contract(contract, &Symbol::new(env, fn_name), vec![env])
}

/// The factory deploys a stock vault bound to itself and registers it in the
/// same call. Only the admin signs: the vault's `registry.require_auth()` is
/// satisfied by the factory signing off the constructor itself — no mocked
/// contract auth involved.
#[test]
fn the_factory_deploys_and_registers_a_vault_bound_to_itself() {
    let env = wasm_env();
    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let oracle = Address::generate(&env);
    let Some(wasm) = product_wasm(&env, "stock_vault.wasm") else {
        return;
    };
    let factory = env.register(IssuanceFactoryContract, (&admin,));
    let client = IssuanceFactoryContractClient::new(&env, &factory);
    env.mock_all_auths();
    client.set_payment_asset(&admin, &PaymentKind::Usdc, &usdc);

    let salt = BytesN::from_array(&env, &[7; 32]);
    let predicted = env
        .deployer()
        .with_address(factory.clone(), salt.clone())
        .deployed_address();
    let name = String::from_str(&env, "TDEMO · Demo SA");
    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &factory,
            fn_name: "deploy_stock_vault",
            args: (
                &admin,
                &wasm,
                &salt,
                &admin,
                &oracle,
                PaymentKind::Usdc,
                stock_terms(&env),
                &name,
            )
                .into_val(&env),
            sub_invokes: &[MockAuthInvoke {
                contract: &predicted,
                fn_name: "__constructor",
                args: stock_ctor_args(&env, &admin, &oracle, &factory, &usdc),
                sub_invokes: &[],
            }],
        },
    }]);
    let vault = client.deploy_stock_vault(
        &admin,
        &wasm,
        &salt,
        &admin,
        &oracle,
        &PaymentKind::Usdc,
        &stock_terms(&env),
        &name,
    );
    assert_eq!(vault, predicted);
    let pid = client.product_id_of(&vault).expect("registered");
    let product = client.get_product(&pid);
    assert_eq!(product.kind, ProductKind::Stock);
    assert_eq!(product.contract_address, vault);
    assert_eq!(view(&env, &vault, "get_registry"), factory);
    assert_eq!(view(&env, &vault, "get_admin"), admin);
}

#[test]
fn deployers_only_use_configured_assets_and_need_the_admin() {
    let f = setup_in(wasm_env());
    let Some(wasm) = product_wasm(&f.env, "stock_vault.wasm") else {
        return;
    };
    let oracle = Address::generate(&f.env);
    let deploy = |admin: &Address, kind: PaymentKind, salt: u8| {
        f.client
            .try_deploy_stock_vault(
                admin,
                &wasm,
                &BytesN::from_array(&f.env, &[salt; 32]),
                &f.admin,
                &oracle,
                &kind,
                &stock_terms(&f.env),
                &String::from_str(&f.env, "x"),
            )
            .is_ok()
    };
    assert!(!deploy(&Address::generate(&f.env), PaymentKind::Usdc, 1));
    assert!(!deploy(&f.admin, PaymentKind::Usdt, 2), "unconfigured asset");
    assert!(deploy(&f.admin, PaymentKind::Usdc, 3));
}

/// A contract that deploys product WASMs on its own, naming whatever
/// registry it is told — what an attacker would run.
#[contract]
pub struct RogueDeployer;

#[contractimpl]
impl RogueDeployer {
    pub fn deploy(env: Env, wasm_hash: BytesN<32>, salt: BytesN<32>, args: Vec<Val>) -> Address {
        let deployer = env.deployer().with_current_contract(salt);
        // Signs off the constructor as itself — it can't sign for anyone else.
        env.authorize_as_current_contract(vec![
            &env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: deployer.deployed_address(),
                    fn_name: Symbol::new(&env, "__constructor"),
                    args: args.clone(),
                },
                sub_invocations: vec![&env],
            }),
        ]);
        deployer.deploy_contract(ContractExecutable::Wasm(wasm_hash), args)
    }
}

/// SC-02: a vault that names the platform factory as its registry can only be
/// deployed by the factory. The same deploy naming the rogue contract itself
/// succeeds (control), so the factory's missing consent is the only reason
/// the first one fails.
#[test]
fn nobody_else_can_deploy_a_vault_that_claims_the_factory() {
    let env = wasm_env();
    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let oracle = Address::generate(&env);
    let Some(wasm) = product_wasm(&env, "stock_vault.wasm") else {
        return;
    };
    let factory = env.register(IssuanceFactoryContract, (&admin,));
    let rogue = env.register(RogueDeployer, ());
    let rogue_client = RogueDeployerClient::new(&env, &rogue);
    let attacker = Address::generate(&env);

    // Only the attacker's own signature is available, never the factory's.
    let attempt = |registry: &Address, salt: u8| {
        let salt = BytesN::from_array(&env, &[salt; 32]);
        let predicted = env
            .deployer()
            .with_address(rogue.clone(), salt.clone())
            .deployed_address();
        let ctor = stock_ctor_args(&env, &attacker, &oracle, registry, &usdc);
        env.mock_auths(&[MockAuth {
            address: &attacker,
            invoke: &MockAuthInvoke {
                contract: &predicted,
                fn_name: "__constructor",
                args: ctor.clone(),
                sub_invokes: &[],
            },
        }]);
        rogue_client.try_deploy(&wasm, &salt, &ctor).is_ok()
    };
    assert!(!attempt(&factory, 1), "a vault claiming the factory was deployed without it");
    assert!(attempt(&rogue, 2), "control: the rogue contract can only bind vaults to itself");
}

/// Forward and warrant deploy through the factory too, with their own
/// counterparties' signatures (escrow and attestation run in the constructor),
/// and the warrantera has to be accredited first.
#[test]
fn the_factory_deploys_forwards_and_warrants() {
    let env = wasm_env();
    env.ledger().set_timestamp(1_000);
    let admin = Address::generate(&env);
    let (Some(forward_wasm), Some(warrant_wasm)) = (
        product_wasm(&env, "forward_contract.wasm"),
        product_wasm(&env, "warrant_vault.wasm"),
    ) else {
        return;
    };
    let factory = env.register(IssuanceFactoryContract, (&admin,));
    let client = IssuanceFactoryContractClient::new(&env, &factory);
    // Producer, buyer and warrantera authorize the constructor, below the
    // admin's root call.
    env.mock_all_auths_allowing_non_root_auth();
    let xlm = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();
    client.set_payment_asset(&admin, &PaymentKind::Xlm, &xlm);
    let (producer, buyer, arbiter, warrantera) = (
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
    );
    StellarAssetClient::new(&env, &xlm).mint(&buyer, &1_000_000);

    let forward = client.deploy_forward(
        &admin,
        &forward_wasm,
        &BytesN::from_array(&env, &[3; 32]),
        &producer,
        &buyer,
        &arbiter,
        &PaymentKind::Xlm,
        &ForwardTerms {
            crop_name: String::from_str(&env, "Soja"),
            total_kilos: 10,
            price_per_kilo: 100,
            harvest_deadline: 1_000 + 90 * 86_400,
        },
        &String::from_str(&env, "Forward soja"),
    );
    assert_eq!(view(&env, &forward, "get_registry"), factory);
    assert_eq!(client.get_product(&client.product_id_of(&forward).unwrap()).price_per_unit, 100);

    let terms = WarrantTerms {
        pogr_cert_hash: BytesN::from_array(&env, &[2; 32]),
        inventory_value: 1_000_000,
        ltv_bps: 5_000,
        interest_rate_bps: 1_000,
        duration_days: 90,
    };
    let warrant = |salt: u8| {
        client.try_deploy_warrant(
            &admin,
            &warrant_wasm,
            &BytesN::from_array(&env, &[salt; 32]),
            &producer,
            &warrantera,
            &PaymentKind::Xlm,
            &terms,
            &String::from_str(&env, "Warrant soja"),
        )
    };
    assert!(warrant(4).is_err(), "warrantera not accredited yet");
    client.set_warrantera(&admin, &warrantera, &true);
    let vault = warrant(5).unwrap().unwrap();
    assert_eq!(view(&env, &vault, "get_registry"), factory);
    assert_eq!(view(&env, &vault, "get_producer"), producer);
    assert_eq!(client.get_product_count(), 2);
}
