#!/bin/bash
# Gold Miner v2 — Deploy to Testnet
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CLUSTER="${1:-testnet}"
RPC="https://rpc.testnet.x1.xyz"
DEPLOYER="$HOME/.config/solana/id.json"
PROGRAM_ID="GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6"
TOKEN_2022="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
GOLD_MINT_KP="$SCRIPT_DIR/gold-mint-keypair.json"

echo "=== Gold Miner v2 → ${CLUSTER} ==="

# BUILD
echo ">>> Building..."
cd "$PROJECT_DIR"
anchor build --provider.cluster "$CLUSTER"

# BALANCE CHECK
BALANCE=$(solana balance --keypair "$DEPLOYER" --url "$RPC" | cut -d' ' -f1)
echo ">>> Deployer balance: $BALANCE SOL"

# CREATE GOLD MINT if needed
if [ ! -f "$GOLD_MINT_KP" ]; then
  echo ">>> Creating GOLD mint keypair..."
  solana-keygen new --no-bip39-passphrase -s -f -o "$GOLD_MINT_KP"
fi
GOLD_MINT=$(solana-keygen pubkey "$GOLD_MINT_KP")
echo ">>> GOLD Mint: $GOLD_MINT"

EXISTS=$(solana account "$GOLD_MINT" --url "$RPC" --output json 2>/dev/null || echo "")
if [ -z "$EXISTS" ]; then
  echo ">>> Creating Token-2022 mint..."
  spl-token create-token \
    --program-id "$TOKEN_2022" \
    --url "$RPC" \
    --decimals 9 \
    "$GOLD_MINT_KP"
  
  # Create metadata via spl-token (requires Token-2022 with metadata)
  # If spl-token doesn't support metadata yet, we skip for now
  echo ">>> Mint created. Add metadata later with token-2022 metadata pointer."
fi

# DEPLOY
echo ">>> Deploying program..."
solana program deploy \
  --program-id "$PROJECT_DIR/target/deploy/gold-miner-keypair.json" \
  --url "$RPC" \
  --keypair "$DEPLOYER" \
  "$PROJECT_DIR/target/deploy/gold_miner.so"

echo ""
echo "=== DEPLOYED ==="
echo "Program ID: $PROGRAM_ID"
echo "GOLD Mint:  $(solana-keygen pubkey "$GOLD_MINT_KP")"
echo ""
echo "Next step: run init.sh to initialize game state"
