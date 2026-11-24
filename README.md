<div align="center">

<img width="2876" height="1566" alt="Screenshot from 2026-11-24 20-06-08" src="https://github.com/user-attachments/assets/1ef53c5b-5160-4c36-9cad-c2534e9bcfe0" />





<img src="https://img.shields.io/badge/Stellar-Soroban-7B2FBE?style=for-the-badge" />
<img src="https://img.shields.io/badge/Rust-1.70%2B-red?style=for-the-badge" />
<img src="https://img.shields.io/badge/Next.js-14-black?style=for-the-badge" />
<img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge" />
<img src="https://img.shields.io/badge/Network-Stellar%20Testnet-1BA6E0?style=for-the-badge" />
<img src="https://img.shields.io/badge/Audit-Not%20yet%20audited-orange?style=for-the-badge" />
<img src="https://img.shields.io/badge/Wallets-Stellar%20Wallets%20Kit-7B2FBE?style=for-the-badge" />

# HyperDex

### Sealed-bid RFQ for USDC ↔ EURC on Stellar Soroban: firm, size-specific quotes from competing makers, settled atomically.

**Taker requests quote → Maker signs off-chain → Soroban verifies ed25519 and settles atomically**

[Live App (Testnet)](https://hyperdex.live) · [Testnet API](https://backend-production-c4e14cb9.up.railway.app/health) · [Explorer](https://stellar.expert/explorer/testnet) · [Contracts](#-deployed-contracts) · [Architecture Spec](docs/TECHNICAL_ARCHITECTURE.md) · [Quick Start](#-quick-start)

</div>

> **Network status:** HyperDex runs on **Stellar Testnet only**, with free test funds. The contracts
> have not yet been independently audited.
>
> **Where HyperDex is going:** v3 turns HyperDex into an **RFQ liquidity and settlement layer**:
> wallet-to-wallet settlement with both parties authorising through Soroban, an on-chain maker
> registry, and every quote compared against the best SDEX and AMM route. Later, zero-knowledge
> compliance credentials let makers trade only with verified businesses. See
> [HyperDex v3: the vision](#-hyperdex-v3-the-vision).

---

## Table of Contents

- [Overview](#-overview)
- [Why HyperDex](#-why-hyperdex)
- [HyperDex v3: the vision](#-hyperdex-v3-the-vision)
- [How It Works](#-how-it-works)
- [Architecture](#-architecture) — full spec: [`docs/TECHNICAL_ARCHITECTURE.md`](docs/TECHNICAL_ARCHITECTURE.md)
- Target architecture (v3 settlement layer): [`docs/TARGET_ARCHITECTURE.md`](docs/TARGET_ARCHITECTURE.md)
- [Smart Contracts](#-smart-contracts)
- [Project Structure](#-project-structure)
- [Networks & Wallets](#-networks--wallets)
- [Deployed Contracts](#-deployed-contracts)
- [Backend & WebSocket Server](#-backend--websocket-server)
- [API Reference](#-api-reference)
- [Maker SDK](#-maker-sdk)
- [Frontend](#-frontend)
- [Quick Start](#-quick-start)
- [Testing](#-testing)
- [Security Notes](#-security-notes)
- [Tech Stack](#-tech-stack)

---

## 📌 Overview

HyperDex gives payment and stablecoin businesses **firm, size-specific USDC ↔ EURC quotes from competing market makers, settled atomically on Soroban**. Price discovery happens off-chain, where makers price the exact size requested; signature verification and settlement of both legs happen on-chain. HyperDex runs on Stellar Testnet and has not yet been independently audited.

The flow:

1. A **taker** requests a swap quote from the backend
2. The backend dispatches an **RFQ** to connected market makers over WebSocket
3. The best-priced **maker** signs the quote with an ed25519 hot key
4. The backend returns the signed quote to the taker
5. The taker submits the quote to Soroban — the **`quote_verifier`** contract verifies the signature and atomically settles the swap

**Price is never discovered on-chain. Only verified and settled.**

---

## 🧩 Why HyperDex

### The Problem: Route Estimates vs. Firm Prices

Stellar already has good on-chain liquidity: the protocol-level **SDEX order book and path payments**,
Soroban AMMs such as **Aquarius** and **Soroswap**, and the **Soroswap aggregator** that routes
across them. These give a route *estimate*. The amount received can change with trade size, with
pool and order-book depth, and between quoting and execution.

A business converting a known amount of USDC to EURC usually needs the reverse: an **exact amount
out, committed before it signs**, for that specific size. That is what a request-for-quote (RFQ)
provides, and it is how FX is quoted between businesses off-chain.

### How HyperDex Approaches It: a Sealed-Bid RFQ

```
RFQ Model (HyperDex)
├── Each maker prices the exact requested size off-chain
├── The quote is signed (ed25519) over every settlement field and bound to one taker
├── Bids are sealed: losing quotes are never published, and the winning quote can
│   only be executed by the taker it names
├── Fixed price: the trade settles at the signed amount_out minus the disclosed
│   0.10% protocol fee, or it does not settle at all (no slippage)
└── Inventory (v2): each maker's inventory sits in its own Soroban maker_pool contract.
    v3 removes the pools and settles directly from the maker's own account.
```

### What HyperDex Adds, and What It Doesn't

| Route-based swap (SDEX / AMM / aggregator) | HyperDex RFQ |
|---|---|
| Output is an estimate that depends on depth and timing | Output is fixed when the maker signs; the trade settles at that price or fails |
| Price comes from a pool curve or the order book | Price comes from competing makers quoting the exact size |
| Public, composable liquidity anyone can access | Liquidity from approved makers; approval is enforced off-chain by the backend today |
| No counterparty to approve | Taker and maker are both named in the signed quote |

HyperDex is **not** a replacement for the SDEX, path payments or AMMs. It adds a new liquidity
*source* (signed, size-specific quotes from professional makers) that is measured against them.
From v3, every quote is shown next to the best SDEX and AMM route for the same size.

### Related Work

- **SEP-38** — Stellar's standard API for anchor RFQ quotes (off-chain firm quotes).
- **TrustRFQ** — a signed-quote RFQ protocol for Stellar (Instaward, 2026).
- **Octarine Settlement** — Soroban RFQ / fixed-price settlement for RWAs.
- **SDEX, path payments, Aquarius, Soroswap and Phoenix** — on-chain liquidity on Stellar.
- **Aggregators and routers (LumAgg, SODAX, LI.FI)** — route across that on-chain liquidity.

HyperDex differs in three ways:
1. **A different kind of liquidity.** Aggregators route across AMM pools and order books. HyperDex
   supplies firm, maker-signed prices for an exact size, which an aggregator or wallet could route to
   as one more venue.
2. **Focus.** The USDC↔EURC FX corridor for payment businesses, with execution quality measured
   against SDEX and AMM routes rather than claimed.
3. **Working code since May 2026.** Contracts, backend, maker SDK and wallet integration, running on
   Stellar Testnet today.

---

## 🔭 HyperDex v3: the vision

> **HyperDex is an RFQ liquidity and settlement layer for stablecoin FX on Stellar.** Professional
> makers quote firm prices for the exact size requested. Each quote is compared against Stellar's own
> liquidity. The chosen trade settles atomically on Soroban, wallet to wallet, at the signed price,
> or not at all.

The full design is in [`docs/TARGET_ARCHITECTURE.md`](docs/TARGET_ARCHITECTURE.md).

### Who it serves

| Who | Role | What they get |
|---|---|---|
| **Makers** (OTC desks, market makers, treasury desks) | Supply quotes | Order flow without locking capital in pools; funds stay in their own accounts |
| **Integrators** (wallets, payment platforms, fintech APIs, aggregators) | Request and settle trades for their users | One API for firm USDC↔EURC conversion, with the best on-chain route shown alongside |
| **End businesses and users** | Reached through integrators | A known amount out before they sign |

### What changes from v2 to v3

| Today (v2) | v3 | Why |
|---|---|---|
| Custom ed25519 quote signature checked by `quote_verifier` | `hyperdex_settlement`: maker and taker both authorise the exact terms with Soroban `require_auth_for_args` (the official atomic-swap pattern) | Native replay protection, bound to the contract and the network; no custom signature scheme |
| One `maker_pool` per maker, inventory pre-deposited | Wallet-to-wallet settlement, no pools | Makers keep capital in their own accounts; nothing can be stranded in a contract |
| Maker approval enforced off-chain | `maker_registry`: on-chain approval, allowed pairs, size limits, global, pair and maker pauses | Venue rules enforced on-chain and visible to anyone |
| Admin can change the fee after a quote is signed; no taker minimum | Fee (10 bps, hard cap 50 bps) and `min_buy` are part of the signed terms | The taker gets what was signed, or the trade reverts |
| Single admin key; `fee_distributor` contract | Multisig admin; fees go straight to a multisig treasury | No single key controls the venue |
| No route comparison | Horizon strict-send paths (SDEX and AMM pools) compared with every quote, net of fees | Execution quality is measured, not claimed |
| 30-second sealed-bid auction window (plus a 750 ms single-shot deadline and a 10 s accept timer) | One quote-collection deadline of about 0.5–2 s, then on-chain validity until `expiry_ledger` | A price in about a second; validity enforced by the contract, not a UI timer. Bids stay sealed. |

### Later: compliance without personal data (ZK)

Businesses want to trade only with verified counterparties, but identity data does not belong on a
public ledger. After v3, HyperDex adds:

1. An **attestor** (a KYB provider, or an integrator that already onboards its customers) verifies a
   business and signs a credential for its Stellar address. The credential stays with the business.
2. The business's wallet generates a **zero-knowledge proof** that an approved attestor signed a
   valid credential for this address.
3. The `compliance_gate` contract verifies the proof with Stellar's BN254 host functions (Protocol 25)
   and records the credential's tier and expiry. **Makers can require it** before they trade.

On-chain, anyone can see that an address holds a credential of a given tier. Nobody can see who
issued it or any KYB data. Trade amounts stay public with this design; confidential settlement is a separate later step, by
integrating Stellar's existing privacy work (Stellar Private Payments, confidential tokens) rather
than building a new proof system. Design details:
[`TARGET_ARCHITECTURE.md` §3.4](docs/TARGET_ARCHITECTURE.md#34-compliance_gate--zk-compliance-credentials--status-later).

### Roadmap

| Phase | Builds |
|---|---|
| **v3** | Settlement and registry contracts, maker SDK authorization signing, sub-2-second quote collection, transaction builder, SDEX/AMM route comparison, multisig admin and treasury, fresh testnet deployment |
| **Next** | Integrator API (`/v1`: quote, build, submit, track), lifecycle tracking and reconciliation, risk limits, maker reliability scoring |
| **Later** | Maker smart accounts with scoped keys, inventory reservation, route fallback execution, more corridors, business tooling when integrators ask for it |
| **Later: ZK compliance credentials** | `compliance_gate` contract and credential circuit: takers prove KYB with a zero-knowledge proof, and makers can require it |
| **Later: confidential settlement** | Hide trade size and counterparties, with auditor view keys, by integrating Stellar Private Payments or confidential tokens once their ZK verifiers and audits are final |
| **Audit** | Independent security audit, fixes and verified WASM builds before any real-value launch |

HyperDex is non-custodial throughout: the service holds no signing keys and never holds user or
maker funds.

---

## ⚙️ How It Works

### 1. Quote Request & RFQ Dispatch

```
Taker enters: 20 EURC → USDC
        │
        ▼
POST /api/quote/start { tokenIn, tokenOut, amountIn, takerAddress }
        │
        ▼
Backend auction (used by the swap UI)
        ├── Pre-flight the taker (balance, trustlines)
        ├── Rank connected makers by their posted price levels
        ├── Dispatch the RFQ to the top makers via WebSocket
        ├── Collect sealed bids for 30 seconds
        └── Return the best quote (highest amountOut)

(The single-shot POST /api/quote endpoint gives makers a 750 ms deadline instead.)
```

### 2. Maker Pricing & Signing

```
Maker SDK receives RFQ
        │
        ▼
MakerEngine.getQuote(ctx)   ← pluggable pricing brain
        ├── Default engine: quote the maker's ghost price, fee-adjusted,
        │                   gated by an inventory check + drift guard
        ├── Custom engine:  any logic (live CEX feed, model, fixed rate…)
        ├── Build Quote struct { quoteId, maker, taker, tokenIn, tokenOut,
        │                         amountIn, amountOut, expiry, salt }
        └── Sign SHA256(XDR(quote)) with ed25519 hot key
        │
        ▼
Return { quote, signature } to backend → backend to taker
```

### 3. On-Chain Settlement (Soroban)

```
Taker calls: quote_verifier.execute_quote(quote, signature)
        │
        ├── Validate: expiry not passed (ledger.timestamp)
        ├── Validate: replay protection (quote_id not used before)
        ├── Validate: taker authorised the call (quote.taker.require_auth())
        ├── Verify: ed25519_verify(maker_signer_key, SHA256(XDR(quote)), sig)
        ├── Execute: maker_pool.execute_swap(quote)
        │     ├── Transfer taker's token_in → pool
        │     ├── Transfer pool's token_out → taker (amount_out - protocol_fee)
        │     └── Transfer protocol_fee (token_out) → fee_distributor
```

### 4. Trade Confirmation

```
Backend ConfirmationPoller
        ├── Polls Soroban RPC for TX status every 5s
        ├── Requires a `quote_executed` event from quote_verifier whose
        │   quote_id AND taker match the trade — a successful transaction
        │   alone is NOT accepted as proof of settlement
        ├── Reads the settled amounts from the maker pool's `swap_executed`
        │   event, accepted only from that maker's registered pool
        ├── Records amountOut (net), feeAmount, and amountInUsd
        ├── Pushes confirmation to maker SDK via WebSocket
        └── Maker SDK displays trade confirmation banner
```

> **Trade amounts.** `Trade.amountOut` stores the **net** the taker received;
> `feeAmount` is the protocol fee carved out on-chain. `amountOut + feeAmount`
> reconstructs the gross the maker signed. Records confirmed before this
> behaviour landed store the gross in `amountOut` with `feeAmount: 0`.

### Quote Struct

The maker signs `SHA256(XDR(quote))` with their registered ed25519 hot key. Soroban serializes `#[contracttype]` structs in **alphabetical field order**:

```rust
pub struct Quote {
    pub amount_in:  i128,        // taker sends this (in stroops)
    pub amount_out: i128,        // gross output; taker receives this minus the protocol fee
    pub expiry:     u64,         // unix timestamp in seconds (maker SDK default: 120s after signing)
    pub maker:      Address,     // registered maker Stellar address
    pub quote_id:   BytesN<32>,  // SHA256(params) — unique per quote
    pub salt:       BytesN<32>,  // random 32 bytes
    pub taker:      Address,     // specific taker address
    pub token_in:   Address,     // EURC or USDC SAC
    pub token_out:  Address,     // USDC or EURC SAC
}
```

> **Critical:** Field serialization order is **alphabetical** (`amount_in`, `amount_out`, `expiry`, …), not declaration order. Both the maker SDK serializer and the frontend must match this exactly or signature verification fails.

---

## 🏗 Architecture

> 📘 **Full technical specification: [`docs/TECHNICAL_ARCHITECTURE.md`](docs/TECHNICAL_ARCHITECTURE.md)**
>
> Contract-by-contract breakdown with auth tables, protocol sequence diagrams, Soroban storage
> layout and TTL strategy, typed Rust signatures, the event catalogue, a STRIDE threat model, and
> the component trust matrix. The summary below is the orientation; that document is the reference.

<img src="docs/static/img/architecture-overview.png" alt="HyperDex system architecture and full RFQ sequence" width="100%" />

### System Architecture Diagram

```
╔═══════════════════════════════════════════════════════════════════╗
║                      STELLAR TESTNET                              ║
║              (five Soroban contracts, testnet only)               ║
║                                                                   ║
║   ┌─────────────────────────────────────────────────────────┐    ║
║   │  Soroban Smart Contracts                                │    ║
║   │                                                         │    ║
║   │  ┌──────────────┐   ┌─────────────────────────────┐   │    ║
║   │  │ pool_registry│   │     quote_verifier           │   │    ║
║   │  │              │   │                              │   │    ║
║   │  │ maker → key  │   │ 1. validate expiry / replay  │   │    ║
║   │  │ signer map   │◄──│ 2. verify ed25519 signature  │   │    ║
║   │  └──────────────┘   │ 3. call maker_pool.swap()    │   │    ║
║   │                     └────────────┬────────────────-─┘   │    ║
║   │                                  │                       │    ║
║   │  ┌──────────────────────────────▼──────────────────┐   │    ║
║   │  │  maker_pool  (per-maker, deployed by factory)   │   │    ║
║   │  │                                                 │   │    ║
║   │  │  token_in (EURC) ──► pool ──► token_out (USDC)  │   │    ║
║   │  │  protocol fee  ──────────────► fee_distributor  │   │    ║
║   │  └─────────────────────────────────────────────────┘   │    ║
║   │                                                         │    ║
║   │  ┌──────────────┐   ┌──────────────────────────────┐  │    ║
║   │  │ maker_pool_  │   │     fee_distributor           │  │    ║
║   │  │ factory      │   │  accumulates 10 bps per swap  │  │    ║
║   │  │ deploys pools│   │  admin withdraws to treasury  │  │    ║
║   │  └──────────────┘   └──────────────────────────────┘  │    ║
║   └─────────────────────────────────────────────────────────┘    ║
╚═══════════════════════════════════════════════════════════════════╝
                              ▲  ▲
                              │  │ Soroban RPC
╔═══════════════════════════════════════════════════════════════════╗
║                     BACKEND (Node.js / Express)                   ║
║        Stellar Testnet                                            ║
║        https://backend-production-c4e14cb9.up.railway.app         ║
║                                                                   ║
║   REST API ──── /api/quote ──────────────── RFQ Router            ║
║                 /api/trades                      │                ║
║                 /api/makers                      │ WebSocket      ║
║                 /health                   ┌──────▼────────┐      ║
║                                           │  WsServer     │      ║
║   Confirmation ──── Horizon Poller        │               │      ║
║   Poller             (every 5s)           │  maker conns  │      ║
║                                           └──────┬────────┘      ║
║   MongoDB ──── trades, makers,                   │               ║
║                rate limits,                      │ WS messages   ║
║                price book                        │               ║
╚═══════════════════════════════════════════════════════════════════╝
                                                   │
╔══════════════════════════════════════════════════╪════════════════╗
║              MARKET MAKER SDK (Node.js)                           ║
║              http://localhost:3001                                ║
║                                                                   ║
║   MakerEngine — the pluggable pricing brain:                      ║
║     - default ghost-price engine, or custom via --engine          ║
║                                                                   ║
║   getLevels()   -> resting price levels, streamed every ~3s ─────►║
║   getQuote(ctx) -> signed amountOut per RFQ (null = skip) ───────►║
║                                                                   ║
║   Signer (ed25519) ──► Quote + Sig ──── to taker (via backend)    ║
║                                                                   ║
║   Trade Confirmed ◄─────── TradePushService push                  ║
╚═══════════════════════════════════════════════════════════════════╝
                    ▲
╔═══════════════════╪═══════════════════════════════════════════════╗
║           FRONTEND (Next.js 14)  ·  https://hyperdex.live         ║
║                   │                                               ║
║   /swap  ──── Quote UI ──────── POST /api/quote                   ║
║   /maker ──── Maker Dashboard ─ REST + WebSocket                  ║
║   /admin ──── Admin Panel ───── REST (admin-gated)                ║
║   /docs  ──── Protocol docs                                       ║
║                                                                   ║
║   Wallet:  Stellar Wallets Kit — Freighter · xBull · LOBSTR ·     ║
║            Rabet · Albedo · Hana · HOT Wallet · Ledger            ║
║   Network: Stellar Testnet only                                   ║
╚═══════════════════════════════════════════════════════════════════╝
```

### Full RFQ Sequence

```
Taker (browser)          Backend               Maker SDK           Soroban
      │                     │                      │                   │
      │─ POST /api/quote ──►│                      │                   │
      │                     │─── WS rfqRequest ───►│                   │
      │                     │                      │─ engine.getQuote  │
      │                     │                      │─ build quote      │
      │                     │                      │─ sign SHA256(XDR) │
      │                     │◄── WS rfqQuote ──────│                   │
      │◄─ { quote, sig } ───│                      │                   │
      │                     │                      │                   │
      │─ execute_quote() ──────────────────────────────────────────────►
      │                     │                      │  verify sig       │
      │                     │                      │  atomic swap      │
      │◄── TX hash ─────────────────────────────────────────────────── │
      │                     │                      │                   │
      │                     │─ poll Horizon ────────────────────────── │
      │                     │◄─ TX confirmed ──────────────────────────│
      │                     │─── WS tradeConfirmed ►│                  │
      │◄── trade status ────│                      │                   │
```

---

## 📜 Smart Contracts

All contracts are written in **Rust / Soroban SDK** and compiled to WebAssembly. They run on Stellar's Soroban smart contract platform.

### `pool_registry`

The single source of truth for registered market makers. Stores the ed25519 hot signing key that the `quote_verifier` uses to validate quotes.

| Function | Description |
|---|---|
| `register_maker(maker, signer_key)` | Register a maker address with their ed25519 public key |
| `update_signer(maker, new_key)` | Rotate signer key without downtime |
| `set_maker_active(maker, active)` | Pause/unpause a maker (admin or self) |
| `get_maker(maker)` | Returns `{ signer_key, active, registered_at }` |
| `get_all_makers()` | Returns list of all registered makers |

**Security:** Each maker's signing key is stored in persistent Soroban storage with extended TTL. Signer rotation is permissioned — only the maker themselves or admin can rotate.

### `quote_verifier`

The taker-facing entry point. Validates and settles every swap.

**Settlement logic:**
```
execute_quote(quote: Quote, signature: BytesN<64>)
  1. require!( ledger.timestamp() < quote.expiry )          // not expired
  2. require!( !used_quote_ids.contains(quote.quote_id) )  // no replay
  3. require!( quote.taker == env.invoker() )               // correct taker
  4. let signer_key = pool_registry.get_maker(quote.maker).signer_key
  5. ed25519_verify(signer_key, sha256(quote.to_xdr()), signature)  // valid sig
  6. used_quote_ids.insert(quote.quote_id)                  // mark used
  7. maker_pool.execute_swap(quote)                         // atomic settlement
```

| Function | Description |
|---|---|
| `execute_quote(quote, sig)` | Verify + settle a signed quote |
| `set_pool_registry(addr)` | Admin — set the registry contract address |
| `set_fee_distributor(addr)` | Admin — set fee distributor address |
| `set_protocol_fee_bps(bps)` | Admin — set protocol fee in basis points |

### `maker_pool` (per-maker, factory-deployed)

Each registered maker has their own isolated pool contract deployed by the factory. Holds token inventory, executes atomic swaps, and routes protocol fees.

| Function | Description |
|---|---|
| `deposit(token, amount)` | Maker deposits USDC or EURC inventory (2-TX: approve + deposit) |
| `withdraw(token, amount)` | Maker withdraws inventory |
| `execute_swap(quote)` | Called by `quote_verifier` — transfers token_in from taker, token_out to taker |
| `get_balances()` | Returns `{ usdc, eurc }` in stroops |

**Access control:** `execute_swap` requires `require_auth()` from the registered `quote_verifier` address — cannot be called directly.

**Persistent storage TTL:** All storage entries (`Usdc`, `Eurc`, `SignerKey`, `QuoteVerifier`, `Owner`) are extended on every `deposit()` and `withdraw()` call to prevent Soroban persistent-storage ledger expiry (the entry TTL is bumped on each state change).

### `maker_pool_factory`

Deploys new `maker_pool` contracts for registered makers using deterministic addressing.

| Function | Description |
|---|---|
| `deploy_pool(maker, signer_key)` | Deploy a pool for this maker; salt = `sha256(maker.to_xdr())` |
| `get_pool(maker)` | Returns deployed pool address for a maker |

**Deterministic salt:** `salt = sha256(maker.to_xdr())` — ensures the same pool address is computed in both simulation and execution (no ledger-sequence salt which would cause footprint mismatch).

### `fee_distributor`

Accumulates protocol fees (10 bps per swap). Admin withdraws to treasury.

| Function | Description |
|---|---|
| `withdraw_fees(token)` | Admin sweeps the contract's whole balance of `token` to the treasury |
| `get_fees(token)` | Returns the contract's current balance of `token` |

Fees arrive by a direct token transfer from the maker's pool during `execute_swap`; there is no
`collect_fee` call.

---

## 📁 Project Structure

```
HyperDex/
│
├── contracts/                        # Soroban smart contracts (Rust)
│   ├── pool_registry/                # Maker registration + signer key store
│   │   ├── src/
│   │   │   ├── lib.rs                # Contract entry points
│   │   │   └── types.rs              # MakerInfo, storage keys
│   │   └── Cargo.toml
│   │
│   ├── quote_verifier/               # Taker entry point — verify + settle
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   └── types.rs              # Quote struct (alphabetical field order)
│   │   └── Cargo.toml
│   │
│   ├── maker_pool/                   # Per-maker inventory vault + swap executor
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   └── types.rs
│   │   └── Cargo.toml
│   │
│   ├── maker_pool_factory/           # Factory — deploys maker_pool contracts
│   │   ├── src/
│   │   │   └── lib.rs
│   │   └── Cargo.toml
│   │
│   └── fee_distributor/              # Protocol fee accumulator
│       ├── src/
│       │   └── lib.rs
│       └── Cargo.toml
│
├── backend/                          # Node.js REST API + WebSocket server
│   ├── src/
│   │   ├── index.ts                  # Express app + WsServer bootstrap
│   │   │
│   │   ├── routes/
│   │   │   ├── quote.ts              # POST /api/quote — RFQ dispatch + auction
│   │   │   ├── makers.ts             # GET/POST /api/makers — CRUD + inventory
│   │   │   ├── trades.ts             # GET /api/trades — trade history + status
│   │   │   ├── health.ts             # GET /health
│   │   │   ├── admin.ts              # GET /api/admin — admin endpoints
│   │   │   └── adminPending.ts       # GET /api/admin/pending — maker approvals
│   │   │
│   │   ├── websocket/
│   │   │   ├── WsServer.ts           # WebSocket server — maker connections
│   │   │   ├── MakerConnection.ts    # Per-maker WS state + ping/pong
│   │   │   ├── TradePushService.ts   # Push trade confirmations to makers
│   │   │   ├── messages/             # WS message type definitions
│   │   │   └── handlers/
│   │   │       ├── onRfqQuote.ts     # Handle maker quote response
│   │   │       └── onError.ts        # Handle maker error / rate limit
│   │   │
│   │   └── utils/
│   │       └── logger.ts             # Winston logger
│   │
│   ├── package.json
│   ├── tsconfig.json
│   └── .env                          # See Environment Variables section
│
├── maker-sdk/                        # Market maker server (TypeScript)
│   ├── src/
│   │   ├── server.ts                 # Bootstrap: loads engine (--engine), WS client, dashboard
│   │   ├── ws-client.ts              # WebSocket to backend; drives engine.getQuote/getLevels
│   │   ├── types/
│   │   │   └── MakerEngine.ts        # ★ MakerEngine interface (getLevels/getQuote/onTradeConfirmed)
│   │   ├── engines/
│   │   │   └── default-engine.ts     # Built-in ghost-price engine (default)
│   │   ├── drift-guard.ts            # Warn >1% / pause quoting >3% vs oracle mid
│   │   ├── ghost-price.ts            # Ghost price state for the default engine
│   │   ├── index.ts                  # Public barrel: export { MakerEngine, ... }
│   │   ├── price-levels.ts           # Builds resting price tiers
│   │   ├── signer.ts                 # ed25519 sign/verify utilities
│   │   ├── serializer.ts             # Quote → XDR ScVal (alphabetical field order)
│   │   ├── oracle.ts                 # FX price feed (CoinGecko + fallbacks), cached
│   │   ├── rate-limiter.ts           # Per-taker RFQ rate limiting
│   │   ├── inventory-checker.ts      # Read pool balances from Soroban
│   │   ├── example-pricer.ts         # Ghost-price decision used by the default engine
│   │   ├── setup.ts                  # Interactive setup wizard
│   │   ├── activate.ts               # Activate maker after pool deployment
│   │   ├── generate-keypair.ts       # Generate ed25519 keypair
│   │   ├── update-signer.ts          # Update signer key on-chain
│   │   └── types.ts                  # Shared type definitions
│   │
│   ├── examples/                     # Custom engine templates for --engine
│   │   ├── fixed-rate-engine.ts      # Simplest engine: hard-coded rate
│   │   └── binance-engine.ts         # Live EUR/USD from Binance WebSocket
│   │
│   ├── credentials/                  # <name>.cred files (git-ignored — secrets)
│   ├── CUSTOM_ENGINE.md              # Guide: building a custom pricing engine
│   ├── TESTING_ENGINES.md            # Guide: E2E-testing engines + common pitfalls
│   ├── package.json
│   └── README.md                     # SDK quick start + engine plugin docs
│
├── frontend/                         # Next.js 14 App Router
│   ├── app/
│   │   ├── page.tsx                  # Landing page
│   │   ├── swap/page.tsx             # Taker swap UI — request quote + execute
│   │   ├── maker/page.tsx            # Maker dashboard — register, deposit, monitor
│   │   ├── admin/page.tsx            # Admin panel — approve maker applications
│   │   └── api/
│   │       └── maker-application/    # Next.js API routes (proxy to backend)
│   │
│   ├── hooks/
│   │   ├── useAuction.ts             # Quote polling + 30s countdown timer
│   │   ├── useIsAdmin.ts             # Check if connected wallet is admin
│   │   ├── useMakerState.ts          # Maker registration status polling
│   │   ├── useWallet.ts              # Wallet connect/disconnect (Wallets Kit)
│   │   └── useNetwork.ts             # Active network, hydration-safe
│   │
│   ├── lib/
│   │   ├── networks.ts               # ★ Network config — Stellar Testnet
│   │   ├── constants.ts              # Re-exports the ACTIVE network's addresses / URLs
│   │   ├── networkHeader.ts          # Tags /api/* calls with x-hyperdex-network
│   │   ├── server/backendTarget.ts   # Server side: header → backend origin
│   │   └── wallet/kit.ts             # ★ Stellar Wallets Kit — 8 wallets, connect / sign / restore
│   │
│   ├── store/                        # Zustand state stores
│   ├── components/                   # Shared UI components
│   │   └── wallet/                   # WalletSelectModal, WrongNetworkBanner
│   │
│   ├── .env.local                    # See Environment Variables section
│   └── next.config.js
│
├── scripts/                          # Deployment + utility scripts
│   ├── deploy-v2.sh                  # Deploy all contracts, write addrs to .env
│   ├── smoke-test.ts                 # Full E2E smoke test (npx ts-node)
│   ├── register-maker-mongodb.ts     # Register maker in MongoDB + issue API key
│   ├── reset-test-makers.ts          # Clear orphan makers so /maker restarts clean
│   ├── update-signer.ts              # Rotate a maker's on-chain signer key
│   ├── bootstrap-testnet-maker.sh    # Non-interactive testnet maker onboarding, end to end
│   └── check-system.sh               # Quick health/quote/inventory check
│                                     # (on-chain register + deposit are now done in the /maker UI)
│
├── docs/
│   ├── TECHNICAL_ARCHITECTURE.md     # ★ Full architecture spec — contracts, flows,
│   │                                 #   storage, events, STRIDE threat model
│   └── static/img/                   # Architecture diagrams
│
├── MAKER_REGISTRATION.md             # Maker onboarding guide (maker + admin flows)
└── README.md
```

---

## 🌐 Networks & Wallets

HyperDex runs on **Stellar Testnet only** and connects through **Stellar Wallets Kit** rather than a
single wallet vendor.

### Network configuration

`frontend/lib/networks.ts` holds the testnet `NetworkConfig`: passphrase, Soroban RPC, Horizon,
backend origin, explorer base, the five contract addresses, both token SACs and the admin address.
`lib/constants.ts` re-exports it under the names the rest of the app uses.

| | Testnet |
|---|---|
| Passphrase | `Test SDF Network ; September 2015` |
| Soroban RPC | `https://soroban-testnet.stellar.org` |
| Horizon | `https://horizon-testnet.stellar.org` |
| Backend | `https://backend-production-c4e14cb9.up.railway.app` |
| Explorer | `stellar.expert/explorer/testnet` |
| Funds | Free from Friendbot |

The backend reads `STELLAR_NETWORK`, which must be `testnet`; any other value fails config validation
at startup.

### `frontend/.env.local`

`NEXT_PUBLIC_TESTNET_*` variables are read first; the un-prefixed variables are a fallback.

```env
NEXT_PUBLIC_TESTNET_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_TESTNET_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_TESTNET_BACKEND_URL=https://backend-production-c4e14cb9.up.railway.app
NEXT_PUBLIC_TESTNET_POOL_REGISTRY_CONTRACT=CA4VDATAXPCSAJSDSTEZSCLVLIWMT6PYS5WJYITBQZWZ6JAFNP3Q5HNW
NEXT_PUBLIC_TESTNET_QUOTE_VERIFIER_CONTRACT=CAJ4UIEWD43ZH4F4HIL2NMPKZKLF5OHWNVJUUDQA2RH6A72ZRQVCCYS5
NEXT_PUBLIC_TESTNET_MAKER_POOL_FACTORY_ADDRESS=CAAQHM5YQUXIL62EJKVSXZDK45GIV4ZSTG4UAS5QFBQJN4ZSDDNXZWXD
NEXT_PUBLIC_TESTNET_FEE_DISTRIBUTOR_CONTRACT=CBVCMBPBGZZQGPFWII5HZCFPGSZ6HKR3URAQGXRDOFLYQVQS6GPSEPYR
NEXT_PUBLIC_TESTNET_USDC_CONTRACT=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
NEXT_PUBLIC_TESTNET_EURC_CONTRACT=CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ
NEXT_PUBLIC_TESTNET_ADMIN_ADDRESS=GARFDOK2ZNTGG3PXRPOUAEML37TAD6G2WL5RRN3JZHBEUQDKSO6GCEOH
```

> ⚠️ **Do not refactor these into a dynamic `process.env[key]` lookup.** Next.js only inlines
> statically-analysable `process.env.NEXT_PUBLIC_X` expressions; a computed key resolves to
> `undefined` in the browser.

### Running the testnet stack locally

```bash
# 1. Backend pointed at testnet (backend/.env)
#    STELLAR_NETWORK=testnet
#    STELLAR_RPC_URL=https://soroban-testnet.stellar.org
#    HORIZON_URL=https://horizon-testnet.stellar.org
#    ...testnet contract addresses
cd backend && npm run dev            # → port 4000

# 2. Bootstrap a maker end-to-end: apply → approve → signer key → deploy pool
bash scripts/bootstrap-testnet-maker.sh
# → writes maker-sdk/.env with API key, signer seed, pool address

# 3. Maker + frontend
cd maker-sdk && npm run dev
cd frontend  && npm run dev          # → http://localhost:3000
```

The bootstrap script is non-interactive and idempotent — if the pool already exists it reads the
address back from the factory and re-syncs the registry signer key, so the testnet environment can be
torn down and rebuilt at any time.

Fund an account with `curl "https://friendbot.stellar.org/?addr=<G...>"` or
`stellar keys generate <name> --network testnet --fund`.

> ⚠️ On **testnet**, Circle's USDC and EURC have **different issuers** (`GBBD47IF…` / centre.io and
> `GB3Q6QDZ…` / circle.com). Add a trustline to each; code must not assume one issuer for both.

### Stellar Wallets Kit integration

`@creit.tech/stellar-wallets-kit` ^2.5.0 replaces the previous Freighter-only path. Eight modules are
registered: **Freighter, xBull, LOBSTR, Rabet, Albedo, Hana, HOT Wallet and Ledger**. The integration
lives in [`frontend/lib/wallet/kit.ts`](frontend/lib/wallet/kit.ts).

| Concern | How it is handled |
|---|---|
| **SSR** | Imported dynamically and initialised lazily, browser-only — kit modules touch `window` and injected extension globals at construction, so an SSR import throws |
| **Picker UI** | HyperDex renders its own sheet instead of the kit's `authModal()`, so the connect flow carries the app theme; the kit still supplies the list, availability detection and every action |
| **Detection** | `refreshSupportedWallets()` re-runs each time the sheet opens — a wallet installed a moment ago shows up without a reload; installed wallets sort first, the rest get an *Install* link |
| **Network** | Kit is initialised to `Networks.TESTNET` |
| **Address** | Connect calls `fetchAddress()` (asks the wallet). `getAddress()` only reads the kit's in-memory value — always empty on a fresh connect — so it is used as the cheap path within a page-load |
| **Signing** | `signTransaction` pins **both** the active `networkPassphrase` and the connected `address`; the latter forces multi-account wallets (Albedo) to sign with the account the quote was bound to, instead of failing `txBadAuth` after the user already approved |
| **Errors** | The kit rejects with a plain `{ code, message }` object, not an `Error`; these are normalised so a user cancellation closes the sheet quietly and real failures keep their reason |
| **Timeouts** | 90 s on connect, 20 s on session restore — the UI can never hang on "Connecting…" |
| **Persistence** | Wallet id + display name in `localStorage`; restore runs **only** for a previously chosen wallet, so no module is probed and no permission prompt fires unasked |
| **Disconnect** | Clears local state and calls the module's `disconnect()` where implemented |

**Wrong-network guard.** After connecting, and again before every signature, the wallet's reported
passphrase is compared against Stellar Testnet. A mismatch raises a banner naming the connected
wallet and the expected network, and blocks signing before the wallet opens — a signature made
against the wrong passphrase is rejected on-chain as `txBadAuth`, *after* the user has approved it.
Wallets that expose no network (hardware, some bridges) return `null` and pass the connect-time
check; the signing-time check still applies.

```ts
// frontend/lib/wallet/kit.ts
const { signedTxXdr } = await kit.signTransaction(xdr, {
  networkPassphrase: ACTIVE_NETWORK.passphrase,  // Stellar Testnet
  address,                                       // pins WHICH account signs
});
```

---

## 🚀 Deployed Contracts

### Stellar Testnet

> Explorer: [https://stellar.expert/explorer/testnet](https://stellar.expert/explorer/testnet)
> Deployed 2026-08-24.

| Contract | Address | Explorer |
|---|---|---|
| **pool_registry** | `CA4VDATAXPCSAJSDSTEZSCLVLIWMT6PYS5WJYITBQZWZ6JAFNP3Q5HNW` | [view](https://stellar.expert/explorer/testnet/contract/CA4VDATAXPCSAJSDSTEZSCLVLIWMT6PYS5WJYITBQZWZ6JAFNP3Q5HNW) |
| **quote_verifier** | `CAJ4UIEWD43ZH4F4HIL2NMPKZKLF5OHWNVJUUDQA2RH6A72ZRQVCCYS5` | [view](https://stellar.expert/explorer/testnet/contract/CAJ4UIEWD43ZH4F4HIL2NMPKZKLF5OHWNVJUUDQA2RH6A72ZRQVCCYS5) |
| **maker_pool_factory** | `CAAQHM5YQUXIL62EJKVSXZDK45GIV4ZSTG4UAS5QFBQJN4ZSDDNXZWXD` | [view](https://stellar.expert/explorer/testnet/contract/CAAQHM5YQUXIL62EJKVSXZDK45GIV4ZSTG4UAS5QFBQJN4ZSDDNXZWXD) |
| **fee_distributor** | `CBVCMBPBGZZQGPFWII5HZCFPGSZ6HKR3URAQGXRDOFLYQVQS6GPSEPYR` | [view](https://stellar.expert/explorer/testnet/contract/CBVCMBPBGZZQGPFWII5HZCFPGSZ6HKR3URAQGXRDOFLYQVQS6GPSEPYR) |
| **USDC SAC** | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` | [view](https://stellar.expert/explorer/testnet/contract/CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA) |
| **EURC SAC** | `CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ` | [view](https://stellar.expert/explorer/testnet/contract/CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ) |

**Admin:** `GARFDOK2ZNTGG3PXRPOUAEML37TAD6G2WL5RRN3JZHBEUQDKSO6GCEOH`
**USDC Issuer:** `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` (Circle testnet — centre.io)
**EURC Issuer:** `GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO` (Circle testnet — circle.com)

> The two testnet assets have **different issuers**. Add a trustline to each.

---

## 🤖 Backend & WebSocket Server

### Service Architecture

The backend handles two concerns: **REST API** for the frontend and **WebSocket server** for maker SDK connections.

```
Express HTTP Server (:4000)
├── POST /api/quote        ─── RFQ auction (30s sealed-bid window, best-quote wins)
├── GET  /api/makers       ─── List makers + connection status
├── GET  /api/trades       ─── Trade history + status polling
├── GET  /health           ─── { activeMakers, priceBookEntries, dbStatus }
├── POST /api/makers/apply ─── Maker application (stores in MongoDB)
└── GET  /api/admin/...    ─── Admin: list/approve/reject pending makers

WebSocket Server (:4000/ws/maker)
├── Auth: Authorization: Bearer <api_key>  (hashed in MongoDB)
├── MakerConnection  ─── per-maker state, ping/pong heartbeat (30s)
├── RFQ dispatch     ─── { type: "rfqRequest", ... } → maker
├── Quote receipt    ─── { type: "rfqQuote", ... }   ← maker
├── Price levels     ─── { type: "priceLevels", ... } ← maker (every ~3s)
├── Trade push       ─── { type: "tradeConfirmed", ... } → maker
└── Rate limit       ─── { type: "rfqError", reason: "rate_limit" } ← maker
```

### RFQ Auction (30s Quote Window)

```
POST /api/quote/start              → opens a 30s sealed-bid auction
  │
  ├── Pre-flight the taker (trustlines + tokenIn balance) — reject early
  ├── Rank makers from the price book (those quoting the pair)
  ├── Dispatch rfqRequest to each ranked maker over WebSocket
  ├── Each maker's engine.getQuote() returns a signed sealed bid
  └── Return { auctionId, makerCount }

GET /api/quote/result/:auctionId   → poll until the window closes
  └── Return the best quote { amountOut, signature, makerName, ... }
```

### Confirmation Poller

After the taker submits a quote on-chain, the backend polls Soroban RPC every 5 seconds (up to TX_TIMEOUT_MS) to detect confirmation, then:

1. Requires a `quote_executed` event from `quote_verifier` whose `quote_id` **and** taker match the trade — a merely successful transaction is not accepted as proof
2. Reads settled amounts from the maker pool's `swap_executed` event, accepted only from that maker's registered pool
3. Updates the trade record in MongoDB to `"confirmed"`, recording `amountOut` (net), `feeAmount` and `amountInUsd`
4. Pushes a `tradeConfirmed` WebSocket event to the maker SDK
5. Maker SDK acknowledges (`tradeAck`) to confirm it received the notification

### MongoDB Collections

| Collection | Purpose |
|---|---|
| `makers` | Address, name, API key hash, signer key, status, pool address |
| `trades` | Quote ID, amounts, TX hash, status, timestamps |
| `rateLimits` | Per-taker limits set by makers, with expiry timestamps |

---

## 📡 API Reference

Base URL: `https://backend-production-c4e14cb9.up.railway.app` (testnet)

### Core Endpoints

| Method | Path | Description | Response |
|---|---|---|---|
| `GET` | `/health` | Server health + live maker count | `{ status, activeMakers, priceBookEntries, dbStatus }` |
| `POST` | `/api/quote` | Request a swap quote (triggers RFQ) | `{ success, quote: { quoteId, amountIn, amountOut, signature, ... } }` |
| `GET` | `/api/makers` | List all makers + WebSocket status | `[{ address, name, connectionStatus, poolAddress }]` |
| `GET` | `/api/trades` | Trade history | `{ trades: [{ status, amountIn, amountOut, txHash, ... }] }` |
| `GET` | `/api/trades/:quoteId/status` | Poll a specific trade status | `{ status: "submitted" \| "confirmed" \| "failed" }` |

### Quote Request Body

```json
{
  "tokenIn":      "CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ",
  "tokenOut":     "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  "amountIn":     "200000000",
  "takerAddress": "G..."
}
```

> Amounts are in **stroops** (1 USDC = 10,000,000 stroops = 1e7).

### Quote Error Codes

`POST /api/quote/start` pre-flights the taker before opening an auction, so a
trade that cannot possibly settle is rejected in ~2s instead of after a 30s
auction and an opaque on-chain `HostError`.

| Code | HTTP | Meaning | How the taker fixes it |
|---|---|---|---|
| `MISSING_TRUSTLINE` | 400 | The wallet has no trustline for one of the assets, so Stellar cannot deliver it | Add a trustline for the asset named in `error.asset`. The swap UI offers a one-click **Add trustline** button |
| `INSUFFICIENT_BALANCE` | 400 | The wallet holds less `tokenIn` than `amountIn` | Fund the wallet. `error.required` and `error.available` carry raw stroop amounts |
| `INVALID_PARAMS` | 400 | Unsupported token, identical tokens, malformed amount or address | Correct the request |
| `NO_MAKERS` | 503 | No maker is online, or all are rate-limited for this taker | Retry shortly |
| `RATE_LIMITED` | 429 | Too many auctions from this taker/IP | Wait before retrying |

A `MISSING_TRUSTLINE` response carries the asset in canonical form so a client
can build the `ChangeTrust` operation directly:

```json
{
  "success": false,
  "error": {
    "code":    "MISSING_TRUSTLINE",
    "message": "Your wallet cannot receive EURC yet. Add a EURC trustline, then try again.",
    "token":   "CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ",
    "asset":   "EURC:GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO"
  }
}
```

> **Why a trustline is needed.** Stellar refuses to deliver a non-native asset to
> an account that has not opted in to holding it. Without the pre-flight the
> failure surfaces only at settlement, inside the token contract, as
> `Error(Contract, #13)` — after the maker has already signed.
>
> The check **fails open**: if Soroban RPC is unreachable the trade proceeds, so
> an RPC blip degrades the warning rather than halting quoting.

### Maker Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/makers/apply` | Submit a maker application |
| `GET` | `/api/makers/:address/inventory` | Pool USDC + EURC balances |
| `POST` | `/api/makers/register-signer-key` | Store signer public key in MongoDB |

### Admin Endpoints (admin address only)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/pending` | List pending maker applications |
| `POST` | `/api/admin/pending/:id/approve` | Approve application + issue API key |
| `POST` | `/api/admin/pending/:id/reject` | Reject application |
| `POST` | `/api/admin/pending/:id/rotate-key` | Rotate API key for a maker |

### WebSocket Messages (maker SDK ↔ backend)

| Direction | Type | Description |
|---|---|---|
| backend → maker | `rfqRequest` | RFQ dispatch: `{ quoteId, tokenIn, tokenOut, amountIn, takerAddress }` |
| maker → backend | `rfqQuote` | Signed quote: `{ quoteId, quote, signature }` |
| maker → backend | `rfqError` | Error: `{ quoteId, reason: "no_inventory" \| "rate_limit" }` |
| maker → backend | `priceLevels` | Price book update: `{ levels: [{ tokenIn, tokenOut, price, maxAmount }] }` |
| backend → maker | `tradeConfirmed` | `{ tradeEventId, txHash, amountIn, amountOut }` |
| maker → backend | `tradeAck` | `{ tradeEventId }` |

---

## 🛠 Maker SDK

The maker SDK is a standalone Node.js server that connects to the backend over WebSocket, signs quotes with an ed25519 key, and handles Soroban + trade confirmations. **Pricing is pluggable** — it runs through a `MakerEngine`. Beginners use the built-in ghost-price engine; advanced makers ship their own.

### Setup (one-time)

```bash
cd maker-sdk
npm install
npm run setup
```

The interactive setup wizard verifies your API key, generates an ed25519 keypair (the **public key** is registered in `pool_registry` on-chain; the **secret key** stays local), and writes everything to `credentials/<yourname>.cred`. Deploy your pool at https://hyperdex.live/maker and add `POOL_ADDRESS=C...` to that file.

### Running the SDK

```bash
# Built-in ghost-price engine (prompts for a ghost price)
npm run dev <yourname>

# Custom engine — NOTE the `--` separator (npm strips a bare flag otherwise)
npm run dev <yourname> -- --engine=./examples/fixed-rate-engine.ts
npm run dev <yourname> -- --engine=./examples/binance-engine.ts

# Skip the ghost-price prompt (non-interactive / CI)
GHOST_PRICE=0.8788 npm run dev <yourname>
```

**Startup banner:**
```
════════════════════════════════════════
  HyperDex Maker SDK
  Maker:   Hog
  Address: GCG6...72DJ
  Pool:    C...
  Backend: wss://backend-production-c4e14cb9.up.railway.app/ws/maker
  Engine:  fixed-rate-engine.ts [custom]   (or: Built-in (ghost-price))
════════════════════════════════════════
[WS] Connected to HyperDex backend
```

### The MakerEngine Plugin System

Pricing lives in an engine that answers two questions; the SDK does everything else (WebSocket, auth, ed25519 signing in the exact XDR the contract verifies, Soroban, trade confirmations):

| Method | Called | Returns |
|---|---|---|
| `getLevels()` | every ~3s | resting book `{ sellLevels, buyLevels }` (empty arrays = go offline gracefully) |
| `getQuote(ctx)` | on each RFQ | `amountOut` in **stroops** as a string, or `null` to skip (no penalty) |
| `onTradeConfirmed(trade)` *(optional)* | when a fill settles | refresh inventory / hedge / log |

**Tier 1 — built-in ghost-price engine (default).** Set one ghost price (EURC per USDC); the SDK quotes it fee-adjusted on every RFQ, gated by an **inventory check** (never quotes >80% of pool balance) and a **drift guard** (`drift-guard.ts`: warns when the ghost price is >1% from the live oracle mid, pauses quoting at >3%). Press `Ctrl+R` to re-price, `Ctrl+C` to disconnect.

**Tier 2/3 — custom engine.** Pass `--engine=./my-engine.ts`. A custom engine owns all pricing, so the SDK skips the ghost-price prompt and `Ctrl+R`. If the file is missing or invalid, the SDK logs the error and **falls back to the default engine**.

```typescript
// my-engine.ts
import { MakerEngine, RfqContext, PriceLevels } from '../src/types/MakerEngine'

const engine: MakerEngine = {
  async getLevels(): Promise<PriceLevels> {
    return {
      sellLevels: [{ quantity: '1000000000', price: '0.87800000' }], // USDC→EURC
      buyLevels:  [{ quantity: '1000000000', price: '1.13800000' }], // EURC→USDC
    }
  },
  async getQuote(ctx: RfqContext): Promise<string | null> {
    const rate   = ctx.tokenInSymbol === 'USDC' ? 0.8780 : 1 / 0.8780
    const feeAdj = 1 - ctx.feesBps * 0.0001            // protocol fee
    const out    = Math.floor(ctx.amountInHuman * rate * feeAdj * 1e7)
    return out > 0 ? out.toString() : null             // null = skip
  },
}
export default engine
```

Working templates live in `examples/` (`fixed-rate-engine.ts`, `binance-engine.ts`). Full guides: `maker-sdk/CUSTOM_ENGINE.md` (building engines) and `maker-sdk/TESTING_ENGINES.md` (E2E-testing + two key pitfalls: getting the rate **direction** right, and **checking inventory** so you don't quote unfillable size).

### Rate Limiting

The SDK tracks RFQ requests per taker address. After exceeding the limit within a rolling window, it sends `rfqError { reason: "rate_limit", expiryTimestampMs }` to the backend, which stores it in MongoDB and blocks further RFQs from that taker for the specified duration.

### Credentials (`credentials/<yourname>.cred`)

Created by `npm run setup`; **git-ignored** — never commit it.

```env
MAKER_API_KEY=sk_live_...
SIGNER_PRIVATE_KEY=<hex — ed25519 secret>
MAKER_ADDRESS=G...
POOL_ADDRESS=C...
PORT=3001
BACKEND_WS_URL=wss://backend-production-c4e14cb9.up.railway.app/ws/maker
USDC_CONTRACT=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
EURC_CONTRACT=CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ
```

---

## 🖥 Frontend

Built with **Next.js 14 App Router**, **TypeScript**, and **Tailwind CSS**. Wallet integration via **Stellar Wallets Kit** — Freighter, xBull, LOBSTR, Rabet, Albedo, Hana, HOT Wallet and Ledger. The app runs on Stellar Testnet. See [Networks & Wallets](#-networks--wallets).

### Pages

| Route | Page | Description |
|---|---|---|
| `/` | Landing | Protocol overview and entry points |
| `/swap` | Swap | EURC ↔ USDC swap UI — request quote, 30s countdown, execute on Soroban |
| `/maker` | Maker Dashboard | Multi-step setup: apply → deploy pool → deposit → start SDK → monitor trades |
| `/admin` | Admin Panel | Approve / reject pending maker applications, rotate API keys |
| `/docs` | Documentation | Protocol docs — including **Network (Testnet)** and **Connecting a Wallet** |

### Maker Dashboard — Setup Flow

The `/maker` page guides market makers through a 5-step onboarding flow:

```
Step 1: Apply          → fill name + description, submit application
Step 2: Get Approved   → admin approves in /admin; API key issued
Step 3: Deploy Pool    → sign 1 TX in your wallet; pool_factory deploys maker_pool
Step 4: Deposit        → deposit USDC + EURC (2 TXs each: approve + deposit)
Step 5: Start SDK      → run `npm run dev` in maker-sdk; SDK comes online
```

After activation, the dashboard shows:
- **Overview tab:** SDK status (online/offline), 24h trade count, pool balances
- **Inventory tab:** Live USDC + EURC balances, deposit/withdraw UI
- **History tab:** Trade list with TX hashes and timestamps
- **Rate Limits tab:** Active taker rate limits with countdown timers

### Swap UI — Quote Lifecycle

```
User enters: 20 EURC → USDC
        │
        ▼ (debounced 800ms)
POST /api/quote via Next.js API route
        │
        ▼
Quote panel appears:
  ┌─────────────────────────────────────┐
  │ Rate:    1 EURC ≈ 1.09 USDC         │
  │ You Get: 21.78 USDC (after 0.10%)   │
  │ Fee:     0.10%                      │
  │ ████████████████░░░░  28s           │ ← countdown timer
  └─────────────────────────────────────┘
        │
        ▼ user clicks Swap → Confirm
Connected wallet signs execute_quote TX
        │
        ▼
"Swap confirmed!" toast + explorer link
```

### Wallet & Network UI

| Component | Role |
|---|---|
| `WalletSelectModal` | The connect sheet — wallet list, availability, *Install* links, per-wallet connect |
| `WrongNetworkBanner` | Fixed banner when the wallet is not on Testnet; publishes its measured height as a CSS variable so the nav and page content shift by exactly one banner |
| `ConnectWalletButton` | Connect / address / disconnect entry point |

### `frontend/.env.local`

See [Networks & Wallets → `frontend/.env.local`](#frontendenvlocal) for the full testnet block.

---

## ⚡ Quick Start

### Prerequisites

- **Rust** 1.70+ with `wasm32-unknown-unknown` target
- **Node.js** 20+
- **Stellar CLI** (`cargo install --locked stellar-cli`)
- **MongoDB** (local or Atlas)
- A **Stellar wallet** — any of Freighter, xBull, LOBSTR, Rabet, Albedo, Hana, HOT Wallet or Ledger, set to Testnet
- A funded testnet account: free from Friendbot, plus USDC/EURC trustlines

### 1. Clone & Install

```bash
git clone https://github.com/hyperdexnetwork/HyperDex.git
cd hyperdex
```

### 2. Build Contracts

```bash
# Add wasm target (one-time)
rustup target add wasm32-unknown-unknown

# Build all contracts
cargo build --target wasm32-unknown-unknown --release
```

WASM files land in `target/wasm32-unknown-unknown/release/`:
- `pool_registry.wasm`
- `quote_verifier.wasm`
- `maker_pool.wasm`
- `maker_pool_factory.wasm`
- `fee_distributor.wasm`

### 3. Deploy Contracts (or use the live testnet deployment)

The deploy script targets Stellar Testnet. The Circle testnet SACs are the built-in defaults.

```bash
stellar keys generate admin --network testnet --fund

export ADMIN_IDENTITY=admin
chmod +x scripts/deploy-v2.sh
ADMIN_IDENTITY=admin ./scripts/deploy-v2.sh
# Contract addresses auto-written to backend/.env and the NEXT_PUBLIC_TESTNET_* keys in frontend/.env.local
```

Or skip deployment and use the already-deployed testnet contracts from the
[Deployed Contracts](#-deployed-contracts) section.

### 4. Run the Backend

```bash
cd backend
npm install

# Copy and fill in environment variables
cp .env.example .env   # edit MONGODB_URI
# STELLAR_NETWORK must be testnet (the default).

# Development
npm run dev
# → Server listening on port 4000
# → MongoDB connected

# Production (Render)
npm run build && npm start
```

### 5. Run the Frontend

```bash
cd frontend
npm install

# Development
npm run dev
# → Ready on http://localhost:3000

# Production build
npm run build && npm start
```

### 6. Register as a Maker

```bash
cd maker-sdk
npm install
npm run setup           # interactive wizard — generates keypair, registers signer key
npm run dev <yourname>  # start with the built-in ghost-price engine
# or run a custom pricing engine (note the `--` separator):
# npm run dev <yourname> -- --engine=./examples/binance-engine.ts
```

Then complete the on-chain pool deployment via `http://localhost:3000/maker`.

### 7. Execute a Test Swap

1. Open `http://localhost:3000/swap` in your browser
2. Set your wallet to Testnet, then connect it (taker account)
3. Select **EURC → USDC**, enter `20`
4. Click **Swap** → approve in your wallet
5. Watch the confirmation toast appear in ~5–15 seconds

---

## 🧪 Testing

### Unit Tests

```bash
make test                       # Soroban contract tests (builds the pool WASM first; needs the Stellar CLI)
cd backend && npm test          # jest — event parsing, contract event shapes
```

CI runs the contract tests, TypeScript checks for `backend`, `maker-sdk` and `frontend`, and the
backend unit tests on every push ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

`backend/src/poller/EventParser.test.ts` builds contract events exactly as the
contracts emit them, in both Protocol 20-22 (`TransactionMetaV3`) and Protocol
23+ (`TransactionMetaV4`) shapes. If the meta format moves again, these fail
loudly rather than the poller silently parsing zero events.

### Smoke Test (full E2E, no browser)

```bash
# Run from the repo root
npx ts-node scripts/smoke-test.ts
```

`scripts/smoke-test.ts` drives the whole backend flow end-to-end and asserts each phase:
1. Backend health check
2. Maker application → admin approval → API key generation
3. Signer key registration
4. Maker status & pool endpoint
5. WebSocket connect + price-level streaming
6. RFQ quote request (engine-signed)
7. Trade record created

### Manual E2E Flow

See [`MAKER_REGISTRATION.md`](MAKER_REGISTRATION.md) for the full maker onboarding
walkthrough (registration → on-chain signer → deposit → live quoting), and
[`maker-sdk/TESTING_ENGINES.md`](maker-sdk/TESTING_ENGINES.md) for engine-level E2E testing.

### API Testing

```bash
# Health check
curl https://backend-production-c4e14cb9.up.railway.app/health

# Request a quote (20 EURC → USDC)
curl -X POST https://backend-production-c4e14cb9.up.railway.app/api/quote \
  -H 'Content-Type: application/json' \
  -d '{
    "tokenIn":      "CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ",
    "tokenOut":     "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    "amountIn":     "200000000",
    "takerAddress": "G..."
  }'

# List connected makers
curl https://backend-production-c4e14cb9.up.railway.app/api/makers
```

---

## 🔐 Security Notes

> **HyperDex runs on Stellar Testnet and has not yet undergone a third-party
> security audit.** It does not move real funds. The following items remain open; most of them are
> addressed by the [v3 design](#-hyperdex-v3-the-vision).
> Trust and key model: [`docs/TRUST_MODEL.md`](docs/TRUST_MODEL.md). Reporting: [`SECURITY.md`](SECURITY.md).

| Area | Current State | Production Recommendation |
|---|---|---|
| **Signer key storage** | ed25519 secret in `maker-sdk/.env` | HSM or KMS-backed key management |
| **Admin key** | Single Stellar keypair | v3: multisig admin and treasury (Stellar threshold signatures) |
| **Audit** | **Not independently audited** | Full third-party audit (e.g. OtterSec / Halborn) |
| **Replay protection** | `quote_id` stored in Soroban persistent storage | Confirmed — enforced on-chain |
| **Quote expiry** | Set by the maker (SDK default: 120 s after signing), enforced on-chain via `ledger().timestamp()` | Enforced on-chain |
| **Vault access** | `execute_swap` requires `require_auth()` from `quote_verifier` | Confirmed — direct calls impossible |
| **Rate limiting** | Maker-side, enforced in SDK + backend MongoDB | Move to contract-level limit for stronger guarantees |
| **Persistent TTL** | Extended on every deposit/withdraw | Confirmed — all storage entries bumped per-interaction |
| **Front-running** | The quote is bound to one taker (`require_auth`), so nobody else can execute it | Enforced on-chain |
| **Taker protection** | No `min_amount_out`; the fee is not part of the signed quote, so an admin fee change between quote and settlement reduces what the taker gets | Planned: signed fee + `min_amount_out` |
| **Quote signature scope** | The signed bytes do not include the verifier address or network | Planned: domain separation (bind contract + network) |
| **Maker approval** | Enforced off-chain by the backend; `deploy_pool` registers any maker as active on-chain | Planned: on-chain approval |
| **Maker last look** | A maker can withdraw inventory or rotate its signer before the taker settles, making settlement fail | Disclosed; planned inventory reservation |

---


## 🛠 Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Smart Contracts | Rust + Soroban SDK | latest |
| Blockchain | Stellar Testnet (Soroban) | — |
| Contract CLI | Stellar CLI | latest |
| Backend Runtime | Node.js | 20+ |
| API Framework | Express | 4.x |
| WebSocket | `ws` | 8.x |
| Database | MongoDB (Atlas) | 6.x |
| Maker SDK | Node.js + TypeScript (pluggable `MakerEngine`) | — |
| ed25519 signing | `tweetnacl` | 1.x |
| XDR serialization | `@stellar/stellar-sdk` | 16.x (frontend) · 15.x (backend + maker-sdk) — bumped for Stellar **Protocol 27** |
| Price Oracle | CoinGecko + FX fallbacks (open.er-api, exchangerate-api) | — |
| Frontend | Next.js (App Router) | 14 |
| Styling | Tailwind CSS | 3.x |
| Wallet | Stellar Wallets Kit (`@creit.tech/stellar-wallets-kit`) — 8 wallets | 2.5.x |
| Language | TypeScript | 5.x |
| Deployment (frontend) | Vercel | — |
| Deployment (backend) | Render | — |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Build contracts: `cargo build --target wasm32-unknown-unknown --release`
4. Run the smoke test: `npx ts-node scripts/smoke-test.ts` — all phases must pass
5. Run TypeScript checks: `npx tsc --noEmit` in `backend/` and `frontend/`
6. CI runs the same checks on every push and pull request (`.github/workflows/ci.yml`)
7. Submit a pull request with a clear description of the change

---

Security issues: see [SECURITY.md](SECURITY.md). Please don't open public issues for vulnerabilities.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

Built for the Stellar ecosystem

**HyperDex — Where Off-Chain Pricing Meets On-Chain Settlement | Built on Stellar Soroban**

[Live App (Testnet)](https://hyperdex.live) · [Testnet API](https://backend-production-c4e14cb9.up.railway.app/health) · [GitHub](https://github.com/hyperdexnetwork/HyperDex)

</div>
