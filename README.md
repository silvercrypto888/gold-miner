# Gold Miner ⛏️

On-chain multiplayer fair mine game on the X1 Network (mainnet). Explore a
1,024×1,024 grid, discover gold, and mine GOLD tokens (Token-2022).

## How It Works

1. **Connect wallet** → sign one transaction to join
2. **Start session** → generates an encrypted session key for frictionless movement
3. **Move** with arrow keys or WASD → each move is on-chain, no wallet popup
4. **Mine gold** → stepping on a gold square auto-mints 100 GOLD (Token-2022)
5. **Gold formula** → `(x & y) % 7 == 0` — figure out the pattern, navigate efficiently
6. **Deposit/Withdraw XNT** → fund your movement gas, withdraw anytime

## Architecture

- **Program**: Anchor (Solana VM / SVM), deployed on X1 Mainnet
- **Frontend**: Next.js + TypeScript + TailwindCSS
- **Session Keys**: One wallet signature → ephemeral browser keypair → AES-256-GCM encrypted via Web Crypto API
- **GOLD Token**: Token-2022, mint-on-demand through gameplay
- **Treasury**: Auto-LP burn — all mined GOLD that goes to the protocol treasury is deployed into protocol-owned liquidity, then burned permanently
- **World State**: On-chain bitmap account tracking mined cells (resettable when sufficiently mined out)

## Program (Mainnet)

| Detail | Value |
|--------|-------|
| Program ID | `DZ4FErNjFdqFMumiYpTLtdKh5a1mqREhYFpQPr6XiJcP` |
| Network | X1 Mainnet |
| RPC | `https://rpc.mainnet.x1.xyz` |
| WebSocket | `wss://ws.mainnet.x1.xyz` |
| Grid Size | 1,024 × 1,024 |
| Session Duration | ~4 hours (36,000 slots) |
| Gold per Mine | 100 GOLD |

## Tokens / Accounts (Mainnet — verified 2026-09-21)

| Item | Address / Value |
|------|-----------------|
| GOLD mint (Token-2022, 9 decimals) | `8HLD8UvZotgX7tGW4TEPLJEkJZGSAsanuRZe7q64CLrX` |
| GOLD metadata URI | `https://arweave.net/cxmHUDnAAt9jUV4RDiEFM5jkoUCR8awzIcnSpcD1r5o` |
| Gold bitmap account | `3XPLwxytSvLf7RthxPAx2gPeaVcbF2LhQuMDUw9uvmG2` |
| GameConfig PDA | `AZqr6YTneD2uFuiBjz7c7yviLYV5pYvcXoa8aWgL2kYU` |
| AMM program (treasury_auto_lp) | `sEsYH97wqmfnkzHedjNcw3zyJdPvUmsa9AixhS4b4fN` |
| AMM LP mint | `B9Vd1yhwQUoKNnYB7b7Z2MWDQs5XrxbEhqzfnpVaXsTX` |

Full env reference: `app/.env.production` (all addresses verified live on mainnet).

## Setup

### Program (already deployed to mainnet)

```bash
cargo build-sbf --manifest-path programs/gold-miner/Cargo.toml
solana program deploy target/deploy/gold_miner.so --url https://rpc.mainnet.x1.xyz
```

### Frontend

```bash
cd app
npm install
# Configure mainnet env (see app/.env.production)
cp .env.production .env.local
npm run dev
```

Production build pulls values from `app/.env.production` (mainnet). All address
constants are env-driven (`NEXT_PUBLIC_*`) and default to mainnet in `constants.ts`.

## Gas Costs

*Based on actual on-chain transactions (X1 mainnet, CU price ~30 μlamports/CU).*

| Action | Fee (XNT) | Avg CU | Notes |
|--------|-----------|--------|-------|
| Move onto empty square | ~0.0012 | ~33,500 | Base movement only |
| Mine gold (Token-2022 mint) | ~0.0015–0.0017 | ~53,000–57,000 | Two CPI calls to mint 100 GOLD |

*Variation depends on Compute Unit Price (your wallet settings). Higher congestion = higher CU price = higher fees.*

### Deposit estimates

| Deposit | Approx. Moves |
|---------|---------------|
| 0.02 XNT | ~12–16 moves |
| 0.1 XNT | ~60–80 moves |
| 1 XNT | ~600–800 moves |

## Deployment

> ⚠️ **REMEMBER:** This project **auto-deploys to Vercel from GitHub**.
> Pushing to `main` triggers a Vercel production deploy automatically.
