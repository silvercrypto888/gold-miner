# Gold Respawn Mechanism — Specification

## Goal
When 75% of gold spots have been mined in the current cycle, automatically reset the entire bitmap so all gold spots respawn in their original positions. No new formula, no new map — the existing `(x & y) % 7 == 0` worldgen produces the same layout every cycle.

## Background
- Grid: 1024 × 1024 (positions 1..1024 in both axes)
- Gold formula: `(x & y) % 7 == 0`
- Total gold spots per cycle: **161,390** (fixed, deterministically derived)
- 75% threshold: **121,042** mined spots trigger a respawn
- Current bitmap: a single 128 KB raw-bytes account owned by the program, 1 bit per cell (0=unmined, 1=mined)

## Changes Required

### 1. Add new field to `GameConfig`

Introduce a `gold_mined_this_cycle: u64` counter that resets on each respawn, distinct from the existing `total_gold_mined` (all-time accumulator).

```rust
#[account]
pub struct GameConfig {
    pub authority: Pubkey,
    pub grid_size: u32,
    pub gold_mint: Pubkey,
    pub gold_bitmap: Pubkey,
    pub total_gold_mined: u64,        // all-time, never reset
    pub gold_mined_this_cycle: u64,   // resets to 0 on respawn  ← NEW
    pub bump: u8,
}
```

### 2. Respawn constant

```rust
pub const TOTAL_GOLD_SPOTS: u64 = 161_390;
pub const RESPAWN_THRESHOLD: u64 = 121_042;  // floor(161390 * 0.75)
```

(Alternatively compute at runtime: `TOTAL_GOLD_SPOTS * 3 / 4`. Pre-computing avoids the division cost.)

### 3. Modify `move_and_mine` logic

After successfully mining a gold spot (bit was 0, set to 1, minted tokens):

```rust
// Inside the mining branch:
player.goldium_minted = player.goldium_minted.saturating_add(GOLD_PER_MINE);
ctx.accounts.game_config.total_gold_mined =
    ctx.accounts.game_config.total_gold_mined.saturating_add(1);
ctx.accounts.game_config.gold_mined_this_cycle =
    ctx.accounts.game_config.gold_mined_this_cycle.saturating_add(1);  // NEW

// Check for respawn:
if ctx.accounts.game_config.gold_mined_this_cycle >= RESPAWN_THRESHOLD {
    // Reset entire bitmap to zero (all gold respawned)
    let bitmap_data = &mut ctx.accounts.gold_bitmap.try_borrow_mut_data()?;
    for byte in bitmap_data.iter_mut() {
        *byte = 0u8;
    }
    drop(bitmap_data);
    
    // Reset cycle counter
    ctx.accounts.game_config.gold_mined_this_cycle = 0;
    
    msg!("💎 RESPAWN — all gold spots regenerated at ({}, {})", nx, ny);
}
```

### 4. Client-side awareness (optional but recommended)

The frontend can detect a respawn by polling `gold_mined_this_cycle` and watching for it to drop to 0. When that happens, the cached bitmap should be refetched (all zeros → all gold visible again).

```typescript
// useGame.ts — add after each moveAndMine callback:
const prevCycle = gameConfig.goldMinedThisCycle;
// ... after tx ...
if (newConfig.goldMinedThisCycle < prevCycle) {
    // Respawn happened — refetch all 13 bitmap slices
    await fetchAllBitmapSlices();
}
```

### 5. No other changes needed

- The bitmap size and layout remain identical
- PDA derivations unchanged
- Account structure unchanged
- No new instructions required
- Gas cost per `move_and_mine`: adds ~128KB / 8 zeroing (~16K iterations) only on the respawn event, not every move. Normal moves are unaffected.
- The `GameConfig::SIZE` constant must be increased by 8 bytes to accommodate the new field.

## Edge Cases

| Case | Behavior |
|------|----------|
| Two players mine the final gold in the same slot | Both can trigger respawn — bitmap becomes zero, second player's mint still succeeds, both get GOLD. Acceptable double-mine as in current design. |
| Player mines after respawn | Works normally — bitmap is zero, bit is unset, mining succeeds. |
| Respawn exactly at threshold | The move that mines the 121,042nd spot triggers the reset. That player's GOLD is still credited (respawn happens after the mint). |
| Threshold never reached | No respawn. Game continues until it does. |

## Migration

Since `GameConfig` already exists on testnet and adding a field changes the account discriminator layout:
1. Deploy updated program
2. Re-initialize `GameConfig` with the new layout (or use `CloseAccount` + `initialize_game`)
3. This is a breaking change to the account struct — a fresh deploy is simplest

Alternatively, use `resize_to` or write a migration instruction that reads the old config and writes the new one with `gold_mined_this_cycle = 0`.

## Summary

```
┌─────────────────────────────────────────────────────┐
│  161,390 gold spots  →  75% mined (121,042)  →     │
│  RESPAWN (bitmap reset to all 0s)  →  same layout  │
│  →  repeat indefinitely                            │
└─────────────────────────────────────────────────────┘
```

No contract upgrade on testnet yet. This file is the spec for when we're ready to build.
