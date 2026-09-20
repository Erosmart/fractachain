#![no_std]
use soroban_sdk::{
    contract, contractclient, contractimpl, contracttype, Address, BytesN, Env, Symbol,
};
use fractachain_core::{
    bump_instance, bump_persistent, pct_bps, prorated_interest, require_positive, token_client,
    MAX_RATE_BPS, SECONDS_PER_DAY,
};

/// Subset of `issuance-factory` this vault depends on to decide who it trusts.
#[contractclient(name = "RegistryClient")]
pub trait Registry {
    fn is_warrantera(env: Env, who: Address) -> bool;
    fn is_payment_asset(env: Env, token: Address) -> bool;
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WarrantStatus {
    Deposited = 0,
    ActiveLoan = 1,
    Repaid = 2,
    Liquidated = 3,
}

#[contracttype]
pub enum WarrantKey {
    Registry,
    Producer,
    OracleWarrantera,
    PaymentToken,
    Lender,
    PogrCertHash,
    InventoryValue,
    LoanAmount,
    InterestRateBps,
    LtvBps,
    DurationDays,
    OfferExpiry,
    StartTs,
    DueDate,
    Status,
    CollateralHolder,
    DebtAtLiquidation,
    SurplusOwedToProducer,
}

#[contract]
pub struct WarrantVaultContract;

const GRACE_DAYS: u64 = 15;
/// An unfunded vault stops being fundable after this long: the collateral
/// attestation goes stale, and a lender must not be able to sit on an old
/// offer waiting for a better moment to strike.
const OFFER_VALID_DAYS: u64 = 30;
const MAX_DURATION_DAYS: u64 = 365;

fn status(env: &Env) -> WarrantStatus {
    env.storage().persistent().get(&WarrantKey::Status).unwrap()
}

fn require_deposited(env: &Env) {
    if status(env) != WarrantStatus::Deposited {
        panic!("Loan already funded or closed");
    }
}

fn require_active(env: &Env) {
    if status(env) != WarrantStatus::ActiveLoan {
        panic!("Loan not in active status");
    }
}

/// Renews every entry this vault reads. `bump_instance` alone does not cover
/// persistent storage, so without this a live loan can archive mid-term and
/// freeze both sides out.
fn bump_all(env: &Env) {
    bump_instance(env);
    bump_persistent(env, &WarrantKey::Registry);
    bump_persistent(env, &WarrantKey::Producer);
    bump_persistent(env, &WarrantKey::OracleWarrantera);
    bump_persistent(env, &WarrantKey::PaymentToken);
    bump_persistent(env, &WarrantKey::PogrCertHash);
    bump_persistent(env, &WarrantKey::InventoryValue);
    bump_persistent(env, &WarrantKey::LoanAmount);
    bump_persistent(env, &WarrantKey::InterestRateBps);
    bump_persistent(env, &WarrantKey::LtvBps);
    bump_persistent(env, &WarrantKey::DurationDays);
    bump_persistent(env, &WarrantKey::OfferExpiry);
    bump_persistent(env, &WarrantKey::StartTs);
    bump_persistent(env, &WarrantKey::Status);
    bump_persistent(env, &WarrantKey::CollateralHolder);
}

#[contractimpl]
impl WarrantVaultContract {
    #[allow(clippy::too_many_arguments)]
    pub fn initialize(
        env: Env,
        registry: Address,
        producer: Address,
        oracle_warrantera: Address,
        payment_token: Address,
        pogr_cert_hash: BytesN<32>,
        inventory_value: i128,
        ltv_bps: u32,
        interest_rate_bps: u32,
        duration_days: u64,
    ) {
        if env.storage().persistent().has(&WarrantKey::Producer) {
            panic!("Already initialized");
        }
        // The whole loan is priced off `inventory_value` and `pogr_cert_hash`,
        // both supplied by the caller. Authenticating a self-chosen oracle
        // proves nothing, so the attestor must be accredited in the registry
        // and must not be the producer.
        if producer == oracle_warrantera {
            panic!("Producer cannot attest its own collateral");
        }
        let registry_client = RegistryClient::new(&env, &registry);
        if !registry_client.is_warrantera(&oracle_warrantera) {
            panic!("Warrantera not accredited");
        }
        if !registry_client.is_payment_asset(&payment_token) {
            panic!("Payment token not allowlisted");
        }
        if ltv_bps < 4000 || ltv_bps > 6000 {
            panic!("LTV must be between 40% and 60%");
        }
        if interest_rate_bps == 0 || interest_rate_bps > MAX_RATE_BPS {
            panic!("Interest rate out of range");
        }
        require_positive(inventory_value);
        if duration_days == 0 || duration_days > MAX_DURATION_DAYS {
            panic!("Duration out of range");
        }
        producer.require_auth();
        oracle_warrantera.require_auth();

        let loan_amount = pct_bps(inventory_value, ltv_bps);
        require_positive(loan_amount);
        let now = env.ledger().timestamp();
        let offer_expiry = now
            .checked_add(OFFER_VALID_DAYS * SECONDS_PER_DAY)
            .expect("overflow");

        env.storage().persistent().set(&WarrantKey::Registry, &registry);
        env.storage().persistent().set(&WarrantKey::Producer, &producer);
        env.storage().persistent().set(&WarrantKey::OracleWarrantera, &oracle_warrantera);
        env.storage().persistent().set(&WarrantKey::PaymentToken, &payment_token);
        env.storage().persistent().set(&WarrantKey::PogrCertHash, &pogr_cert_hash);
        env.storage().persistent().set(&WarrantKey::InventoryValue, &inventory_value);
        env.storage().persistent().set(&WarrantKey::LoanAmount, &loan_amount);
        env.storage().persistent().set(&WarrantKey::LtvBps, &ltv_bps);
        env.storage().persistent().set(&WarrantKey::InterestRateBps, &interest_rate_bps);
        env.storage().persistent().set(&WarrantKey::DurationDays, &duration_days);
        env.storage().persistent().set(&WarrantKey::OfferExpiry, &offer_expiry);
        env.storage().persistent().set(&WarrantKey::StartTs, &now);
        // `DueDate` is deliberately not set here: the term only starts running
        // when the loan is actually disbursed. See `fund_loan`.
        env.storage().persistent().set(&WarrantKey::Status, &WarrantStatus::Deposited);
        env.storage().persistent().set(&WarrantKey::CollateralHolder, &producer);
        bump_all(&env);
        env.events()
            .publish((Symbol::new(&env, "deposited"), producer), loan_amount);
    }

    /// Lender (admin or LP) funds the burst loan in XLM/USDC/USDT.
    pub fn fund_loan(env: Env, lender: Address) {
        lender.require_auth();
        require_deposited(&env);

        let now = env.ledger().timestamp();
        let offer_expiry: u64 = env.storage().persistent().get(&WarrantKey::OfferExpiry).unwrap();
        if now > offer_expiry {
            panic!("Warrant offer expired: re-attest collateral");
        }

        // The term is measured from disbursement. Deriving `DueDate` at
        // `initialize` let a lender wait out the clock and then fund and
        // liquidate in the same ledger, taking the collateral for free.
        let duration_days: u64 = env.storage().persistent().get(&WarrantKey::DurationDays).unwrap();
        let due = now
            .checked_add(
                duration_days
                    .checked_mul(SECONDS_PER_DAY)
                    .expect("overflow"),
            )
            .expect("overflow");

        let amount: i128 = env.storage().persistent().get(&WarrantKey::LoanAmount).unwrap();
        let producer: Address = env.storage().persistent().get(&WarrantKey::Producer).unwrap();
        let token: Address = env.storage().persistent().get(&WarrantKey::PaymentToken).unwrap();

        env.storage().persistent().set(&WarrantKey::Lender, &lender);
        env.storage().persistent().set(&WarrantKey::StartTs, &now);
        env.storage().persistent().set(&WarrantKey::DueDate, &due);
        env.storage().persistent().set(&WarrantKey::Status, &WarrantStatus::ActiveLoan);
        bump_all(&env);
        bump_persistent(&env, &WarrantKey::Lender);
        bump_persistent(&env, &WarrantKey::DueDate);

        token_client(&env, &token).transfer(&lender, &producer, &amount);
        env.events().publish((Symbol::new(&env, "fund"), lender), amount);
    }

    pub fn repay_loan(env: Env, payer: Address) {
        payer.require_auth();
        if status(&env) != WarrantStatus::ActiveLoan {
            panic!("No active loan to repay");
        }

        // Repayment and liquidation used to overlap indefinitely, which let a
        // lender front-run a late payment and take the collateral instead.
        // Grace expiry now closes repayment exactly where liquidation opens.
        let now = env.ledger().timestamp();
        let due: u64 = env.storage().persistent().get(&WarrantKey::DueDate).unwrap();
        let cutoff = due
            .checked_add(GRACE_DAYS * SECONDS_PER_DAY)
            .expect("overflow");
        if now > cutoff {
            panic!("Grace period expired: loan is in default");
        }

        let principal: i128 = env.storage().persistent().get(&WarrantKey::LoanAmount).unwrap();
        let rate: u32 = env.storage().persistent().get(&WarrantKey::InterestRateBps).unwrap();
        let start: u64 = env.storage().persistent().get(&WarrantKey::StartTs).unwrap();
        let interest = prorated_interest(principal, rate, start, now);
        let total = principal.checked_add(interest).expect("overflow");

        let lender: Address = env.storage().persistent().get(&WarrantKey::Lender).unwrap();
        let token: Address = env.storage().persistent().get(&WarrantKey::PaymentToken).unwrap();
        let producer: Address = env.storage().persistent().get(&WarrantKey::Producer).unwrap();

        env.storage().persistent().set(&WarrantKey::Status, &WarrantStatus::Repaid);
        env.storage().persistent().set(&WarrantKey::CollateralHolder, &producer);
        bump_all(&env);

        token_client(&env, &token).transfer(&payer, &lender, &total);
        env.events().publish((Symbol::new(&env, "repay"), payer), total);
    }

    /// Adjudicates the collateral to the lender once grace has lapsed.
    ///
    /// Only the lender or the accredited warrantera may call it, and the
    /// surplus over the outstanding debt is recorded as owed to the producer
    /// so an over-collateralized default is not a windfall.
    pub fn execute_liquidation(env: Env, caller: Address) {
        caller.require_auth();
        require_active(&env);

        let lender: Address = env.storage().persistent().get(&WarrantKey::Lender).unwrap();
        let oracle: Address = env
            .storage()
            .persistent()
            .get(&WarrantKey::OracleWarrantera)
            .unwrap();
        if caller != lender && caller != oracle {
            panic!("Only lender or warrantera can liquidate");
        }

        let now = env.ledger().timestamp();
        let due: u64 = env.storage().persistent().get(&WarrantKey::DueDate).unwrap();
        let grace_end = due
            .checked_add(GRACE_DAYS * SECONDS_PER_DAY)
            .expect("overflow");
        if now < grace_end {
            panic!("Grace period has not expired yet");
        }

        let principal: i128 = env.storage().persistent().get(&WarrantKey::LoanAmount).unwrap();
        let rate: u32 = env.storage().persistent().get(&WarrantKey::InterestRateBps).unwrap();
        let start: u64 = env.storage().persistent().get(&WarrantKey::StartTs).unwrap();
        let debt = principal
            .checked_add(prorated_interest(principal, rate, start, now))
            .expect("overflow");
        let inventory: i128 = env
            .storage()
            .persistent()
            .get(&WarrantKey::InventoryValue)
            .unwrap();
        let surplus = if inventory > debt { inventory - debt } else { 0 };

        env.storage().persistent().set(&WarrantKey::DebtAtLiquidation, &debt);
        env.storage().persistent().set(&WarrantKey::SurplusOwedToProducer, &surplus);
        env.storage().persistent().set(&WarrantKey::CollateralHolder, &lender);
        env.storage().persistent().set(&WarrantKey::Status, &WarrantStatus::Liquidated);
        bump_all(&env);
        env.events()
            .publish((Symbol::new(&env, "liquidate"), lender), (debt, surplus));
    }

    pub fn get_status(env: Env) -> WarrantStatus {
        status(&env)
    }

    pub fn get_loan_amount(env: Env) -> i128 {
        env.storage().persistent().get(&WarrantKey::LoanAmount).unwrap()
    }

    pub fn get_collateral_holder(env: Env) -> Address {
        env.storage().persistent().get(&WarrantKey::CollateralHolder).unwrap()
    }

    pub fn get_payment_token(env: Env) -> Address {
        env.storage().persistent().get(&WarrantKey::PaymentToken).unwrap()
    }

    /// Who attested the collateral. A lender has to be able to check this
    /// on-chain before funding, rather than trusting the frontend.
    pub fn get_oracle_warrantera(env: Env) -> Address {
        env.storage().persistent().get(&WarrantKey::OracleWarrantera).unwrap()
    }

    pub fn get_pogr_cert_hash(env: Env) -> BytesN<32> {
        env.storage().persistent().get(&WarrantKey::PogrCertHash).unwrap()
    }

    /// `(inventory_value, ltv_bps, interest_rate_bps, start_ts, due_date, offer_expiry)`.
    /// `due_date` is 0 until the loan is funded.
    pub fn get_terms(env: Env) -> (i128, u32, u32, u64, u64, u64) {
        (
            env.storage().persistent().get(&WarrantKey::InventoryValue).unwrap(),
            env.storage().persistent().get(&WarrantKey::LtvBps).unwrap(),
            env.storage().persistent().get(&WarrantKey::InterestRateBps).unwrap(),
            env.storage().persistent().get(&WarrantKey::StartTs).unwrap(),
            env.storage().persistent().get(&WarrantKey::DueDate).unwrap_or(0),
            env.storage().persistent().get(&WarrantKey::OfferExpiry).unwrap(),
        )
    }

    pub fn get_surplus_owed_to_producer(env: Env) -> i128 {
        env.storage()
            .persistent()
            .get(&WarrantKey::SurplusOwedToProducer)
            .unwrap_or(0)
    }

    /// Amount owed at the moment of default, frozen so the off-chain
    /// settlement of the collateral has an auditable reference.
    pub fn get_debt_at_liquidation(env: Env) -> i128 {
        env.storage()
            .persistent()
            .get(&WarrantKey::DebtAtLiquidation)
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod test;
