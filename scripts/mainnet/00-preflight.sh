#!/bin/bash
# Gold Miner v2 — Mainnet Pre-flight Check (Phase 3, Step 1)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
RPC="https://rpc.mainnet.x1.xyz"

# Deployer wallet = the funded mainnet deployer
DEPLOYER="$PROJECT_DIR/../secure/gold-miner-mainnet/deployer-mainnet.json"
if [ ! -f "$DEPLOYER" ]; then
  echo "❌ Deployer keypair not found at $DEPLOYER"
  exit 1
fi
DEPLOYER_PUBKEY=$(solana-keygen pubkey "$DEPLOYER")

PROG_PAIR="$PROJECT_DIR/target/deploy/gold_miner_mainnet-keypair.json"
if [ ! -f "$PROG_PAIR" ]; then
  echo "❌ Mainnet program keypair not found at $PROG_PAIR"
  exit 1
fi
PROG_ID=$(solana-keygen pubkey "$PROG_PAIR")

echo "=== Gold Miner v2 — Mainnet Pre-flight ==="
echo "RPC:        $RPC"
echo ""

# 1. Deployer balance
echo ">>> [1/4] Deployer wallet balance ($DEPLOYER_PUBKEY):"
BAL=$(solana balance --url "$RPC" --keypair "$DEPLOYER" 2>&1)
echo "    $BAL"
if ! echo "$BAL" | grep -qE 'SOL'; then
  echo "    ⚠️  No SOL balance — deployer not funded. Check balance/name."
  exit 1
fi

# NOTE: This workspace has a global rustup override to 1.89.0-sbpf-solana-v1.53
# which is NOT installed (only v1.52 is). Always build with the env-pinned
# toolchain below (it takes precedence over the directory override).
export RUSTUP_TOOLCHAIN=1.89.0-sbpf-solana-v1.52

# 2. SBF binary freshness
SO="$PROJECT_DIR/target/deploy/gold_miner.so"
echo ""
echo ">>> [2/4] SBF binary (built with v3.1.14 toolchain):"
if [ -f "$SO" ]; then
  stat -c '    %n  (%s bytes, last modified %y)' "$SO"
else
  echo "    ❌ $SO not found — run: RUSTUP_TOOLCHAIN=1.89.0-sbpf-solana-v1.52 <solana3.1.14>/cargo-build-sbf"
  exit 1
fi

# 3. Anchor.toml mainnet program ID matches program keypair
echo ""
echo ">>> [3/4] Anchor.toml [programs.mainnet] vs program keypair:"
TOML_PROG=$(grep -A3 '\[programs.mainnet\]' "$PROJECT_DIR/Anchor.toml" \
  | grep -oE 'gold_miner[[:space:]]*=[[:space:]]*"[A-Za-z0-9]+"' \
  | grep -oE '"[A-Za-z0-9]+"' | tr -d '"')
echo "    Anchor.toml: $TOML_PROG"
echo "    keypair:     $PROG_ID"
if [ "$TOML_PROG" != "$PROG_ID" ]; then
  echo "    ❌ MISMATCH — update Anchor.toml before deploying."
  exit 1
fi
echo "    ✅ Match"

# 4. Program keypair backup
echo ""
echo ">>> [4/4] Program keypair backup:"
BACKUP="$PROJECT_DIR/secure-mainnet/gold_miner_mainnet-keypair.json"
if [ -f "$BACKUP" ]; then
  BACKUP_PUB=$(solana-keygen pubkey "$BACKUP")
  if [ "$BACKUP_PUB" == "$PROG_ID" ]; then
    echo "    ✅ Backup $BACKUP matches (perms $(stat -c '%a' "$BACKUP"))"
  else
    echo "    ❌ Backup does NOT match program keypair."
    exit 1
  fi
else
  echo "    ❌ No backup at $BACKUP — copy target/deploy/gold_miner_mainnet-keypair.json there."
  exit 1
fi

echo ""
echo "=== PRE-FLIGHT PASSED — ready to deploy to mainnet ==="
