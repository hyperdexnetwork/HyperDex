#![cfg(test)]

use crate::{Error, MakerPool, MakerPoolClient};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{token, Address, Env};

// `verifier` and `eurc` are kept for tests that need them.
#[allow(dead_code)]
struct Ctx {
    env: Env,
    pool: Address,
    owner: Address,
    verifier: Address,
    usdc: Address,
    eurc: Address,
}

fn setup() -> Ctx {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let verifier = Address::generate(&env);
    let usdc = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let eurc = env.register_stellar_asset_contract_v2(admin.clone()).address();

    let pool = env.register(MakerPool, ());
    let client = MakerPoolClient::new(&env, &pool);
    client.initialize(&owner, &verifier, &usdc, &eurc);

    // Fund owner with USDC.
    token::StellarAssetClient::new(&env, &usdc).mint(&owner, &50_000_000);

    Ctx { env, pool, owner, verifier, usdc, eurc }
}

fn pool<'a>(c: &'a Ctx) -> MakerPoolClient<'a> {
    MakerPoolClient::new(&c.env, &c.pool)
}

#[test]
fn deposit_and_withdraw_owner() {
    let c = setup();
    pool(&c).deposit(&c.owner, &c.usdc, &10_000_000);
    assert_eq!(pool(&c).get_balance(&c.usdc), 10_000_000);
    assert_eq!(token::Client::new(&c.env, &c.usdc).balance(&c.pool), 10_000_000);

    pool(&c).withdraw(&c.owner, &c.usdc, &4_000_000);
    assert_eq!(pool(&c).get_balance(&c.usdc), 6_000_000);
    assert_eq!(token::Client::new(&c.env, &c.usdc).balance(&c.owner), 44_000_000);
}

#[test]
fn deposit_by_non_owner_rejected() {
    let c = setup();
    let intruder = Address::generate(&c.env);
    token::StellarAssetClient::new(&c.env, &c.usdc).mint(&intruder, &10_000_000);
    // require_auth passes (mock), but the owner check must reject the intruder.
    let res = pool(&c).try_deposit(&intruder, &c.usdc, &1_000_000);
    assert_eq!(res, Err(Ok(Error::Unauthorized.into())));
}

#[test]
fn withdraw_by_non_owner_rejected() {
    let c = setup();
    pool(&c).deposit(&c.owner, &c.usdc, &10_000_000);
    let intruder = Address::generate(&c.env);
    let res = pool(&c).try_withdraw(&intruder, &c.usdc, &1_000_000);
    assert_eq!(res, Err(Ok(Error::Unauthorized.into())));
}

#[test]
fn withdraw_over_balance_rejected() {
    let c = setup();
    pool(&c).deposit(&c.owner, &c.usdc, &5_000_000);
    let res = pool(&c).try_withdraw(&c.owner, &c.usdc, &6_000_000);
    assert_eq!(res, Err(Ok(Error::InsufficientBalance.into())));
}

#[test]
fn deposit_unwhitelisted_token_rejected() {
    let c = setup();
    let bogus = env_token(&c.env);
    let res = pool(&c).try_deposit(&c.owner, &bogus, &1_000_000);
    assert_eq!(res, Err(Ok(Error::InvalidToken.into())));
}

#[test]
fn execute_swap_requires_verifier_auth() {
    // No mock_all_auths: a direct caller cannot satisfy verifier.require_auth().
    let env = Env::default();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let verifier = Address::generate(&env);
    let taker = Address::generate(&env);
    let usdc = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let eurc = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let pool_addr = env.register(MakerPool, ());
    let client = MakerPoolClient::new(&env, &pool_addr);
    // initialize requires no auth in this contract, so it succeeds without mocks.
    client.initialize(&owner, &verifier, &usdc, &eurc);

    let res = client.try_execute_swap(
        &usdc, &eurc, &1_000_000, &900_000, &taker, &100, &verifier,
    );
    // Missing authorization for `verifier` → the call fails (auth error), not a swap.
    assert!(res.is_err());
}

fn env_token(env: &Env) -> Address {
    let a = Address::generate(env);
    env.register_stellar_asset_contract_v2(a).address()
}
