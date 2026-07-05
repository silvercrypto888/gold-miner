# Gold Miner Program Audit — 2026-06-29

## Executive Summary

After on-chain investigation of the deployer wallet (`2zotLCHPhTazmMVaRg9y4bmRm8mbBHb5XuvbV4mcQRAS`), only **ONE** Gold Miner program is actually initialized and usable. Two other program binaries were deployed but never initialized.

| Program | Status | Deployed | Initialized | Config Exists | Treasury Exists | Usable |
|---------|--------|----------|-------------|---------------|-----------------|--------|
| **4GQU... (v1)** | ✅ **LIVE** | Yes (slot 169,270,450) | Yes (slot 169,270,496) | ✅ `H4KY...` | ✅ Yes | **YES** |
| **GLDF... (v2)** | ❌ Deployed only | Yes | **NO** | ❌ Not found | ❌ No | **NO** |
| **4GkZ... (v3)** | ❌ Deployed only | Yes (slot 169,226,336) | **NO** | ❌ Not found | ❌ No | **NO** |

---

## Program 1: 4GQU2H48Ai2WtM8mzGexLGDA1KAcrvrHRXG1WeHaWxAM (v1)

**Status: ✅ LIVE AND USABLE**

### Deployment History (from deployer tx logs)
- **Deployed**: Slot 169,270,450 — `BPFLoaderUpgradeab1e` "Upgraded program 4GQU..."
- **Initialized**: Slot 169,270,496 — Log: `"Instruction: InitializeGame"`, `"Game init. Grid 1024x1024"`
- **Treasury Init**: Slot 169,270,866 — Log: `"Treasury initialized"`

### On-Chain State
```
Program account:
  Executable: true
  Owner: BPFLoaderUpgradeab1e11111111111111111111111
  Data size: 36 (program loader stub)
  Lamports: 1,141,440

Config PDA (seeds: ["silver_config_v2"]):
  Address: H4KYZGURjXfo1n7RkQXjiz7CvihLNV4ykP7bjFvE94aG
  Owner: 4GQU2H48Ai2WtM8mzGexLGDA1KAcrvrHRXG1WeHaWxAM (correct)
  Data size: 118 bytes (old struct, no immutable field)
  Lamports: 1,712,160
  
Config PDA (seeds: ["game_config"]):
  Address: 5hCDeJqzKvQnPjGmMpJFSBqCT8kDw6fScx8oB8JoBmnC
  Status: NOT FOUND (never created — only silver_config_v2 was used)
```

### Config Data (decoded)
```
Authority: 2zotLCHPhTazmMVaRg9y4bmRm8mbBHb5XuvbV4mcQRAS (deployer)
Grid size: 1024
Gold mint: FEksZivLhY8LFhuNrtgyke8hTGJV498iybFViapzSdAX
Gold bitmap: 7DVVV8f7mzXLW3pB3Xx1z9LQxVpTpNQ1Cm9NiggXDT8A
Total gold mined: 31
Bump: 254
Immutable: false (field doesn't exist in this version)
```

### GOLD Mint (v1)
- **Address**: `FEksZivLhY8LFhuNrtgyke8hTGJV498iybFViapzSdAX`
- **Size**: 82 bytes (basic Token-2022, NO extensions)
- **Mint authority**: `H4KYZGURjXfo1n7RkQXjiz7CvihLNV4ykP7bjFvE94aG` (config PDA)
- **Supply**: 6,000,000,000,000 (6 trillion = 6000 with 9 decimals)
- **Decimals**: 9
- **Metadata**: ❌ NONE — this is why wallets show raw mint address

---

## Program 2: GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6 (v2)

**Status: ❌ DEPLOYED BUT NEVER INITIALIZED**

### Deployment History
- **Deployed**: Confirmed on chain (exists as executable program)
- **Initialized**: **NOT FOUND** — no transaction invoking `initializeGame` found in deployer history
- **Treasury Init**: Never happened

### On-Chain State
```
Program account:
  Executable: true
  Owner: BPFLoaderUpgradeab1e11111111111111111111111
  Data size: 36
  Lamports: 1,141,440

Config PDA (seeds: ["silver_config_v2"]):
  Address: FSXRbsQo4NxEQ6pzDEL3EEMHVTaMfivKQLfWHXHuABX6
  Status: NOT FOUND

Config PDA (seeds: ["game_config"]):
  Address: 3cP6ffJRKwJ4FyoKa5Khg1tLZtoArVpfReLY3FxhXQJV
  Status: NOT FOUND
```

**Note**: The v2 config (`3cP6...`) was found in an earlier query but appears to have been queried in error or was a temporary state. Re-verification shows it does not exist. The PDA `3cP6ffJRKwJ4FyoKa5Khg1tLZtoArVpfReLY3FxhXQJV` is NOT owned by `GLDF...`.

---

## Program 3: 4GkZ3snMDedRn9BRvUtH1rx24AqzpDCZj7VP7WXGfZUr (v3 with finalize_game)

**Status: ❌ DEPLOYED BUT NEVER INITIALIZED**

### Deployment History
- **Deployed**: Slot 169,226,336 — `BPFLoaderUpgradeab1e` "Upgraded program 4GkZ..."
- **Initialized**: **NOT FOUND**
- **Treasury Init**: Never happened

### On-Chain State
```
Program account:
  Executable: true
  Owner: BPFLoaderUpgradeab1e11111111111111111111111
  Data size: 36
  Lamports: 1,141,440

Config PDA (seeds: ["silver_config_v2"]):
  Address: 6fBgJhEiy1Smj4ScA1ZHZChWwQMEF7WtYnaXSUz767fe
  Status: NOT FOUND

Config PDA (seeds: ["game_config"]):
  Address: FoP1GkST2bzygBd6R6L4UpZhBec3RPuokksxxAdSH64Q
  Status: NOT FOUND
```

### What "finalize_game" Did
The `finalize_game()` instruction was added to the v3 source code but the program was never initialized, so:
- The instruction exists in the binary
- No game config exists to call it on
- The instruction is unreachable

---

## The Metadata Problem

Silver reports that GOLD tokens in his wallet show raw mint address (no name/image).

### Why: Two separate issues

**Issue 1: You're using the v1 program**
- The ONLY initialized program is v1 (`4GQU...`)
- Its mint `FEks...` is a basic Token-2022 account (82 bytes, NO metadata extensions)
- Wallets cannot display metadata because none exists on chain

**Issue 2: Even the v2 mint had limited visibility**
- The `HAPJ...` mint (associated with v2 in earlier notes) does have Token-2022 metadata extensions
- But most wallets (Backpack, Solflare, Phantom) do NOT display Token-2022 native metadata
- They only display Metaplex metadata, which requires a separate Metaplex metadata account

### Solution Options
1. **Create a Metaplex metadata account** for the existing mint (works with all wallets)
2. **Mint new tokens with Metaplex metadata** from the start
3. **Update frontend** to manually display Token-2022 metadata (wallet-agnostic but not wallet-native)

---

## Files Referenced
- `gold-miner/programs/gold-miner/src/lib.rs` — Source code with `finalize_game()`
- `gold-miner/app/src/lib/constants.ts` — Frontend pointing to `GLDF...` and `HAPJ...`
- `gold-miner/app/src/lib/idl.ts` — IDL with `updateGoldMint` instruction
- `gold-miner/scripts/audit_programs.js` — This audit script
- `gold-miner/docs/PROGRAM_AUDIT.md` — This file

## Methodology
1. Queried `getAccountInfo` for each program ID
2. Queried `getSignaturesForAddress` for deployer wallet (200+ txs)
3. Parsed transaction logs for program invocations
4. Derived PDAs using `findProgramAddressSync` with each program ID + seed bytes
5. Queried each derived PDA with `getAccountInfo`
6. Decoded config data where accounts existed

## Last Updated
2026-06-29 21:26 UTC
