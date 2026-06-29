# Gold Miner ⛏️

On-chain multiplayer grid game on X1 Network. Explore a 100×100 grid, discover gold, and mine Goldium tokens.

## How It Works

1. **Connect wallet** → sign one transaction to join
2. **Start session** → generates a session key for frictionless movement
3. **Move** with arrow keys or WASD → each move is on-chain, no wallet popup
4. **Mine gold** → stepping on a gold square auto-mints 100 Goldium (Token-2022)
5. **Gold formula** → `(x & y) % 7 == 0` — figure out the pattern, navigate efficiently
6. **Deposit/Withdraw XNT** → fund your movement gas, withdraw anytime

## Architecture

- **Program**: Anchor (Solana VM), deployed on X1 Testnet
- **Frontend**: Next.js + TypeScript + TailwindCSS
- **Session Keys**: One wallet signature → browser keypair → frictionless moves
- **Goldium**: Token-2022, mint-on-demand, tradeable

## Program

| Detail | Value |
|--------|-------|
| Program ID | `EkThFJFcQtC9vmguQWQu6qhbndCkCaFFvuGX5MSsgGAf` |
| Network | X1 Testnet |
| RPC | `https://rpc.testnet.x1.xyz` |

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

- Each move costs ~0.002 XNT on X1
- 0.02 XNT deposit ≈ 10 moves
- 0.1 XNT deposit ≈ 50 moves
- 1 XNT deposit ≈ 500 moves