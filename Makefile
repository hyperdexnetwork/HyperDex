# HyperDex contracts: build and test.
#
# `make test` works on a clean clone. The maker_pool_factory tests embed the
# optimized maker_pool WASM, so it is built and optimized first.
#
# Requires: Rust with the wasm32v1-none target, and the Stellar CLI (`stellar`).

POOL_WASM     := target/wasm32v1-none/release/maker_pool.wasm
POOL_WASM_OPT := target/wasm32v1-none/release/maker_pool.optimized.wasm

.PHONY: build pool-wasm test clean

build:
	stellar contract build

pool-wasm: $(POOL_WASM_OPT)

$(POOL_WASM_OPT): contracts/maker_pool/src/*.rs contracts/maker_pool/Cargo.toml Cargo.lock
	stellar contract build --package maker_pool
	stellar contract optimize --wasm $(POOL_WASM) --wasm-out $(POOL_WASM_OPT)

test: pool-wasm
	cargo test --workspace

clean:
	cargo clean
