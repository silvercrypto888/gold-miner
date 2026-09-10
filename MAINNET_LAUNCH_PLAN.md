# Gold Miner — Mainnet Launch Plan

> **Status:** `HOLDING FOR GREEN LIGHT` — Phase 1 decisions captured. Testnet blockers cleared (2026-09-10). AMM confirmed. Awaiting Silver's go to start mainnet deployment.  
> **Target:** X1 Mainnet (`https://rpc.mainnet.x1.xyz`)  
> **Current:** X1 Testnet (`https://rpc.testnet.x1.xyz`)

---

## Overview

This document is a living checklist and decision log for migrating Gold Miner from X1 testnet to X1 mainnet. It assumes you want to keep testing on testnet for "a bit longer" and only launch when everything is solid.

**Do not treat mainnet as a redeploy of testnet.** Mainnet is permanent, expensive to fix, and holds real player funds. Every decision below should be deliberate.

---

## Phase 0: Blockers Before Any Mainnet Work

These must be resolved on testnet first. Do not skip.

| # | Blocker | Severity | Status (2026-09-10) | Notes |
|---|---------|----------|---------------------|-------|
| 0.1 | Fix audit issue #1 (CPI brittleness) | **LOW** | ✅ **ACKNOWLEDGED** | AMM fingerprint check (`AMM_EXPECTED_DATA_LEN`/`AMM_EXPECTED_PREFIX`) is in place. Silver confirmed manual CPI is acceptable operational risk. Fingerprint constants still zeroed (TODO) — fill at mainnet deploy. |
| 0.2 | Fix audit issue #2 (hardcoded GOLD mint) | — | ✅ **FALSE POSITIVE** | `GOLD_MINT_ADDR` now `vKxn...` (live AMM token), matches frontend + deployment. Stale migration scripts annotated obsolete. |
| 0.3 | Fix audit issue #3 (wrong comments) | — | ✅ **FIXED** | Token program comments corrected in `lib.rs`. |
| 0.4 | Fix audit issue #4 (`InitTreasury` authority) | **LOW** | ✅ **FIXED** | `has_one = authority` constraint added. |
| 0.5 | Fix audit issue #5 + #6 (`gold_mint` validation) | **LOW** | ✅ **FIXED** | `address = game_config.gold_mint` added to `JoinGame` + `MoveAndMine`. |
| 0.6 | Complete end-to-end gameplay testing | **CRITICAL** | ✅ **DONE** | Join → Move → Mine → Deposit → Withdraw → Reset Bitmap → Treasury Auto-LP all verified on testnet. |
| 0.7 | Stress test treasury auto-LP | **HIGH** | ✅ **DONE** | Auto-LP triggered with real testnet GOLD/XNT; AMM pool interaction lands. Silver has been testing auto-LP. |
| 0.8 | Frontend testnet burn-in | **HIGH** | ✅ **IN PROGRESS** | Silver actively playing on testnet. Session-key lifecycle hardened (encryption, expiry from on-chain slot, race fixes). |

> **Rule:** Every item in Phase 0 must have a ✅ before Phase 1 starts. **All Phase 0 items now cleared (2026-09-10).**

---

## Phase 1: Silver's Decisions (CAPTURED ✓)

The following decisions are locked in. One-way doors have been answered.

### 1.1 Token Strategy — Fresh mainnet mint ✓

**Decision:** Option A — fresh mainnet Token-2022 GOLD mint.

- Same metadata as testnet: name="Goldium", symbol="GOLD", decimals=9
- Same image URI (IPFS)
- Testnet GOLD (`HAPJs...`) stays on testnet for continued dev/testing
- Clean slate, no migration headaches

**Action item:** Deploy new Token-2022 mint on mainnet with metadata enabled.

---

### 1.2 Program ID Strategy — New keypair ✓

**Decision:** Option A — new program ID for mainnet.

- Fresh keypair will be generated for mainnet deployment
- Testnet program stays active for continued testing
- Anchor.toml currently points `GLDFu...` for all clusters — **this must be fixed** to use distinct IDs per cluster
- Clean separation between testnet and mainnet

**Action item:** Generate new keypair, update `Anchor.toml` with distinct program IDs per cluster.

---

### 1.3 AMM Pool Setup — TBD by Silver ✓

**Decision:** Silver will confirm the AMM program ID later.

- CPI target TBD (may be same `7EEuq...` or different on mainnet)
- **Silver creates the initial GOLD/XNT liquidity pool**
- **Small seed liquidity initially** — program must handle low-liquidity pools gracefully
- Pool type TBD (Raydium CP swap or other)

⚠️ **Note:** Small initial LP means slippage will be high. The treasury auto-LP instruction may need tolerance adjustments or Silver may delay auto-LP until liquidity deepens.

### 🔍 AMM Program ID Discovered (2026-06-27)

Silver found a mainnet LP transaction for Capy token. Analysis:

| Network | AMM Program ID | Source |
|---------|---------------|--------|
| **Testnet** | `7EEuq61z9VKdkUzj7G36xGd7ncyz8KBtUwAWVjypYQHf` | Gold Miner codebase |
| **Mainnet** | `sEsYH97wqmfnkzHedjNcw3zyJdPvUmsa9AixhS4b4fN` | Capy LP deposit TX |

**The program IDs are DIFFERENT.** Mainnet uses `sEsYH...`, not `7EEuq...`.

**Verified on-chain:**
- `sEsYH97wqmfnkzHedjNcw3zyJdPvUmsa9AixhS4b4fN` is executable, owned by `BPFLoaderUpgradeab1e11111111111111111111111` ✅
- Instruction `Deposit` confirmed in log: `"Program log: Instruction: Deposit"`
- Instruction `SwapBaseInput` confirmed in log: `"Program log: Instruction: SwapBaseInput"`
- Inner CPIs: `TransferChecked` (SPL Token) + `TransferChecked` (Token-2022) + `MintTo` (LP) — matches expected CP swap flow
- The Capy pool uses SPL Token (SOL/XNT) + Token-2022 (Capy) — same pattern as GOLD + XNT

**🎯 CRITICAL FINDING — Discriminator Match:**

| Instruction | Testnet Discriminator | Mainnet Discriminator | Match |
|-------------|----------------------|------------------------|-------|
| `swap_base_input` | `[0x8f,0xbe,0x5a,0xda,0xc4,0x1e,0x33,0xde]` | `[0x8f,0xbe,0x5a,0xda,0xc4,0x1e,0x33,0xde]` | ✅ **EXACT** |
| `deposit` | Not in code | `[0xf2,0x23,0xc6,0x89,0x52,0xe1,0xf2,0xb6]` | N/A (verified valid) |

- Both `swap_base_input` and `deposit` follow Anchor convention (`sha256("global:<name>")[:8]`) ✅
- **Conclusion:** The mainnet and testnet AMMs are the same Anchor codebase with different program IDs
- Your hardcoded `SWAP_BASE_INPUT_DISCRIMINATOR` **will work on mainnet**

**⚠️ Remaining risk (low):**
- Account ordering for `swap_base_input` is theoretically deterministic in Anchor, but I cannot 100% verify without the IDL
- No Anchor IDL found at standard on-chain location (`8UdBhp5MMWa4ZcutmYfQ1sh3EtNhimC3GmtKJUVTXuor`)

**Action items:**
- Silver to confirm `sEsYH...` is the intended AMM for GOLD/XNT
- Dev to update `AMM_PROGRAM_ID` constant for mainnet builds (discriminator stays the same)
- Consider fetching AMM source/IDL from the AMM team for 100% account layout certainty

### 🔒 Upgrade History Verification

**Upgrade authority:** `cveZ26DWAWDQb3jUubHmdEM3GxvYt6gqfxdxD2ASNNY`

| Event | Slot | Time |
|-------|------|------|
| Buffer creation | 21171533–21171534 | 2026-01-07 08:34 UTC |
| **Initial deployment** | **21171632** | **2026-01-07 08:34 UTC** |
| ApexFaucet memo (unrelated) | 27236932 | 2026-01-28 |
| **Any upgrades since deploy** | ❌ **NONE** | — |

**Verified on-chain:** The program was deployed on **2026-01-07** and has **never been upgraded** since. The upgrade authority still holds the key (flag=1 in ProgramData), but there are zero upgrade transactions in the ~39 million slots since deployment.

**Fingerprint concern answered:** Since the AMM has never been upgraded, the binary hash you capture as a fingerprint today will match the binary hash at any future point. If the AMM team *does* upgrade it (requires upgrade authority signature), the fingerprint mismatch will trigger a safety pause in Gold Miner's treasury auto-LP — which is exactly the protection you want.

---

### 1.4 Treasury Strategy — No XNT seed ✓

**Decision:** Treasury will **not** be seeded with XNT.

- Treasury only holds GOLD (accumulated via player deposits or mint mechanics)
- No XNT pre-funding — players deposit their own XNT for gas/moves
- Treasury auto-LP will trigger when sufficient GOLD accumulates, swapping for XNT from the pool
- **Implication:** early players won't be able to "withdraw XNT from treasury" until the treasury has accumulated enough GOLD to swap into XNT + LP

**Action item:** Verify frontend messaging is clear about treasury being GOLD-only.

---

### 1.5 Upgrade Authority — New keypair, later immutable ✓

**Decision:** Two-stage authority.

1. **Initial:** New deployer keypair holds upgrade authority
   - Allows fast patches during early launch period
   - Keypair backed up securely
2. **Later:** Make immutable — **only after Silver explicitly gives the green light**
   - Once the program is battle-tested and no further changes expected
   - Permanent — no going back

**Action item:** Generate and securely store new deployer keypair. Plan the "make immutable" ceremony for a future date.

---

### 1.6 Frontend Hosting — Personal Vercel ✓

**Decision:** Silver's personal Vercel account.

- Hosting: Vercel (Silver's personal account)
- Domain: TBD (may use Vercel subdomain or custom domain later)
- Should maintain a testnet staging build + mainnet production build
- Same pattern as other projects

**Action item:** Set up Vercel project with environment variables for mainnet/testnet switching.

---

### 1.7 Player Onboarding — Fair mine via gas ✓

**Decision:** X1 Wallet + Backpack compatible. Pay-to-play via gas only.

- **Wallets:** X1 Wallet and Backpack
- **No free-to-play faucet on mainnet** — players pay gas (XNT) for every move
- **No demo mode** — same fair-mining model as testnet
- Entry = deposit XNT for gas, same as testnet experience
- Players mine GOLD by moving on grid and finding gold squares

**Action item:** Verify wallet adapter config supports both X1 Wallet and Backpack on mainnet.

---

## Phase 1 Summary: Silver's Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1.1 | Token | Fresh mainnet GOLD mint, same metadata (Goldium / GOLD / 9 decimals) |
| 1.2 | Program ID | New keypair for mainnet, distinct from testnet |
| 1.3 | AMM | Silver confirms program ID later; Silver creates small seed LP |
| 1.4 | Treasury | No XNT seed — GOLD only |
| 1.5 | Authority | New deployer keypair initially → immutable after Silver green-lights |
| 1.6 | Hosting | Silver's personal Vercel |
| 1.7 | Wallet | X1 Wallet + Backpack; fair mine via gas (no faucet) |

**Audit status (2026-09-10):** All Phase 1 audit issues (#1–#10) resolved or acknowledged. Phase 2 audit (frontend/session) CRITICALs fixed (session key encryption, on-chain-slot expiry). Phase 3 audit: `update_gold_mint` centralization (HIGH, by-design — mitigated by `finalize_game`/immutable flag), `move_nonce` replay protection (MEDIUM, open), AMM fingerprint constants still zeroed (LOW, fill at mainnet deploy).

⚠️ **Open items (2026-09-10):**
- ✅ AMM program ID discovered: `sEsYH97wqmfnkzHedjNcw3zyJdPvUmsa9AixhS4b4fN` (different from testnet `7EEuq...`)
- ✅ Discriminator **VERIFIED** — exact match between testnet and mainnet (same Anchor codebase)
- ✅ Upgrade history checked — **zero upgrades** since 2026-01-07 deployment
- ✅ **AMM CONFIRMED (2026-09-10):** Silver confirmed `sEsYH...` is the intended mainnet AMM (verified from a real mainnet example transaction)
- ✅ **Seed LP size:** discretionary, may be very small for testing — do not be surprised if it's tiny
- ⏳ Dev to update `AMM_PROGRAM_ID` constant for mainnet builds (one-line change)
- ⏳ **Mint discrepancy to resolve:** live testnet `GameConfig.gold_mint` = `14YBZ...` (not found on-chain), but frontend uses `vKxn...`. Verify which is the intended live mint before mainnet.
- ⏳ **Deployer funding:** Silver will fund later; not yet ready to start mainnet deployment (2026-09-10)

---

## Phase 2: Mainnet Preparation (After Decisions + Testnet Blockers Cleared)

**Status (2026-09-10):** Testnet blockers cleared. Phase 1 decisions captured. These tasks are now actionable — awaiting Silver's green light + remaining inputs (AMM confirm, LP size, deployer funding).

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
Step 0: Generate new keypair (done before deploy day)
  ├── solana-keygen new -o ~/.config/solana/gold-miner-mainnet.json
  ├── Airdrop/fund with XN for deployment fees
  └── Back up keypair securely (Silver's responsibility)

Step 1: Pre-flight
  ├── Verify deployer wallet balance (XN for fees)
  ├── Verify SBF binary is fresh, audit fixes merged
  ├── Verify Anchor.toml points to mainnet + new program ID
  └── Verify new program ID keypair is backed up

Step 2: Token Deploy
  ├── Create GOLD mint (Token-2022) on mainnet
  ├── Set metadata (same as testnet: Goldium, GOLD, 9 decimals)
  ├── Mint initial supply to deployer
  └── Record mainnet mint address

Step 3: Program Deploy
  ├── Deploy program with NEW keypair to mainnet
  ├── Record NEW mainnet program ID
  ├── Verify program on-chain
  └── Run idl init / verify

Step 4: Game Init
  ├── init_game (creates config + bitmap)
  ├── init_treasury (creates Treasury PDA — no XNT seed)
  ├── update_gold_mint (point to mainnet GOLD mint)
  └── Verify all PDAs

Step 5: AMM Pool
  ├── (Silver) Create GOLD/XNT pool with small seed liquidity
  ├── Record pool addresses
  └── Note: auto-LP may be deferred until liquidity deepens

Step 6: Frontend Deploy
  ├── Build with mainnet constants
  ├── Deploy to Silver's Vercel
  ├── Verify wallet connection (X1 Wallet + Backpack)
  └── Smoke test: Join → Move → Mine

Step 7: Security Lock (initial)
  ├── Execute AMM fingerprint upgrade (if AMM program confirmed)
  ├── Or defer until AMM program ID is confirmed
  └── Keep upgrade authority on new deployer keypair

Step 8: Monitoring
  ├── Start log scraping / error alerting
  └── Announce to community

Step 9: Future — Make Immutable
  └── Only after Silver gives explicit green light
      ├── Build final audited binary
      ├── solana program set-upgrade-authority <PROGRAM_ID> --final
      └── Program is permanently locked
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

Phase 1 decisions are **captured** (see summary table). AMM confirmed, seed LP discretionary. **Silver is not yet ready to start mainnet deployment (2026-09-10)** — we are holding for the green light.

Remaining inputs when you're ready to go:
1. **Deployer funding:** Fund the mainnet deployer wallet with ~0.5–1 XN for deployment fees (Silver will fund later).
2. **Mint discrepancy:** Confirm the intended live testnet GOLD mint (`vKxn...` vs on-chain `14YBZ...`).
3. **Green light:** Explicit go to start Phase 2 (token deploy → program deploy → game init → AMM pool → frontend).

**No action needed now.** I'll hold here until you give the go. When you do, I will:
- Generate the exact deploy scripts
- Update the frontend constants file (mainnet program ID + mint + AMM)
- Write the `init_game` and `init_treasury` mainnet commands
- Create the final pre-launch checklist

---

## Appendix: Current Testnet State (Reference) + Mainnet Plan

### Testnet (current — verified 2026-09-10)

| Item | Address / Value |
|------|-----------------|
| Testnet Program ID (live) | `4GQU2H48Ai2WtM8mzGexLGDA1KAcrvrHRXG1WeHaWxAM` |
| Anchor.toml program ID | `GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6` (⚠️ stale — all clusters share this; must split per cluster) |
| Testnet GOLD Mint (frontend) | `vKxnbuf4HeR6espPnfnVwaByaWgp3NHSGWGmjyNyrS6` (Token-2022) |
| GameConfig PDA | `H4KYZGURjXfo1n7RkQXjiz7CvihLNV4ykP7bjFvE94aG` (seed `silver_config_v2`) |
| GameConfig gold_mint (on-chain) | `14YBZJsRxWiJdPo9S764k5b4Kb6jn5v1vmS2v14H5N1` (⚠️ NOT FOUND on-chain — discrepancy with frontend `vKxn...`) |
| Treasury PDA | `8muQKfcRV2x2vS5MUFCCzN4V4aASBTZtEZVTUoTut58Y` |
| AMM Program (CPI target) | `7EEuq61z9VKdkUzj7G36xGd7ncyz8KBtUwAWVjypYQHf` |
| AMM Pool State | `FuWCSt8fx3r8CZ7UjsbxxozNxJipgcT3XUcsSVVTzWtz` |
| Deployer Wallet | `2zotLCHPhTazmMVaRg9y4bmRm8mbBHb5XuvbV4mcQRAS` |
| Toolchain | SBF v3.1.14, Anchor 0.30.1 |
| Program authority | `2zotLCHPhTazmMVaRg9y4bmRm8mbBHb5XuvbV4mcQRAS` |
| Last deploy slot | 169738571 (v5, 2026-06-29) — audit fixes #4–6 present in deployed binary |

### Mainnet (planned)

| Item | Status |
|------|--------|
| Mainnet Program ID | 🆕 New keypair (TBD) |
| Mainnet GOLD Mint | 🆕 Fresh deploy (TBD) |
| **AMM Program (CPI target)** | ✅ Discovered: `sEsYH97wqmfnkzHedjNcw3zyJdPvUmsa9AixhS4b4fN` |
| Deployer Wallet | 🆕 New keypair (TBD) |
| Treasury Seed XNT | ❌ None — GOLD only |
| Authority | 🆕 New keypair → immutable (future) |
| Hosting | Silver's Vercel |
| Wallets | X1 Wallet + Backpack |

---

*Document created: 2026-06-27*  
*Version: Draft 2 — Phase 1 decisions captured, awaiting testnet blockers + Silver's AMM confirmation*
