#[cfg(test)]
mod settlement_tests {
    use crate::{Error, Quote, QuoteVerifier, QuoteVerifierClient};
    use ed25519_dalek::{Signer, SigningKey};
    use soroban_sdk::testutils::{Address as _, Ledger as _};
    use soroban_sdk::xdr::ToXdr;
    use soroban_sdk::{token, Address, BytesN, Env, Vec};

    const FEE_BPS: u32 = 10; // 0.1%
    const AMOUNT_IN: i128 = 10_000_000;
    const AMOUNT_OUT: i128 = 9_240_000;

    struct Fixture {
        env: Env,
        verifier_addr: Address,
        registry_addr: Address,
        pool_addr: Address,
        maker: Address,
        taker: Address,
        usdc: Address,
        eurc: Address,
        fee_distributor: Address,
        signing_key: SigningKey,
    }

    impl Fixture {
        fn verifier(&self) -> QuoteVerifierClient<'_> {
            QuoteVerifierClient::new(&self.env, &self.verifier_addr)
        }
        fn registry(&self) -> pool_registry::PoolRegistryClient<'_> {
            pool_registry::PoolRegistryClient::new(&self.env, &self.registry_addr)
        }
        fn usdc_token(&self) -> token::Client<'_> {
            token::Client::new(&self.env, &self.usdc)
        }
        fn eurc_token(&self) -> token::Client<'_> {
            token::Client::new(&self.env, &self.eurc)
        }
    }

    fn signer_from_seed(seed: u8) -> SigningKey {
        SigningKey::from_bytes(&[seed; 32])
    }

    /// Wire up the full settlement stack the way it runs on-chain:
    /// registry + verifier + fee_distributor + a maker_pool holding token_out
    /// inventory, with the maker registered against a real ed25519 signer key.
    fn setup(signing_key: SigningKey) -> Fixture {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let maker = Address::generate(&env);
        let taker = Address::generate(&env);

        // Two SAC tokens standing in for USDC / EURC.
        let usdc = env.register_stellar_asset_contract_v2(admin.clone()).address();
        let eurc = env.register_stellar_asset_contract_v2(admin.clone()).address();
        let usdc_admin = token::StellarAssetClient::new(&env, &usdc);
        let eurc_admin = token::StellarAssetClient::new(&env, &eurc);

        // Contracts.
        let registry_addr = env.register(pool_registry::PoolRegistry, ());
        let registry = pool_registry::PoolRegistryClient::new(&env, &registry_addr);
        let fee_distributor = env.register(fee_distributor::FeeDistributor, ());
        let fd_client = fee_distributor::FeeDistributorClient::new(&env, &fee_distributor);
        let verifier_addr = env.register(QuoteVerifier, ());
        let verifier = QuoteVerifierClient::new(&env, &verifier_addr);
        let pool_addr = env.register(maker_pool::MakerPool, ());
        let pool = maker_pool::MakerPoolClient::new(&env, &pool_addr);

        // Initialize everything.
        let factory = Address::generate(&env); // stand-in factory (mock_all_auths approves)
        registry.initialize(&admin, &factory);
        fd_client.initialize(&admin, &admin);
        verifier.initialize(&admin, &registry_addr, &fee_distributor, &usdc, &eurc, &FEE_BPS);

        let signer_key = BytesN::from_array(&env, &signing_key.verifying_key().to_bytes());
        pool.initialize(&maker, &verifier_addr, &usdc, &eurc);

        // Register the maker in the registry (factory-authed).
        let mut pairs: Vec<(Address, Address)> = Vec::new(&env);
        pairs.push_back((usdc.clone(), eurc.clone()));
        registry.register_maker(&maker, &signer_key, &pool_addr, &pairs);

        // Fund: maker deposits EURC (token_out) inventory; taker holds USDC (token_in).
        eurc_admin.mint(&maker, &20_000_000);
        pool.deposit(&maker, &eurc, &20_000_000);
        usdc_admin.mint(&taker, &AMOUNT_IN);

        Fixture {
            env,
            verifier_addr,
            registry_addr,
            pool_addr,
            maker,
            taker,
            usdc,
            eurc,
            fee_distributor,
            signing_key,
        }
    }

    fn make_quote(f: &Fixture, quote_id: u8, expiry: u64) -> Quote {
        Quote {
            quote_id: BytesN::from_array(&f.env, &[quote_id; 32]),
            maker: f.maker.clone(),
            taker: f.taker.clone(),
            token_in: f.usdc.clone(),
            token_out: f.eurc.clone(),
            amount_in: AMOUNT_IN,
            amount_out: AMOUNT_OUT,
            expiry,
            salt: BytesN::from_array(&f.env, &[0x99; 32]),
        }
    }

    /// Sign sha256(XDR(quote)) exactly as the SDK and contract expect.
    fn sign(f: &Fixture, quote: &Quote, key: &SigningKey) -> BytesN<64> {
        let xdr = quote.clone().to_xdr(&f.env);
        let digest = f.env.crypto().sha256(&xdr).to_array();
        let sig = key.sign(&digest);
        BytesN::from_array(&f.env, &sig.to_bytes())
    }

    #[test]
    fn happy_path_settles_and_splits_fee() {
        let f = setup(signer_from_seed(1));
        let quote = make_quote(&f, 0x01, 2000);
        let sig = sign(&f, &quote, &f.signing_key);

        f.verifier().execute_quote(&quote, &sig);

        let fee = AMOUNT_OUT * (FEE_BPS as i128) / 10_000;
        let taker_gets = AMOUNT_OUT - fee;

        // Taker received token_out net of fee; fee landed in the distributor.
        assert_eq!(f.eurc_token().balance(&f.taker), taker_gets);
        assert_eq!(f.eurc_token().balance(&f.fee_distributor), fee);
        // Taker's token_in was pulled into the pool.
        assert_eq!(f.usdc_token().balance(&f.taker), 0);
        assert_eq!(f.usdc_token().balance(&f.pool_addr), AMOUNT_IN);
        // Pool paid out exactly amount_out of token_out.
        assert_eq!(f.eurc_token().balance(&f.pool_addr), 20_000_000 - AMOUNT_OUT);
    }

    #[test]
    fn replay_is_rejected() {
        let f = setup(signer_from_seed(2));
        let quote = make_quote(&f, 0x02, 2000);
        let sig = sign(&f, &quote, &f.signing_key);

        f.verifier().execute_quote(&quote, &sig);
        // Same quote_id again → QuoteAlreadyUsed.
        let res = f.verifier().try_execute_quote(&quote, &sig);
        assert_eq!(res, Err(Ok(Error::QuoteAlreadyUsed.into())));
    }

    #[test]
    fn expired_quote_is_rejected() {
        let f = setup(signer_from_seed(3));
        // Advance ledger time past the quote's expiry.
        f.env.ledger().with_mut(|li| li.timestamp = 5000);
        let quote = make_quote(&f, 0x03, 2000);
        let sig = sign(&f, &quote, &f.signing_key);

        let res = f.verifier().try_execute_quote(&quote, &sig);
        assert_eq!(res, Err(Ok(Error::QuoteExpired.into())));
    }

    #[test]
    fn same_token_in_and_out_is_rejected() {
        let f = setup(signer_from_seed(4));
        let mut quote = make_quote(&f, 0x04, 2000);
        quote.token_out = f.usdc.clone(); // token_in == token_out
        let sig = sign(&f, &quote, &f.signing_key);

        let res = f.verifier().try_execute_quote(&quote, &sig);
        assert_eq!(res, Err(Ok(Error::InvalidTokens.into())));
    }

    #[test]
    fn non_whitelisted_token_is_rejected() {
        let f = setup(signer_from_seed(5));
        let bogus = env_random_token(&f.env);
        let mut quote = make_quote(&f, 0x05, 2000);
        quote.token_out = bogus;
        let sig = sign(&f, &quote, &f.signing_key);

        let res = f.verifier().try_execute_quote(&quote, &sig);
        assert_eq!(res, Err(Ok(Error::InvalidTokens.into())));
    }

    #[test]
    #[should_panic] // ed25519_verify traps on a bad signature
    fn forged_signature_is_rejected() {
        let f = setup(signer_from_seed(6));
        let quote = make_quote(&f, 0x06, 2000);
        // Sign with a DIFFERENT key than the one registered.
        let wrong = signer_from_seed(200);
        let sig = sign(&f, &quote, &wrong);

        f.verifier().execute_quote(&quote, &sig);
    }

    #[test]
    fn tampered_amount_is_rejected() {
        let f = setup(signer_from_seed(7));
        let quote = make_quote(&f, 0x07, 2000);
        let sig = sign(&f, &quote, &f.signing_key);
        // Attacker bumps amount_out after signing.
        let mut tampered = quote.clone();
        tampered.amount_out = AMOUNT_OUT * 2;
        let res = f.verifier().try_execute_quote(&tampered, &sig);
        assert!(res.is_err());
    }

    #[test]
    fn inactive_maker_is_rejected() {
        let f = setup(signer_from_seed(8));
        f.registry().set_maker_active(&f.maker, &false);
        let quote = make_quote(&f, 0x08, 2000);
        let sig = sign(&f, &quote, &f.signing_key);

        let res = f.verifier().try_execute_quote(&quote, &sig);
        assert_eq!(res, Err(Ok(Error::InvalidSigner.into())));
    }

    #[test]
    fn fee_bps_above_max_is_rejected_at_init() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let registry = env.register(pool_registry::PoolRegistry, ());
        let fd = env.register(fee_distributor::FeeDistributor, ());
        let usdc = env.register_stellar_asset_contract_v2(admin.clone()).address();
        let eurc = env.register_stellar_asset_contract_v2(admin.clone()).address();
        let verifier = QuoteVerifierClient::new(&env, &env.register(QuoteVerifier, ()));

        let res = verifier.try_initialize(&admin, &registry, &fd, &usdc, &eurc, &10_001);
        assert_eq!(res, Err(Ok(Error::InvalidFee.into())));
    }

    #[test]
    fn set_fee_bps_boundary() {
        let f = setup(signer_from_seed(10));
        // Exactly MAX_FEE_BPS is allowed.
        f.verifier().set_fee_bps(&10_000);
        assert_eq!(f.verifier().get_protocol_fee(), 10_000);
        // One over the bound is rejected.
        let res = f.verifier().try_set_fee_bps(&10_001);
        assert_eq!(res, Err(Ok(Error::InvalidFee.into())));
    }

    #[test]
    fn set_fee_bps_requires_admin_auth() {
        let f = setup(signer_from_seed(11));
        // Drop the blanket auth mock and authorize nothing: admin.require_auth
        // inside set_fee_bps must now reject the call.
        f.env.mock_auths(&[]);
        let res = f.verifier().try_set_fee_bps(&50);
        assert!(res.is_err(), "set_fee_bps must require the admin's authorization");
    }

    /// Genuine proof (not hidden by mock_all_auths) that settlement pulls the
    /// taker's funds only under the taker's own authorization: the taker address
    /// appears in the exercised auth set, covering the nested token_in transfer.
    #[test]
    fn taker_authorization_is_exercised() {
        let f = setup(signer_from_seed(12));
        let quote = make_quote(&f, 0x12, 2000);
        let sig = sign(&f, &quote, &f.signing_key);

        f.verifier().execute_quote(&quote, &sig);

        let auths = f.env.auths();
        assert!(
            auths.iter().any(|(addr, _)| addr == &f.taker),
            "settlement must require the taker's authorization"
        );
    }

    /// The negative of the above: with real auth enforced and nothing authorized,
    /// settlement must fail rather than silently pull the taker's tokens.
    #[test]
    fn settlement_without_taker_auth_fails() {
        let f = setup(signer_from_seed(13));
        let quote = make_quote(&f, 0x13, 2000);
        let sig = sign(&f, &quote, &f.signing_key);

        f.env.mock_auths(&[]);
        let res = f.verifier().try_execute_quote(&quote, &sig);
        assert!(res.is_err(), "settlement must fail when the taker has not authorized it");
    }

    fn env_random_token(env: &Env) -> Address {
        let admin = Address::generate(env);
        env.register_stellar_asset_contract_v2(admin).address()
    }
}

#[cfg(test)]
mod serialization_tests {
    extern crate std;
    use std::{format, vec::Vec};

    use soroban_sdk::{Address, BytesN, Env, xdr::ToXdr};
    use crate::Quote;

    fn make_bytes32(b: u8) -> [u8; 32] {
        [b; 32]
    }

    fn test_quote(env: &Env) -> Quote {
        Quote {
            quote_id: BytesN::from_array(env, &make_bytes32(0x01)),
            maker:    Address::from_str(env, "GALNCMRJ2GCQ34RH7L55HZLUCZ3EHDIKPWTNTWDGVJ4FJWCP5GDVA726"),
            taker:    Address::from_str(env, "GABIRDNI5LREXRZQ7RS34CE7WOWL6ZQSK3UVFJAH4R54P255OSHNEP5A"),
            token_in:  Address::from_str(env, "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"),
            token_out: Address::from_str(env, "CDOIV56NSBNVNZN4XPTOT7JVRK6AW4RUISEPYUZYIIKMVIY7X3OH4S5X"),
            amount_in:  10_000_000,
            amount_out:  9_240_000,
            expiry: 1_800_000_000,
            salt: BytesN::from_array(env, &make_bytes32(0x02)),
        }
    }

    #[test]
    fn test_quote_xdr_order_and_length() {
        let env = Env::default();
        let xdr_bytes = test_quote(&env).to_xdr(&env);
        let len = xdr_bytes.len();

        let raw: Vec<u8> = xdr_bytes.iter().collect();
        let hex: std::string::String = raw.iter().map(|b| format!("{:02x}", b)).collect();

        let hash = env.crypto().sha256(&xdr_bytes);
        let hash_hex: std::string::String = hash.to_array().iter().map(|b| format!("{:02x}", b)).collect();

        std::eprintln!("XDR length: {}", len);
        std::eprintln!("XDR hex: {}", hex);
        std::eprintln!("SHA256: {}", hash_hex);

        assert_eq!(len, 464, "XDR length should be 464 bytes");
    }

    #[test]
    fn test_quote_hash_matches_typescript() {
        let env = Env::default();
        let xdr_bytes = test_quote(&env).to_xdr(&env);
        let hash = env.crypto().sha256(&xdr_bytes);
        let hash_arr = hash.to_array();
        let hash_hex: std::string::String = hash_arr.iter().map(|b| format!("{:02x}", b)).collect();

        // This hash was verified to match the TypeScript serializer output in
        // maker-sdk/src/serializer.ts (alphabetical field order, ScvMap XDR encoding).
        let expected = "ff65f4b0ee5af00d0c3faa902e50be2d1db3ecc4ce5ae963a1d3c0d229822584";
        assert_eq!(hash_hex, expected, "Rust and TypeScript must produce the same SHA256 hash");
    }
}
