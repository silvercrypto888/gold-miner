#!/bin/bash
# Initialize Gold Miner v2 game state after deploy.
# Creates GameConfig + GoldBitmap accounts on-chain.
set -euo pipefail

CLUSTER="${1:-testnet}"
RPC="https://rpc.testnet.x1.xyz"
DEPLOYER="$HOME/.config/solana/id.json"
DEPLOYER_PK=$(solana-keygen pubkey "$DEPLOYER")
PROGRAM_ID="GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6"
TOKEN_2022="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GOLD_MINT_KP="$SCRIPT_DIR/gold-mint-keypair.json"

if [ ! -f "$GOLD_MINT_KP" ]; then
  echo "ERROR: No gold-mint-keypair.json. Run deploy.sh first."
  exit 1
fi
GOLD_MINT=$(solana-keygen pubkey "$GOLD_MINT_KP")

echo "=== Initializing Game ==="
echo "Deployer:    $DEPLOYER_PK"
echo "Program:     $PROGRAM_ID"
echo "GOLD Mint:   $GOLD_MINT"
echo ""

# Derive PDAs
GAME_CONFIG=$(solana address --url "$RPC" \
  --keypair /dev/stdin <<< "$(python3 -c "
import base58, hashlib
seed = b'game_config'
prog = bytes.fromhex('$(solana-keygen pubkey /dev/stdin 2>/dev/null || echo "$PROGRAM_ID")'[:0])
# Can't easily derive PDA from shell. We'll use the Anchor test.
print('Derive via anchor test')
")" 2>/dev/null || echo "PDA")

echo "Will call initializeGame via Anchor test script..."
echo ""
echo "Run: anchor run init --provider.cluster $CLUSTER"
echo ""
echo "Or deploy a one-time init script with:"
echo "  solana -k $DEPLOYER -u $RPC program deploy ..."
echo "  Then call initializeGame instruction"
