#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, Address, BytesN, Env, String, Symbol,
};

pub mod kyc;
pub mod opa;
pub mod orderbook;

use fractachain_core::{require_divisible, require_positive, token_client, bump_instance};
use kyc::{
    is_investor_verified, revoke_investor as kyc_revoke, verify_investor as kyc_verify, InvestorType,
};
use opa::{
    check_control_threshold, get_record, require_can_launch_opa, set_record, OpaRecord, OpaState,
    SQUEEZE_OUT_THRESHOLD_BPS,
};
use orderbook::{
    cancel_order as ob_cancel_order, create_order as ob_create_order, get_order, Order,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LegalInfo {
    pub fideicomiso_hash: BytesN<32>,
    pub cnv_record_id: String,
    pub legal_terms_uri: String,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum State {
    Open = 0,
    Successful = 1,
    Failed = 2,
    Terminated = 3,
}

#[contracttype]
pub enum DataKey {
    Admin,
    /// Trust account that receives the proceeds of a successful issuance.
    Fiduciary,
    PaymentToken,
    SoftCap,
    HardCap,
    Deadline,
    PricePerUnit,
    TotalRaised,
    TotalRwaMinted,
    State,
    LegalInfo,
    Contribution(Address),
    RwaBalance(Address),
    Allocated(Address),
    SqueezePrice,
    /// One-shot guard so the proceeds cannot be withdrawn twice.
    ProceedsWithdrawn,
    /// RWA locked in the holder's open sale orders. Counted in
    /// `TotalRwaMinted` but absent from `RwaBalance`, so a buyout has to add it
    /// back or the holder is paid for less than they own.
    OrderEscrow(Address),
    /// Funds the acquirer locked up when launching a tender offer.
    OpaEscrow,
    /// Highest price per unit seen on-chain, used as the equitable-price floor
    /// for a squeeze-out (Art. 88).
    HighestPrice,
}

#[contract]
pub struct FractachainLicitacionContract;

fn require_admin(env: &Env, admin: &Address) {
    let stored: Address = env.storage().persistent().get(&DataKey::Admin).unwrap();
    if admin != &stored {
        panic!("Unauthorized admin");
    }
    admin.require_auth();
}

fn payment_token(env: &Env) -> Address {
    env.storage().persistent().get(&DataKey::PaymentToken).unwrap()
}

/// Gate for every path that puts tokens **into** an account.
///
/// The rule is deliberately one-directional: acquiring the security requires
/// live KYC, but returning value never does. Gating a refund, a squeeze-out
/// payout, or an exit on an expired KYC would not enforce compliance, it would
/// confiscate — the holder was approved when they bought, and they are giving
/// the token up, not taking one on.
///
/// On the Stellar side this same rule is enforced by the protocol: the token is
/// issued with `AUTH_REQUIRED`, so an account the issuer has not authorized
/// cannot hold, receive, or place offers for it at all.
fn require_kyc_to_receive(env: &Env, who: &Address) {
    if !is_investor_verified(env, who) {
        panic!("Recipient KYC not verified or expired");
    }
}

fn rwa_balance(env: &Env, user: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::RwaBalance(user.clone()))
        .unwrap_or(0)
}

fn set_rwa_balance(env: &Env, user: &Address, amount: i128) {
    env.storage()
        .persistent()
        .set(&DataKey::RwaBalance(user.clone()), &amount);
    env.storage().persistent().extend_ttl(
        &DataKey::RwaBalance(user.clone()),
        fractachain_core::BUMP_THRESHOLD,
        fractachain_core::BUMP_TO,
    );
}

fn order_escrow(env: &Env, user: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::OrderEscrow(user.clone()))
        .unwrap_or(0)
}

fn set_order_escrow(env: &Env, user: &Address, amount: i128) {
    env.storage()
        .persistent()
        .set(&DataKey::OrderEscrow(user.clone()), &amount);
    env.storage().persistent().extend_ttl(
        &DataKey::OrderEscrow(user.clone()),
        fractachain_core::BUMP_THRESHOLD,
        fractachain_core::BUMP_TO,
    );
}

/// Total RWA attributable to a holder: free balance plus whatever is sitting in
/// their open sale orders.
fn total_holding(env: &Env, user: &Address) -> i128 {
    rwa_balance(env, user) + order_escrow(env, user)
}

fn set_contribution(env: &Env, user: &Address, amount: i128) {
    env.storage()
        .persistent()
        .set(&DataKey::Contribution(user.clone()), &amount);
    // Without this the entry can archive before a failed issuance is refunded,
    // stranding the contributor's claim.
    env.storage().persistent().extend_ttl(
        &DataKey::Contribution(user.clone()),
        fractachain_core::BUMP_THRESHOLD,
        fractachain_core::BUMP_TO,
    );
}

/// Tracks the highest observed unit price, which floors the squeeze-out price.
fn record_price(env: &Env, price: i128) {
    let highest: i128 = env
        .storage()
        .persistent()
        .get(&DataKey::HighestPrice)
        .unwrap_or(0);
    if price > highest {
        env.storage().persistent().set(&DataKey::HighestPrice, &price);
    }
}

fn equitable_price_floor(env: &Env) -> i128 {
    let primary: i128 = env.storage().persistent().get(&DataKey::PricePerUnit).unwrap();
    let highest: i128 = env
        .storage()
        .persistent()
        .get(&DataKey::HighestPrice)
        .unwrap_or(0);
    let opa_price = get_record(env).map(|r| r.price_per_share).unwrap_or(0);
    primary.max(highest).max(opa_price)
}

/// Pays the raise to the company wallet configured at initialize.
///
/// Called from `finalize` on success so the issuer does not depend on a
/// second admin transaction to actually receive the money. `withdraw_proceeds`
/// remains as a recovery path if that transfer was interrupted.
fn payout_proceeds(env: &Env) -> i128 {
    let withdrawn: bool = env
        .storage()
        .persistent()
        .get(&DataKey::ProceedsWithdrawn)
        .unwrap_or(false);
    if withdrawn {
        return 0;
    }
    let amount: i128 = env.storage().persistent().get(&DataKey::TotalRaised).unwrap();
    if amount <= 0 {
        env.storage().persistent().set(&DataKey::ProceedsWithdrawn, &true);
        return 0;
    }
    let fiduciary: Address = env.storage().persistent().get(&DataKey::Fiduciary).unwrap();
    env.storage().persistent().set(&DataKey::ProceedsWithdrawn, &true);
    token_client(env, &payment_token(env)).transfer(
        &env.current_contract_address(),
        &fiduciary,
        &amount,
    );
    env.events()
        .publish((Symbol::new(env, "proceeds"), fiduciary), amount);
    amount
}

#[contractimpl]
impl FractachainLicitacionContract {
    #[allow(clippy::too_many_arguments)]
    pub fn initialize(
        env: Env,
        admin: Address,
        fiduciary: Address,
        payment_token: Address,
        soft_cap: i128,
        hard_cap: i128,
        deadline: u64,
        price_per_unit: i128,
        legal_info: LegalInfo,
    ) {
        if env.storage().persistent().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        require_positive(soft_cap);
        require_positive(hard_cap);
        require_positive(price_per_unit);
        if hard_cap < soft_cap {
            panic!("Hard cap must be >= soft cap");
        }
        if deadline <= env.ledger().timestamp() {
            panic!("Deadline must be in the future");
        }

        admin.require_auth();
        bump_instance(&env);

        env.storage().persistent().set(&DataKey::Admin, &admin);
        env.storage().persistent().set(&DataKey::Fiduciary, &fiduciary);
        env.storage().persistent().set(&DataKey::PaymentToken, &payment_token);
        env.storage().persistent().set(&DataKey::SoftCap, &soft_cap);
        env.storage().persistent().set(&DataKey::HardCap, &hard_cap);
        env.storage().persistent().set(&DataKey::Deadline, &deadline);
        env.storage().persistent().set(&DataKey::PricePerUnit, &price_per_unit);
        env.storage().persistent().set(&DataKey::TotalRaised, &0i128);
        env.storage().persistent().set(&DataKey::TotalRwaMinted, &0i128);
        env.storage().persistent().set(&DataKey::State, &State::Open);
        env.storage().persistent().set(&DataKey::LegalInfo, &legal_info);
        env.storage().persistent().set(&DataKey::ProceedsWithdrawn, &false);
        env.storage().persistent().set(&DataKey::HighestPrice, &price_per_unit);

        env.events().publish(
            (Symbol::new(&env, "init"), admin.clone()),
            (payment_token, price_per_unit),
        );
    }

    /// Releases the subscription proceeds to the company wallet (`Fiduciary`).
    ///
    /// Prefer `finalize`: a successful close already pays this address. This
    /// entry point exists so an interrupted payout can be retried, and so a
    /// squeeze-out (`Terminated`) still has a path if finalize never ran.
    pub fn withdraw_proceeds(env: Env, admin: Address) -> i128 {
        require_admin(&env, &admin);
        let state: State = env.storage().persistent().get(&DataKey::State).unwrap();
        if state != State::Successful && state != State::Terminated {
            panic!("Proceeds are only withdrawable after a successful licitacion");
        }
        let amount = payout_proceeds(&env);
        if amount <= 0 {
            panic!("Proceeds already withdrawn");
        }
        amount
    }

    pub fn get_fiduciary(env: Env) -> Address {
        env.storage().persistent().get(&DataKey::Fiduciary).unwrap()
    }

    /// Repoints the wallet that will receive the raise.
    ///
    /// Only while `TotalRaised` is still zero: once an investor has paid in,
    /// the destination of their money is part of the deal they agreed to and
    /// must not be movable by the admin.
    pub fn set_fiduciary(env: Env, admin: Address, fiduciary: Address) {
        require_admin(&env, &admin);
        let raised: i128 = env.storage().persistent().get(&DataKey::TotalRaised).unwrap();
        if raised != 0 {
            panic!("Cannot change the payout wallet after contributions started");
        }
        env.storage().persistent().set(&DataKey::Fiduciary, &fiduciary);
        env.events()
            .publish((Symbol::new(&env, "fiduciary"), admin), fiduciary);
    }

    pub fn proceeds_withdrawn(env: Env) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::ProceedsWithdrawn)
            .unwrap_or(false)
    }

    /// Admin can change XLM / USDC / USDT SAC and unit price until the first contribution.
    pub fn set_payment_token(env: Env, admin: Address, payment_token: Address) {
        require_admin(&env, &admin);
        let raised: i128 = env.storage().persistent().get(&DataKey::TotalRaised).unwrap();
        if raised != 0 {
            panic!("Cannot change payment token after contributions started");
        }
        env.storage().persistent().set(&DataKey::PaymentToken, &payment_token);
    }

    pub fn set_price_per_unit(env: Env, admin: Address, price_per_unit: i128) {
        require_admin(&env, &admin);
        require_positive(price_per_unit);
        let raised: i128 = env.storage().persistent().get(&DataKey::TotalRaised).unwrap();
        if raised != 0 {
            panic!("Cannot change price after contributions started");
        }
        env.storage().persistent().set(&DataKey::PricePerUnit, &price_per_unit);
        env.events()
            .publish((Symbol::new(&env, "price"), admin), price_per_unit);
    }

    pub fn verify_investor(
        env: Env,
        admin: Address,
        investor: Address,
        country_code: u32,
        investor_type: InvestorType,
        expiry: u64,
    ) {
        require_admin(&env, &admin);
        kyc_verify(&env, &investor, country_code, investor_type, expiry);
    }

    pub fn revoke_investor(env: Env, admin: Address, investor: Address) {
        require_admin(&env, &admin);
        kyc_revoke(&env, &investor);
    }

    pub fn is_verified(env: Env, investor: Address) -> bool {
        is_investor_verified(&env, &investor)
    }

    /// True only on Stellar pubnet. Testnet and local skip the 08–16 ART window.
    pub fn kyc_hours_enforced(env: Env) -> bool {
        kyc::kyc_hours_enforced(&env)
    }

    /// False once votes are suspended for an unfulfilled tender offer (Art. 88).
    pub fn has_votes(env: Env, investor: Address) -> bool {
        kyc::has_voting_rights(&env, &investor)
    }

    /// Restores voting rights once the acquirer complies with the tender offer.
    ///
    /// The suspension is applied automatically by the protocol, but lifting it
    /// is a judgement call, so it stays an explicit admin action.
    pub fn restore_votes(env: Env, admin: Address, investor: Address) {
        require_admin(&env, &admin);
        kyc::set_voting_rights(&env, &investor, true);
        env.events()
            .publish((Symbol::new(&env, "votes_restored"), investor), true);
    }

    pub fn get_opa_record(env: Env) -> Option<OpaRecord> {
        get_record(&env)
    }

    pub fn contribute(env: Env, buyer: Address, payment_amount: i128) {
        buyer.require_auth();
        bump_instance(&env);

        if !is_investor_verified(&env, &buyer) {
            panic!("Buyer KYC not verified or expired");
        }

        let state: State = env.storage().persistent().get(&DataKey::State).unwrap();
        if state != State::Open {
            panic!("Licitacion not open");
        }

        let now = env.ledger().timestamp();
        let deadline: u64 = env.storage().persistent().get(&DataKey::Deadline).unwrap();
        if now > deadline {
            panic!("Deadline passed");
        }

        let price: i128 = env.storage().persistent().get(&DataKey::PricePerUnit).unwrap();
        require_divisible(payment_amount, price);

        let hard_cap: i128 = env.storage().persistent().get(&DataKey::HardCap).unwrap();
        let total_raised: i128 = env.storage().persistent().get(&DataKey::TotalRaised).unwrap();
        if total_raised.checked_add(payment_amount).expect("overflow") > hard_cap {
            panic!("Exceeds hard cap");
        }

        let units = payment_amount / price;
        token_client(&env, &payment_token(&env)).transfer(
            &buyer,
            &env.current_contract_address(),
            &payment_amount,
        );

        let previous: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Contribution(buyer.clone()))
            .unwrap_or(0);
        set_contribution(&env, &buyer, previous + payment_amount);
        env.storage()
            .persistent()
            .set(&DataKey::TotalRaised, &(total_raised + payment_amount));

        let new_rwa = rwa_balance(&env, &buyer) + units;
        set_rwa_balance(&env, &buyer, new_rwa);

        let minted: i128 = env.storage().persistent().get(&DataKey::TotalRwaMinted).unwrap();
        let new_minted = minted + units;
        env.storage()
            .persistent()
            .set(&DataKey::TotalRwaMinted, &new_minted);

        env.events()
            .publish((Symbol::new(&env, "contribute"), buyer.clone()), (payment_amount, units));

        // Control can be accumulated in the primary just as easily as in the
        // secondary; checking only on `fill_order` let a subscriber take a
        // majority of the issuance without ever triggering the tender offer.
        check_control_threshold(&env, &buyer, new_rwa, new_minted);
    }

    pub fn finalize(env: Env) {
        bump_instance(&env);
        let state: State = env.storage().persistent().get(&DataKey::State).unwrap();
        if state != State::Open {
            panic!("Not in open state");
        }

        let now = env.ledger().timestamp();
        let deadline: u64 = env.storage().persistent().get(&DataKey::Deadline).unwrap();
        let total_raised: i128 = env.storage().persistent().get(&DataKey::TotalRaised).unwrap();
        let soft_cap: i128 = env.storage().persistent().get(&DataKey::SoftCap).unwrap();
        let hard_cap: i128 = env.storage().persistent().get(&DataKey::HardCap).unwrap();

        if total_raised >= hard_cap || now >= deadline {
            if total_raised >= soft_cap {
                env.storage().persistent().set(&DataKey::State, &State::Successful);
                // The company wallet configured in `initialize` / `set_fiduciary`
                // receives the raise here. Waiting for a later admin call is
                // how the money used to get stuck in the contract forever.
                let paid = payout_proceeds(&env);
                env.events().publish(
                    (Symbol::new(&env, "finalize"),),
                    (State::Successful as u32, paid),
                );
            } else {
                env.storage().persistent().set(&DataKey::State, &State::Failed);
                env.events()
                    .publish((Symbol::new(&env, "finalize"),), State::Failed as u32);
            }
        } else {
            panic!("Cannot finalize yet");
        }
    }

    pub fn refund(env: Env, contributor: Address) {
        contributor.require_auth();
        bump_instance(&env);

        let state: State = env.storage().persistent().get(&DataKey::State).unwrap();
        if state != State::Failed {
            panic!("Refunds only available on failed licitacion");
        }

        let contributed: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Contribution(contributor.clone()))
            .unwrap_or(0);
        if contributed <= 0 {
            panic!("No balance to refund");
        }

        let price: i128 = env.storage().persistent().get(&DataKey::PricePerUnit).unwrap();
        let units = contributed / price;
        let minted: i128 = env.storage().persistent().get(&DataKey::TotalRwaMinted).unwrap_or(0);
        env.storage()
            .persistent()
            .set(&DataKey::TotalRwaMinted, &(minted - units).max(0));
        set_contribution(&env, &contributor, 0);
        set_rwa_balance(&env, &contributor, 0);

        token_client(&env, &payment_token(&env)).transfer(
            &env.current_contract_address(),
            &contributor,
            &contributed,
        );
    }

    /// Escrows RWA inside this contract. The live secondary market is the
    /// Stellar DEX (`AUTH_REQUIRED` classic asset), not this book: these
    /// helpers exist so OPA / squeeze-out can still see a holder's position.
    pub fn place_order(env: Env, seller: Address, amount_rwa: i128, price_per_unit: i128) -> u64 {
        let state: State = env.storage().persistent().get(&DataKey::State).unwrap();
        if state != State::Successful {
            panic!("Secondary market only active after successful licitacion");
        }

        require_positive(amount_rwa);
        let balance = rwa_balance(&env, &seller);
        if balance < amount_rwa {
            panic!("Insufficient RWA balance");
        }

        set_rwa_balance(&env, &seller, balance - amount_rwa);
        // Mirror the locked amount so a buyout still sees it as the seller's.
        set_order_escrow(&env, &seller, order_escrow(&env, &seller) + amount_rwa);
        ob_create_order(&env, &seller, amount_rwa, price_per_unit)
    }

    pub fn cancel_sale_order(env: Env, seller: Address, order_id: u64) {
        let order: Order = get_order(&env, order_id).expect("Order not found");
        ob_cancel_order(&env, &seller, order_id);

        let balance = rwa_balance(&env, &seller);
        set_rwa_balance(&env, &seller, balance + order.amount_rwa);
        set_order_escrow(
            &env,
            &seller,
            (order_escrow(&env, &seller) - order.amount_rwa).max(0),
        );
    }

    pub fn fill_order(env: Env, buyer: Address, order_id: u64) {
        buyer.require_auth();
        bump_instance(&env);

        let state: State = env.storage().persistent().get(&DataKey::State).unwrap();
        if state != State::Successful {
            panic!("Secondary market closed");
        }

        if !is_investor_verified(&env, &buyer) {
            panic!("Buyer KYC not verified");
        }

        let mut order: Order = get_order(&env, order_id).expect("Order not found");
        if !order.is_active {
            panic!("Order not active");
        }
        if !is_investor_verified(&env, &order.seller) {
            panic!("Seller KYC expired or revoked");
        }

        let total = order
            .amount_rwa
            .checked_mul(order.price_per_unit_usdc)
            .expect("overflow");
        require_positive(total);

        let client = token_client(&env, &payment_token(&env));
        let fee = (total * 25) / 10000;
        let seller_net = total - fee;
        client.transfer(&buyer, &order.seller, &seller_net);
        if fee > 0 {
            let admin: Address = env.storage().persistent().get(&DataKey::Admin).unwrap();
            client.transfer(&buyer, &admin, &fee);
        }

        let new_buyer_rwa = rwa_balance(&env, &buyer) + order.amount_rwa;
        set_rwa_balance(&env, &buyer, new_buyer_rwa);
        // The sold units leave the seller's escrow for good.
        set_order_escrow(
            &env,
            &order.seller,
            (order_escrow(&env, &order.seller) - order.amount_rwa).max(0),
        );
        record_price(&env, order.price_per_unit_usdc);

        order.is_active = false;
        env.storage()
            .persistent()
            .set(&orderbook::OrderbookKey::Order(order_id), &order);

        env.events().publish(
            (Symbol::new(&env, "fill"), buyer.clone()),
            (order_id, order.amount_rwa, order.price_per_unit_usdc),
        );

        let total_rwa: i128 = env.storage().persistent().get(&DataKey::TotalRwaMinted).unwrap();
        check_control_threshold(&env, &buyer, new_buyer_rwa, total_rwa);
    }

    /// Launches the mandatory tender offer, escrowing the full consideration.
    ///
    /// The offer has to be firm: funding it up front is what lets a minority
    /// accept unilaterally. While the acquirer's money stayed in their own
    /// wallet, every acceptance needed their signature too, which made the
    /// "offer" revocable at will.
    pub fn launch_opa(env: Env, acquirer: Address, price_per_share: i128) {
        acquirer.require_auth();
        require_kyc_to_receive(&env, &acquirer);
        require_positive(price_per_share);
        let rec = get_record(&env).expect("OPA not triggered");
        require_can_launch_opa(&rec, &acquirer);

        // The offer must be at least as good as anything already paid.
        let floor = equitable_price_floor(&env);
        if price_per_share < floor {
            panic!("OPA price below equitable price floor");
        }

        let total_rwa: i128 = env.storage().persistent().get(&DataKey::TotalRwaMinted).unwrap();
        let outstanding = total_rwa - total_holding(&env, &acquirer);
        require_positive(outstanding);
        let escrow = outstanding
            .checked_mul(price_per_share)
            .expect("overflow");

        let updated = OpaRecord {
            state: OpaState::ActiveOffer,
            acquirer: acquirer.clone(),
            price_per_share,
            triggered_at: rec.triggered_at,
            deadline: env.ledger().timestamp() + opa::OPA_DEADLINE_SECONDS,
        };
        set_record(&env, &updated);
        env.storage().persistent().set(&DataKey::OpaEscrow, &escrow);
        record_price(&env, price_per_share);

        token_client(&env, &payment_token(&env)).transfer(
            &acquirer,
            &env.current_contract_address(),
            &escrow,
        );
        env.events()
            .publish((Symbol::new(&env, "opa_launch"), acquirer), (price_per_share, escrow));
    }

    /// A minority holder accepts the tender offer and is paid from escrow.
    pub fn accept_opa(env: Env, seller: Address) {
        seller.require_auth();
        let rec = get_record(&env).expect("No OPA");
        if rec.state != OpaState::ActiveOffer {
            panic!("No active OPA offer");
        }
        if env.ledger().timestamp() > rec.deadline {
            panic!("OPA offer expired");
        }
        if seller == rec.acquirer {
            panic!("Acquirer cannot accept its own offer");
        }
        // The tokens move to the acquirer, so their KYC has to still be valid
        // at settlement, not merely at launch. The seller is only exiting, so
        // they are deliberately not gated here.
        require_kyc_to_receive(&env, &rec.acquirer);

        let bal = rwa_balance(&env, &seller);
        require_positive(bal);
        let payout = bal
            .checked_mul(rec.price_per_share)
            .expect("overflow");

        let escrow: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::OpaEscrow)
            .unwrap_or(0);
        if payout > escrow {
            panic!("OPA escrow exhausted");
        }
        env.storage().persistent().set(&DataKey::OpaEscrow, &(escrow - payout));

        let acq = rec.acquirer.clone();
        set_rwa_balance(&env, &seller, 0);
        let acquirer_new = rwa_balance(&env, &acq) + bal;
        set_rwa_balance(&env, &acq, acquirer_new);

        token_client(&env, &payment_token(&env)).transfer(
            &env.current_contract_address(),
            &seller,
            &payout,
        );
        env.events()
            .publish((Symbol::new(&env, "opa_accept"), seller), payout);

        let total_rwa: i128 = env.storage().persistent().get(&DataKey::TotalRwaMinted).unwrap();
        check_control_threshold(&env, &acq, acquirer_new + order_escrow(&env, &acq), total_rwa);
    }

    /// Returns unspent tender-offer escrow to the acquirer once the offer lapsed.
    pub fn reclaim_opa_escrow(env: Env, acquirer: Address) -> i128 {
        acquirer.require_auth();
        let rec = get_record(&env).expect("No OPA");
        if acquirer != rec.acquirer {
            panic!("Not the OPA acquirer");
        }
        if env.ledger().timestamp() <= rec.deadline {
            panic!("OPA offer still active");
        }
        let escrow: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::OpaEscrow)
            .unwrap_or(0);
        require_positive(escrow);
        env.storage().persistent().set(&DataKey::OpaEscrow, &0i128);
        token_client(&env, &payment_token(&env)).transfer(
            &env.current_contract_address(),
            &acquirer,
            &escrow,
        );
        escrow
    }

    pub fn execute_squeeze_out(env: Env, acquirer: Address, buyout_price_per_share: i128) {
        acquirer.require_auth();
        require_kyc_to_receive(&env, &acquirer);
        require_positive(buyout_price_per_share);

        let state: State = env.storage().persistent().get(&DataKey::State).unwrap();
        if state != State::Successful {
            panic!("Squeeze-out only after successful issuance");
        }

        // Art. 88 requires an equitable price. Letting the acquirer name any
        // number meant the last 5% could be bought for a single stroop.
        let floor = equitable_price_floor(&env);
        if buyout_price_per_share < floor {
            panic!("Buyout price below equitable price floor");
        }

        let total_rwa: i128 = env.storage().persistent().get(&DataKey::TotalRwaMinted).unwrap();
        let balance = total_holding(&env, &acquirer);
        if total_rwa <= 0 || (balance * 10000) / total_rwa < SQUEEZE_OUT_THRESHOLD_BPS {
            panic!("Squeeze-out threshold of 95% not met");
        }

        let remaining = total_rwa - balance;
        let deposit = remaining
            .checked_mul(buyout_price_per_share)
            .expect("overflow");
        if remaining > 0 {
            token_client(&env, &payment_token(&env)).transfer(
                &acquirer,
                &env.current_contract_address(),
                &deposit,
            );
        }

        let now = env.ledger().timestamp();
        set_record(
            &env,
            &OpaRecord {
                state: OpaState::SqueezedOut,
                acquirer: acquirer.clone(),
                price_per_share: buyout_price_per_share,
                triggered_at: now,
                deadline: now,
            },
        );
        env.storage().persistent().set(&DataKey::SqueezePrice, &buyout_price_per_share);
        env.storage().persistent().set(&DataKey::State, &State::Terminated);
    }

    /// Pull-based buyout: minorities claim payment and burn RWA after squeeze-out.
    pub fn claim_squeeze_out(env: Env, holder: Address) {
        holder.require_auth();
        let rec = get_record(&env).expect("Squeeze-out not executed");
        if rec.state != OpaState::SqueezedOut {
            panic!("Squeeze-out not executed");
        }
        if holder == rec.acquirer {
            panic!("Acquirer cannot claim squeeze-out");
        }

        let claimed: bool = env
            .storage()
            .persistent()
            .get(&DataKey::Allocated(holder.clone()))
            .unwrap_or(false);
        if claimed {
            panic!("Already claimed");
        }

        // Units parked in open sale orders still belong to the holder. Paying
        // only the free balance shortchanged anyone with a live offer.
        let bal = total_holding(&env, &holder);
        require_positive(bal);
        let payout = bal
            .checked_mul(rec.price_per_share)
            .expect("overflow");

        env.storage()
            .persistent()
            .set(&DataKey::Allocated(holder.clone()), &true);
        set_rwa_balance(&env, &holder, 0);
        set_order_escrow(&env, &holder, 0);
        token_client(&env, &payment_token(&env)).transfer(
            &env.current_contract_address(),
            &holder,
            &payout,
        );
        env.events()
            .publish((Symbol::new(&env, "squeeze_claim"), holder), payout);
    }

    pub fn get_state(env: Env) -> State {
        env.storage().persistent().get(&DataKey::State).unwrap()
    }

    pub fn get_total_raised(env: Env) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::TotalRaised)
            .unwrap_or(0)
    }

    pub fn get_rwa_balance(env: Env, user: Address) -> i128 {
        rwa_balance(&env, &user)
    }

    pub fn get_price_per_unit(env: Env) -> i128 {
        env.storage().persistent().get(&DataKey::PricePerUnit).unwrap()
    }

    pub fn get_payment_token(env: Env) -> Address {
        payment_token(&env)
    }

    pub fn get_legal_info(env: Env) -> LegalInfo {
        env.storage().persistent().get(&DataKey::LegalInfo).unwrap()
    }

    /// RWA locked in the holder's open sale orders.
    pub fn get_order_escrow(env: Env, user: Address) -> i128 {
        order_escrow(&env, &user)
    }

    /// Free balance plus order escrow — what a buyout actually owes them.
    pub fn get_total_holding(env: Env, user: Address) -> i128 {
        total_holding(&env, &user)
    }

    /// Minimum acceptable price for an OPA or squeeze-out (Art. 88).
    pub fn get_equitable_price_floor(env: Env) -> i128 {
        equitable_price_floor(&env)
    }

    pub fn get_opa_escrow(env: Env) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::OpaEscrow)
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod test;
