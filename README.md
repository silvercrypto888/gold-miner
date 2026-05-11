# ⛏️ Gold Miner

An on-chain multiplayer grid game built on X1 (Solana VM).

## Game Overview

Gold Miner is a real-time multiplayer grid game where players explore a 100×100 grid to find and mine gold. Each gold square mined rewards the player with 100 Goldium (GLD) tokens.

### Key Features

- **100×100 Grid**: Massive play area with ~1,400 gold spots
- **On-Chain Movement**: Every move is a transaction on X1
- **Session Keys**: Sign once, play seamlessly with session-based authentication
- **Token Rewards**: Mine gold to earn Goldium (GLD) Token-2022 tokens
- **Escrow System**: Deposit XNT for gas fees, withdraw anytime

## How It Works

### Gold Distribution

Gold spots are determined by the formula: `(x & y) % 7 == 0`

This creates approximately 1,400 gold squares distributed across the grid.

### Session Keys

1. Connect your wallet
2. Sign one transaction to create your player account and session key
3. Session key signs all subsequent moves (no more popups!)
4. Session expires after ~4 hours

### Movement & Mining

- Use **Arrow Keys** or **WASD** to move
- Step on a gold square to automatically mine it
- Each mine rewards **100 GLD** tokens
- First transaction to a gold square wins the gold

## Architecture

### Smart Contract (Anchor)

**Programs:**
- `initialize_game` - Initialize game configuration
- `join_game` - Create player account at position (1,1)
- `start_session` - Set up session key for gas-less moves
- `move_player` - Move in any direction (Up/Down/Left/Right)
- `deposit_xnt` - Deposit XNT into escrow for gas
- `withdraw_xnt` - Withdraw all XNT from escrow

**Accounts:**
- `GameConfig` - Grid size, authority, goldium mint, counters
- `Player` - Wallet, session key, position, escrow balance, goldium minted
- `GoldSpot` - PDA tracking which squares have been mined

### Frontend (Next.js + TypeScript)

- **Canvas Rendering**: 15×15 viewport follows the player
- **Smooth Animation**: Interpolates between on-chain positions
- **Wallet Integration**: Backpack, Phantom, Solflare support
- **Dark Theme**: Optimized for gaming aesthetic

## Getting Started

### Prerequisites

- Node.js 18+
- Rust
- Solana CLI
- Anchor

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/gold-miner.git
cd gold-miner

# Install dependencies
npm install
cd app && npm install

# Build the Anchor program
anchor build

# Deploy to X1 Testnet
anchor deploy --provider.cluster testnet
```

### Running Locally

```bash
# Start the frontend (in app/ directory)
cd app
npm run dev

# Open http://localhost:3000
```

### Environment Setup

Create `app/.env.local`:

```env
VITE_PROGRAM_ID=YOUR_PROGRAM_ID
VITE_RPC_URL=https://rpc.testnet.x1.xyz
VITE_WS_URL=wss://ws.testnet.x1.xyz
```

## Tokenomics

- **Token**: Goldium (GLD)
- **Standard**: Token-2022 (SPL Token-2022)
- **Minting**: Mint-on-demand when gold is mined
- **Supply**: Capped by ~140,000 GLD (1,400 gold spots × 100 GLD each)
- **Utility**: Collection/trading only

## Network Details

- **Target**: X1 Testnet
- **RPC**: https://rpc.testnet.x1.xyz
- **WebSocket**: wss://ws.testnet.x1.xyz
- **Token-2022**: TokenzQgBNY1bUK1n5T2Q6Q6WKFk5CQu9upH5hF9jQ
- **Block Time**: ~400ms
- **Move Cost**: ~0.002 XNT

## Testing

```bash
# Run Anchor tests
anchor test

# Test specific functionality
anchor test --grep "can move player"
```

## File Structure

```
gold-miner/
├── programs/
│   └── gold-miner/
│       ├── Cargo.toml
│       └── src/
│           └── lib.rs          # Anchor program
├── app/                        # Next.js frontend
│   ├── src/
│   │   ├── app/                # Next.js app directory
│   │   ├── components/         # React components
│   │   ├── hooks/              # Custom React hooks
│   │   ├── lib/                # Utilities, constants, IDL
│   │   └── types/              # TypeScript types
│   ├── package.json
│   └── next.config.js
├── tests/
│   └── gold-miner.ts           # Anchor tests
├── Anchor.toml
├── Cargo.toml
└── README.md
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Anchor](https://anchor-lang.com/)
- Solana Wallet Adapter
- X1 Testnet