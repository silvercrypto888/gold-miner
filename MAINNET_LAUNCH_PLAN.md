# Gold Miner — Mainnet Launch Plan

> **Status:** `DRAFT` — Awaiting Silver's decisions on key open questions.  
> **Target:** X1 Mainnet (`https://rpc.mainnet.x1.xyz`)  
> **Current:** X1 Testnet (`https://rpc.testnet.x1.xyz`)

---

## Overview

This document is a living checklist and decision log for migrating Gold Miner from X1 testnet to X1 mainnet. It assumes you want to keep testing on testnet for "a bit longer" and only launch when everything is solid.

**Do not treat mainnet as a redeploy of testnet.** Mainnet is permanent, expensive to fix, and holds real player funds. Every decision below should be deliberate.

---

## Phase 0: Blockers Before Any Mainnet Work

These must be resolved on testnet first. Do not skip.

| # | Blocker | Severity | Notes |
|---|---------|----------|-------|
| 0.1 | Fix audit issue #1 (CPI brittleness) | **CRITICAL** | AMM fingerprint check is in place but the manual CPI construction is still HIGH risk. Either adopt Anchor IDL-generated CPIs or accept the fingerprint fallback. |
| 0.2 | Fix audit issue #2 (hardcoded GOLD mint) | **HIGH** | `GOLD_MINT_ADDR = "EarL8Na..."` does not match deployed `HAPJs...`. Align program + frontend + actual mint. |
| 0.3 | Fix audit issue #3 (wrong comments) | **LOW** | Trivial but signals sloppy maintenance to auditors. |
| 0.4 | Fix audit issue #4 (`InitTreasury` authority) | **MEDIUM** | Prevents griefing at init time. |
| 0.5 | Fix audit issue #5 + #6 (`gold_mint` validation) | **MEDIUM** | Missing validation in `JoinGame` and `MoveAndMine`. |
| 0.6 | Complete end-to-end gameplay testing | **CRITICAL** | Join → Move → Mine → Deposit → Withdraw → Reset Bitmap → Treasury Auto-LP. Every path must work. |
| 0.7 | Stress test treasury auto-LP | **HIGH** | Trigger it with real (testnet) GOLD/XNT. Verify the AMM pool interaction lands. |
| 0.8 | Frontend testnet burn-in | **HIGH** | Players actually playing for a week+ without session key desync, UI crashes, or RPC timeouts. |

> **Rule:** Every item in Phase 0 must have a ✅ before Phase 1 starts.

---

## Phase 1: Silver's Decisions (I Need These From You)

Before I can write the exact deploy scripts and sequence, I need you to answer the following. These are one-way doors.

### 1.1 Token Strategy — What happens to the testnet GOLD token?

**Option A: Fresh mainnet mint (recommended)**
- Deploy a brand-new Token-2022 GOLD mint on mainnet
- Testnet GOLD (`HAPJs...`) stays on testnet for continued testing
- Clean slate, no migration headaches
- **Question for you:** Same metadata (name="Goldium", symbol="GOLD") or rebrand?

**Option B: Bridge / migrate testnet GOLD**
- Testnet GOLD has `HAPJsAGEXkeE41VqcytFfUm3fMWiiz5baJFvCpDziyTa`
- Mainnet would need a "claim" contract or airdrop
- Complex, error-prone, rarely worth it for a game token
- **Not recommended unless you have a strong reason**

**What I need from you:** Pick A or B. If A, confirm name/symbol/decimals.

---

### 1.2 Program ID Strategy — Same or new?

**Option A: New program ID (recommended for mainnet)**
- Deploy a fresh program ID on mainnet
- Testnet program (`EkThFJFcQtC9vmguQWQu6qhbndCkCaFFvuGX5MSsgGAf` or `GLDFu...`) stays active for testing
- Clean separation, no risk of cross-network confusion
- Anchor.toml currently points `GLDFu...` for all clusters — this is a bug waiting to happen

**Option B: Same program ID across networks**
- Requires the same keypair to deploy on both testnet and mainnet
- Risk: someone front-runs the ID on mainnet if you leak the keypair
- Risk: hard to distinguish testnet vs mainnet transactions in explorers

**What I need from you:** Pick A or B. If A, generate a new keypair for mainnet deployment.

---

### 1.3 AMM Pool Setup — Which pool on mainnet?

On testnet you may have a mock or dev AMM pool. On mainnet, the pool must be real.

**Questions for you:**
1. Which AMM program ID will be the CPI target on mainnet? (Same `7EEuq61z9VKdkUzj7G36xGd7ncyz8KBtUwAWVjypYQHf` or a different one?)
2. Who creates the GOLD/XNT liquidity pool? You, or the AMM team?
3. What is the initial liquidity ratio? (e.g., 1M GOLD + 10,000 XNT)
4. Is the pool a Raydium-style CP swap or something else? (This affects the CPI instruction layout.)

**What I need from you:** AMM program ID, pool creation plan, and initial liquidity commitment.

---

### 1.4 Treasury Strategy — How much XNT do you seed?

The treasury auto-LP feature converts accumulated GOLD into XNT + GOLD LP tokens.

**Questions for you:**
1. Do you pre-seed the treasury with XNT so early players can withdraw immediately?
2. If yes, how much? (Suggested: 1,000–10,000 XNT depending on expected player volume)
3. What % of GOLD minted goes to treasury vs players? (Currently: 100 GOLD per mine to player, treasury gets nothing directly — it only gets GOLD via player deposits? Clarify the flow.)

**What I need from you:** Treasury seed amount and funding wallet address.

---

### 1.5 Upgrade Authority — Who controls the program after deploy?

Solana programs have an `upgrade authority` that can overwrite the program binary.

**Options:**
- **A:** Your deployer wallet (fast fixes, but centralized)
- **B:** A multisig (e.g., 2-of-3 with you + trusted community members)
- **C:** Immutable (burn upgrade authority — safest for players, but you can never patch bugs)

**What I need from you:** Pick A, B, or C. If B, specify the multisig addresses and threshold.

---

### 1.6 Frontend Hosting — Where does the game live?

**Current:** Likely local/Vercel dev mode.

**Questions for you:**
1. Do you want a custom domain? (e.g., `goldminer.x1.xyz` or `gold-miner.io`)
2. Vercel, Cloudflare Pages, or self-hosted (like your other games on `64.20.42.194`)?
3. Do you need a testnet staging site AND a mainnet production site?

**What I need from you:** Hosting preference and domain name.

---

### 1.7 Player Onboarding — Wallet support

**Questions for you:**
1. Which wallets do you want to support on mainnet? (Backpack is the most common on X1.)
2. Do you want a "free to play" faucet for testnet, or is mainnet pay-to-play from day one?
3. Do you want a "demo mode" where players can explore without spending XNT?

**What I need from you:** Wallet requirements and onboarding UX decisions.

---

## Phase 2: Mainnet Preparation (After Decisions Are Made)

Once you answer the Phase 1 questions, these become actionable tasks.

### 2.1 Program Changes

| Task | Owner | Notes |
|------|-------|-------|
| Update `Anchor.toml` with distinct program IDs per cluster | Dev | Fix the current bug where all clusters share `GLDFu...` |
| Add `mainnet` provider config to `Anchor.toml` | Dev | `cluster = "mainnet"`, `wallet = ~/.config/solana/mainnet-id.json` |
| Update `GOLD_MINT_ADDR` constant to mainnet mint | Dev | Post-mint-deploy |
| Implement audit fixes #1–#6 | Dev | See AUDIT.md |
| Rebuild SBF with v3.1.14 toolchain | Dev | `$HOME/.local/share/solana/install/releases/3.1.14/solana-release/bin/cargo-build-sbf` |
| Run `anchor test` one final time | Dev | All green before mainnet deploy |

### 2.2 Token Deployment (mainnet)

```bash
# 1. Create mainnet GOLD mint (Token-2022)
spl-token --url https://rpc.mainnet.x1.xyz create-token \
  --program-id TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb \
  --decimals 9

# 2. Create metadata account (Metaplex / Token-2022 extensions)
# ... (script TBD based on Silver's metadata choices)

# 3. Mint initial supply to deployer / treasury
# ...

# 4. Record: mint address, mint authority, freeze authority
```

**What I need from you:**
- Initial supply amount (e.g., 100M GOLD)
- Whether mint authority should be retained or revoked
- Metadata JSON (name, symbol, description, image URI)

### 2.3 AMM Pool Setup (mainnet)

```bash
# 1. Create the GOLD/XNT pool on the chosen AMM
# 2. Add initial liquidity
# 3. Record: pool ID, vault addresses, LP token mint
```

**What I need from you:**
- AMM program confirmation
- Initial liquidity amounts (GOLD + XNT)
- Wallet that will provide the initial liquidity

### 2.4 Game Config Initialization (mainnet)

```bash
# 1. Deploy program
# 2. Run init_game (creates GameConfig PDA, bitmap, etc.)
# 3. Run init_treasury (creates Treasury PDA)
# 4. Set gold_mint in GameConfig to the mainnet GOLD mint
# 5. Verify all PDAs and account states
```

**What I need from you:**
- Deployer wallet with enough XN for deployment fees (~0.5–1 XN)
- Game parameters: entry fee (if any), move cost, mine reward, reset threshold

### 2.5 Frontend Updates

| Task | Owner | Notes |
|------|-------|-------|
| Update `constants.ts` with mainnet program ID | Dev | Both game + AMM constants |
| Update `constants.ts` with mainnet GOLD mint | Dev | Must match deployed mint |
| Update RPC endpoint to mainnet | Dev | `https://rpc.mainnet.x1.xyz` |
| Add network switcher (testnet ↔ mainnet) | Dev | For continued testnet dev |
| Update wallet adapter for mainnet | Dev | Backpack, etc. |
| Test on mainnet dev build | Dev | Internal smoke test |

### 2.6 Security Finalization

| Task | Owner | Notes |
|------|-------|-------|
| Execute AMM fingerprint upgrade (post-deploy) | Dev | See `AMM_FINGERPRINT_UPGRADE_PLAN.md` |
| Set upgrade authority (multisig or immutable) | Dev | Per Silver's decision |
| Revoke mint authority (if applicable) | Dev | If token supply is fixed |
| Transfer treasury control (if multisig) | Dev | Per Silver's decision |

---

## Phase 3: Deployment Sequence (The Big Day)

Recommended order — do not skip or reorder.

```
Step 1: Pre-flight
  ├── Verify deployer wallet balance (XN for fees)
  ├── Verify SBF binary is fresh and signed
  ├── Verify Anchor.toml points to mainnet
  └── Verify program ID keypair is backed up

Step 2: Token Deploy
  ├── Create GOLD mint (Token-2022)
  ├── Set metadata
  ├── Mint initial supply
  └── Record mint address

Step 3: Program Deploy
  ├── Deploy program to mainnet
  ├── Record program ID
  ├── Verify program on-chain
  └── Run idl init / verify

Step 4: Game Init
  ├── init_game (creates config + bitmap)
  ├── init_treasury
  ├── update_gold_mint (point to mainnet GOLD)
  └── Verify all PDAs

Step 5: AMM Pool
  ├── Create GOLD/XNT pool (or verify existing)
  ├── Add initial liquidity
  └── Record pool addresses

Step 6: Treasury Seed
  ├── Transfer XNT to treasury vault
  ├── Verify treasury balance
  └── Test a deposit/withdraw cycle

Step 7: Frontend Deploy
  ├── Build with mainnet constants
  ├── Deploy to hosting
  ├── Verify wallet connection
  └── Smoke test: Join → Move → Mine

Step 8: Security Lock
  ├── Execute AMM fingerprint upgrade
  ├── Set upgrade authority per decision
  └── Optional: make immutable

Step 9: Monitoring
  ├── Start log scraping / error alerting
  ├── Set up treasury balance monitoring
  └── Announce to community
```

---

## Phase 4: Post-Launch

### 4.1 Monitoring Checklist (First 48 hours)

- [ ] Transactions landing without errors
- [ ] Treasury balance changing as expected (deposits, LP, fees)
- [ ] AMM pool price not wildly divergent from intended ratio
- [ ] No front-running on `reset_bitmap`
- [ ] Session keys expiring / working correctly
- [ ] Frontend RPC not rate-limiting users

### 4.2 Emergency Procedures

| Scenario | Action |
|----------|--------|
| Critical bug found | If upgradeable: pause frontend, deploy fix, migrate state if needed. If immutable: build v2 program, announce migration. |
| AMM upgrades | Treasury auto-LP will fail with `AmmProgramVersionMismatch`. Follow `AMM_FINGERPRINT_UPGRADE_PLAN.md`. |
| Treasury drained | Investigate: exploit, bug, or intended LP? Pause deposits immediately. |
| RPC down | Switch to backup RPC endpoint. X1 has multiple public RPCs. |
| GOLD hyperinflation | Check mine reward math. `reset_bitmap` may be called too frequently. |

### 4.3 Metrics to Track

| Metric | Target | Tool |
|--------|--------|------|
| Daily active players | >10 in week 1 | Frontend analytics |
| Avg moves per player | >20 | On-chain player accounts |
| Treasury XNT balance | >seed amount | `solana balance <treasury>` |
| AMM pool TVL | Stable or growing | XDEX / X1 Explorer |
| Transaction success rate | >98% | RPC logs |

---

## What I Need From You Right Now

To turn this from a draft into an actionable runbook, answer these **7 questions**:

1. **Token:** Fresh mainnet GOLD mint (Option A)? Same name/symbol?
2. **Program:** New program ID for mainnet (Option A)?
3. **AMM:** Same AMM program (`7EEuq...`) or different? Who creates the pool?
4. **Treasury:** How much XNT do you seed? Which wallet?
5. **Authority:** Upgrade authority = your wallet, multisig, or immutable?
6. **Hosting:** Vercel / Cloudflare / self-hosted? Custom domain?
7. **Wallet:** Backpack only, or others too? Free-to-play or pay-to-play?

Once I have these, I will:
- Generate the exact deploy scripts
- Update the frontend constants file
- Write the `init_game` and `init_treasury` mainnet commands
- Create the final pre-launch checklist

---

## Appendix: Current Testnet State (Reference)

| Item | Address / Value |
|------|-----------------|
| Testnet Program ID | `EkThFJFcQtC9vmguQWQu6qhbndCkCaFFvuGX5MSsgGAf` |
| Anchor.toml program ID | `GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6` |
| Testnet GOLD Mint | `HAPJsAGEXkeE41VqcytFfUm3fMWiiz5baJFvCpDziyTa` |
| Testnet Goldium v2 Mint | `HAPJsAGEXkeE41VqcytFfUm3fMWiiz5baJFvCpDziyTa` |
| AMM Program (CPI target) | `7EEuq61z9VKdkUzj7G36xGd7ncyz8KBtUwAWVjypYQHf` |
| Deployer Wallet | `2zotLCHPhTazmMVaRg9y4bmRm8mbBHb5XuvbV4mcQRAS` |
| Toolchain | SBF v3.1.14, Anchor 0.30.1 |

---

*Document created: 2026-06-27*  
*Version: Draft 1 — awaiting Silver's Phase 1 decisions*
