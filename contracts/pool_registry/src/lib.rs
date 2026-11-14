#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error,
    Address, BytesN, Env, Vec,
};

const LEDGER_THRESHOLD: u32 = 1_000_000;
const LEDGER_BUMP: u32 = 1_500_000;

#[contracterror]
#[derive(Copy, Clone, PartialEq, Eq, Debug)]
pub enum Error {
    NotFound = 1,
    Unauthorized = 2,
    AlreadyRegistered = 3,
    NotInitialized = 4,
    AlreadyInitialized = 5,
}

#[contracttype]
#[derive(Clone)]
pub struct MakerInfo {
    pub maker: Address,
    pub signer_key: BytesN<32>,
    pub pool_address: Address,
    pub supported_pairs: Vec<(Address, Address)>,
    pub active: bool,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Factory,
    Maker(Address),
    Initialized,
}

#[contract]
pub struct PoolRegistry;

fn check_initialized(env: &Env) {
    if !env.storage().instance().has(&DataKey::Initialized) {
        panic_with_error!(env, Error::NotInitialized);
    }
}

#[contractimpl]
impl PoolRegistry {
    pub fn initialize(env: Env, admin: Address, factory: Address) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic_with_error!(env, Error::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Factory, &factory);
        env.storage().instance().set(&DataKey::Initialized, &true);
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    pub fn register_maker(
        env: Env,
        maker: Address,
        signer_key: BytesN<32>,
        pool_address: Address,
        pairs: Vec<(Address, Address)>,
    ) {
        // Only the factory may register makers; the factory already requires
        // maker auth before calling this during deploy_pool.
        check_initialized(&env);
        let factory: Address = env.storage().instance().get(&DataKey::Factory).unwrap();
        factory.require_auth();
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        let key = DataKey::Maker(maker.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(env, Error::AlreadyRegistered);
        }

        let info = MakerInfo {
            maker: maker.clone(),
            signer_key,
            pool_address,
            supported_pairs: pairs,
            active: true,
        };
        env.storage().persistent().set(&key, &info);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
        env.events().publish(("maker_registered",), maker);
    }

    pub fn update_signer(env: Env, maker: Address, new_signer_key: BytesN<32>) {
        maker.require_auth();
        let key = DataKey::Maker(maker.clone());
        let mut info: MakerInfo = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotFound));
        info.signer_key = new_signer_key.clone();
        env.storage().persistent().set(&key, &info);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
        env.events()
            .publish(("signer_updated",), (maker, new_signer_key));
    }

    pub fn set_maker_active(env: Env, maker: Address, active: bool) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized));
        admin.require_auth();
        let key = DataKey::Maker(maker.clone());
        let mut info: MakerInfo = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotFound));
        info.active = active;
        env.storage().persistent().set(&key, &info);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    /// Canonical single-read accessor. Bumps the entry's TTL, since this is
    /// the call quote_verifier makes on every swap (keeping active makers'
    /// data alive as a side effect of trading).
    pub fn get_maker(env: Env, maker: Address) -> MakerInfo {
        let key = DataKey::Maker(maker);
        let info: MakerInfo = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotFound));
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
        info
    }

    /// Pure read, no TTL side effect — used by off-chain callers only.
    pub fn get_pool_address(env: Env, maker: Address) -> Address {
        let key = DataKey::Maker(maker);
        let info: MakerInfo = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotFound));
        info.pool_address
    }

    /// Pure read, no TTL side effect — used by off-chain callers only.
    pub fn get_signer_key(env: Env, maker: Address) -> BytesN<32> {
        let key = DataKey::Maker(maker);
        let info: MakerInfo = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotFound));
        info.signer_key
    }

    pub fn is_active(env: Env, maker: Address) -> bool {
        let key = DataKey::Maker(maker);
        env.storage()
            .persistent()
            .get::<_, MakerInfo>(&key)
            .map(|i| i.active)
            .unwrap_or(false)
    }

    pub fn is_valid_signer(env: Env, maker: Address, signer_key: BytesN<32>) -> bool {
        let key = DataKey::Maker(maker);
        env.storage()
            .persistent()
            .get::<_, MakerInfo>(&key)
            .map(|i| i.active && i.signer_key == signer_key)
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod test;
