# HyperDEX Maker Registration Guide

**Complete step-by-step guide for registering as a market maker on HyperDEX.**

This guide covers two parallel flows:
- **Maker flow** — what the new maker does (browser + terminal)
- **Admin flow** — what the admin does to approve and onboard the maker

---

## Overview of the Full Flow

```
MAKER (browser — visit 1):
  1. Visit /maker → connect Freighter wallet
  2. Fill application form → submit name + contact
  3. See "Pending Approval" state → wait
  (If rejected by admin: see "Application Not Approved" screen → reapply)

ADMIN (browser):
  1. Visit /admin/pending
  2. Review application → click Approve (or Reject)
  3. API key shown ONCE → copy it → email to maker manually

MAKER (terminal — after receiving API key):
  1. cd maker-sdk && npm run setup → enter API key
  2. Keypair generated → PUBLIC KEY shown → copy it

MAKER (browser — visit 2):
  1. Visit /maker → step tracker shown (approved_sdk_pending state)
  2. Acknowledge "I have run npm run setup" checkbox
  3. Paste PUBLIC KEY → Register On-Chain (Freighter signs)
     → transitions to approved_onchain_pending state
  4. Deposit USDC and/or EURC into vault (Freighter signs)
     → transitions to active state
  5. See "Start SDK" step with command

MAKER (terminal):
  1. npm run dev <makername>
  2. Set your ghost price when prompted (built-in engine) — or pass
     `--engine=./my-engine.ts` to run your own pricing engine
  3. SDK connects to HyperDEX and starts serving quotes
```

---

## Prerequisites

- **Freighter wallet** installed in browser: https://www.freighter.app
- **Stellar mainnet account** with at least a few XLM for transaction fees
- **USDC and/or EURC** on Stellar mainnet to deposit as inventory
- **Node.js ≥ 18** and **npm** installed in terminal
- **maker-sdk** directory from the HyperDEX repository

---

## Services Running

All three services must be running for the full flow:

| Service | Port | Start Command |
|---------|------|---------------|
| Backend API | 4000 | `cd backend && npm run dev` |
| Frontend | 3000 | `cd frontend && npm run dev` |
| Maker SDK | 3001 | `cd maker-sdk && npm run dev <name>` (after setup) |

---

## PART A — MAKER FLOW (Browser, Visit 1)

### Step A1 — Connect Wallet

1. Open **http://localhost:3000/maker** in your browser
2. Click **Connect Wallet**
3. Freighter will prompt you to allow the connection — click **Allow**
4. Your Stellar address (G...) appears in the wallet bar

> If you don't see the Connect button, install Freighter at https://www.freighter.app

---

### Step A2 — Submit Application

After connecting your wallet, you will see the **"Become a HyperDEX Market Maker"** form.

Fill in:

| Field | Description | Required |
|-------|-------------|----------|
| Display Name | Your firm/maker name (2–50 chars) | Yes |
| Contact Email | Email for admin to reach you | At least one |
| Telegram Handle | @handle for admin to reach you | At least one |
| Supported Pairs | USDC→EURC and EURC→USDC (pre-selected) | Fixed |
| Stellar Address | Auto-filled from your wallet | Read-only |

Click **Submit Application**.

**On success:** You'll see the "Application Under Review" screen.

---

### Step A3 — Wait for Approval

The **"Application Under Review"** screen shows:
- Your name and address
- Time since submission
- Status: Pending Review

**What happens automatically:**
- The page polls every 60 seconds for status changes
- When admin approves, the page detects it and transitions automatically

**What you need to do:**
- Wait for the admin to email/Telegram you with your **API key** (starts with `sk_live_`)

> You can also click **Refresh Status** manually at any time.

---

### Step A4 — If Your Application Is Rejected

If the admin rejects your application, you will see the **"Application Not Approved"** screen:

```
✗ Application Not Approved

Your application was reviewed and not approved at this time.
You may reapply with updated contact information or a different display name.

[Reapply]
```

**To reapply:**

1. Click **Reapply** — a form appears
2. Update your Display Name and/or contact details
3. Click **Submit New Application**
4. You will return to the "Application Under Review" state

Your previous application stays on record as history.

---

## PART B — ADMIN FLOW (Browser)

### Step B1 — Review Application

1. Open **http://localhost:3000/admin/pending** in your browser

   > The Navbar shows **Admin | Pending** links when logged in as admin.
   > A red badge on "Pending" shows the count of unreviewed applications.

2. The left panel lists all applications. Filter by **[Pending]** tab.

3. Click an application card to open it in the right panel.

---

### Step B2 — Review Application Details

The right panel shows:
- **Name** and application timestamp
- **Stellar Address** with Copy and Explorer link
- **Contact** — email and/or Telegram handle
- **Requested Pairs** — which trading pairs they want to provide
- **Admin Notes** field — your internal notes (auto-saved on blur)

---

### Step B3 — Approve the Application

1. Click **Approve Maker ✓** (violet button)

2. A confirmation modal appears:
   ```
   Approve AlphaFirm?
   This will:
   • Create their maker account
   • Generate an API key
   You will need to send the API key to the maker via email manually.
   ```

3. Click **Confirm Approval**

4. The system will:
   - Create the maker record in MongoDB
   - Generate an API key (`sk_live_` + 64 random hex chars)
   - Return the raw API key — **shown once, in this response, and never stored**

---

### Step B4 — Copy and Send the API Key

After approval, the right panel shows the **API Key Reveal Panel**:

```
✓ AlphaFirm Approved
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠ API Key — Copy and Send to Maker

  sk_live_a8f3b2c9d4e5f6...         [Copy ✓]

Shown once. Not stored — rotate to issue a replacement.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
What maker needs to do next:
1. Run: 

(enter this API key)
2. Visit /maker → complete registration
3. Run: npm run dev <makername>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Send Email] ← opens mailto: with key    Expires in: 24h 0m
```

**Actions:**

- **[Copy ✓]** — copies the full API key to clipboard (click once)
- **[Send Email]** — opens your mail client with the key pre-filled (only if maker provided email)
- If maker only has Telegram, the panel shows their @handle — message them directly

**The exact message to send the maker:**
```
Subject: HyperDEX Maker API Key

Your API key: sk_live_...

Next steps:
1. In the maker-sdk folder, run: npm run setup
2. When prompted, enter this API key
3. Copy the PUBLIC KEY shown at the end
4. Visit localhost:3000/maker
5. Follow the step tracker to complete registration
6. Run: npm run dev <yourname>
```

---

### Step B5 — The Key Cannot Be Re-Viewed

There is no "view again". The backend stores only a bcrypt hash of the key, so
once the reveal panel is dismissed the raw value is gone — from the UI *and*
from the database.

This is deliberate. Keeping a readable copy so an admin could re-read it would
put working maker credentials into every database backup and snapshot, which
defeats hashing the key in the first place.

Copy it when it is shown, and send it to the maker over a channel you trust.

---

### Step B6 — If the Key Is Lost

Rotate it. Select the application and click **[Generate New API Key]**:

```
API Key
Issued 3d ago

Shown once when issued and not stored. If the maker lost it,
generate a replacement — the previous key stops working immediately.

[Generate New API Key]
```

A fresh key is generated and shown once. **All previous keys for that maker are
deactivated immediately**, so the maker must reconnect with the new one — expect
their WebSocket to drop until they do.

---

### Step B7 — Rejecting an Application (if needed)

1. Click **Reject** (outline button)
2. An inline rejection form appears
3. Enter an optional reason for rejection
4. Click **Confirm Rejection**

The application moves to the **Rejected** tab. The maker can re-apply from the same wallet.

---

## PART C — MAKER FLOW (Terminal — after receiving API key)

### Step C1 — Navigate to maker-sdk

```bash
cd /path/to/HyperDex/maker-sdk
```

### Step C2 — Run Setup

```bash
npm run setup
```

The wizard runs:

**Welcome banner + instructions shown**

**Prompt: Enter your API key**
```
Enter your API key from admin: 
```
Type or paste the full `sk_live_...` key. Press Enter.

**Verification:**
```
✓ Verifying API key...
Verified as: AlphaFirm (GALNCMRJ...)

  Name:    AlphaFirm
  Address: GALNCMRJ2GCQ34RH7L55HZLUCZ3EHDIKPWTNTWDGVJ4FJWCP5GDVA726
```

**Keypair generation:**
```
✓ Keypair generated
```

**Your PUBLIC KEY is shown:**
```
  Your SIGNER PUBLIC KEY:

  ████████████████████████████████████████████████████████████████
  f89265fbd7803601eb3a50a830f7ac0b3e5a3c490ec9705058e3a83311eca9d7
  ████████████████████████████████████████████████████████████████

  📋 Copy this key — you need it in the next step

  Next steps:
  1. Visit localhost:3000/maker
  2. Paste this PUBLIC KEY in the registration form
  3. Sign the on-chain registration via Freighter
  4. Deposit inventory
  5. Run: npm run dev alphafirm

  Credentials saved: credentials/alphafirm.cred
```

> **Copy the PUBLIC KEY now.** It's 64 hex characters. You need it in the next browser step.

---

### Step C3 — Verify credentials were created

```bash
ls credentials/
# alphafirm.cred

cat credentials/alphafirm.cred
# HyperDEX Maker Credentials — AlphaFirm
# Generated: 2026-05-16T...
# KEEP THIS FILE SECURE
#
# MAKER_API_KEY=sk_live_...
# SIGNER_PRIVATE_KEY=...
# PORT=3001
# BACKEND_WS_URL=ws://localhost:4000/ws/maker
```

> **Keep this file secure.** Never commit it to git. The file permissions are 600.

---

## PART D — MAKER FLOW (Browser, Visit 2)

Return to **http://localhost:3000/maker** with your wallet connected.

The page now shows the **Setup Progress** step tracker.

---

### Step D1 — Step 1: Application Approved ✓ (already done)

Green checkmark — nothing to do.

---

### Step D2 — Step 2: Acknowledge SDK Setup

The step shows:
```
SDK Setup (Terminal)

Run this command in your terminal:
  npm run setup   [Copy]

Enter your API key when prompted.
This generates your signing keypair.
At the end it shows your PUBLIC KEY.

☐ I have run npm run setup and have my PUBLIC KEY
```

**Check the checkbox.** Step 2 turns green and Step 3 becomes active.

---

### Step D3 — Step 3: On-Chain Registration

The step shows:
```
On-Chain Registration

Paste your PUBLIC KEY from SDK setup below:
[                                              ]
(64 hex characters from npm run setup)      ✓/✗

[Register On-Chain]
```

1. Paste the 64-hex PUBLIC KEY from the terminal output
2. A green **✓** appears when the format is valid (✗ if incorrect)
3. Click **Register On-Chain**
4. **Freighter opens** — review the transaction details
5. Click **Sign** in Freighter
6. Wait 5–10 seconds for Stellar confirmation

**What this does:** Writes your maker address and signer public key to the `pool_registry` Soroban contract on Stellar mainnet.

**On success:** Step 3 turns green, Step 4 becomes active.

---

### Step D4 — Step 4: Deposit Inventory

The step shows two deposit cards:

```
┌────────────────┐  ┌────────────────┐
│ USDC           │  │ EURC           │
│ Wallet: 1000   │  │ Wallet: 500    │
│ Vault:  0      │  │ Vault:  0      │
│ [Amount      ] │  │ [Amount      ] │
│ [Deposit]      │  │ [Deposit]      │
└────────────────┘  └────────────────┘
```

For each token you want to deposit:

1. Enter the amount in the input field
2. Click **Deposit**
3. **Transaction 1 of 2 (Approve):** Freighter opens
   - This approves the vault contract to spend your tokens
   - Click **Sign** in Freighter
   - Wait for confirmation (~5s)
4. **Transaction 2 of 2 (Deposit):** Freighter opens again
   - This moves tokens from your wallet into the vault
   - Click **Sign** in Freighter
   - Wait for confirmation (~5s)

> **You only need to deposit at least one token** (USDC or EURC) to unlock Step 5.
> You can always deposit more later from the Inventory tab.

**On success:** Step 4 turns green, Step 5 becomes active.

---

### Step D5 — Step 5: Start SDK

The step shows:
```
✓ Setup Complete!

Start your maker server:
  npm run dev <makername>   [Copy]

Your server will connect to HyperDEX
and start serving quotes automatically.
```

> **Pricing is pluggable.** With no flag, the SDK runs the built-in
> **ghost-price engine** and prompts you for a ghost price on startup. To run
> your own pricing logic instead, pass a custom engine (note the `--`
> separator): `npm run dev <makername> -- --engine=./my-engine.ts`.
> See [PART G — Pricing Engines](#part-g--pricing-engines-choose-how-you-quote) below.

---

## PART E — MAKER FLOW (Terminal — Final)

### Step E1 — Start the Maker Server

```bash
cd maker-sdk
npm run dev alphafirm
```

Replace `alphafirm` with your credential name (the part before `.cred` in the credentials folder).

**Ghost-price prompt (built-in engine only):** before connecting, the SDK asks
for your ghost price — the EURC you offer per 1 USDC. Type a number (e.g.
`0.8788`) and press Enter. To skip the prompt in CI, pass `GHOST_PRICE=0.8788`
as an env var. A custom engine (`--engine=...`) owns its own pricing, so this
prompt is skipped.

**Startup banner:**
```
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  HyperDEX Maker SDK  ● LIVE
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Maker:   AlphaFirm
  Address: GALNCM…VA726
  Pool:    CDXY…P4Q7
  Backend: wss://hyperdex.onrender.com/ws/maker
  Engine:  Built-in (ghost-price)      ← or: binance-engine.ts [custom]
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Ghost price: 1 USDC = 0.878800 EURC
  Auto-bidding at ghost price on all RFQs...
  Press Ctrl+C to disconnect | Ctrl+R to update ghost price
```

The SDK is now:
- Connected to HyperDEX backend via WebSocket
- Streaming live price levels from your engine's `getLevels()` (every ~3s)
- Responding to RFQ (Request for Quote) requests via your engine's `getQuote()`
- Automatically signing quotes with your signer key (in the exact XDR the contract verifies)
- Guarding against drift — the built-in engine warns when your ghost price is
  >1% from the live oracle mid and **pauses quoting at >3%** so you don't get arbitraged

---

### Step E2 — Verify on the Maker Dashboard

Return to **http://localhost:3000/maker**:
- The page transitions to the **Active** state
- The **Overview** tab shows: **SDK Online — streaming price levels**
- Price levels appear in the Price Levels panel
- Connection status shows a cyan dot (connected)

---

### Step E3 — Verify on Admin Dashboard

Admin verification:
1. Visit **http://localhost:3000/admin**
2. In the **All Makers** tab, find `AlphaFirm`
3. Status column shows **connected**

---

## PART F — Multiple Credentials (Advanced)

If you manage multiple maker accounts:

**List all credentials:**
```bash
npm run list
```

Output:
```
  HyperDEX Maker SDK — Saved Credentials
  ─────────────────────────────────────────

  alphafirm        AlphaFirm        GALNCM…GDVA726   ● Connected
  betafirm         BetaFirm         GABCDE…XYZ123    ○ Offline

  To start a maker:
    npm run dev alphafirm
    npm run dev betafirm
```

**Run a specific maker:**
```bash
npm run dev alphafirm
npm run dev betafirm
```

---

## PART G — Pricing Engines (choose how you quote)

The SDK handles all the infrastructure — WebSocket, API-key auth, ed25519 quote
signing in the exact XDR the on-chain contract verifies, inventory reads, and
trade confirmations. **You only decide how to price**, and that lives in a
pluggable **MakerEngine**. An engine answers two questions:

| Method | Called | Returns |
|--------|--------|---------|
| `getLevels()` | every ~3s | your resting book `{ sellLevels, buyLevels }` (empty arrays = go offline gracefully) |
| `getQuote(ctx)` | on each RFQ | `amountOut` in **stroops** as a string, or `null` to skip this trade (no penalty) |
| `onTradeConfirmed(trade)` *(optional)* | when a fill settles | refresh inventory, hedge on a CEX, log |

### Tier 1 — Built-in ghost-price engine (default, no code)

```bash
npm run dev <makername>
```

Set one ghost price (EURC per USDC); the SDK auto-bids it, fee-adjusted, on
every RFQ. It's gated by an **inventory check** (never quotes more than ~80% of
your pool balance) and a **drift guard** (warns at >1% drift from the live oracle
mid, pauses quoting at >3%). Press `Ctrl+R` to re-price, `Ctrl+C` to disconnect.

### Tier 2 / 3 — Custom engine

Run any engine file with `--engine`. **Note the `--` separator** — without it,
npm swallows the flag:

```bash
npm run dev <makername> -- --engine=./examples/fixed-rate-engine.ts
npm run dev <makername> -- --engine=./examples/binance-engine.ts
npm run dev <makername> -- --engine=./path/to/your-engine.ts
```

A custom engine owns its full pricing logic, so the SDK skips the ghost-price
prompt and `Ctrl+R`. If the file is missing or doesn't implement
`getLevels`/`getQuote`, the SDK logs the error and **falls back to the built-in
engine** — it won't crash. Confirm which one loaded from the `Engine:` line in
the startup banner.

Working templates live in `maker-sdk/examples/`. Full guides:
- **`maker-sdk/CUSTOM_ENGINE.md`** — building a custom pricing engine
- **`maker-sdk/TESTING_ENGINES.md`** — E2E-testing an engine + two key pitfalls
  (get the rate **direction** right, and **check inventory** so you don't quote
  size you can't fill — a custom engine is *not* auto-gated like the default one)
- **`maker-sdk/src/types/MakerEngine.ts`** — the `MakerEngine` / `RfqContext` / `PriceLevels` types

---

## Maker State Machine Reference

The `/maker` page uses a deterministic state machine. Here are all possible states and what triggers them:

| State | Condition | Page Shows |
|-------|-----------|------------|
| `disconnected` | No wallet connected | Connect Wallet prompt |
| `not_applied` | No PendingMaker record for this address | Application form |
| `pending_approval` | PendingMaker exists, status: pending | Pending review screen (polls 60s) |
| `rejected` | PendingMaker exists, status: rejected | Rejected screen with Reapply button |
| `approved_sdk_pending` | Approved but NOT registered on-chain | Setup Progress (Steps 1–3 active) |
| `approved_onchain_pending` | On-chain done, vault balance = 0 | Setup Progress (Steps 1–4, Step 4 active) |
| `active` | On-chain done + vault balance > 0 | Full Maker Dashboard |

**Key rule:** A wallet that has never gone through the PendingMaker application flow will always see `not_applied`, even if it exists in the Maker collection from old scripts.

**Database cleanup:** If a wallet gets stuck showing the wrong state, run:
```bash
MONGODB_URI=<uri> npx ts-node scripts/reset-test-makers.ts
```
This removes orphan makers (added by scripts, no PendingMaker record) so they restart from the application form.

---

## Troubleshooting

### "API key is invalid" during npm run setup

- Make sure you copied the full key (starts with `sk_live_`, total ~76 characters)
- The key was lost or is stale — ask the admin to rotate it (this invalidates the old one)
- Admin goes to `/admin/pending` → select application → **Generate New API Key**

### "Backend may be offline" during setup

- Start the backend: `cd backend && npm run dev`
- Setup will still save the key locally and continue
- You can still complete setup; SDK will verify on next start

### Freighter not opening during on-chain registration

- Ensure Freighter is installed and unlocked
- Your connected wallet must match your Stellar address exactly
- Try refreshing the page (your checkbox state resets — just re-check it)

### "Deposit failed" but "Approval was successful"

- The approve (tx 1) worked but deposit (tx 2) failed
- Click **Retry Deposit** — you don't need to approve again
- Common cause: insufficient XLM for fees (need ~0.1 XLM per transaction)

### SDK starts but admin shows "disconnected"

- Check backend is running: `curl http://localhost:4000/health`
- Check `BACKEND_WS_URL` in your `.cred` file: should be `ws://localhost:4000/ws/maker`
- Restart the SDK: `npm run dev alphafirm`

### "Credential not found" when running npm run dev

- Run `npm run list` to see available credentials
- Make sure setup completed fully (`credentials/alphafirm.cred` exists)
- Check: `ls maker-sdk/credentials/`

### Freighter shows wrong network

- Freighter must be set to **Stellar Mainnet** (Public Network)
- In Freighter: Settings → Network → Mainnet

---

## Key Contract Addresses (Stellar Mainnet)

| Contract | Address |
|----------|---------|
| Pool Registry | `CDONQCEJFQHOUIFWB4X4K2MVSFXH6HLEYPWRBPTAUR4WZNP2FD4YSQWW` |
| Quote Verifier | `CDMOUCUKCZRMSYQE5TQ7QVGVUFJYFSP7XLLBHL3ZE2EQLZGZUFC4PHXK` |
| Maker Pool Factory | `CBDD5WBPCX6GSF4XIP6CAKAM3TCU6R73CW7QNYUTXXT3OAGEPFFACOI4` |
| Fee Distributor | `CAAWWYIUWKV2Z4OGAVBXNVRGRCN3QY3FF4M2BLV72V2MBNEVFLMSAU2R` |
| USDC SAC | `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75` |
| EURC SAC | `CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV` |

> Each maker gets their **own** `maker_pool` contract, deployed by the Maker Pool
> Factory during on-chain registration (Step D3). There is no longer a single
> shared "vault" — your pool address is shown in the dashboard Overview tab and
> goes in your `.cred` file as `POOL_ADDRESS`.

---

## Quick Reference Checklists

### Maker Checklist

- [ ] Freighter installed, mainnet account funded with XLM
- [ ] USDC and/or EURC on mainnet (via Circle, an exchange withdrawal, or the Stellar DEX)
- [ ] Visit `/maker` → connect wallet
- [ ] Fill application form (name + email or Telegram) → Submit
- [ ] If rejected: click **Reapply**, update details, resubmit
- [ ] Receive API key email from admin (`sk_live_...`)
- [ ] `cd maker-sdk && npm run setup` → enter API key → **copy PUBLIC KEY**
- [ ] Visit `/maker` → shows Setup Progress (approved_sdk_pending state)
- [ ] Check "I have run npm run setup" checkbox
- [ ] Paste PUBLIC KEY → Register On-Chain → sign in Freighter
  - Page transitions to `approved_onchain_pending` state
- [ ] Deposit USDC/EURC → sign in Freighter (2 transactions per token)
  - Page transitions to `active` state
- [ ] `npm run dev <makername>` → verify live banner with correct name
- [ ] Maker Dashboard → Overview tab → shows "SDK Online"

### Admin Checklist

- [ ] Visit `/admin/pending` → see pending application badge
- [ ] Click application → review details (address, contact, pairs)
- [ ] Click **Approve Maker ✓** → confirm in modal
- [ ] **Immediately copy the API key** (shown once — not recoverable)
- [ ] Send key via [Send Email] or Telegram with setup instructions
- [ ] After maker completes setup: verify in `/admin` → All Makers → status "connected"
