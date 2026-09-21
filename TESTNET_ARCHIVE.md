# Gold Miner — X1 Testnet Archive (Snapshot 2026-09-18)

> **UPDATE (2026-09-21):** Mainnet is now **LIVE** (`DZ4FErNjFdqFMumiYpTLtdKh5a1mqREhYFpQPr6XiJcP`,
> GOLD mint `8HLD8UvZotgX7tGW4TEPLJEkJZGSAsanuRZe7q64CLrX`). See `README.md` for the current mainnet
> deployment. This document is kept purely as the **testnet snapshot** should we need to restore or
> reference the old testnet environment. The `14YBZ...` stale entry and dual-program-ID note (§2)
> were resolved: on-chain `GameConfig.gold_mint` matched the frontend (`vKxn...`) for testnet, and
> mainnet uses the fresh `DZ4FEr...` program + `8HLD8...` mint per MAINNET_LAUNCH_PLAN decisions.

**Purpose:** Archival snapshot of the X1 **testnet** deployment, captured before the planned
transition to **mainnet**. If the mainnet migration fails for any reason and we need to fall
back to testnet, this document is the single source of truth for restoring the working
testnet environment.

**Owner decision (Silver, 2026-09-18):** Keep this archived in case we have to go back to
testnet later.

---

## 1. Environment / Toolchain

| Item | Value |
|---|---|
| Cluster (Anchor.toml `[provider]`) | `testnet` |
| Default RPC (frontend fallback) | `https://rpc.testnet.x1.xyz` |
| Alt RPC (some scripts) | `https://x1-testnet.xen.network` |
| Token program | **SPL Token-2022** (`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`) |
| ATA program | `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL` |
| Deployer wallet | `2zotLCHPhTazmMVaRg9y4bmRm8mbBHb5XuvbV4mcQRAS` |
| Anchor version | `0.30.1` |
| Solana CLI version | `1.18.26` |
| Rust version | `1.78.0` |

---

## 2. Program (Anchor) — `gold_miner`

**Program ID:** `GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6`
(pinned identically in `Anchor.toml` `[programs.localnet]` / `.testnet` / `.mainnet`)

**IMPORTANT — two distinct program IDs exist (do not conflate):**
- `GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6` — the **Anchor program ID** in `Anchor.toml`
  and in `set-auth.js` / `create-treasury-ata.js`.
- `4GQU2H48Ai2WtM8mzGexLGDA1KAcrvrHRXG1WeHaWxAM` — the **frontend `NEXT_PUBLIC_PROGRAM_ID`**
  default in `app/src/lib/constants.ts` and the live `PROG` in `create-gold-mint-v5.js`.

These appear as two generations of the game program. The **frontend runs `4GQU2...`**; the
**Anchor build/config points at `GLDFu...`.** Before any mainnet deploy, reconcile these (pick
one canonical program ID) — this is a known inconsistency to resolve, not a fact to preserve.

---

## 3. GOLD Mint & Authorities

The mint has gone through **several versions** (v3 → v4 → v5 + testnet keypair). Current canonical
"live" value used by the AMM and several scripts:

| Field | Value |
|---|---|
| **GOLD mint (AMM / live-flagged)** | `vKxnbuf4HeR6espPnfnVwaByaWgp3NHSGWGmjyNyrS6` |
| Decimals | `9` |
| Token standard | SPL Token-2022 |
| Name / Symbol | Goldium / GOLD |

**Mint keypair files on disk (pub derived from each):**
| File | Pubkey (derived) |
|---|---|
| `goldium-mint-keypair.json` | `CnacgNEjpATghhtnvBtHvRPZWdMiZts7ztDksS3DbUhn` |
| `goldium-mint-v2-keypair.json` | `FZVFSUmwBSgUDkKUFLVBUFYDdXJDSpRFGGXfHtMeyp9D` |
| `goldium-mint-testnet-keypair.json` | `3oHfoTR3ek3TMT2fNbPSitFGHpMVJWGxhsgnYRmpJipi` |
| `scripts/gold-mint-keypair.json` | (see `scripts/gold-mint-vN-info.json`) |
| `gold-bitmap-keypair.json` | `7DVVV8f7mzXLW3pB3Xx1z9LQxVpTpNQ1Cm9NiggXDT8A` |

**Mint authority / config PDA:** `H4KYZGURjXfo1n7RkQXjiz7CvihLNV4ykP7bjFvE94aG`
(used as the Token-2022 mint authority / `game_config` PDA signer in `set_mint_authority.js`)
Seed: `game_config`.

> ⚠️ **Key security (standing rule):** keypair files are **never in GitHub** (protected by
> `.gitignore`: `**/*-keypair.json`, `*.keypair.json`, `*.json`). They live on the server only.
> Theo is the sole holder of all mainnet keys (Silver's decision 2026-09-15).

---

## 4. Metadata / Info files

| File | Mint | Notes |
|---|---|---|
| `goldium-mint-info.json` | (name/symbol/decimals only; `X1 Testnet`) | Token-2022, 9 decimals |
| `scripts/gold-mint-v3-info.json` | | earlier generation |
| `scripts/gold-mint-v4-info.json` | `EarL8NaAje3mx5UGC86CWByVnotKgibkGmuJh6bHcWdz` | mintAuth `9goAY...`, prog `4GkZ3...` |
| `scripts/gold-mint-v5-info.json` | `FEksZivLhY8LFhuNrtgyke8hTGJV498iybFViapzSdAX` | mintAuth `H4KYZ...`, prog `4GQU2...`, deployer `2zotL...`, created 2026-06-29 |

**Metaplex metadata image (IPFS):** `ipfs://QmZxVjTkmjdRmpp6fhtAaKWDWKHVK2z6fpB5LuDiKQk6k7`

---

## 5. AMM / treasury_auto_lp addresses (Token-2022 GOLD / XNT)

From `app/src/lib/constants.ts`:

| Item | Value |
|---|---|
| AMM program | `7EEuq61z9VKdkUzj7G36xGd7ncyz8KBtUwAWVjypYQHf` |
| AMM market authority | `2HbqjtA9gB9c95c8KkUUWxhtNjCfYcPbvfdhcdobbq1C` |
| AMM config | `3FzzbxwpdJKxRW1yNT7UPYmna17SwC9PRmskMa8A2BuY` |
| AMM pool state | `FuWCSt8fx3r8CZ7UjsbxxozNxJipgcT3XUcsSVVTzWtz` |
| AMM GOLD vault | `DvprQjnFnjhdjqLDkagcjSsqYZNuDPbXmto9zdqDcE94` |
| AMM XNT vault | `AkvjBU6S3G4UdrXFHrgZPxnofrCgEToXvtbczKpFqvFD` |
| AMM observer state | `DUd6JfdKGA8M2xiSWLGwfxkDgHXWQKVLL6CCvcdFx2En` |
| AMM GOLD mint | `vKxnbuf4HeR6espPnfnVwaByaWgp3NHSGWGmjyNyrS6` |
| AMM XNT mint (wrapped SOL) | `So11111111111111111111111111111111111111112` |
| AMM LP mint | `R42M1rNtsrDvTAKMZbMWHE2TXZxPqAZzZ5bR6uR3Qzy` |
| AMM XNT token program | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` (regular SPL) |
| AMM GOLD token program | `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` (Token-2022) |
| INCINERATOR | `1nc1nerator11111111111111111111111111111111` |

**Treasury:** GOLD ATA + XNT ATA derived from treasury PDA (seed `["treasury", gameConfigPda]`)
under program `GLDFu...`. See `create-treasury-ata.js` / `create-treasury-gold-ata.js`.

---

## 6. Frontend wallet-connect caveat (at snapshot time)

- **Mobile wallet connect is temporarily disabled** (Silver's decision 2026-09-18): mobile users
  see a "Play on Desktop" notice. Re-enable by flipping `ALLOW_MOBILE_WALLET_CONNECT = true` in
  `app/src/lib/utils.ts` and rebuilding.
- Wallet provider auto-discovers wallets via wallet-standard; Backpack Android MWA was the known
  problem child (see comments in `WalletProvider.tsx`).

---

## 7. How to restore testnet (fallback checklist)

1. `solana config set --url https://rpc.testnet.x1.xyz`
2. Ensure deployer `2zotLCHPhTazmMVaRg9y4bmRm8mbBHb5XuvbV4mcQRAS` is funded.
3. Re-deploy program from source if needed:
   - `cargo build-sbf` (or `anchor build`), then `solana program deploy` with the
     `GLDFu...` program ID keypair.
4. Re-create mint + ATA + treasury from the scripts in `app/scripts/` and `scripts/`
   (create-gold-mint-v5 / set_mint_authority / create-treasury-ata).
5. Frontend: ensure `.env.local` matches the restored addresses (see §2–§5).
6. `npm run build && npm start` (port configured for the UI).

---

## 8. Open items / known inconsistencies to resolve before mainnet

> **UPDATE (2026-09-21):** These were resolved during the mainnet migration — see README.md for the
> live mainnet addresses. The notes below are historical context only.

- **Dual program IDs** (`4GQU2...` frontend vs `GLDFu...` Anchor) — reconcile to one canonical ID.
- **Multiple mint versions** (v3/v4/v5 + testnet keypair) — the "live" GOLD mint is ambiguous
  across scripts; pin one. `vKxnbuf4HeR6espPnfnVwaByaWgp3NHSGWGmjyNyrS6` is the AMM-flagged value.
- **Program immutability** target — Silver wants the program made **immutable** once mainnet is
  stable (then keys become irrelevant).
- **Mobile wallet connect** — to re-enable on mobile once MWA is fixed.
