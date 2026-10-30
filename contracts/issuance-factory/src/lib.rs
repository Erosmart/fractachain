#![no_std]
use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, contracttype, vec, Address, BytesN, ContractExecutable, Env, IntoVal,
    String, Symbol, Val, Vec,
};
use fractachain_core::{bump_instance, bump_persistent, require_positive};

/// Admin registry: allow XLM / USDC / USDT SACs and bind each new product instance.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProductKind {
    Licitacion = 0,
    Forward = 1,
    Warrant = 2,
    Stock = 3,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PaymentKind {
    Xlm = 0,
    Usdc = 1,
    Usdt = 2,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Product {
    pub id: u64,
    pub kind: ProductKind,
    pub contract_address: Address,
    pub payment_kind: PaymentKind,
    pub payment_token: Address,
    pub price_per_unit: i128,
    pub name: String,
    pub active: bool,
}

/// Stock-vault terms for `deploy_stock_vault`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StockTerms {
    pub ticker: Symbol,
    pub company_name: String,
    pub isin: String,
    pub custodian_cuit: String,
}

/// Forward terms for `deploy_forward`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ForwardTerms {
    pub crop_name: String,
    pub total_kilos: i128,
    pub price_per_kilo: i128,
    pub harvest_deadline: u64,
}

/// Warrant terms for `deploy_warrant`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WarrantTerms {
    pub pogr_cert_hash: BytesN<32>,
    pub inventory_value: i128,
    pub ltv_bps: u32,
    pub interest_rate_bps: u32,
    pub duration_days: u64,
}

#[contracttype]
pub enum FactoryKey {
    Admin,
    PaymentAsset(PaymentKind),
    ProductCount,
    Product(u64),
    /// Accredited collateral attestors (warranteras). `deploy_warrant` refuses
    /// a vault whose oracle is not allowlisted here, so a producer cannot
    /// attest their own grain.
    Warrantera(Address),
    /// Reverse index: product contract → product id.
    ProductOf(Address),
}

#[contract]
pub struct IssuanceFactoryContract;

fn require_admin(env: &Env, admin: &Address) {
    let stored: Address = env.storage().instance().get(&FactoryKey::Admin).unwrap();
    if admin != &stored {
        panic!("Unauthorized admin");
    }
    admin.require_auth();
}

fn register(
    env: &Env,
    kind: ProductKind,
    contract_address: Address,
    payment_kind: PaymentKind,
    price_per_unit: i128,
    name: String,
) -> u64 {
    if price_per_unit < 0 {
        panic!("Price cannot be negative");
    }
    if env
        .storage()
        .persistent()
        .has(&FactoryKey::ProductOf(contract_address.clone()))
    {
        panic!("Product already registered");
    }
    let token = configured_asset(env, payment_kind);

    let id: u64 = env
        .storage()
        .persistent()
        .get(&FactoryKey::ProductCount)
        .unwrap_or(0)
        + 1;
    let product = Product {
        id,
        kind,
        contract_address: contract_address.clone(),
        payment_kind,
        payment_token: token,
        price_per_unit,
        name,
        active: true,
    };
    env.storage().persistent().set(&FactoryKey::Product(id), &product);
    env.storage().persistent().set(&FactoryKey::ProductCount, &id);
    env.storage()
        .persistent()
        .set(&FactoryKey::ProductOf(contract_address.clone()), &id);
    bump_persistent(env, &FactoryKey::Product(id));
    bump_persistent(env, &FactoryKey::ProductCount);
    bump_persistent(env, &FactoryKey::ProductOf(contract_address));
    env.events()
        .publish((Symbol::new(env, "register"), id), product.name.clone());
    id
}

fn configured_asset(env: &Env, kind: PaymentKind) -> Address {
    env.storage()
        .instance()
        .get(&FactoryKey::PaymentAsset(kind))
        .unwrap_or_else(|| panic!("Payment asset not configured"))
}

/// Deploys `wasm_hash` with `args` and registers it, signing off the
/// constructor call as this contract.
///
/// SC-02: registry-bound products call `registry.require_auth()` in their
/// constructor. A contract authorizes only what it explicitly signs off while
/// executing, and the factory signs off exactly this constructor call, under
/// its admin's signature, after vetting the arguments. So an instance whose
/// `get_registry()` is this factory was deployed by it with vetted terms.
/// (The constructor cannot call back into the factory to check them: Soroban
/// forbids re-entry.)
#[allow(clippy::too_many_arguments)]
fn deploy_and_register(
    env: &Env,
    kind: ProductKind,
    wasm_hash: BytesN<32>,
    salt: BytesN<32>,
    args: Vec<Val>,
    payment_kind: PaymentKind,
    price_per_unit: i128,
    name: String,
) -> Address {
    bump_instance(env);
    let deployer = env.deployer().with_current_contract(salt);
    let address = deployer.deployed_address();
    env.authorize_as_current_contract(vec![
        env,
        InvokerContractAuthEntry::Contract(SubContractInvocation {
            context: ContractContext {
                contract: address.clone(),
                fn_name: Symbol::new(env, "__constructor"),
                args: args.clone(),
            },
            sub_invocations: vec![env],
        }),
    ]);
    let deployed = deployer.deploy_contract(ContractExecutable::Wasm(wasm_hash), args);
    if deployed != address {
        panic!("Unexpected deployed address");
    }
    let id = register(env, kind, address.clone(), payment_kind, price_per_unit, name);
    env.events()
        .publish((Symbol::new(env, "deploy"), id), address.clone());
    address
}

#[contractimpl]
impl IssuanceFactoryContract {
    /// Runs once, atomically with the deploy (SC-06: a separate `initialize`
    /// could be front-run to seize the registry).
    pub fn __constructor(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&FactoryKey::Admin, &admin);
        env.storage().persistent().set(&FactoryKey::ProductCount, &0u64);
        bump_instance(&env);
        bump_persistent(&env, &FactoryKey::ProductCount);
    }

    /// Deploys a `stock-vault` bound to this registry, paid in the configured
    /// `payment_kind` asset, and registers it.
    #[allow(clippy::too_many_arguments)]
    pub fn deploy_stock_vault(
        env: Env,
        admin: Address,
        wasm_hash: BytesN<32>,
        salt: BytesN<32>,
        custodian: Address,
        por_oracle: Address,
        payment_kind: PaymentKind,
        terms: StockTerms,
        name: String,
    ) -> Address {
        require_admin(&env, &admin);
        let token = configured_asset(&env, payment_kind);
        let args = (
            custodian,
            por_oracle,
            env.current_contract_address(),
            token,
            terms.ticker,
            terms.company_name,
            terms.isin,
            terms.custodian_cuit,
        )
            .into_val(&env);
        deploy_and_register(&env, ProductKind::Stock, wasm_hash, salt, args, payment_kind, 0, name)
    }

    /// Deploys a `forward-contract` bound to this registry. Producer and buyer
    /// authorize the constructor (it escrows the buyer's payment).
    #[allow(clippy::too_many_arguments)]
    pub fn deploy_forward(
        env: Env,
        admin: Address,
        wasm_hash: BytesN<32>,
        salt: BytesN<32>,
        producer: Address,
        buyer: Address,
        arbiter: Address,
        payment_kind: PaymentKind,
        terms: ForwardTerms,
        name: String,
    ) -> Address {
        require_admin(&env, &admin);
        let token = configured_asset(&env, payment_kind);
        let price = terms.price_per_kilo;
        let args = (
            env.current_contract_address(),
            producer,
            buyer,
            arbiter,
            token,
            terms.crop_name,
            terms.total_kilos,
            terms.price_per_kilo,
            terms.harvest_deadline,
        )
            .into_val(&env);
        deploy_and_register(&env, ProductKind::Forward, wasm_hash, salt, args, payment_kind, price, name)
    }

    /// Deploys a `warrant-vault` bound to this registry. The attesting
    /// warrantera must be accredited here; producer and warrantera authorize
    /// the constructor.
    #[allow(clippy::too_many_arguments)]
    pub fn deploy_warrant(
        env: Env,
        admin: Address,
        wasm_hash: BytesN<32>,
        salt: BytesN<32>,
        producer: Address,
        oracle_warrantera: Address,
        payment_kind: PaymentKind,
        terms: WarrantTerms,
        name: String,
    ) -> Address {
        require_admin(&env, &admin);
        if !Self::is_warrantera(env.clone(), oracle_warrantera.clone()) {
            panic!("Warrantera not accredited");
        }
        let token = configured_asset(&env, payment_kind);
        let args = (
            env.current_contract_address(),
            producer,
            oracle_warrantera,
            token,
            terms.pogr_cert_hash,
            terms.inventory_value,
            terms.ltv_bps,
            terms.interest_rate_bps,
            terms.duration_days,
        )
            .into_val(&env);
        deploy_and_register(&env, ProductKind::Warrant, wasm_hash, salt, args, payment_kind, 0, name)
    }

    /// Hand the registry to a new admin. Without this, a lost key is terminal:
    /// payment assets and the warrantera allowlist would freeze permanently.
    pub fn transfer_admin(env: Env, admin: Address, new_admin: Address) {
        require_admin(&env, &admin);
        new_admin.require_auth();
        env.storage().instance().set(&FactoryKey::Admin, &new_admin);
        bump_instance(&env);
        env.events()
            .publish((Symbol::new(&env, "admin"), admin), new_admin);
    }

    pub fn get_admin(env: Env) -> Address {
        env.storage().instance().get(&FactoryKey::Admin).unwrap()
    }

    /// Map XLM / USDC / USDT to the SAC (or native wrapper) used on this network.
    pub fn set_payment_asset(env: Env, admin: Address, kind: PaymentKind, token: Address) {
        require_admin(&env, &admin);
        bump_instance(&env);
        let previous: Option<Address> = env
            .storage()
            .instance()
            .get(&FactoryKey::PaymentAsset(kind));
        env.storage()
            .instance()
            .set(&FactoryKey::PaymentAsset(kind), &token);
        // `kind` belongs in the topic: without it an indexer cannot tell which
        // of the three assets was rebound.
        env.events()
            .publish((Symbol::new(&env, "payment_asset"), kind), (previous, token));
    }

    pub fn get_payment_asset(env: Env, kind: PaymentKind) -> Address {
        env.storage()
            .instance()
            .get(&FactoryKey::PaymentAsset(kind))
            .unwrap_or_else(|| panic!("Payment asset not configured"))
    }

    /// True when `token` is one of the three configured SACs. Product contracts
    /// call this so a caller cannot slip in a look-alike token whose `transfer`
    /// is a no-op.
    pub fn is_payment_asset(env: Env, token: Address) -> bool {
        for kind in [PaymentKind::Xlm, PaymentKind::Usdc, PaymentKind::Usdt] {
            let configured: Option<Address> =
                env.storage().instance().get(&FactoryKey::PaymentAsset(kind));
            if configured == Some(token.clone()) {
                return true;
            }
        }
        false
    }

    /// Accredit (or revoke) a warrantera allowed to attest collateral.
    pub fn set_warrantera(env: Env, admin: Address, who: Address, allowed: bool) {
        require_admin(&env, &admin);
        bump_instance(&env);
        env.storage()
            .persistent()
            .set(&FactoryKey::Warrantera(who.clone()), &allowed);
        bump_persistent(&env, &FactoryKey::Warrantera(who.clone()));
        env.events()
            .publish((Symbol::new(&env, "warrantera"), who), allowed);
    }

    pub fn is_warrantera(env: Env, who: Address) -> bool {
        env.storage()
            .persistent()
            .get(&FactoryKey::Warrantera(who))
            .unwrap_or(false)
    }

    /// Register a product deployed elsewhere (e.g. a licitación deployed by its
    /// own admin). Price can be 0 and set later via `set_product_price`.
    pub fn register_product(
        env: Env,
        admin: Address,
        kind: ProductKind,
        contract_address: Address,
        payment_kind: PaymentKind,
        price_per_unit: i128,
        name: String,
    ) -> u64 {
        require_admin(&env, &admin);
        register(&env, kind, contract_address, payment_kind, price_per_unit, name)
    }

    /// Product id of a registered contract, if any. Integrators use it to
    /// tell platform instances from look-alikes.
    pub fn product_id_of(env: Env, contract_address: Address) -> Option<u64> {
        env.storage()
            .persistent()
            .get(&FactoryKey::ProductOf(contract_address))
    }

    pub fn set_product_price(env: Env, admin: Address, product_id: u64, price_per_unit: i128) {
        require_admin(&env, &admin);
        require_positive(price_per_unit);
        let mut product: Product = env
            .storage()
            .persistent()
            .get(&FactoryKey::Product(product_id))
            .unwrap_or_else(|| panic!("Unknown product"));
        product.price_per_unit = price_per_unit;
        env.storage()
            .persistent()
            .set(&FactoryKey::Product(product_id), &product);
        bump_persistent(&env, &FactoryKey::Product(product_id));
        env.events()
            .publish((Symbol::new(&env, "price"), product_id), price_per_unit);
    }

    pub fn set_product_active(env: Env, admin: Address, product_id: u64, active: bool) {
        require_admin(&env, &admin);
        let mut product: Product = env
            .storage()
            .persistent()
            .get(&FactoryKey::Product(product_id))
            .unwrap_or_else(|| panic!("Unknown product"));
        product.active = active;
        env.storage()
            .persistent()
            .set(&FactoryKey::Product(product_id), &product);
        bump_persistent(&env, &FactoryKey::Product(product_id));
        env.events()
            .publish((Symbol::new(&env, "active"), product_id), active);
    }

    /// Renew a product entry's TTL. Unprivileged on purpose: it mutates no
    /// state, so anyone can pay to keep the registry from archiving.
    pub fn touch_product(env: Env, product_id: u64) {
        if !env
            .storage()
            .persistent()
            .has(&FactoryKey::Product(product_id))
        {
            panic!("Unknown product");
        }
        bump_persistent(&env, &FactoryKey::Product(product_id));
        bump_persistent(&env, &FactoryKey::ProductCount);
        bump_instance(&env);
    }

    /// False when a `set_payment_asset` rotation left this product pinned to a
    /// stale SAC, so the frontend can surface the divergence.
    pub fn product_token_is_current(env: Env, product_id: u64) -> bool {
        let product: Product = env
            .storage()
            .persistent()
            .get(&FactoryKey::Product(product_id))
            .unwrap_or_else(|| panic!("Unknown product"));
        env.storage()
            .instance()
            .get::<_, Address>(&FactoryKey::PaymentAsset(product.payment_kind))
            .map_or(false, |current| current == product.payment_token)
    }

    pub fn get_product(env: Env, product_id: u64) -> Product {
        env.storage()
            .persistent()
            .get(&FactoryKey::Product(product_id))
            .unwrap_or_else(|| panic!("Unknown product"))
    }

    pub fn get_product_count(env: Env) -> u64 {
        env.storage()
            .persistent()
            .get(&FactoryKey::ProductCount)
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod test;
