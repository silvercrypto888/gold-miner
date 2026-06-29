# Gold Miner ⛏️

On-chain multiplayer fair mine game on X1 Network. Explore a 1,024×1,024 grid, discover gold, and mine GOLD tokens.

## How It Works

1. **Connect wallet** → sign one transaction to join
2. **Start session** → generates an encrypted session key for frictionless movement
3. **Move** with arrow keys or WASD → each move is on-chain, no wallet popup
4. **Mine gold** → stepping on a gold square auto-mints 100 GOLD (Token-2022)
5. **Gold formula** → `(x & y) % 7 == 0` — figure out the pattern, navigate efficiently
6. **Deposit/Withdraw XNT** → fund your movement gas, withdraw anytime

## Architecture

- **Program**: Anchor (Solana VM), deployed on X1 Testnet
- **Frontend**: Next.js + TypeScript + TailwindCSS
- **Session Keys**: One wallet signature → ephemeral browser keypair → AES-256-GCM encrypted via Web Crypto API
- **GOLD Token**: Token-2022, mint-on-demand through gameplay
- **Treasury**: Auto-LP burn — all mined GOLD that goes to the protocol treasury is deployed into protocol-owned liquidity, then burned permanently
- **World State**: On-chain bitmap account tracking mined cells (resettable when sufficiently mined out)

## Program

| Detail | Value |
|--------|-------|
| Program ID | `EkThFJFcQtC9vmguQWQu6qhbndCkCaFFvuGX5MSsgGAf` |
| Network | X1 Testnet |
| RPC | `https://rpc.testnet.x1.xyz` |
| Grid Size | 1,024 × 1,024 |
| Session Duration | ~4 hours (36,000 slots) |
| Gold per Mine | 100 GOLD |

## Setup

### Program (already deployed)

```bash
cargo build-sbf --manifest-path programs/gold-miner/Cargo.toml
solana program deploy target/deploy/gold_miner.so --url https://rpc.testnet.x1.xyz
```

### Frontend

```bash
cd app
npm install
npm run dev
```

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
