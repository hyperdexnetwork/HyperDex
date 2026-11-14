# Security Policy

## Status

HyperDex runs on **Stellar Testnet only** and moves no real funds. The contracts have **not yet been
independently audited**. Known open items are listed in the README's
[Security Notes](README.md#-security-notes), and the trust and key model is in
[`docs/TRUST_MODEL.md`](docs/TRUST_MODEL.md).

## Scope

In scope:
- Soroban contracts in `contracts/` (`quote_verifier`, `maker_pool`, `maker_pool_factory`,
  `pool_registry`, `fee_distributor`)
- The backend RFQ service in `backend/`
- The maker SDK in `maker-sdk/`
- The web app in `frontend/`

Out of scope:
- Third-party wallets, Stellar RPC and Horizon providers, and the Stellar network itself
- Findings that need a compromised maker or admin key. These are covered by the trust model.
- Test funds lost on testnet

## Reporting a vulnerability

Please **don't open a public GitHub issue** for a security problem. Instead, use GitHub's private
reporting: **Security → Report a vulnerability** on this repository.

Please include:
- The affected component and file or contract function
- Steps to reproduce, or a failing test
- The impact as you understand it

We aim to acknowledge reports within 3 working days and to share a fix plan within 10 working days.
Because HyperDex is testnet-only, fixes ship in the next contract deployment rather than as hot
patches. The contracts aren't upgradeable.
