# Gold Miner — Mainnet Launch Plan

> **Status:** `DRAFT` — Phase 1 decisions captured. Awaiting testnet blockers + Silver's final green light.  
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

**Action item:** Silver to confirm AMM program ID and pool type before deploy.

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

⚠️ **Open items:**
- AMM program ID confirmation (Silver to verify)
- Initial LP size confirmation (Silver to decide)
- Custom domain decision (optional, future)

---

## Phase 2: Mainnet Preparation (After Decisions + Testnet Blockers Cleared)

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

## Appendix: Current Testnet State (Reference) + Mainnet Plan

### Testnet (current)

| Item | Address / Value |
|------|-----------------|
| Testnet Program ID | `EkThFJFcQtC9vmguQWQu6qhbndCkCaFFvuGX5MSsgGAf` |
| Anchor.toml program ID | `GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6` |
| Testnet GOLD Mint | `HAPJsAGEXkeE41VqcytFfUm3fMWiiz5baJFvCpDziyTa` |
| AMM Program (CPI target) | `7EEuq61z9VKdkUzj7G36xGd7ncyz8KBtUwAWVjypYQHf` |
| Deployer Wallet | `2zotLCHPhTazmMVaRg9y4bmRm8mbBHb5XuvbV4mcQRAS` |
| Toolchain | SBF v3.1.14, Anchor 0.30.1 |

### Mainnet (planned)

| Item | Status |
|------|--------|
| Mainnet Program ID | 🆕 New keypair (TBD) |
| Mainnet GOLD Mint | 🆕 Fresh deploy (TBD) |
| AMM Program (CPI target) | ⏳ Silver to confirm |
| Deployer Wallet | 🆕 New keypair (TBD) |
| Treasury Seed XNT | ❌ None — GOLD only |
| Authority | 🆕 New keypair → immutable (future) |
| Hosting | Silver's Vercel |
| Wallets | X1 Wallet + Backpack |

---

*Document created: 2026-06-27*  
*Version: Draft 2 — Phase 1 decisions captured, awaiting testnet blockers + Silver's AMM confirmation*
