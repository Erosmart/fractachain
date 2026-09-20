#![no_std]
use soroban_sdk::{
    contract, contractclient, contractimpl, contracttype, Address, BytesN, Env, String, Symbol,
};
use fractachain_core::{
    bump_instance, bump_persistent, require_positive, token_client, SECONDS_PER_DAY,
};

/// Subset of `issuance-factory` used to validate the payment asset.
#[contractclient(name = "RegistryClient")]
pub trait Registry {
    fn is_payment_asset(env: Env, token: Address) -> bool;
}

/// Fixed-point scale for `dividend_per_token_accum`.
const DIV_SCALE: i128 = 1_000_000;

/// A proof-of-reserve older than this blocks further minting.
const POR_STALE_AFTER_DAYS: u64 = 90;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StockMetadata {
    pub ticker: Symbol,
    pub company_name: String,
    pub isin: String,
    pub total_shares_custodied: i128,
    pub total_tokens_minted: i128,
    pub custodian_cuit: String,
    pub last_audit_timestamp: u64,
    pub dividend_per_token_accum: i128,
}

#[contracttype]
pub enum StockKey {
    Admin,
    /// Attests shares actually held at Caja de Valores. Must not be the
    /// custodian: otherwise the entity that can over-mint is the same one
    /// certifying the backing.
    PorOracle,
    Registry,
    PaymentToken,
    Metadata,
    TokenBalance(Address),
    /// Accumulator checkpoint: the value of `dividend_per_token_accum` at the
    /// holder's last balance change.
    ClaimedDividend(Address),
    /// Dividends already earned by a holder but not yet withdrawn.
    PendingDividend(Address),
    /// Payment-token balance deposited as dividends and not yet claimed.
    ///
    /// Tracked from deposits and claims rather than from accrual: a holder's
    /// share is owed to them the moment the dividend lands, long before any
    /// call happens to check-point it. Deriving this from `PendingDividend`
    /// alone would let `sweep_unallocated` take money already owed.
    UnclaimedPool,
    MintPaused,
    /// Per-mint attestation: `(recipient, amount, cv_deposit_hash)`.
    MintProof(u64),
    MintSeq,
    /// Audit report hash per proof-of-reserve update, keyed by timestamp.
    PorProof(u64),
}

#[contract]
pub struct StockVaultContract;

fn require_admin(env: &Env, admin: &Address) {
    let stored: Address = env.storage().persistent().get(&StockKey::Admin).unwrap();
    if admin != &stored {
        panic!("Unauthorized custodian");
    }
    admin.require_auth();
}

fn meta(env: &Env) -> StockMetadata {
    env.storage().persistent().get(&StockKey::Metadata).unwrap()
}

/// Persists metadata and re-derives the mint pause flag from it.
///
/// The flag used to be written only inside `update_proof_of_reserve`, so any
/// mint or burn left it describing a stale relationship between the two
/// counters.
fn set_meta(env: &Env, metadata: &StockMetadata) {
    env.storage().persistent().set(&StockKey::Metadata, metadata);
    env.storage().persistent().set(
        &StockKey::MintPaused,
        &(metadata.total_shares_custodied < metadata.total_tokens_minted),
    );
    bump_persistent(env, &StockKey::Metadata);
    bump_persistent(env, &StockKey::MintPaused);
}

fn payment_token(env: &Env) -> Address {
    env.storage().persistent().get(&StockKey::PaymentToken).unwrap()
}

fn balance_of(env: &Env, holder: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&StockKey::TokenBalance(holder.clone()))
        .unwrap_or(0)
}

/// Credits the dividends earned by `holder`'s **current** balance and seals
/// their accumulator checkpoint.
///
/// Must run before every mutation of `TokenBalance`. Without it the scheme is
/// broken in both directions: a holder minted after a dividend deposit
/// inherits the entire historical accumulator and drains the pool, while a
/// holder who burns before claiming forfeits what they had already earned.
fn accrue(env: &Env, holder: &Address) {
    let accum = meta(env).dividend_per_token_accum;
    let already: i128 = env
        .storage()
        .persistent()
        .get(&StockKey::ClaimedDividend(holder.clone()))
        .unwrap_or(0);
    let delta = accum - already;
    let balance = balance_of(env, holder);

    if delta > 0 && balance > 0 {
        let owed = balance.checked_mul(delta).expect("dividend overflow") / DIV_SCALE;
        if owed > 0 {
            let pending: i128 = env
                .storage()
                .persistent()
                .get(&StockKey::PendingDividend(holder.clone()))
                .unwrap_or(0);
            env.storage().persistent().set(
                &StockKey::PendingDividend(holder.clone()),
                &pending.checked_add(owed).expect("overflow"),
            );
            bump_persistent(env, &StockKey::PendingDividend(holder.clone()));
        }
    }

    // A brand-new holder is sealed at the current accumulator with zero
    // pending, so they no longer inherit dividends from before they existed.
    env.storage()
        .persistent()
        .set(&StockKey::ClaimedDividend(holder.clone()), &accum);
    bump_persistent(env, &StockKey::ClaimedDividend(holder.clone()));
}

#[contractimpl]
impl StockVaultContract {
    #[allow(clippy::too_many_arguments)]
    pub fn initialize_stock(
        env: Env,
        admin: Address,
        por_oracle: Address,
        registry: Address,
        payment_token: Address,
        ticker: Symbol,
        company_name: String,
        isin: String,
        custodian_cuit: String,
    ) {
        if env.storage().persistent().has(&StockKey::Admin) {
            panic!("Already initialized");
        }
        if admin == por_oracle {
            panic!("Custodian cannot audit its own reserve");
        }
        admin.require_auth();
        if !RegistryClient::new(&env, &registry).is_payment_asset(&payment_token) {
            panic!("Payment token not allowlisted");
        }
        bump_instance(&env);

        let metadata = StockMetadata {
            ticker,
            company_name,
            isin,
            total_shares_custodied: 0,
            total_tokens_minted: 0,
            custodian_cuit,
            last_audit_timestamp: env.ledger().timestamp(),
            dividend_per_token_accum: 0,
        };

        env.storage().persistent().set(&StockKey::Admin, &admin);
        env.storage().persistent().set(&StockKey::PorOracle, &por_oracle);
        env.storage().persistent().set(&StockKey::Registry, &registry);
        env.storage().persistent().set(&StockKey::PaymentToken, &payment_token);
        set_meta(&env, &metadata);
        bump_persistent(&env, &StockKey::Admin);
        bump_persistent(&env, &StockKey::PorOracle);
        bump_persistent(&env, &StockKey::PaymentToken);
    }

    pub fn transfer_admin(env: Env, admin: Address, new_admin: Address) {
        require_admin(&env, &admin);
        new_admin.require_auth();
        let oracle: Address = env.storage().persistent().get(&StockKey::PorOracle).unwrap();
        if new_admin == oracle {
            panic!("Custodian cannot audit its own reserve");
        }
        env.storage().persistent().set(&StockKey::Admin, &new_admin);
        env.events()
            .publish((Symbol::new(&env, "admin"), admin), new_admin);
    }

    pub fn set_payment_token(env: Env, admin: Address, new_token: Address) {
        require_admin(&env, &admin);
        let m = meta(&env);
        if m.total_tokens_minted != 0 {
            panic!("Cannot change payment token after mint");
        }
        let registry: Address = env.storage().persistent().get(&StockKey::Registry).unwrap();
        if !RegistryClient::new(&env, &registry).is_payment_asset(&new_token) {
            panic!("Payment token not allowlisted");
        }
        // Switching while the contract still holds the old asset would strand
        // that balance: every claim path resolves against the new token.
        let current = payment_token(&env);
        if current != new_token {
            let held = token_client(&env, &current).balance(&env.current_contract_address());
            if held != 0 {
                panic!("Sweep outstanding balance before switching token");
            }
        }
        env.storage().persistent().set(&StockKey::PaymentToken, &new_token);
        env.events()
            .publish((Symbol::new(&env, "payment_token"), admin), new_token);
    }

    /// Issues tokens against shares the PoR oracle has already attested.
    ///
    /// Minting no longer increments `total_shares_custodied`: that made the
    /// proof-of-reserve circular, since the invariant it checks was satisfied
    /// by the very act of minting.
    pub fn mint_backed_stock(
        env: Env,
        admin: Address,
        to: Address,
        amount: i128,
        cv_deposit_hash: BytesN<32>,
    ) {
        require_admin(&env, &admin);
        require_positive(amount);
        bump_instance(&env);
        let paused: bool = env.storage().persistent().get(&StockKey::MintPaused).unwrap_or(false);
        if paused {
            panic!("Mint paused: undercollateralized PoR");
        }

        let mut m = meta(&env);
        let stale_at = m
            .last_audit_timestamp
            .checked_add(POR_STALE_AFTER_DAYS * SECONDS_PER_DAY)
            .expect("overflow");
        if env.ledger().timestamp() > stale_at {
            panic!("Proof of reserve is stale");
        }

        let new_minted = m.total_tokens_minted.checked_add(amount).expect("overflow");
        if new_minted > m.total_shares_custodied {
            panic!("Mint would exceed attested custody");
        }

        accrue(&env, &to);

        m.total_tokens_minted = new_minted;
        set_meta(&env, &m);

        let balance = balance_of(&env, &to);
        env.storage().persistent().set(
            &StockKey::TokenBalance(to.clone()),
            &balance.checked_add(amount).expect("overflow"),
        );
        bump_persistent(&env, &StockKey::TokenBalance(to.clone()));

        // Ties this issuance to its Caja de Valores deposit slip. The hash used
        // to be accepted and discarded, leaving no on-chain trail at all.
        let seq: u64 = env
            .storage()
            .persistent()
            .get(&StockKey::MintSeq)
            .unwrap_or(0)
            + 1;
        env.storage().persistent().set(&StockKey::MintSeq, &seq);
        env.storage().persistent().set(
            &StockKey::MintProof(seq),
            &(to.clone(), amount, cv_deposit_hash.clone()),
        );
        bump_persistent(&env, &StockKey::MintProof(seq));

        env.events()
            .publish((Symbol::new(&env, "mint"), to), (amount, seq, cv_deposit_hash));
    }

    pub fn burn_for_redemption(
        env: Env,
        caller: Address,
        amount: i128,
        external_broker_comitente: String,
    ) {
        caller.require_auth();
        require_positive(amount);
        let balance = balance_of(&env, &caller);
        if balance < amount {
            panic!("Insufficient stock balance to redeem");
        }

        // Freeze what the holder has already earned before their balance drops,
        // otherwise redeeming silently forfeits unclaimed dividends.
        accrue(&env, &caller);

        let mut m = meta(&env);
        m.total_tokens_minted = m
            .total_tokens_minted
            .checked_sub(amount)
            .expect("minted underflow");
        // `total_shares_custodied` is signed and set by the PoR, so an
        // unguarded subtraction could quietly drive it negative.
        if m.total_shares_custodied < amount {
            panic!("Custody shortfall: redemption blocked until PoR is updated");
        }
        m.total_shares_custodied -= amount;
        set_meta(&env, &m);

        env.storage()
            .persistent()
            .set(&StockKey::TokenBalance(caller.clone()), &(balance - amount));
        bump_persistent(&env, &StockKey::TokenBalance(caller.clone()));

        env.events().publish(
            (Symbol::new(&env, "burn"), caller),
            (amount, external_broker_comitente),
        );
    }

    pub fn deposit_dividends(env: Env, admin: Address, total_payment: i128) {
        require_admin(&env, &admin);
        require_positive(total_payment);
        let mut m = meta(&env);
        if m.total_tokens_minted <= 0 {
            panic!("No tokens circulating to distribute dividends");
        }

        let dividend_per_token = total_payment
            .checked_mul(DIV_SCALE)
            .expect("dividend overflow")
            / m.total_tokens_minted;
        m.dividend_per_token_accum = m
            .dividend_per_token_accum
            .checked_add(dividend_per_token)
            .expect("overflow");
        set_meta(&env, &m);

        let pool: i128 = env
            .storage()
            .persistent()
            .get(&StockKey::UnclaimedPool)
            .unwrap_or(0);
        env.storage().persistent().set(
            &StockKey::UnclaimedPool,
            &pool.checked_add(total_payment).expect("overflow"),
        );
        bump_persistent(&env, &StockKey::UnclaimedPool);

        let token = payment_token(&env);
        token_client(&env, &token).transfer(&admin, &env.current_contract_address(), &total_payment);
        env.events().publish(
            (Symbol::new(&env, "dividends"), admin),
            (total_payment, m.dividend_per_token_accum),
        );
    }

    pub fn claim_dividends(env: Env, investor: Address) -> i128 {
        investor.require_auth();
        accrue(&env, &investor);

        let payout: i128 = env
            .storage()
            .persistent()
            .get(&StockKey::PendingDividend(investor.clone()))
            .unwrap_or(0);
        if payout <= 0 {
            return 0;
        }

        env.storage()
            .persistent()
            .set(&StockKey::PendingDividend(investor.clone()), &0i128);
        let pool: i128 = env
            .storage()
            .persistent()
            .get(&StockKey::UnclaimedPool)
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&StockKey::UnclaimedPool, &(pool - payout).max(0));

        let token = payment_token(&env);
        token_client(&env, &token).transfer(&env.current_contract_address(), &investor, &payout);
        env.events()
            .publish((Symbol::new(&env, "claim"), investor), payout);
        payout
    }

    /// Records an independent attestation of the shares held in custody.
    ///
    /// Restricted to the PoR oracle: the custodian must not be able to certify
    /// its own backing.
    pub fn update_proof_of_reserve(
        env: Env,
        oracle: Address,
        shares_in_cv: i128,
        audit_hash: BytesN<32>,
    ) {
        let stored: Address = env.storage().persistent().get(&StockKey::PorOracle).unwrap();
        if oracle != stored {
            panic!("Not the PoR oracle");
        }
        oracle.require_auth();
        if shares_in_cv < 0 {
            panic!("Invalid PoR");
        }

        let now = env.ledger().timestamp();
        let mut m = meta(&env);
        m.total_shares_custodied = shares_in_cv;
        m.last_audit_timestamp = now;
        set_meta(&env, &m);

        env.storage()
            .persistent()
            .set(&StockKey::PorProof(now), &audit_hash);
        bump_persistent(&env, &StockKey::PorProof(now));
        env.events().publish(
            (Symbol::new(&env, "por"), oracle),
            (shares_in_cv, m.total_tokens_minted, audit_hash),
        );
    }

    /// Withdraws only the payment-token balance that is not owed to any holder.
    pub fn sweep_unallocated(env: Env, admin: Address, to: Address, amount: i128) {
        require_admin(&env, &admin);
        require_positive(amount);
        let token = payment_token(&env);
        let held = token_client(&env, &token).balance(&env.current_contract_address());
        let committed: i128 = env
            .storage()
            .persistent()
            .get(&StockKey::UnclaimedPool)
            .unwrap_or(0);
        if amount > held - committed {
            panic!("Amount exceeds unallocated balance");
        }
        token_client(&env, &token).transfer(&env.current_contract_address(), &to, &amount);
        env.events()
            .publish((Symbol::new(&env, "sweep"), to), amount);
    }

    pub fn get_metadata(env: Env) -> StockMetadata {
        meta(&env)
    }

    pub fn get_balance(env: Env, user: Address) -> i128 {
        balance_of(&env, &user)
    }

    pub fn get_payment_token(env: Env) -> Address {
        payment_token(&env)
    }

    pub fn get_por_oracle(env: Env) -> Address {
        env.storage().persistent().get(&StockKey::PorOracle).unwrap()
    }

    pub fn is_mint_paused(env: Env) -> bool {
        env.storage()
            .persistent()
            .get(&StockKey::MintPaused)
            .unwrap_or(false)
    }

    /// Dividends earned but not yet withdrawn, including what the current
    /// balance has accrued since the last checkpoint.
    pub fn get_claimable(env: Env, investor: Address) -> i128 {
        let m = meta(&env);
        let already: i128 = env
            .storage()
            .persistent()
            .get(&StockKey::ClaimedDividend(investor.clone()))
            .unwrap_or(0);
        let pending: i128 = env
            .storage()
            .persistent()
            .get(&StockKey::PendingDividend(investor.clone()))
            .unwrap_or(0);
        let delta = m.dividend_per_token_accum - already;
        let balance = balance_of(&env, &investor);
        if delta > 0 && balance > 0 {
            pending + (balance * delta) / DIV_SCALE
        } else {
            pending
        }
    }

    pub fn get_mint_proof(env: Env, seq: u64) -> (Address, i128, BytesN<32>) {
        env.storage()
            .persistent()
            .get(&StockKey::MintProof(seq))
            .unwrap_or_else(|| panic!("Unknown mint"))
    }
}

#[cfg(test)]
mod test;
