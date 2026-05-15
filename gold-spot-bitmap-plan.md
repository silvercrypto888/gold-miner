# Gold Spot Bitmap Migration Plan

## Goal
Replace 150k individual gold spot PDAs with a bitmap-based mined-state
system for a 1024x1024 board.

## Current System (as of 2026-05)
- Each gold spot is a PDA account (discriminator + 1 byte `hasGold` bool)
- `MoveAndMine` derives the PDA for the target cell, reads it, mines if
  available
- Gold formula `(x & y) % 7 == 0` determines where gold exists
- ~150k gold spots on a 1024x1024 board

## The Problem
- 150k PDAs = ~$75k in rent at current X1 rates
- `updateVisibleGold()` fetches `VIEWPORT_SIZE^2` PDAs per viewport move
- Initialization requires creating all PDAs before anyone can play

## Proposed Architecture

### Storage: Bitmap split across multiple accounts
- 1024 x 1024 bits = 1,048,576 bits = 128 KB
- Split into 13 accounts of ~10 KB each (Solana/X1 account limit)
- Each account holds a contiguous slice of the bitmap
- Bit index = y * 1024 + x
- Account assignment = bit index / (bits_per_account)
- Bits: 0 = unmined (gold exists), 1 = mined (gold gone)

### On-Chain Changes (`programs/gold-miner/src/lib.rs`)

1. **New accounts:**
   ```
   #[account]
   pub struct GoldBitmapSlice {
       pub slice_index: u8,        // 0-12
       pub bits: [u8; 10240],      // ~10KB per slice
   }
   ```
   Initialized once at deploy with all zeros (all gold available).

2. **Modified instruction: `MoveAndMine`**
   - Remove gold_spot PDA from accounts list
   - Add `gold_bitmap_slice` (the account containing the target cell)
   - Logic:
     ```
     let bit_idx = position.y * 1024 + position.x;
     let (slice_idx, offset) = map_to_slice(bit_idx);
     let byte = bits[offset / 8];
     let mask = 1 << (offset % 8);
     if byte & mask == 0 {
         bits[offset / 8] = byte | mask;  // mark mined
         goldium_minted += GOLD_PER_MINE;
     }
     ```

3. **New instruction: `FindGoldSlice`**
   - Returns which slice account index contains a given (x, y)
   - Client-side helper — can also be computed offline

4. **Removed:**
   - `gold_spot` PDA derivation + account creation
   - Gold spot account discriminator checks

### Client-Side Changes (`app/src/`)

1. **`useGame.ts` — `updateVisibleGold()`**
   - Instead of fetching N gold_spot PDAs, fetch all 13 bitmap slices
   - Cache them in state (they only change when user mines)
   - Check each viewport cell against the bitmap:
     ```
     const bitIdx = y * 1024 + x;
     const sliceIdx = Math.floor(bitIdx / 81920); // bits per slice
     const byteIdx = Math.floor((bitIdx % 81920) / 8);
     const bitMask = 1 << (bitIdx % 8);
     const mined = (slices[sliceIdx].bits[byteIdx] & bitMask) !== 0;
     visibleGold.push({ x, y, hasGold: !mined });
     ```

2. **`useGame.ts` — `move()`**
   - Pass the correct slice account to the `MoveAndMine` instruction
   - Slice PDA derived from `slice_index` + program ID

3. **Gas estimation:**
   - `MoveAndMine`: ~9k CUs (slightly more due to bitmap bit ops, less due
     to PDA derivation removal) — roughly neutral
   - MoveAndMine accounts needed: session_signer, game_config, player,
     goldium_mint, player_ata, gold_bitmap_slice, token_program,
     ata_program, system_program = 9 accounts

### Double-Mine Behavior
- Two players hitting the same cell in the same slot can both mine it
- Both get 100 GLD, both set the same bit
- This is acceptable: gold is formula-generated (not fixed supply), both
  players earned it
- No lock, no queue, no epoch needed

### Migration Path

**Option A: Clean slate (recommended)**
1. Deploy new program with bitmap accounts pre-initialized
2. Wipe testnet player state
3. Everyone starts fresh with the new board

**Option B: Hybrid migration**
1. New program reads both old PDAs and new bitmap
2. On first visit, user's gold count is checkpointed
3. Background script iterates old PDA space and writes mined bits into
   bitmap
4. Phase out old PDAs after migration completes

### Open Questions
- Should `GoldBitmapSlice` store slice_index as a seed, or use a fixed
  PDA derivation from slice number?
- Pre-initialize all 13 slices in a single setup TX or let the first user
  pay? (Recommend: include in deploy script)
- Bitmap initialization cost: 13 accounts × 10KB × rent rate ≈ negligible
