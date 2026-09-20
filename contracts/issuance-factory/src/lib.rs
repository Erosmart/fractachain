#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Env, String, Symbol,
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

#[contracttype]
pub enum FactoryKey {
    Admin,
    PaymentAsset(PaymentKind),
    ProductCount,
    Product(u64),
    /// Accredited collateral attestors (warranteras). A `warrant-vault` refuses
    /// to initialize unless its oracle is allowlisted here, so a producer cannot
    /// attest their own grain.
    Warrantera(Address),
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

#[contractimpl]
impl IssuanceFactoryContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&FactoryKey::Admin) {
            panic!("Already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&FactoryKey::Admin, &admin);
        env.storage().persistent().set(&FactoryKey::ProductCount, &0u64);
        bump_instance(&env);
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

    /// Register a newly deployed product. Price can be 0 and set later via `set_product_price`.
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
        if price_per_unit < 0 {
            panic!("Price cannot be negative");
        }
        let token: Address = env
            .storage()
            .instance()
            .get(&FactoryKey::PaymentAsset(payment_kind))
            .unwrap_or_else(|| panic!("Payment asset not configured"));

        let id: u64 = env
            .storage()
            .persistent()
            .get(&FactoryKey::ProductCount)
            .unwrap_or(0)
            + 1;
        let product = Product {
            id,
            kind,
            contract_address,
            payment_kind,
            payment_token: token,
            price_per_unit,
            name,
            active: true,
        };
        env.storage().persistent().set(&FactoryKey::Product(id), &product);
        env.storage().persistent().set(&FactoryKey::ProductCount, &id);
        bump_persistent(&env, &FactoryKey::Product(id));
        bump_persistent(&env, &FactoryKey::ProductCount);
        env.events()
            .publish((Symbol::new(&env, "register"), id), product.name.clone());
        id
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
