# AMM Fingerprint Upgrade Plan

> **Status:** `PENDING` — Do this only after Gold Miner is deployed to X1 mainnet.  
> **Goal:** Pin the CPI target to the exact AMM binary that is live at game launch, preventing treasury LP calls from accidentally routing to a mismatched or upgraded AMM.

---

## Prerequisites

- [ ] Gold Miner program is live on X1 mainnet
- [ ] Treasury and auto-LP flow have been tested end-to-end on mainnet
- [ ] The AMM program ID on mainnet is known (currently `7EEuq61z9VKdkUzj7G36xGd7ncyz8KBtUwAWVjypYQHf` on mainnet)
- [ ] Upgrade authority wallet is funded and accessible
- [ ] You are ready to make the program immutable (or at least finalize the AMM target)

---

## Step 1: Download the AMM binary from mainnet

Run this on any machine with the Solana CLI installed and mainnet RPC access:

```bash
solana program dump \
  7EEuq61z9VKdkUzj7G36xGd7ncyz8KBtUwAWVjypYQHf \
  amm.bin \
  --url https://rpc.mainnet.x1.xyz
```

Save `amm.bin` somewhere safe — this is the exact on-chain program your treasury will CPI into.

---

## Step 2: Extract the fingerprint values

### A — Total byte length

```bash
ls -l amm.bin | awk '{print $5}'
```

Example output: `388584`

→ This becomes `AMM_EXPECTED_DATA_LEN` in `lib.rs`.

### B — First 32 bytes (ELF header prefix)

```bash
head -c 32 amm.bin | xxd -p | sed 's/../0x&, /g' | sed 's/, $//'
```

Example output:  
`0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0xfe, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00`

→ This becomes `AMM_EXPECTED_PREFIX` in `lib.rs`.

---

## Step 3: Update the constants in `lib.rs`

Open `programs/gold-miner/src/lib.rs` and replace the zeroed-out placeholders:

```rust
// BEFORE (testnet / disabled):
const AMM_EXPECTED_DATA_LEN: u64 = 0;
const AMM_EXPECTED_PREFIX: [u8; 32] = [0u8; 32];

// AFTER (mainnet locked):
const AMM_EXPECTED_DATA_LEN: u64 = 388584;      // ← your actual byte count
const AMM_EXPECTED_PREFIX: [u8; 32] = [
    0x7f, 0x45, 0x4c, 0x46, /* ... paste the full 32-byte hex output ... */
];
```

---

## Step 4: Rebuild the SBF binary

Use the same toolchain that worked for the last deploy (v3.1.14):

```bash
$HOME/.local/share/solana/install/releases/3.1.14/solana-release/bin/cargo-build-sbf
```

Confirm it compiles cleanly. Do **not** deploy yet.

---

## Step 5: Test the fingerprint logic (dry-run on devnet)

Optional but recommended — deploy the updated program to devnet first and verify:

1. Treasury auto-LP still works when the AMM matches
2. It fails with `AmmProgramVersionMismatch` if you tamper the prefix or length constants

This confirms the check is working and not overly strict.

---

## Step 6: Deploy the upgrade to mainnet

```bash
solana program deploy \
  target/deploy/gold_miner.so \
  --program-id <your_mainnet_program_id> \
  --url https://rpc.mainnet.x1.xyz
```

Wait for confirmation:

```bash
solana program show <your_mainnet_program_id> --url https://rpc.mainnet.x1.xyz
```

---

## Step 7: (Optional but recommended) Make the program immutable

If you are confident no further upgrades are needed:

```bash
solana program set-upgrade-authority \
  <your_mainnet_program_id> \
  --final \
  --url https://rpc.mainnet.x1.xyz
```

> ⚠️ **This is irreversible.** Only do this after full audit and community sign-off.

---

## What happens if the AMM upgrades later?

If the AMM team deploys a new version (new binary, new size or header), your program will reject CPIs with `AmmProgramVersionMismatch`. This is by design — it prevents accidental treasury interactions with an unknown AMM.

**To re-enable LP, you must:**

1. Repeat Steps 1–2 to capture the new AMM fingerprint
2. Update `lib.rs` again
3. Re-deploy (if the program is not yet immutable)

If the program **is** already immutable, you would need to build a v2 program with the new fingerprint and migrate treasury funds to it.

---

## Security Notes

| Concern | Mitigation |
|--------|------------|
| AMM silently upgraded | Fingerprint check catches size/header mismatch (~500 CUs) |
| Someone deploys a fake AMM with same size | They’d also need the exact same 32-byte prefix — extremely unlikely for a non-identical binary |
| AMM is redeployed to same address with identical binary | Size and prefix would match; this is acceptable because the binary itself hasn’t changed |
| Cost of check | ~500 compute units per `treasury_auto_lp` call — negligible |

---

## One-liner checklist

```
□  AMM binary dumped from mainnet
□  AMM_EXPECTED_DATA_LEN recorded
□  AMM_EXPECTED_PREFIX recorded
□  lib.rs updated, committed
□  SBF binary rebuilt successfully
□  Devnet dry-run passed (optional)
□  Deployed to mainnet
□  Program made immutable (optional, final step)
```

---

*Document created: 2026-06-27*  
*Last updated: 2026-06-27*  
*Target: Gold Miner CPI safety upgrade — post-mainnet launch*
