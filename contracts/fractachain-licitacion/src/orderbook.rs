use soroban_sdk::{contracttype, Address, Env};
use crate::kyc::is_investor_verified;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Order {
    pub order_id: u64,
    pub seller: Address,
    pub amount_rwa: i128,
    pub price_per_unit_usdc: i128,
    pub is_active: bool,
    pub created_at: u64,
}

#[contracttype]
pub enum OrderbookKey {
    Order(u64),
    OrderCount,
}

pub fn get_order_count(env: &Env) -> u64 {
    env.storage()
        .persistent()
        .get(&OrderbookKey::OrderCount)
        .unwrap_or(0)
}

pub fn set_order_count(env: &Env, count: u64) {
    env.storage()
        .persistent()
        .set(&OrderbookKey::OrderCount, &count);
}

pub fn get_order(env: &Env, order_id: u64) -> Option<Order> {
    env.storage()
        .persistent()
        .get(&OrderbookKey::Order(order_id))
}

pub fn create_order(
    env: &Env,
    seller: &Address,
    amount_rwa: i128,
    price_per_unit: i128,
) -> u64 {
    seller.require_auth();
    if !is_investor_verified(env, seller) {
        panic!("Seller is not verified via KYC");
    }
    fractachain_core::require_positive(amount_rwa);
    fractachain_core::require_positive(price_per_unit);

    let next_id = get_order_count(env) + 1;
    let order = Order {
        order_id: next_id,
        seller: seller.clone(),
        amount_rwa,
        price_per_unit_usdc: price_per_unit,
        is_active: true,
        created_at: env.ledger().timestamp(),
    };

    env.storage()
        .persistent()
        .set(&OrderbookKey::Order(next_id), &order);
    set_order_count(env, next_id);
    // An order holds escrowed RWA, so its entry must not archive out from
    // under the seller before it is filled or cancelled.
    env.storage().persistent().extend_ttl(
        &OrderbookKey::Order(next_id),
        fractachain_core::BUMP_THRESHOLD,
        fractachain_core::BUMP_TO,
    );
    env.storage().persistent().extend_ttl(
        &OrderbookKey::OrderCount,
        fractachain_core::BUMP_THRESHOLD,
        fractachain_core::BUMP_TO,
    );

    next_id
}

pub fn cancel_order(env: &Env, seller: &Address, order_id: u64) {
    seller.require_auth();
    let mut order = get_order(env, order_id).expect("Order does not exist");
    if order.seller != *seller {
        panic!("Not order owner");
    }
    if !order.is_active {
        panic!("Order not active");
    }

    order.is_active = false;
    env.storage()
        .persistent()
        .set(&OrderbookKey::Order(order_id), &order);
}
