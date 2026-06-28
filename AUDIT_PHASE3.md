# Gold Miner v2 — Phase 3 Security Audit
## Economic & Gameplay Attacks, MEV, Bitmap Mechanics

**Program:** `4GkZ3snMDedRn9BRvUtH1rx24AqzpDCZj7VP7WXGfZUr`  
**Scope:** `programs/gold-miner/src/lib.rs` (all instructions), `app/src/lib/constants.ts`, `app/src/lib/idl.ts`, `app/src/hooks/useGoldMiner.ts`  
**Auditor:** Theo / xxen_bot  
**Date:** 2026-06-27

---

## Summary

Phase 3 reveals that while the core mining mechanic is sound, several economic and gameplay attack vectors exist around **bitmap reset manipulation**, **front-running gold mints**, and **authority centralization**. The `treasury_auto_lp` feature introduces significant trust assumptions. Most critically, the **IDL and deployed program are out of sync** — frontend calls to `depositXnt` and `withdrawXnt` will fail because these instructions don't exist in the Rust program.

| Severity | Count | Categories |
|----------|-------|------------|
| CRITICAL | 2 | IDL mismatch, authority centralization |
| HIGH | 3 | Treasury LP manipulation, reset griefing, front-running |
| MEDIUM | 4 | Bitmap verification, gold distribution predictability, replay, IDL drift |
| LOW | 2 | Missing deposit/withdraw UX, worldgen formula |
| INFO | 2 | Economic design notes |

---

## CRITICAL: IDL Mismatch — Frontend Calls Instructions That Don't Exist

**Severity:** CRITICAL  
**File:** `app/src/lib/idl.ts` (lines 155-187), `app/src/hooks/useGoldMiner.ts` (lines 98-140)  
**Rust Program:** `programs/gold-miner/src/lib.rs`

### Finding

The IDL defines `depositXnt` and `withdrawXnt` instructions:

```typescript
{
  name: "depositXnt",
  discriminator: [174, 84, 153, 146, 93, 0, 115, 244],
  accounts: [ /* wallet, player, systemProgram */ ],
  args: [{ name: "amountLamports", type: "u64" }],
},
{
  name: "withdrawXnt",
  discriminator: [129, 188, 47, 92, 90, 169, 6, 251],
  accounts: [ /* wallet, player, systemProgram */ ],
  args: [],
},
```

The frontend `useGoldMiner.ts` calls them via Anchor's builder:

```typescript
const tx = await programRef.current.methods
  .depositXnt(amountLamports)
  .accounts({ wallet: publicKey, player: playerPda, systemProgram: SystemProgram.programId })
  .transaction();
```

**But the Rust program has NO `deposit_xnt` or `withdraw_xnt` functions.** The program exports exactly 8 instructions: `initialize_game`, `init_treasury`, `join_game`, `start_session`, `move_and_mine`, `reset_bitmap`, `update_gold_mint`, `treasury_auto_lp`.

### Impact

- Any user clicking "Deposit XNT" or "Withdraw" in the UI will receive a **runtime error** — the transaction will be rejected by the program as an unrecognized instruction discriminator.
- The `DepositButtons.tsx` component and `TreasuryPanel.tsx` likely expose broken functionality.
- The `escrowBalance` computed in `useGoldMiner.ts` (`getBalance(playerPda) - minRent`) is meaningless — there's no escrow mechanism in the program. The Player account has no `escrow` field.

### Fix

**Option A:** Implement `deposit_xnt` and `withdraw_xnt` in the Rust program (add to Player struct, handle transfers).

**Option B:** Remove the broken deposit/withdraw UI and all references from the IDL. The game uses session keys + direct moves only — no escrow needed.

**Recommended:** Option B for now. The current architecture (session key funded by wallet, moves paid by session key) doesn't need escrow. If escrow is desired for a future feature, add it properly in both program and IDL.

---

## CRITICAL: `update_gold_mint` is Instant, No Timelock or Governance

**Severity:** CRITICAL  
**File:** `programs/gold-miner/src/lib.rs` (lines 209-219)  
**File:** `app/src/lib/idl.ts` (lines 137-155)

### Finding

```rust
pub fn update_gold_mint(ctx: Context<UpdateGoldMint>) -> Result<()> {
    let cfg = &mut ctx.accounts.game_config;
    require!(
        ctx.accounts.authority.key() == cfg.authority,
        GoldMinerError::InvalidSessionKey
    );
    let old_mint = cfg.gold_mint;
    cfg.gold_mint = ctx.accounts.new_gold_mint.key();
    msg!("Gold mint updated: {} -> {}", old_mint, cfg.gold_mint);
    Ok(())
}
```

The game authority can **instantly and unilaterally** change the GOLD token mint. This breaks:

1. **Token provenance** — All previously mined GOLD becomes orphaned (new mint has different ATA, different supply).
2. **Player balances** — `playerTokenAccount` in `move_and_mine` is derived from the CURRENT `game_config.gold_mint`. Changing the mint means future mines go to a different token account.
3. **Treasury accounting** — `treasury_gold_ata` is ATA-derived. A mint change orphans accumulated GOLD.
4. **AMM integration** — The AMM expects a specific GOLD mint. Changing it breaks `treasury_auto_lp`.

### Why This Matters

- A compromised authority key can rug-pull all GOLD holders by minting a worthless replacement token.
- Even a benign update (e.g., migrating to a new token standard) would require all players to migrate their token accounts.
- The `has_one = authority` constraint ensures only the authority can call this, but there's **no multisig, no timelock, no governance**.

### Fix

**Option A (recommended):** Remove `update_gold_mint` entirely. The GOLD mint should be immutable after `initialize_game`.

**Option B:** Add a **timelock + multisig**. Require 7-day delay + 2-of-3 signers for mint updates, with clear on-chain event logging.

**Option C (minimum):** Add an `immutable` flag to GameConfig that, once set, permanently disables `update_gold_mint`.

---

## HIGH: `treasury_auto_lp` Trusts a Single Authority with Treasury Funds

**Severity:** HIGH  
**File:** `programs/gold-miner/src/lib.rs` (lines 222-496)  
**Instruction:** `treasury_auto_lp`

### Finding

The treasury accumulates GOLD from every mine (100 GOLD to player + 100 GOLD to treasury). The `treasury_auto_lp` instruction:

1. Swaps 50% of treasury GOLD for XNT via CPI to AMM
2. Deposits both GOLD + XNT as LP
3. Burns the LP tokens permanently

```rust
pub fn treasury_auto_lp(ctx: Context<TreasuryAutoLp>) -> Result<()> {
    // Authority check is implicit via Signer<'info> — ANYONE can call this!
    // ...
    solana_program::program::invoke_signed(
        &solana_program::instruction::Instruction {
            program_id: ctx.accounts.amm_program.key(),
            accounts: vec![ /* 13 accounts */ ],
            data: deposit_data,
        },
        &[ /* accounts */ ],
        signer_seeds,
    )?;
    // ...
}
```

Wait — the `TreasuryAutoLp` context requires `authority: Signer<'info>` but **does NOT verify** that the signer is the game authority:

```rust
#[derive(Accounts)]
pub struct TreasuryAutoLp<'info> {
    pub authority: Signer<'info>,  // ← ANY signer accepted!
    #[account(mut, seeds = [b"silver_config"], bump = game_config.bump)]
    pub game_config: Box<Account<'info, GameConfig>>,
    // ...
}
```

**ANY wallet can call `treasury_auto_lp`**, not just the game authority. This is a permissionless call that locks treasury GOLD into LP and burns it.

### Why This Matters

- A malicious actor can front-run or force LP creation at unfavorable pool ratios.
- The AMM swap is a **CPI** with no slippage protection (beyond the `MIN_GOLD_FOR_LP` threshold). MEV bots can sandwich the swap.
- Once LP is burned, the treasury GOLD is **permanently locked** in the AMM pool. It cannot be recovered.

### Fix

1. **Add authority validation:**
```rust
require!(
    ctx.accounts.authority.key() == ctx.accounts.game_config.authority,
    GoldMinerError::InvalidSessionKey
);
```

2. **Add slippage protection:** Currently `deposit_data` uses `max_token0 = xnt_received` and `max_token1 = remaining_gold` — this is NO slippage protection. The AMM can execute at any price. Add `min_lp_out` parameter and revert if actual LP < minimum.

3. **Add rate limiting:** Only allow `treasury_auto_lp` once per N slots (e.g., once per hour).

---

## HIGH: Bitmap Reset Can Be Front-Run to Deny Legitimate Miners

**Severity:** HIGH  
**File:** `programs/gold-miner/src/lib.rs` (lines 190-207)  
**Instruction:** `reset_bitmap`

### Finding

```rust
pub fn reset_bitmap(ctx: Context<ResetBitmap>) -> Result<()> {
    let cfg = &mut ctx.accounts.game_config;
    require!(
        cfg.total_gold_mined >= RESET_THRESHOLD,  // 121,042 = 75% of 161,390
        GoldMinerError::NotEnoughMinedForReset
    );
    // Zero out bitmap
    for byte in data[8..].iter_mut() { *byte = 0; }
    cfg.total_gold_mined = 0;
    Ok(())
}
```

`reset_bitmap` is **permissionless** — anyone can call it once 75% threshold is reached. But:

1. **No notification:** Players mining at the moment of reset have their pending TXs invalidated. The bitmap they thought had gold at (x,y) now shows none.
2. **Front-running:** A bot can watch for `total_gold_mined` approaching 121,042, then race to reset. Immediately after, it can mine the "fresh" gold spots before anyone else.
3. **MEV extraction:** The reset transaction itself can be bundled with a sequence of `move_and_mine` calls targeting the newly-reset high-value spots.

### Why This Matters

- The 75% threshold creates a **predictable reset event**. Bots can pre-compute exactly when the threshold will be hit.
- After reset, the gold distribution formula `(x & y) % 7 == 0` produces the **exact same gold spots** as before. A bot with a position list can instant-mine the most valuable ones.
- There's no cooldown or delay between resets.

### Fix

1. **Add cooldown:** `last_reset_slot` in GameConfig. Require 1000+ slots (~7 minutes) between resets.
2. **Rotate worldgen seed:** After each reset, XOR a `reset_count` into the gold formula so spots change: `((x ^ reset_count) & (y ^ reset_count)) % 7 == 0`.
3. **Require authority:** Make reset callable only by game authority, removing the MEV race.
4. **Add reset notification event:** Emit a `BitmapReset` event with the new seed so clients can update.

---

## HIGH: Gold Distribution is Fully Deterministic and Exploitable

**Severity:** HIGH  
**File:** `programs/gold-miner/src/lib.rs` (line 118)  
**File:** `app/src/lib/constants.ts` (line 92)

### Finding

```rust
if (nx & ny) % 7 == 0 {
```

The gold formula is **purely deterministic**. For any (x, y), anyone can compute whether gold exists without ever calling the program. The frontend does exactly this:

```typescript
export function hasGoldAt(x: number, y: number): boolean {
  return ((x & y) % 7) === 0;
}
```

### Why This Matters

- **No exploration value:** Players don't "discover" gold — they just compute it. The game is reduced to "walk to pre-computed coordinates."
- **Bot advantage:** A script can generate all 161,390 gold spots instantly and route the optimal path. Human players are at a permanent disadvantage.
- **No randomness:** Every reset produces the **exact same** gold map. There's no point in playing after the first reset — the optimal path is already known.

### Fix

1. **Commit-reveal randomness:** Use X1 Randomness Protocol (VRF) or a commit-reveal scheme. The program commits to a seed hash, reveals it after a delay, and gold formula uses `hash(seed || x || y)`.
2. **Per-player salt:** Each player gets a unique salt. Gold exists at `(hash(salt || x || y) % 7) == 0`. Prevents global bot maps.
3. **Periodic re-seeding:** Change the seed every N slots automatically, not just on reset.

---

## MEDIUM: `reset_bitmap` Zeroes Full Bitmap Without Preserving Discriminator

**Severity:** MEDIUM  
**File:** `programs/gold-miner/src/lib.rs` (lines 198-201)

### Finding

```rust
for byte in data[8..].iter_mut() {
    *byte = 0;
}
```

The reset skips the first 8 bytes (Anchor discriminator) and zeroes the rest. This is correct — the discriminator must be preserved for Anchor to deserialize the account.

However, there's **no verification** that `data.len() == BITMAP_ACCT` (131,072 + 8). If the bitmap account is resized or corrupted, the reset may:
- Leave old data at the end (if account grew)
- Panic with out-of-bounds (if account shrank)

### Fix

Add a length check:
```rust
require!(data.len() == BITMAP_ACCT + 8, GoldMinerError::InvalidBitmapSize);
```

---

## MEDIUM: `move_and_mine` Double-Mint Without Position Check

**Severity:** MEDIUM  
**File:** `programs/gold-miner/src/lib.rs` (lines 110-186)

### Finding

```rust
if (nx & ny) % 7 == 0 {
    if data[byte_idx] & mask == 0 {
        data[byte_idx] |= mask;
        // ... mint to player AND treasury
    } else {
        msg!("Moved ({},{}) mined", nx, ny);
    }
}
```

The `else` branch (already mined) only logs — it doesn't return an error. This means:

1. A player can submit multiple `move_and_mine` calls for the same (x, y) after mining it. Each call:
   - Moves them to (x, y) again (allowed — position update happens before gold check)
   - Finds gold already mined
   - Logs "already mined" but TX succeeds
   - Costs the player a TX fee for nothing

2. More critically: The `player.position_x = nx; player.position_y = ny;` update happens **before** the gold check. A player can spam-move to the same already-mined spot, paying fees each time, with no gameplay benefit.

### Why This Matters

- Griefing: A bot can spam-move to an already-mined spot, wasting session key gas. Not a direct exploit but a griefing vector.
- The `goldium_minted` counter only increments on first mine, so no double-minting occurs. The bitmap check prevents that.

### Fix

Return an error on already-mined cells:
```rust
} else {
    return err!(GoldMinerError::AlreadyMined);
}
```

(Note: The IDL lists `AlreadyMined` as error code 6005, but it's never used in the program. This is another IDL/program mismatch.)

---

## MEDIUM: No `AlreadyMined` Error in Program Despite IDL Definition

**Severity:** MEDIUM  
**File:** `app/src/lib/idl.ts` (lines 258-262)  
**File:** `programs/gold-miner/src/lib.rs` (lines 560-580)

### Finding

The IDL defines:
```typescript
{ code: 6005, name: "AlreadyMined", msg: "Position already mined" },
{ code: 6006, name: "NoGoldHere", msg: "No gold at this position" },
```

But the Rust `GoldMinerError` enum only has:
```rust
pub enum GoldMinerError {
    InvalidSessionKey,
    SessionExpired,
    OutOfBounds,
    NoFundsToWithdraw,
    ArithmeticError,
    InsufficientGoldForLp,
    InsufficientLpMinted,
    NotEnoughMinedForReset,
    AmmProgramVersionMismatch,
}
```

`AlreadyMined` and `NoGoldHere` are **defined in the IDL but never used in the program**. The frontend might expect these error codes and handle them specially, but they'll never be returned.

### Fix

Either:
1. Add the errors to the Rust program and use them, OR
2. Remove them from the IDL to prevent confusion.

---

## MEDIUM: Player Account Has No `move_nonce` — Replay Risk

**Severity:** MEDIUM  
**File:** `programs/gold-miner/src/lib.rs` (Player struct, lines 510-520)

### Finding

The `Player` account tracks:
- wallet, session_key, position_x, position_y, goldium_minted, session_expires_at, bump

But **no move_nonce or sequence number**. As noted in Phase 2, the frontend injects a sequence into the IX data, but the program ignores it.

Without an on-chain nonce, a replayed `move_and_mine` TX (e.g., from mempool history) would:
1. Move the player to the same (x, y) again
2. Check if gold exists (already mined → no mint)
3. Succeed with "already mined" log

The impact is limited (no double-minting), but it allows:
- **Position griefing:** Replay an old "move left" TX to force the player back to a previous position.
- **Gas waste:** Each replay costs the session key a TX fee.

### Fix

Add `move_nonce: u64` to Player and require it increments:
```rust
pub move_nonce: u64,

// In move_and_mine, after direction arg:
// require!(move_nonce > player.move_nonce, GoldMinerError::ReplayAttack);
// player.move_nonce = move_nonce;
```

---

## LOW: `join_game` Creates Token Account But Never Uses It for Escrow

**Severity:** LOW  
**File:** `programs/gold-miner/src/lib.rs` (lines 90-101)

### Finding

```rust
pub fn join_game(ctx: Context<JoinGame>) -> Result<()> {
    // Creates player account, creates playerTokenAccount (GOLD ATA)
    // But never transfers anything into escrow
}
```

The `JoinGame` context initializes a `playerTokenAccount` (GOLD ATA) for the player, but:
- No deposit is required to join
- No escrow transfer happens
- The `playerTokenAccount` is only used as a destination in `move_and_mine` (receiving minted GOLD)

This is fine for the current design (free-to-play, no escrow), but if `depositXnt`/`withdrawXnt` were intended, they're missing. The ATA creation costs the player ~0.002 SOL in rent for an account they may never use meaningfully.

### Fix

If the game is truly free-to-play with no escrow, remove the `playerTokenAccount` from `JoinGame` and let `move_and_mine` create it lazily via `init_if_needed`.

---

## LOW: `reset_bitmap` Resets Counter But Not Player `goldium_minted`

**Severity:** LOW  
**File:** `programs/gold-miner/src/lib.rs` (lines 190-207)

### Finding

The reset clears `game_config.total_gold_mined = 0` but does NOT touch individual Player accounts. Each player's `goldium_minted` is preserved across resets.

This is probably intentional (lifetime stats), but it means:
- `total_gold_mined` (global) and `goldium_minted` (per-player) are on different reset cycles.
- After reset, `total_gold_mined` starts at 0 but `goldium_minted` retains pre-reset values.
- If a leaderboard reads `goldium_minted`, those values are cumulative forever. This is fine for "all-time" but confusing for "this round" leaderboards.

### Fix

Document this behavior. If "round-based" leaderboards are desired, add `round_goldium_minted` that resets with the bitmap.

---

## INFO: `treasury_auto_lp` AMM Fingerprint is Placeholder

**Severity:** INFO  
**File:** `programs/gold-miner/src/lib.rs` (lines 39-51)

### Finding

```rust
pub const AMM_EXPECTED_DATA_LEN: usize = 0; // TODO: fill at deploy time
pub const AMM_EXPECTED_PREFIX: [u8; 32] = [0x00; 32]; // TODO: fill at deploy time
```

The AMM fingerprint check is currently a no-op because both constants are zeroed. The comment says "fill at deploy time" but they're still zeroes.

When filled, the check compares AMM binary length + ELF header prefix. This catches ~99% of AMM upgrades but:
- Requires re-deployment of the Gold Miner program for every AMM upgrade
- The AMM could be upgraded maliciously in a way that preserves data length + header prefix

### Fix

1. Actually fill these values at deploy time (run the `solana program dump` commands in the comment).
2. Consider removing the fingerprint and instead using a **verified AMM program ID** with a **multisig-governed upgrade authority**.

---

## INFO: `treasury_auto_lp` LP Burning is Deflationary but Unverifiable

**Severity:** INFO  
**File:** `programs/gold-miner/src/lib.rs` (lines 222-496)

### Finding

The treasury_auto_lp instruction:
1. Swaps 50% of GOLD for XNT
2. Deposits both as LP
3. Burns ALL minted LP tokens

This is a **permanent lock** — the GOLD and XNT are stuck in the AMM pool with no LP tokens to claim them. The `lp_burned` counter tracks cumulative burns.

**Questions this raises:**
- Who benefits from the locked liquidity? The AMM earns fees on trades, but no one owns the LP position.
- Is this intentional deflationary pressure (GOLD removed from circulation)?
- Could the AMM itself be upgraded to extract this "orphaned" liquidity?

This design is unusual. Most protocols either:
- Hold LP tokens (to claim fees)
- Burn LP tokens but send them to a dead address (verifiable)
- Here: LP tokens are burned via `spl_token::instruction::burn`, which is fine, but the economic rationale should be documented.

---

## Appendix A: Instruction Permission Matrix

| Instruction | Who Can Call | Authority Check | Risk |
|-------------|-------------|---------------|------|
| `initialize_game` | Anyone (once) | N/A | Low |
| `init_treasury` | Authority | `has_one = authority` | Low |
| `join_game` | Anyone | Wallet signer | Low |
| `start_session` | Player | Wallet = player.wallet | Low |
| `move_and_mine` | Session key | `session_key == session_signer` | Medium |
| `reset_bitmap` | Anyone | None (permissionless) | **HIGH** |
| `update_gold_mint` | Authority | `authority == cfg.authority` | **CRITICAL** |
| `treasury_auto_lp` | Anyone | **None** (only Signer<'info>) | **HIGH** |

---

## Appendix B: Recommended Fix Priority

1. **Remove or implement `depositXnt`/`withdrawXnt`** — IDL/program mismatch (CRITICAL)
2. **Add authority check to `treasury_auto_lp`** — Currently permissionless (HIGH)
3. **Remove `update_gold_mint` or add timelock** — Instant mint change is a rug vector (CRITICAL)
4. **Add cooldown + seed rotation to `reset_bitmap`** — Prevents MEV front-running (HIGH)
5. **Add on-chain move_nonce** — Prevents replay griefing (MEDIUM)
6. **Add `AlreadyMined` error usage** — Currently defined but unused (MEDIUM)
7. **Document LP burning economics** — Unusual design (INFO)
8. **Fill AMM fingerprint constants** — Security TODO (INFO)
