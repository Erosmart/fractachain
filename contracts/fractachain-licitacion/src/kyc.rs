use soroban_sdk::{contracttype, Address, Env};

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InvestorType {
    National = 0,
    Foreign = 1,
    Qualified = 2,
    Institutional = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InvestorInfo {
    pub country_code: u32,
    pub investor_type: InvestorType,
    pub kyc_expiry: u64,
    pub is_active: bool,
    pub voting_rights: bool,
    pub registered_at: u64,
}

#[contracttype]
pub enum KycKey {
    Investor(Address),
    Admin,
}

pub fn is_gafi_blacklisted(country_code: u32) -> bool {
    country_code == 364 || country_code == 408 || country_code == 104
}

/// SHA-256 of the pubnet passphrase
/// `Public Global Stellar Network ; September 2015`.
///
/// `verify_investor` only applies the Mon–Fri 08:00–16:00 ART window on this
/// network. Testnet, futurenet, standalone and the local test Env all have a
/// different `network_id`, so they stay unrestricted for development.
const PUBNET_NETWORK_ID: [u8; 32] = [
    0x7a, 0xc3, 0x39, 0x97, 0x54, 0x4e, 0x31, 0x75, 0xd2, 0x66, 0xbd, 0x02, 0x24, 0x39, 0xb2, 0x2c,
    0xdb, 0x16, 0x50, 0x8c, 0x01, 0x16, 0x3f, 0x26, 0xe5, 0xcb, 0x2a, 0x3e, 0x10, 0x45, 0xa9, 0x79,
];

pub fn kyc_hours_enforced(env: &Env) -> bool {
    env.ledger().network_id().to_array() == PUBNET_NETWORK_ID
}

/// Monday–Friday 08:00–16:00 ART (UTC-3). Operational window, not a security boundary.
pub fn is_argentina_business_hours(timestamp: u64) -> bool {
    if timestamp < 10800 {
        return false;
    }
    let art_time = timestamp - 10800;
    let days_since_epoch = art_time / 86400;
    let day_of_week = (days_since_epoch + 4) % 7;
    let second_of_day = art_time % 86400;
    let hour = second_of_day / 3600;
    (1..=5).contains(&day_of_week) && (8..16).contains(&hour)
}

pub fn verify_investor(
    env: &Env,
    investor: &Address,
    country_code: u32,
    investor_type: InvestorType,
    expiry: u64,
) {
    if is_gafi_blacklisted(country_code) {
        panic!("Country is GAFI blacklisted");
    }

    let now = env.ledger().timestamp();
    if expiry <= now {
        panic!("KYC expiry must be in the future");
    }

    // Pubnet only. Testnet and local ledgers must be usable at any hour so we
    // can actually demo and integration-test the flow.
    if kyc_hours_enforced(env) && !is_argentina_business_hours(now) {
        panic!("Whitelist authorization only allowed during Argentine business hours (Mon-Fri 08:00-16:00 ART)");
    }

    let info = InvestorInfo {
        country_code,
        investor_type,
        kyc_expiry: expiry,
        is_active: true,
        voting_rights: true,
        registered_at: now,
    };

    env.storage()
        .persistent()
        .set(&KycKey::Investor(investor.clone()), &info);
    env.storage().persistent().extend_ttl(
        &KycKey::Investor(investor.clone()),
        fractachain_core::BUMP_THRESHOLD,
        fractachain_core::BUMP_TO,
    );
}

pub fn revoke_investor(env: &Env, investor: &Address) {
    if let Some(mut info) = get_investor_info(env, investor) {
        info.is_active = false;
        env.storage()
            .persistent()
            .set(&KycKey::Investor(investor.clone()), &info);
    }
}

pub fn set_voting_rights(env: &Env, investor: &Address, can_vote: bool) {
    write_voting_rights(env, investor, can_vote);
}

/// Applies a voting-rights change without requiring anyone's signature.
///
/// Suspension for an unfulfilled mandatory tender offer is a protocol rule, not
/// an administrative decision, and it is detected while the *buyer* is the one
/// signing. Routing it through `set_voting_rights` made the admin's
/// `require_auth` fail inside that buyer's transaction, which reverted the whole
/// fill and locked the holder out of the secondary market permanently.
pub fn write_voting_rights(env: &Env, investor: &Address, can_vote: bool) {
    if let Some(mut info) = get_investor_info(env, investor) {
        info.voting_rights = can_vote;
        env.storage()
            .persistent()
            .set(&KycKey::Investor(investor.clone()), &info);
        env.storage().persistent().extend_ttl(
            &KycKey::Investor(investor.clone()),
            fractachain_core::BUMP_THRESHOLD,
            fractachain_core::BUMP_TO,
        );
    }
}

pub fn get_investor_info(env: &Env, investor: &Address) -> Option<InvestorInfo> {
    env.storage()
        .persistent()
        .get(&KycKey::Investor(investor.clone()))
}

pub fn is_investor_verified(env: &Env, investor: &Address) -> bool {
    if let Some(info) = get_investor_info(env, investor) {
        let now = env.ledger().timestamp();
        info.is_active && info.kyc_expiry > now && !is_gafi_blacklisted(info.country_code)
    } else {
        false
    }
}

pub fn has_voting_rights(env: &Env, investor: &Address) -> bool {
    if !is_investor_verified(env, investor) {
        return false;
    }
    get_investor_info(env, investor)
        .map(|i| i.voting_rights)
        .unwrap_or(false)
}
