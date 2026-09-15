# Gold Miner — Architecture & Repo Map

> **Maintainer note:** This file is the high-level "heads-up" map of the repo so you (and I) can quickly re-orient on what lives where and what's happening. Keep it brief and current. Owner: Silver 🪙.

## What the game is

**Gold Miner** — on-chain multiplayer "fair mine" game on the **X1 Network** (Solana VM / SVM).

- Explore a **1,024 × 1,024** grid, discover a hidden gold pattern, step on spots to mine **GOLD**.
- Gold formula: `(x & y) % 7 == 0`. Gold spots are **consumable** (mine once, gone). Figure out the pattern to navigate efficiently.
- **Session keys** let you move on-chain without a wallet popup per move.
- **GOLD** is a **Token-2022** mint-on-demand token. 100 GOLD per spot to the **player**, 100 GOLD to the **treasury** (~200/spot → ~**30M GOLD per world epoch**).
- **Treasury Auto-LP:** GOLD accruing to the protocol treasury is deployed into **protocol-owned liquidity**, then **burned** (deflationary).

---

## High-level architecture

```
Solidity/JS clients ─► Anchor program (Rust, SVM) ─► X1 chain
        │                        │
        └─ Next.js frontend      └─ Token-2022 GOLD mint, player PDAs,
           (browser → RPC)          on-chain bitmap, treasury AMM (CLMM)
```

- **Program:** Anchor 0.30 / Rust, SVM. Deployed on X1 (testnet + mainnet).
- **Frontend:** Next.js (App Router) + TypeScript + Tailwind.
- **Session keys:** one wallet signature → ephemeral browser keypair, encrypted at rest with **AES-256-GCM** via **Web Crypto API**.
- **World state:** on-chain bitmap account (131,072 bytes = 1024×1024 bits) tracking mined cells; resettable when ~75% mined out.
- **Treasury:** auto-LP → burn (see `docs/liquidity-auto-burn.md` and `GAME_DESIGN.md`).

---

## Directory structure

```
gold-miner/
├── ARCHITECTURE.md          # ← you are here
├── README.md                # game overview + quickstart
├── GAME_DESIGN.md           # core design philosophy (consumable gold, spatial)
├── Anchor.toml              # anchor build/deploy config + test genesis (token_2022)
├── Cargo.toml / Cargo.lock  # rust workspace (program)
├── litepaper.pdf/.tex/...   # litepaper PDF + LaTeX source (web version lives in app)
├── audits/                  # security/design audit docs
│   ├── AUDIT.md
│   ├── AUDIT_PHASE2.md
│   └── AUDIT_PHASE3.md
├── docs/                    # supporting design docs (ARCHIVED_ESCROW, liquidity-auto-burn, PROGRAM_AUDIT)
├── programs/
│   └── gold-miner/src/lib.rs    # THE on-chain program (single source of truth)
├── app/                     # Next.js frontend (deployed to Vercel)
│   ├── src/
│   │   ├── app/             # routes: page, litepaper, terms, layout
│   │   ├── components/      # GameCanvas, GameUI, PlayerHUD, GoldEye, TreasuryPanel, ...
│   │   ├── hooks/           # useGame, useSessionKey, useGoldMiner, useAudio
│   │   └── lib/             # constants, idl, sessionCrypto, utils
│   ├── public/              # static assets (music/, sounds/, images)
│   └── next.config.js
├── tests/                   # integration + init scripts (reorganized 2026-09-15)
│   ├── integration/          # test-deposit, test-move, test-withdraw, test-idl, verify-finalize...
│   ├── init/                 # init-game, init-testnet, reinit-testnet
│   ├── gold-miner.ts         # anchor program tests
│   └── call_treasury_lp.*    # treasury auto-LP exercise
├── scripts/                 # ops: metadata, treasury ATAs, debug, deploy.sh, init.sh, game-config
└── assets/                  # music (opus) + sounds + audio license
```

---

## Key program constants (`programs/gold-miner/src/lib.rs`)

| Constant | Value | Meaning |
|----------|-------|---------|
| `declare_id!` / program id | `4GQU2H48Ai2WtM8mzGexLGDA1KAcrvrHRXG1WeHaWxAM` | On-chain program (src of truth: `lib.rs`, IDL, frontend default). ⚠️ README still lists stale `EkThFJ…` |
| `GRID_SIZE` | 1024 | Grid is 1024×1024 |
| `GOLD_PER_MINE` | 100 | GOLD minted per spot (player) |
| `GOLD_DECIMALS` | 9 | GOLD token decimals |
| `SESSION_DURATION_SLOTS` | 36000 | ~4h session key lifetime |
| `BITMAP_BODY` | 131,072 | Bytes = 1024×1024 bits |
| `TOTAL_GOLD_SPOTS` | 161,390 | Total spots in a world |
| `RESET_THRESHOLD` | 121,042 | 75% of spots → bitmap reset allowed |
| `MIN_GOLD_FOR_LP` / `MIN_LP_TO_BURN` | 1000 / 1000 | Treasury auto-LP burn triggers |
| `GOLD_MINT_ADDR` | `vKxnbuf4…` (Token-2022) | GOLD mint |
| `XNT_MINT_ADDR` | `So111…` | XNT = wSOL-ish native gas |
| AMm / LP | `7EEuq61z…` + LP `R42M1…` | Treasury CLMM pool + LP mint |

**Program instructions:** `initialize_game`, `init_treasury`, `join_game`, `start_session`, `move_and_mine`, `reset_bitmap`, `update_gold_mint`, `finalize_game`, `treasury_auto_lp`.

---

## Key frontend modules (`app/src/`)

| Module | Responsibility |
|--------|----------------|
| `hooks/useGame.ts` | Core game loop: movement, mining, session-gas topup, bitmap state |
| `hooks/useSessionKey.ts` | Session key lifecycle: generate, encrypt/decrypt, topup, sweep, renewal |
| `hooks/useGoldMiner.ts` | Program wrapper (Anchor) |
| `hooks/useAudio.ts` | Music + SFX playback (per-track/SFX volume overrides) |
| `lib/constants.ts` | Program IDs, RPC/WS URLs, grid/bitmap sizes, AMM addresses |
| `lib/sessionCrypto.ts` | AES-256-GCM session-key encryption |
| `lib/idl.ts` | Generated Anchor IDL |
| `components/GameCanvas.tsx` | Rendering + input |
| `components/TreasuryPanel.tsx` | Deposit / auto-LP / burn UI |

---

## Session-gas topup note (2026-09-15)

Session balance is checked in `useGame.ts` (`move_and_mine` path). Threshold `SESSION_MIN_SAFE_BALANCE = 8_000_000` lamports (0.008 SOL) — raised from 3.5M so the topup fires **early**, before a move can fail for lack of gas (avoids a console error). Topup target is `SESSION_FUND_LAMPORTS = 0.2 SOL` in `useSessionKey.ts`. Rationale: threshold ~4% of target, so it won't re-trip after every move but gives several moves + RPC-lag headroom.

---

## Quick pointers

- **Deploy:** Anchor via `Anchor.toml` (`[programs.testnet]` / `[programs.mainnet]`). `scripts/deploy.sh` also exists.
- **Frontend deploy:** Vercel (auto from `main`). Uses `NEXT_PUBLIC_PROGRAM_ID` / `NEXT_PUBLIC_RPC_URL` env overrides, falling back to constants in `lib/constants.ts`.
- **Audio files:** `assets/music/` (opus) + `assets/sounds/` (opus). SFX/music volume tweaks live in `useAudio.ts`.
- **Litepaper:** PDF generated from `litepaper.tex` at repo root; web version at `app/src/app/litepaper/page.tsx`. Keep the two in sync (e.g. ~30M GOLD/epoch supply figure).
