# Gold Miner Litepaper

## Overview

Gold Miner is an on-chain multiplayer grid game on X1 Network. Players explore a 100×100 grid, discover gold deposits, and mine Goldium tokens (Token-2022). All game state lives on-chain — every move, every mine, every token mint is a Solana transaction.

## Session Keys — Frictionless Gameplay

To avoid wallet popups on every move, Gold Miner uses **delegated session keys**:

1. Player signs **once** to create an ephemeral Ed25519 keypair
2. The session keypair signs all subsequent moves and mine actions
3. The session expires after a fixed slot duration
4. The keypair is encrypted at rest and survives page refreshes

## Session Key Encryption

Session secret keys are encrypted using **AES-256-GCM** via the browser's native **Web Crypto API** (W3C standard, available in all modern browsers). The encryption flow:

1. Wallet signs a fixed message (`"Unlock Gold Miner session"`)
2. The 64-byte Ed25519 signature is hashed with SHA-256 to derive a 32-byte AES key
3. The session secret key is encrypted with AES-256-GCM + random 12-byte IV
4. Ciphertext and IV are stored in `localStorage`

**Security properties:**
- Only the same wallet can decrypt (same message → same signature → same AES key)
- AES-256-GCM provides confidentiality + authentication (tamper-evident)
- The key never exists in plaintext outside the active JavaScript heap
- Session expiry is enforced on-chain — the program rejects expired sessions regardless of local state

## Token Economics

- **Goldium**: Token-2022, minted on-demand when mining gold
- **XNT**: Native gas token for moves and session funding
- **Gold formula**: `(x & y) % 7 == 0` — deterministic, fair, exploitable with strategy

## Technical Stack

- **Program**: Anchor (Rust) on Solana VM / X1 Testnet
- **Frontend**: Next.js + TypeScript + TailwindCSS
- **Session Crypto**: Web Crypto API (AES-256-GCM, SHA-256, random IV generation)
- **Key Generation**: tweetnacl (Ed25519)

## Program Details

| Parameter | Value |
|-----------|-------|
| Program ID | `EkThFJFcQtC9vmguQWQu6qhbndCkCaFFvuGX5MSsgGAf` |
| Network | X1 Testnet |
| RPC | `https://rpc.testnet.x1.xyz` |
| Session Duration | 300 slots (~10 minutes) |
| Grid Size | 100×100 |
| Gold per Mine | 100 Goldium |
| Mint Standard | Token-2022 |

## Deployment

The program is deployed on X1 Testnet. Frontend auto-deploys via GitHub → Vercel.
