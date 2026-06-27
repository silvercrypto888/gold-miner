# Gold Miner Smart Contract Security Audit

**Program:** `gold-miner` (`4GkZ3snMDedRn9BRvUtH1rx24AqzpDCZj7VP7WXGfZUr`)  
**Repo:** `silvercrypto888/gold-miner`  
**Commit audited:** `8cdf5b2` (post-merge, current HEAD)  
**Date:** 2026-06-27  
**Auditor:** Theo / xxen_bot

---

## Summary

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Manual CPI construction is brittle against AMM upgrades | **HIGH** | 🔴 OPEN |
| 2 | Hardcoded `GOLD_MINT_ADDR` does not match deployed mint | **MEDIUM** | 🔴 OPEN |
| 3 | Token program comments in `TreasuryAutoLp` are wrong | **MEDIUM** | 🔴 OPEN |
| 4 | `InitTreasury` missing authority validation | **LOW** | 🔴 OPEN |
| 5 | `JoinGame` does not validate `gold_mint` against game config | **LOW** | 🔴 OPEN |
| 6 | `MoveAndMine` does not validate `gold_mint` against game config | **LOW** | 🔴 OPEN |
| 7 | Bitmap reset hardcoded `data[8..]` may skip first 8 bytes | **LOW** | 🟡 INTENTIONAL |
| 8 | `start_session` session key hijacking | — | 🟢 NOT AN ISSUE |
| 9 | `move_and_mine` session key verification | — | 🟢 NOT AN ISSUE |
| 10 | `update_gold_mint` should be admin-only | — | 🟢 ALREADY ADMIN-ONLY |

**Note:** Issues #8–#10 were flagged in an earlier informal scan but have been re-verified and are either not issues or already addressed.

---

## 🔴 #1 — Manual CPI Construction Is Brittle Against AMM Upgrades

**Severity:** HIGH  
**Location:** `treasury_auto_lp` (swap + deposit CPIs), lines 242–424  
**Status:** OPEN

### Description

The `treasury_auto_lp` function manually constructs Raydium CP Swap CPIs with hardcoded discriminators, account orderings, and data layouts:

```rust
pub const SWAP_BASE_INPUT_DISCRIMINATOR: [u8; 8] = [0x8f, 0xbe, 0x5a, 0xda, 0xc4, 0x1e, 0x33, 0xde];
```

Three raw `invoke_signed` calls are made with manually assembled account lists (lines 253, 367, 424). If the XDEX AMM program upgrades its instruction format (new fields, different account ordering, new discriminator), this will silently break or produce confusing errors.

### Impact

The AMM program at `7EEuq61z9VKdkUzj7G36xGd7ncyz8KBtUwAWVjypYQHf` could upgrade. Your program would then invoke the wrong instruction layout, potentially causing:
- Failed transactions (stuck treasury LP cycles)
- Unexpected token movements
- Confusing error messages for players

### Fix Options

1. **Preferred:** Use Anchor IDL-generated CPI helpers (requires importing the AMM program's IDL).
2. **Fallback:** Add a runtime version-pinning check on the AMM program (e.g., verify program data hash matches a known-good version).
3. **Operational:** Document this as a known risk and monitor the AMM program for upgrades.

---

## 🔴 #2 — Hardcoded `GOLD_MINT_ADDR` Does Not Match Deployed Mint

**Severity:** MEDIUM  
**Location:** Constant declaration, line 34  
**Status:** OPEN

### Description

```rust
pub const GOLD_MINT_ADDR: &str = "EarL8NaAje3mx5UGC86CWByVnotKgibkGmuJh6bHcWdz";
```

Per prior discussion, the deployed GOLD mint is `9RThpUMiFo5ioaREZkJD5wd5VPr5peBYbX8212r1KkQB`. This constant does not match. The constant is **not** used in on-chain account validation (the program validates `gold_mint` against `game_config.gold_mint` at runtime), but it is misleading for developers, auditors, and anyone reading the source.

Additionally, the frontend (`app/src/lib/constants.ts:201`) hardcodes `AMM_GOLD_MINT` to the same `EarL8Na...` address, which is used for the AMM pool. If this is the AMM pool's GOLD mint and not the game mint, the naming is confusing. If it is supposed to be the same mint, there's a mismatch between program and deployment.

### Fix

Update the constant to the actual deployed mint address, or remove it if unused. Verify alignment with the frontend constant.

---

## 🔴 #3 — Wrong Token Program Comments in `TreasuryAutoLp`

**Severity:** MEDIUM  
**Location:** `TreasuryAutoLp` accounts struct, lines 639–666  
**Status:** OPEN

### Description

The actual code is correct — GOLD uses Token-2022 (`TokenzQd...`) and XNT uses regular SPL Token (`Tokenkeg...`). However, the comments are swapped and misleading:

| Line | Comment | Reality |
|------|---------|---------|
| 652 | `/// XNT mint (wrapped SOL, Token2022)` | XNT is SPL Token, **not** Token-2022 |
| 660 | `/// Token program for GOLD (regular SPL Token — Tokenkeg)` | GOLD uses Token-2022 (`TokenzQd`), **not** `Tokenkeg` |
| 666 | `/// Token program for XNT (Token2022 — TokenzQd)` | XNT uses `Tokenkeg`, **not** `TokenzQd` |

The account types (`gold_token_prog: Program<'info, Token2022>`, `xnt_token_prog: Program<'info, Token>`) are correct, so this is a maintenance hazard rather than an active bug. Future developers may be confused and make incorrect changes.

### Fix

Correct the comments to match the actual token program assignments.

---

## 🔴 #4 — `InitTreasury` Missing Authority Validation

**Severity:** LOW  
**Location:** `InitTreasury` accounts struct, lines 507–515  
**Status:** OPEN

### Description

```rust
#[derive(Accounts)]
pub struct InitTreasury<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"silver_config"], bump = game_config.bump)]
    pub game_config: Account<'info, GameConfig>,
    // ...
}
```

There is no constraint verifying `authority.key() == game_config.authority`. The `init` constraint on `treasury` uses a PDA seeded on `game_config.key()`, so only one treasury per game_config can exist. However, anyone can call this instruction and front-run the real authority's initialization.

### Impact

Griefing — a malicious actor could front-run the `init_treasury` call, forcing the real authority to close and reinitialize (if the treasury account is closable). Since it's a one-time initialization, the practical impact is low.

### Fix

Add an authority constraint:
```rust
#[account(mut, seeds = [b"silver_config"], bump = game_config.bump,
          has_one = authority @ GoldMinerError::InvalidAuthority)]
pub game_config: Account<'info, GameConfig>,
```

---

## 🔴 #5 — `JoinGame` Does Not Validate `gold_mint` Against Game Config

**Severity:** LOW  
**Location:** `JoinGame` accounts struct, lines 518–530  
**Status:** OPEN

### Description

```rust
pub struct JoinGame<'info> {
    // ...
    #[account(mut)]
    pub gold_mint: Box<InterfaceAccount<'info, Mint>>,
    // ...
}
```

There is no constraint that `gold_mint == game_config.gold_mint`. The instruction does not mint tokens (it only initializes the `Player` account and creates an ATA), so the practical impact is minimal. However, a user could create a `Player` with an ATA for the wrong mint, which could cause confusion or issues if downstream logic assumes the ATA holds the correct token.

### Fix

Add a constraint:
```rust
#[account(mut, address = game_config.gold_mint)]
pub gold_mint: Box<InterfaceAccount<'info, Mint>>,
```

Note: The `game_config` account is not currently in `JoinGame`'s accounts struct, so it would need to be added.

---

## 🔴 #6 — `MoveAndMine` Does Not Validate `gold_mint` Against Game Config

**Severity:** LOW  
**Location:** `MoveAndMine` accounts struct, lines 540–555  
**Status:** OPEN

### Description

```rust
pub struct MoveAndMine<'info> {
    // ...
    #[account(mut)]
    pub gold_mint: Box<InterfaceAccount<'info, Mint>>,
    // ...
}
```

There is no constraint that `gold_mint == game_config.gold_mint`. The `mint_to` CPI in the instruction body uses `game_config.gold_mint` as the mint, so the passed `gold_mint` account is not directly used in the CPI (the CPI reads from `game_config`). However, having an unvalidated mint account in the transaction is an account validation gap.

### Fix

Add a constraint:
```rust
#[account(mut, address = game_config.gold_mint)]
pub gold_mint: Box<InterfaceAccount<'info, Mint>>,
```

---

## 🟡 #7 — Bitmap Reset Hardcoded `data[8..]` May Skip First 8 Bytes

**Severity:** LOW (Informational)  
**Location:** `reset_bitmap`, lines 172–173  
**Status:** INTENTIONAL BEHAVIOR (acknowledged)

### Description

```rust
let data = &mut ctx.accounts.gold_bitmap.data.borrow_mut()[..];
require!(data.len() == BITMAP_ACCT, GoldMinerError::InvalidBitmapSize);
for byte in data[8..].iter_mut() {
    *byte = 0;
}
```

The reset function hardcodes `data[8..]`, skipping the first 8 bytes. The `gold_bitmap` account is initialized with `space = BITMAP_ACCT` (131,072 bytes) and uses `UncheckedAccount`. There is no room in the declared space for an 8-byte Anchor discriminator, yet the code skips 8 bytes as if one exists.

On a fresh initialization, the first 8 bytes are zero-filled by the system program, so this is harmless in practice. On subsequent resets (without re-initialization), the first 8 bytes would not be cleared if they contained non-zero data. However, Silver has confirmed that bitmap resetting is intentional behavior and this is acceptable.

### Fix

If future changes modify the account structure, consider whether `data[8..]` should be `data[..]` for `UncheckedAccount` accounts.

---

## 🟢 #8 — `start_session` Session Key Hijacking — NOT AN ISSUE

**Severity:** —  
**Location:** `StartSession` accounts struct, lines 532–538  
**Status:** VERIFIED SAFE

### Description

An earlier informal scan flagged that `start_session` might allow anyone to override another player's session key. After re-verification:

```rust
#[derive(Accounts)]
pub struct StartSession<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(mut, seeds = [b"player", wallet.key().as_ref()], bump = player.bump)]
    pub player: Account<'info, Player>,
}
```

The `player` PDA is derived from `wallet.key()`. Only the wallet owner can sign to mutate their own player account. **There is no session key hijacking vulnerability.** The initial report was a false positive.

---

## 🟢 #9 — `move_and_mine` Session Key Verification — NOT AN ISSUE

**Severity:** —  
**Location:** `MoveAndMine` accounts struct, lines 540–555  
**Status:** VERIFIED SAFE

### Description

An earlier informal scan flagged that `move_and_mine` might not verify the session key. After re-verification:

```rust
#[account(mut, seeds = [b"player", player.wallet.as_ref()], bump = player.bump,
          constraint = player.session_key == session_signer.key() @ GoldMinerError::InvalidSessionKey)]
pub player: Account<'info, Player>,
```

The `session_signer` must match `player.session_key`. **Session key verification is enforced.** The initial report was a false positive.

---

## 🟢 #10 — `update_gold_mint` Should Be Admin-Only — ALREADY IS

**Severity:** —  
**Location:** `update_gold_mint` instruction, lines 191–202  
**Status:** ALREADY ADMIN-ONLY

### Description

An earlier informal scan flagged that `update_gold_mint` might not be admin-only. After re-verification:

```rust
pub fn update_gold_mint(ctx: Context<UpdateGoldMint>) -> Result<()> {
    let cfg = &mut ctx.accounts.game_config;
    require!(
        ctx.accounts.authority.key() == cfg.authority,
        GoldMinerError::InvalidSessionKey
    );
    // ...
}
```

And the accounts struct has:
```rust
#[account(mut, seeds = [b"silver_config"], bump = game_config.bump,
          has_one = authority @ GoldMinerError::InvalidSessionKey)]
pub game_config: Account<'info, GameConfig>,
```

Both a runtime `require!` check AND the `has_one = authority` Anchor constraint enforce that only the game authority can update the gold mint. **This is already admin-only.** The initial report was a false positive.

---

## Notes on Intentional Behavior

- **Bitmap resetting is permissionless** — confirmed by Silver as intentional. Anyone can call `reset_bitmap` once 75% of spots are mined.
- **Auto-LP is permissionless** — confirmed by Silver as intentional. Anyone can trigger `treasury_auto_lp` when the treasury holds sufficient GOLD.

---

## Recommendations by Priority

| Priority | Action |
|----------|--------|
| **P0** | Address #1 (CPI brittleness) — highest risk if AMM upgrades |
| **P1** | Address #2 (mint address mismatch) — verify and align program + frontend |
| **P2** | Address #3 (comment fixes) — trivial 2-minute fix |
| **P3** | Address #4, #5, #6 (authority/gold_mint validation) — easy wins, low risk |

---

*End of audit.*
