#!/bin/bash
# Gold Miner v2 — Deploy Program to Mainnet (Phase 3, Step 3)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
RPC="https://rpc.mainnet.x1.xyz"

DEPLOYER="$PROJECT_DIR/../secure/gold-miner-mainnet/deployer-mainnet.json"
PROG_PAIR="$PROJECT_DIR/target/deploy/gold_miner_mainnet-keypair.json"
SO="$PROJECT_DIR/target/deploy/gold_miner.so"

DEPLOYER_PUBKEY=$(solana-keygen pubkey "$DEPLOYER")
PROG_ID=$(solana-keygen pubkey "$PROG_PAIR")

echo "=== Gold Miner v2 — Deploy Program → MAINNET ==="
echo "Deployer:  $DEPLOYER_PUBKEY"
echo "Program:   $PROG_ID"
echo "RPC:       $RPC"

# Sanity — ensure SBF built
if [ ! -f "$SO" ]; then
  echo "❌ $SO not found. Run: anchor build"
  exit 1
fi

# Deployer balance
BAL=$(solana balance --url "$RPC" --keypair "$DEPLOYER" | awk '{print $1}')
echo "Deployer balance: $BAL SOL"

# Deploy with the NEW greenfield program keypair
echo ">>> Deploying program..."
solana program deploy \
  --program-id "$PROG_PAIR" \
  --url "$RPC" \
  --keypair "$DEPLOYER" \
  "$SO"

echo ""
echo ">>> Verifying on-chain..."
solana program show "$PROG_ID" --url "$RPC" || echo "(program show unavailable — verify via getAccountInfo)"

echo ""
echo "=== PROGRAM DEPLOYED ==="
echo "Program ID: $PROG_ID"
echo ""
echo "Next: run scripts/mainnet/03-init-game.sh"
