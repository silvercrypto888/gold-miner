# Gold Miner v2 — Phase 3 Security Audit (REVISED)
## Economic & Gameplay Design, MEV, Bitmap Mechanics — Post-Design-Clarification

**Program:** `4GkZ3snMDedRn9BRvUtH1rx24AqzpDCZj7VP7WXGfZUr`  
**Scope:** `programs/gold-miner/src/lib.rs` (all instructions), `app/src/lib/constants.ts`, `app/src/lib/idl.ts`, `app/src/hooks/useGoldMiner.ts`, `app/src/app/litepaper/page.tsx`  
**Auditor:** Theo / xxen_bot  
**Date:** 2026-06-29 (Revision 2 — incorporates Silver's design clarifications)  

---

## Summary

This revised audit reflects Silver's clarification that **Gold Miner is intentionally a decentralized crypto game**, not a traditional crypto game with admin-gated mechanics. Several findings from the original Phase 3 audit are reclassified as **by-design** features rather than vulnerabilities. The IDL has been corrected. What remains are observations about MEV surface and suggestions for hardening, not critical flaws.

| Severity | Count | Categories |
|----------|-------|------------|
| CRITICAL | 1 | `update_gold_mint` remains instant — recommend removal or timelock |
| HIGH | 0 | `treasury_auto_lp` and `reset_bitmap` reclassified as by-design |
| MEDIUM | 2 | Front-running observations (not exploitable as bugs), move_nonce suggestion |
| LOW | 1 | AMM fingerprint constants still zeroed |
| INFO | 3 | Economic design notes, deterministic worldgen is intentional |

---

## ✅ RESOLVED: IDL Mismatch — depositXnt / withdrawXnt Removed

**Original Severity:** CRITICAL → **Status: RESOLVED**

The IDL no longer contains `depositXnt` or `withdrawXnt`. The Rust program never implemented these, and they were an early escrow experiment. The comment in `idl.ts` (line 126) correctly documents this:

```typescript
// NOTE: depositXnt / withdrawXnt were an early escrow experiment.
// They were never implemented in the Rust program. Removed from IDL.
// See docs/ARCHIVED_ESCROW_CODE.md for the archived code.
```

**Frontend impact:** The `useGoldMiner.ts` hook and any deposit/withdraw UI components should be verified to no longer reference these instructions. If they do, those are dead code, not vulnerabilities.

---

## ✅ RESOLVED / BY DESIGN: `treasury_auto_lp` — Permissionless LP Creation

**Original Severity:** HIGH → **Status: BY DESIGN**

### What the audit originally flagged
The `TreasuryAutoLp` context requires `authority: Signer<'info>` but does not verify the signer is the game authority. This means **any wallet can call `treasury_auto_lp`**, swapping treasury GOLD for XNT and burning LP tokens.

### Silver's clarification
> "Auto-LP and resetting bitmap being callable by anyone is part of the design. The overarching objective of Gold Miner is a decentralized crypto game."

### Reassessment
Permissionless `treasury_auto_lp` is **intentional decentralization**. The treasury is a protocol-owned account; anyone triggering auto-LP is performing a public service that:
- Swaps 50% of accumulated GOLD for XNT (with 1% slippage protection)
- Deposits both as LP
- Burns the LP tokens permanently

There is no rug vector here because:
- The treasury GOLD can only go **into the AMM pool**, not to the caller
- LP tokens are burned, not transferred
- The swap has on-chain slippage protection (`SLIPPAGE_BPS = 100` = 1%)

### Remaining observation (not a vulnerability)
An MEV bot could sandwich the swap within the 1% slippage tolerance. However, the sandwich profit is bounded by 1% of the swap amount, and the bot would need to hold both GOLD and XNT liquidity. Given the game is designed to be decentralized, this is acceptable MEV surface — no worse than any AMM interaction.

**Recommended (optional):** Add a `last_lp_slot` cooldown (e.g., 1 hour) to prevent rapid-fire LP calls that might concentrate sandwich attacks.

---

## ✅ RESOLVED / BY DESIGN: `reset_bitmap` — Permissionless World Reset

**Original Severity:** HIGH → **Status: BY DESIGN**

### What the audit originally flagged
`reset_bitmap` is permissionless once 75% of gold spots (121,042 / 161,390) are mined. A bot could front-run the reset and immediately mine fresh spots.

### Silver's clarification
Permissionless reset is intentional. The game is designed so that **no admin controls the world cycle**.

### Reassessment
The reset threshold creates a **predictable game phase transition**, not an exploit. Key points:
- After reset, the gold formula `(x & y) % 7 == 0` produces the **same** spots. This is **intentional** — players who've done the work to learn the map retain their knowledge advantage.
- The "first to mine after reset" race is a **feature**, not a bug. It's equivalent to a new game round starting.
- There is no economic extraction: the reset doesn't transfer value, it just clears the bitmap.

### Remaining observations
1. **No cooldown between resets:** If someone mines 121,042 spots immediately after a reset, another reset could happen instantly. In practice, this requires ~121K transactions, which at ~0.4s/block would take ~13.5 hours of continuous mining. Not a practical concern.
2. **No reset notification event:** Consider emitting a `BitmapReset` event with `total_gold_mined_before_reset` so clients and indexers can track rounds.

**Recommended (optional):** Add a `last_reset_slot` field to `GameConfig` and require N slots between resets (e.g., 7,200 slots = ~1 hour). This prevents pathological edge cases without sacrificing decentralization.

---

## ✅ RESOLVED / BY DESIGN: Deterministic Gold Distribution

**Original Severity:** HIGH → **Status: BY DESIGN**

### What the audit originally flagged
The gold formula `((x & y) % 7) === 0` is fully deterministic. Anyone can pre-compute all gold spots without calling the program.

### Litepaper clarification (Section 6 — Game Theory)
The litepaper now explicitly addresses this:

> **Foresight** is an intentional feature, not an exploit. With deterministic world generation, every player can see where gold lies ahead. But perfect information does not eliminate competition — it shifts it from *guessing* to *racing*.

### Reassessment
Deterministic worldgen is a **core game design pillar**, not a vulnerability:
- It eliminates information asymmetry (no "insider knowledge")
- It rewards **path optimization and execution speed** over luck
- It enables **offline strategy planning** — players can compute optimal routes
- The "bot advantage" is mitigated by the fact that bots must still pay gas for every move

The litepaper also notes:
> The early-adopter advantage is **endogenous** — it emerges from the rules themselves, not from exogenous bonuses.

**No fix needed.** This is working as designed.

---

## ✅ RESOLVED / BY DESIGN: Silent Already-Mined

**Original Severity:** MEDIUM (unused `AlreadyMined` error) → **Status: BY DESIGN**

### What the audit originally flagged
The `move_and_mine` instruction handles already-mined spots with a silent `msg!` log instead of returning the defined `AlreadyMined` error. The audit suggested this might be a bug.

### Silver's clarification + Litepaper context
The litepaper Game Theory section was revised to remove the "silent already-mined" paragraph (moved to design doc). The Rust code comment explains the rationale:

```rust
// Already mined — this is intentionally NOT an error.
// Players can walk over already-mined spots harmlessly.
```

### Reassessment
Silent success is an **anti-griefing measure**. If already-mined spots returned an error, a malicious actor could:
1. Mine ahead of a target player
2. Cause the target's transaction to fail
3. Repeat to deny service

With silent success, the griefing attack is neutralized. The player simply gets no gold (as expected) but their session continues.

**No fix needed.** The `AlreadyMined` error variant can be removed from the enum if unused, or kept for future use.

---

## 🔶 REMAINING: `update_gold_mint` — Instant Authority Action

**Severity:** HIGH (downgraded from CRITICAL by design intent, but still a centralization risk)  
**File:** `programs/gold-miner/src/lib.rs` (lines 214-224)

### Finding
The game authority can instantly change the GOLD token mint:

```rust
pub fn update_gold_mint(ctx: Context<UpdateGoldMint>) -> Result<()> {
    let cfg = &mut ctx.accounts.game_config;
    require!(ctx.accounts.authority.key() == cfg.authority, GoldMinerError::InvalidSessionKey);
    let old_mint = cfg.gold_mint;
    cfg.gold_mint = ctx.accounts.new_gold_mint.key();
    msg!("Gold mint updated: {} -> {}", old_mint, cfg.gold_mint);
    Ok(())
}
```

### Why this is the last real concern
Everything else in Gold Miner is permissionless or player-driven. This is the **only** remaining admin-only instruction that can alter game state unilaterally and instantly. Even if the authority is trustworthy:
- A compromised key = instant token migration
- All previously mined GOLD becomes orphaned (different mint = different token)
- Treasury GOLD ATA is derived from the current mint; changing it orphans treasury accumulation
- Breaks any AMM integration (`treasury_auto_lp` expects a specific GOLD mint)

### Recommended fix
**Option A (strongly recommended for decentralization):** Remove `update_gold_mint` entirely. Make GOLD mint immutable at `initialize_game` time. This would make Gold Miner **fully immutable after initialization** — the ultimate decentralization.

**Option B:** Add a 7-day timelock + require 2-of-3 multisig. Give the community time to react.

**Option C (minimum):** Add an `immutable` flag to `GameConfig`. Once set (e.g., via a one-way `finalize_game()` call), `update_gold_mint` is permanently disabled.

---

## 🟡 MEDIUM: Front-Running `treasury_auto_lp` — Observation

**Severity:** MEDIUM (observation, not a bug)  
**File:** `programs/gold-miner/src/lib.rs` (lines 227+)

### Observation
`treasury_auto_lp` performs a swap on-chain. The 1% slippage protection (`SLIPPAGE_BPS = 100`) bounds MEV extraction, but a sophisticated bot could:
1. Observe the treasury GOLD balance approaching `MIN_GOLD_FOR_LP`
2. Pre-position a sandwich bundle
3. Extract up to 1% of the swap value

### Assessment
This is **standard AMM MEV surface**, not a Gold Miner bug. Every on-chain swap faces this. The 1% slippage tolerance is reasonable for a game treasury operation. Given Silver's design intent (decentralized, permissionless), this is acceptable.

### Optional mitigation
- Add a `min_xnt_out` parameter to `treasury_auto_lp` so callers can specify tighter slippage
- Or add a `last_lp_slot` cooldown to reduce frequency of swap events

---

## 🟡 MEDIUM: Move Replay Without Nonce

**Severity:** MEDIUM  
**File:** `programs/gold-miner/src/lib.rs` (lines 135-193)

### Finding
`move_and_mine` has no replay protection beyond the session expiry check. A signed `move_and_mine` transaction could theoretically be replayed if:
- The session hasn't expired
- The player hasn't moved (or has moved back)
- The gold spot hasn't been mined

In practice, this is unlikely because:
- Session keys expire after ~4 hours
- The bitmap changes on every successful mine (the spot is marked)
- Moving to a non-gold spot is a no-op anyway

However, a malicious RPC or mempool observer could replay a "move to gold spot" transaction if the spot is still unmined and the player is still at the previous position.

### Recommended fix
Add a `move_nonce: u64` to the `Player` struct. Increment it on every `move_and_mine`. The frontend includes the nonce in the instruction, and the program rejects stale nonces. This is standard practice for session-based games.

```rust
// In Player struct:
pub move_nonce: u64,

// In move_and_mine:
require!(direction.nonce == player.move_nonce + 1, GoldMinerError::InvalidNonce);
player.move_nonce += 1;
```

---

## 🟢 LOW: AMM Fingerprint Constants Still Zeroed

**Severity:** LOW  
**File:** `programs/gold-miner/src/lib.rs` (lines 39-51)

### Finding
```rust
pub const AMM_EXPECTED_DATA_LEN: usize = 0; // TODO: fill at deploy time
pub const AMM_EXPECTED_PREFIX: [u8; 32] = [0x00; 32]; // TODO: fill at deploy time
```

Because both are zeroed, the fingerprint check in `treasury_auto_lp` is currently a no-op:
```rust
if AMM_EXPECTED_DATA_LEN > 0 {
    require!(...);
}
```

### Assessment
The fingerprint is a defense-in-depth measure against AMM upgrades. With the constants zeroed, the check doesn't execute. This is fine for testnet but should be filled for mainnet.

### Fix
Run the commands in the comment at deploy time:
```bash
solana program dump 7EEuq61z9VKdkUzj7G36xGd7ncyz8KBtUwAWVjypYQHf amm.bin --url <X1_RPC>
ls -l amm.bin  # → AMM_EXPECTED_DATA_LEN
head -c 32 amm.bin | xxd -p | sed 's/../0x&, /g'  # → AMM_EXPECTED_PREFIX
```

---

## ℹ️ INFO: LP Burning Economics

**Severity:** INFO  
**File:** `programs/gold-miner/src/lib.rs` (lines 227+)

### Observation
`treasury_auto_lp` burns all LP tokens after deposit. This means:
- GOLD and XNT are permanently locked in the AMM pool
- No one owns the LP position, so no one can withdraw the liquidity
- The AMM still earns trading fees on the locked liquidity, but those fees accrue to... no one (they stay in the pool, benefiting future traders)

### Assessment
This is **intentional deflationary design**. It aligns with the litepaper's statement:

> Every GOLD token minted through gameplay that flows into the protocol treasury is used to deepen and permanently burn liquidity.

The economic rationale should be documented in the litepaper or a separate economics doc. Consider noting that this creates **ever-deepening liquidity** that can never be pulled.

---

## ℹ️ INFO: `total_gold_mined` vs `goldium_minted` Reset Asymmetry

**Severity:** INFO  

### Observation
- `total_gold_mined` (global) resets to 0 on `reset_bitmap`
- `goldium_minted` (per-player) is cumulative forever

This is intentional: `goldium_minted` tracks lifetime player earnings for leaderboards, while `total_gold_mined` tracks round progress.

**No action needed**, but document if round-based leaderboards are ever desired.

---

## Appendix A: Instruction Permission Matrix (Updated)

| Instruction | Who Can Call | Authority Check | Status |
|-------------|-------------|---------------|--------|
| `initialize_game` | Anyone (once) | N/A | ✅ By design |
| `init_treasury` | Authority | `has_one = authority` | ✅ Admin setup |
| `join_game` | Anyone | Wallet signer | ✅ By design |
| `start_session` | Player | Wallet = player.wallet | ✅ By design |
| `move_and_mine` | Session key | `session_key == session_signer` | ✅ By design |
| `reset_bitmap` | Anyone | None (permissionless) | ✅ **By design** |
| `update_gold_mint` | Authority | `authority == cfg.authority` | ⚠️ Recommend removal/timelock |
| `treasury_auto_lp` | Anyone | Signer only | ✅ **By design** |

---

## Appendix B: Recommended Priority (Revised)

1. **Remove or timelock `update_gold_mint`** — Last remaining centralization vector (HIGH)
2. **Add `move_nonce` to Player** — Replay protection for session keys (MEDIUM)
3. **Fill AMM fingerprint constants** — Defense in depth for mainnet (LOW)
4. **Optional: `last_lp_slot` cooldown** — Reduce swap frequency (LOW)
5. **Optional: `last_reset_slot` cooldown** — Prevent pathological rapid resets (LOW)
6. **Document LP burning economics** — Helps players understand deflationary mechanics (INFO)

---

## Appendix C: Design Philosophy Statement (from Silver)

> "The overarching objective of Gold Miner is a decentralized crypto game. This is pretty unusual relative to the industry, which may make the game features seem strange, but it is far from a typical crypto game."

This audit revision acknowledges that **permissionless mechanics are not vulnerabilities** when they are intentional. Gold Miner is designed to minimize trust:
- No admin controls the world reset
- No admin controls the treasury LP
- Anyone can trigger economic actions
- The only remaining trust assumption is the authority key for `update_gold_mint`

Fixing #1 (removing `update_gold_mint`) would make Gold Miner **fully immutable after initialization**, achieving the stated decentralization goal.
