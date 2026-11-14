# HyperDex — Trust and Key Model (v2, Stellar Testnet)

This page describes who holds which keys in the system **as deployed today (v2)**, what each party
can and can't do, and how to recover when something goes wrong. The v3 trust model is in
[`TARGET_ARCHITECTURE.md` §7](TARGET_ARCHITECTURE.md#7-trust-model).

HyperDex runs on Stellar Testnet only and has not been independently audited.

---

## 1. Who holds what

| Party | Holds | Notes |
|---|---|---|
| **Taker** | Their own wallet keys, through Stellar Wallets Kit | Signs `execute_quote` themselves. Nothing is signed on their behalf. |
| **Maker** | A Stellar account that owns its `maker_pool`, plus an ed25519 **quoting key** registered in `pool_registry` | The quoting key signs quotes off-chain. It can be different from the owner account, and on its own it can't withdraw from the pool. |
| **Admin** | The admin account of `pool_registry`, `quote_verifier` and `fee_distributor` | Can activate or deactivate makers, set the protocol fee (capped by `MAX_FEE_BPS`) and sweep fees to the treasury. Moving this account to a Stellar multisig is part of v3. |
| **Backend** | **No Stellar signing keys** | Runs the RFQ auction and relays signed quotes. It holds an `ADMIN_API_KEY` for its own admin HTTP routes, and a MongoDB connection string. |
| **Treasury** | The account that receives fees from `fee_distributor.withdraw_fees` | Fixed when the contract is initialised. |

## 2. What each party can and can't do

| Party | Can | Can't |
|---|---|---|
| **Taker** | Accept or ignore a quote; settle it before it expires | Change a signed quote's price or size; reuse a `quote_id` |
| **Maker** | Quote, deposit and withdraw its own inventory, and rotate its quoting key (`update_signer`) | Settle a quote without the named taker's authorisation; touch another maker's pool |
| **Backend** | Choose which makers receive an RFQ; pick the winning quote; refuse service | Forge a maker's signature; move any funds; execute a trade for a taker |
| **Admin** | Deactivate a maker (`set_maker_active`); change the fee; sweep collected fees to the treasury | Withdraw from a maker's pool; alter a signed quote |

## 3. Known gaps (fixed by the v3 design)

- **Fee change after signing.** The fee isn't part of the signed quote, so an admin fee change
  between quote and settlement reduces what the taker receives. There's no `min_amount_out`.
- **No domain separation.** The quote signature doesn't bind the verifier contract or the network.
- **Off-chain maker approval.** `deploy_pool` registers any maker as active on-chain. Approval is
  enforced only by the backend.
- **Maker last look.** A maker can withdraw inventory or rotate its key before the taker settles.
  The trade then fails and the taker loses nothing.
- **Admin dashboard key in the browser.** The web admin panel keeps `ADMIN_API_KEY` in the
  browser's `localStorage`. Wallet-signed admin login is planned.

## 4. Key compromise

| Compromised | Impact | Response |
|---|---|---|
| **Maker quoting key** | An attacker can sign quotes against that maker's pool at bad prices, but only for takers who then settle them | Maker calls `pool_registry.update_signer` with a new key. If they can't do that quickly, the admin calls `set_maker_active(maker, false)`. Then the maker withdraws its inventory. |
| **Maker owner account** | The attacker can withdraw the pool's inventory | Outside HyperDex's control. Makers should keep the owner key offline and use the quoting key for live operation. |
| **Admin account** | The attacker can deactivate makers, raise the fee (the v2 cap is 100%), or sweep fees to the configured treasury | Makers withdraw their inventory, which the admin can't touch. A fresh set of contracts is deployed under a new admin. v3 moves the admin to multisig and caps the fee at 50 bps. |
| **Backend `ADMIN_API_KEY`** | Access to backend admin routes (maker applications, API keys) | Rotate `ADMIN_API_KEY` and restart the backend. No funds are exposed. |
| **Backend server** | The attacker can drop or reorder RFQs, or show a bad quote | They can't forge a maker signature or move funds. The taker's wallet shows the exact amounts before it signs. |

## 5. Failure and recovery

| Situation | What happens |
|---|---|
| Quote expires before settlement | `execute_quote` rejects it on-chain. The taker requests a new quote. |
| Maker pool has too little inventory | Settlement fails atomically. Nothing moves. |
| Same quote submitted twice | The second submission is rejected: `quote_id` is stored on-chain. |
| RPC or Horizon outage | No transaction is submitted. Quotes expire, and the taker re-quotes when service returns. |
| Backend outage | No new RFQs. Funds in maker pools are unaffected, and makers can still withdraw directly. |
| Contract bug | The contracts aren't upgradeable. Makers withdraw their inventory, and a fixed set of contracts is deployed fresh. Each deployment is recorded in the README's deployed-contracts table. |
