#![cfg(test)]

// NOTE: this test deploys the real maker_pool via the factory, so it embeds the
// compiled pool WASM. It uses the *optimized* artifact: rustc 1.95 forces the
// wasm reference-types extension on, which the soroban-env-host validator rejects
// ("reference-types not enabled"); `stellar contract optimize` (run by
// scripts/deploy-v2.sh) lowers it to the MVP feature set the host accepts.
// Build + optimize the pool before `cargo test`:
//   cargo build --release --target wasm32-unknown-unknown
//   stellar contract optimize --wasm target/wasm32-unknown-unknown/release/maker_pool.wasm
mod pool_wasm {
    soroban_sdk::contractimport!(
        file = "../../target/wasm32v1-none/release/maker_pool.optimized.wasm"
    );
}

use crate::{Error, MakerPoolFactory, MakerPoolFactoryClient};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, BytesN, Env, Vec};

struct Ctx {
    env: Env,
    factory: Address,
    registry: Address,
    usdc: Address,
    eurc: Address,
}

fn pairs(env: &Env, usdc: &Address, eurc: &Address) -> Vec<(Address, Address)> {
    let mut p: Vec<(Address, Address)> = Vec::new(env);
    p.push_back((usdc.clone(), eurc.clone()));
    p
}

fn setup() -> Ctx {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let quote_verifier = Address::generate(&env);
    let fee_distributor = Address::generate(&env);
    let usdc = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let eurc = env.register_stellar_asset_contract_v2(admin.clone()).address();

    // Real registry, told to trust the factory as its only registrar.
    let registry_addr = env.register(pool_registry::PoolRegistry, ());
    let factory_addr = env.register(MakerPoolFactory, ());
    pool_registry::PoolRegistryClient::new(&env, &registry_addr)
        .initialize(&admin, &factory_addr);

    // Upload the pool WASM and initialize the factory with its hash.
    let wasm_hash = env.deployer().upload_contract_wasm(pool_wasm::WASM);
    MakerPoolFactoryClient::new(&env, &factory_addr).initialize(
        &admin,
        &registry_addr,
        &quote_verifier,
        &fee_distributor,
        &usdc,
        &eurc,
        &wasm_hash,
    );

    Ctx { env, factory: factory_addr, registry: registry_addr, usdc, eurc }
}

fn factory<'a>(c: &'a Ctx) -> MakerPoolFactoryClient<'a> {
    MakerPoolFactoryClient::new(&c.env, &c.factory)
}
fn registry<'a>(c: &'a Ctx) -> pool_registry::PoolRegistryClient<'a> {
    pool_registry::PoolRegistryClient::new(&c.env, &c.registry)
}

/// deploy_pool atomically deploys the pool, initializes it with the maker as
/// owner + signer, and registers it in the registry with the deployed address.
#[test]
fn deploy_initializes_and_registers() {
    let c = setup();
    let maker = Address::generate(&c.env);
    let signer = BytesN::from_array(&c.env, &[0x11; 32]);

    let pool = factory(&c).deploy_pool(&maker, &signer, &pairs(&c.env, &c.usdc, &c.eurc));

    // Factory records the maker → pool mapping.
    assert_eq!(factory(&c).get_pool(&maker), Some(pool.clone()));

    // Registry holds the deployed pool address, the signer, and active = true.
    let info = registry(&c).get_maker(&maker);
    assert_eq!(info.pool_address, pool);
    assert_eq!(info.signer_key, signer);
    assert!(info.active);

    // The deployed pool itself was initialized with the maker as owner. (The
    // signer key lives only in the registry — asserted above — not in the pool.)
    let p = pool_wasm::Client::new(&c.env, &pool);
    assert_eq!(p.get_owner(), maker);
}

/// A maker may deploy exactly one pool; a second attempt is rejected.
#[test]
fn duplicate_pool_rejected() {
    let c = setup();
    let maker = Address::generate(&c.env);
    let signer = BytesN::from_array(&c.env, &[0x22; 32]);

    factory(&c).deploy_pool(&maker, &signer, &pairs(&c.env, &c.usdc, &c.eurc));
    let res = factory(&c).try_deploy_pool(&maker, &signer, &pairs(&c.env, &c.usdc, &c.eurc));
    assert_eq!(res, Err(Ok(Error::PoolAlreadyDeployed.into())));
}

/// The salt is derived from the maker address, so distinct makers get distinct
/// pool addresses and one maker's deploy cannot occupy another's address.
#[test]
fn distinct_makers_get_distinct_pools() {
    let c = setup();
    let m1 = Address::generate(&c.env);
    let m2 = Address::generate(&c.env);
    let signer = BytesN::from_array(&c.env, &[0x33; 32]);

    let p1 = factory(&c).deploy_pool(&m1, &signer, &pairs(&c.env, &c.usdc, &c.eurc));
    let p2 = factory(&c).deploy_pool(&m2, &signer, &pairs(&c.env, &c.usdc, &c.eurc));

    assert_ne!(p1, p2);
    assert_eq!(factory(&c).get_pool(&m1), Some(p1));
    assert_eq!(factory(&c).get_pool(&m2), Some(p2));
}

#[test]
fn get_pool_is_none_before_deploy() {
    let c = setup();
    let maker = Address::generate(&c.env);
    assert_eq!(factory(&c).get_pool(&maker), None);
}
