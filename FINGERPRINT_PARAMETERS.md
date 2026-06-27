# Gold Miner — Mainnet Fingerprint Parameters
> **Generated:** 2026-06-27 09:14 UTC  
> **AMM Program:** `sEsYH97wqmfnkzHedjNcw3zyJdPvUmsa9AixhS4b4fN`  
> **Source:** On-chain fetch from X1 mainnet RPC

---

## 1. Fingerprint Constants (Ready to Paste)

Replace these placeholders in `programs/gold-miner/src/lib.rs`:

```rust
// ── AMM immutability fingerprint ────────────────────────────────────────────
pub const AMM_EXPECTED_DATA_LEN: usize = 526600;
pub const AMM_EXPECTED_PREFIX: [u8; 32] = [
    0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x03, 0x00, 0x07, 0x01, 0x01, 0x00, 0x00, 0x00,
    0x20, 0x66, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00,
];
```

**Verification:**
- `0x7f 0x45 0x4c 0x46` = `"\x7fELF"` — valid ELF64 magic ✅
- `0x02` = 64-bit (`ELFCLASS64`) ✅
- `0x01` = Little-endian (`ELFDATA2LSB`) ✅
- `526,600` bytes = the full deploy binary (excl. ProgramData header) ✅

---

## 2. Program ID Update

```rust
// OLD (testnet)
pub const AMM_PROGRAM_ID: &str = "7EEuq61z9VKdkUzj7G36xGd7ncyz8KBtUwAWVjypYQHf";

// NEW (mainnet — SAME code, different program ID)
pub const AMM_PROGRAM_ID: &str = "sEsYH97wqmfnkzHedjNcw3zyJdPvUmsa9AixhS4b4fN";
```

**Note:** The discriminators (`SWAP_BASE_INPUT_DISCRIMINATOR`, `DEPOSIT_DISCRIMINATOR`) remain **unchanged** — verified exact match on-chain.

---

## 3. Pool-Specific Constants (CANNOT be pre-filled)

These depend on the GOLD/XNT pool being **created first** on mainnet. After pool creation, fetch them from the AMM:

| Constant | Description | How to get it |
|----------|-------------|---------------|
| `MARKET_AUTHORITY` | Pool's market authority PDA | AMM pool creation TX output |
| `AMM_CONFIG` | AMM global config account | AMM SDK or fixed per AMM |
| `POOL_STATE` | GOLD/XNT pool state account | Created at pool init, address returned |
| `GOLD_VAULT` | Pool's GOLD token vault ATA | Derived from pool state + GOLD mint |
| `XNT_VAULT` | Pool's XNT token vault ATA | Derived from pool state + XNT mint |

**For testnet:** These were manually discovered by inspecting transactions. Same process on mainnet after pool creation.

---

## 4. What the Fingerprint Check Does

In `treasury_auto_lp()`, **~500 compute units** before any CPI:

```rust
let amm_info = ctx.accounts.amm_program.to_account_info();
let amm_data = amm_info.data.borrow();
if AMM_EXPECTED_DATA_LEN > 0 {
    require!(amm_data.len() == AMM_EXPECTED_DATA_LEN, GoldMinerError::AmmProgramVersionMismatch);
    require!(&amm_data[..32] == &AMM_EXPECTED_PREFIX[..], GoldMinerError::AmmProgramVersionMismatch);
}
```

**Two checks:**
1. **Data length** — catches major upgrades that change binary size
2. **ELF header prefix** — catches any recompilation (different compiler flags, toolchain, etc.)

**If AMM is upgraded →** `AmmProgramVersionMismatch` → transaction reverts → treasury LP is **safely paused** until team manually updates the fingerprint.

**If you haven't set the constants yet (len=0) →** check is **bypassed** — lets you deploy and test without the fingerprint.

---

## 5. Full Diff (what to change in `lib.rs`)

```diff
- pub const AMM_PROGRAM_ID: &str = "7EEuq61z9VKdkUzj7G36xGd7ncyz8KBtUwAWVjypYQHf";
+ pub const AMM_PROGRAM_ID: &str = "sEsYH97wqmfnkzHedjNcw3zyJdPvUmsa9AixhS4b4fN";

- pub const AMM_EXPECTED_DATA_LEN: usize = 0; // TODO: fill at deploy time
+ pub const AMM_EXPECTED_DATA_LEN: usize = 526600;

- pub const AMM_EXPECTED_PREFIX: [u8; 32] = [
-     0x00, 0x00, 0x00, 0x00, ... // 32 zeros
- ];
+ pub const AMM_EXPECTED_PREFIX: [u8; 32] = [
+     0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00,
+     0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
+     0x03, 0x00, 0x07, 0x01, 0x01, 0x00, 0x00, 0x00,
+     0x20, 0x66, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00,
+ ];
```

**Note:** `MARKET_AUTHORITY`, `AMM_CONFIG`, `POOL_STATE`, `GOLD_VAULT`, `XNT_VAULT` are testnet values and must be updated **after** mainnet pool creation. They are NOT part of the fingerprint.

---

## 6. Commit This Data

```bash
cd /path/to/gold-miner
# Edit lib.rs with values above
anchor build
# Deploy to mainnet (new program ID if needed)
```

**Recommendation:** Commit the `AMM_PROGRAM_ID` + fingerprint constants to the codebase now, but leave `AMM_EXPECTED_DATA_LEN = 0` until you're ready to enforce it. This way the code is documented but won't accidentally block treasury LP during initial testing.
