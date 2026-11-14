#![cfg(test)]

use crate::{Error, PoolRegistry, PoolRegistryClient};
use soroban_sdk::testutils::{Address as _, Events as _};
use soroban_sdk::{Address, BytesN, Env, String, TryFromVal, Vec};

fn pairs(env: &Env) -> Vec<(Address, Address)> {
    let mut p: Vec<(Address, Address)> = Vec::new(env);
    p.push_back((Address::generate(env), Address::generate(env)));
    p
}

#[test]
fn register_and_read_back() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let addr = env.register(PoolRegistry, ());
    let c = PoolRegistryClient::new(&env, &addr);
    c.initialize(&admin, &factory);

    let maker = Address::generate(&env);
    let pool = Address::generate(&env);
    let key = BytesN::from_array(&env, &[1u8; 32]);
    c.register_maker(&maker, &key, &pool, &pairs(&env));

    let info = c.get_maker(&maker);
    assert_eq!(info.signer_key, key);
    assert_eq!(info.pool_address, pool);
    assert!(info.active);
    assert_eq!(c.get_signer_key(&maker), key);
    assert!(c.is_active(&maker));
    assert!(c.is_valid_signer(&maker, &key));
}

#[test]
fn double_registration_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let c = PoolRegistryClient::new(&env, &env.register(PoolRegistry, ()));
    c.initialize(&admin, &factory);

    let maker = Address::generate(&env);
    let pool = Address::generate(&env);
    let key = BytesN::from_array(&env, &[1u8; 32]);
    c.register_maker(&maker, &key, &pool, &pairs(&env));
    let res = c.try_register_maker(&maker, &key, &pool, &pairs(&env));
    assert_eq!(res, Err(Ok(Error::AlreadyRegistered.into())));
}

#[test]
fn update_signer_is_isolated_per_maker() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let c = PoolRegistryClient::new(&env, &env.register(PoolRegistry, ()));
    c.initialize(&admin, &factory);

    let maker_a = Address::generate(&env);
    let maker_b = Address::generate(&env);
    let pool = Address::generate(&env);
    let key_a = BytesN::from_array(&env, &[0xAA; 32]);
    let key_b = BytesN::from_array(&env, &[0xBB; 32]);
    c.register_maker(&maker_a, &key_a, &pool, &pairs(&env));
    c.register_maker(&maker_b, &key_b, &pool, &pairs(&env));

    // A rotates its own key; B is untouched.
    let key_a2 = BytesN::from_array(&env, &[0xCC; 32]);
    c.update_signer(&maker_a, &key_a2);
    assert_eq!(c.get_signer_key(&maker_a), key_a2);
    assert_eq!(c.get_signer_key(&maker_b), key_b);
}

#[test]
fn set_maker_active_toggles() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let c = PoolRegistryClient::new(&env, &env.register(PoolRegistry, ()));
    c.initialize(&admin, &factory);

    let maker = Address::generate(&env);
    let pool = Address::generate(&env);
    let key = BytesN::from_array(&env, &[1u8; 32]);
    c.register_maker(&maker, &key, &pool, &pairs(&env));

    c.set_maker_active(&maker, &false);
    assert!(!c.is_active(&maker));
    c.set_maker_active(&maker, &true);
    assert!(c.is_active(&maker));
}

#[test]
fn get_unknown_maker_errors() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let c = PoolRegistryClient::new(&env, &env.register(PoolRegistry, ()));
    c.initialize(&admin, &factory);

    // MakerInfo has no Debug/PartialEq, so unwrap the error side directly.
    let res = c.try_get_maker(&Address::generate(&env));
    let err = res.err().unwrap().unwrap();
    assert_eq!(err, Error::NotFound.into());
}

#[test]
fn update_signer_emits_event() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let addr = env.register(PoolRegistry, ());
    let c = PoolRegistryClient::new(&env, &addr);
    c.initialize(&admin, &factory);

    let maker = Address::generate(&env);
    let pool = Address::generate(&env);
    let key = BytesN::from_array(&env, &[1u8; 32]);
    c.register_maker(&maker, &key, &pool, &pairs(&env));

    let new_key = BytesN::from_array(&env, &[2u8; 32]);
    c.update_signer(&maker, &new_key);

    // Find the signer_updated event published by this contract and decode it.
    // Topics are published as &str (same as maker_registered), which become a String.
    let topic = String::from_str(&env, "signer_updated");
    let events = env.events().all();
    let found = events.iter().find(|(contract, topics, _)| {
        *contract == addr
            && topics.len() == 1
            && String::try_from_val(&env, &topics.get(0).unwrap()).ok() == Some(topic.clone())
    });
    let (_, _, data) = found.expect("signer_updated event not emitted");
    let (ev_maker, ev_key): (Address, BytesN<32>) =
        TryFromVal::try_from_val(&env, &data).expect("unexpected event payload shape");
    assert_eq!(ev_maker, maker);
    assert_eq!(ev_key, new_key);

    // Storage behaviour is unchanged.
    assert_eq!(c.get_signer_key(&maker), new_key);
}
