import { PublicKey } from "@solana/web3.js";

// Program and Network Configuration
let _PROGRAM_ID: PublicKey | null = null;
export function getProgramId(): PublicKey {
  if (!_PROGRAM_ID) {
    _PROGRAM_ID = new PublicKey(
      process.env.NEXT_PUBLIC_PROGRAM_ID || "GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6"
    );
  }
  return _PROGRAM_ID;
}

let _GOLD_MINT: PublicKey | null = null;
export function getGoldMint(): PublicKey {
  if (!_GOLD_MINT) {
    _GOLD_MINT = new PublicKey(
      process.env.NEXT_PUBLIC_GOLD_MINT || PublicKey.default.toString()
    );
  }
  return _GOLD_MINT;
}

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.testnet.x1.xyz";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "wss://ws.testnet.x1.xyz";

const JOIN_GAME_DISC = Buffer.from([107, 112, 18, 38, 56, 173, 60, 128]);
const START_SESSION_DISC = Buffer.from([23, 227, 111, 142, 212, 230, 3, 175]);
const MOVE_AND_MINE_DISC = Buffer.from([26, 202, 228, 63, 206, 4, 137, 63]);

// Token-2022 program on X1
const X1_TOKEN_2022_BYTES = Uint8Array.from([
  0x06, 0xdd, 0xf6, 0xe1, 0xee, 0x75, 0x8f, 0xde,
  0x18, 0x42, 0x5d, 0xbc, 0xe4, 0x6c, 0xcd, 0xda,
  0xb6, 0x1a, 0xfc, 0x4d, 0x83, 0xb9, 0x0d, 0x27,
  0xfe, 0xbd, 0xf9, 0x28, 0xd8, 0xa1, 0x8b, 0xfc,
]);
let _TOKEN_2022_PROGRAM_ID: PublicKey | null = null;
export function getToken2022ProgramId(): PublicKey {
  if (!_TOKEN_2022_PROGRAM_ID) {
    _TOKEN_2022_PROGRAM_ID = new PublicKey(X1_TOKEN_2022_BYTES);
  }
  return _TOKEN_2022_PROGRAM_ID;
}

let _ATA_PROGRAM_ID: PublicKey | null = null;
export function getAtaProgramId(): PublicKey {
  if (!_ATA_PROGRAM_ID) {
    _ATA_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
  }
  return _ATA_PROGRAM_ID;
}

// Derive player's GOLD ATA (Token-2022) — wallet-owned
export function getGoldAta(wallet: PublicKey, goldMint?: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      wallet.toBuffer(),
      getToken2022ProgramId().toBuffer(),
      (goldMint || getGoldMint()).toBuffer(),
    ],
    getAtaProgramId()
  )[0];
}

// ─── Game Constants ───

const BITMAP_KEYPAIR_ADDRESS = process.env.NEXT_PUBLIC_GOLD_BITMAP || "7DVVV8f7mzXLW3pB3Xx1z9LQxVpTpNQ1Cm9NiggXDT8A";
export const VIEWPORT_SIZE = 15;
export const CELL_SIZE = 40;
export const GRID_SIZE = 1024;
export const BITMAP_BYTES = 131072; // 1024 * 1024 bits (not including discriminator)
export const GOLD_PER_MINE = 100;
export const SESSION_DURATION_SLOTS = 36000; // ~4 hours
export const BLOCK_TIME_MS = 400;
export const SESSION_KEY_STORAGE = "gold_miner_session_key";
export const LAMPORTS_PER_SOL = 1_000_000_000;

export const DEPOSIT_AMOUNTS = [
  { label: "0.02", value: 0.02 },
  { label: "0.1", value: 0.1 },
  { label: "1", value: 1.0 },
];

/// Check if a grid position has gold based on worldgen formula
export function hasGoldAt(x: number, y: number): boolean {
  return ((x & y) % 7) === 0;
}

/// Count total gold spots on the grid
export function estimateGoldSpots(): number {
  let count = 0;
  for (let x = 1; x <= GRID_SIZE; x++) {
    for (let y = 1; y <= GRID_SIZE; y++) {
      if (hasGoldAt(x, y)) count++;
    }
  }
  return count;
}

/// Position (x,y) to bitmap bit index
export function posToBitIndex(x: number, y: number): number {
  return (y - 1) * GRID_SIZE + (x - 1);
}

/// Bitmap helper: check if a cell is mined
export function isCellMined(bits: Uint8Array, x: number, y: number): boolean {
  const bitIdx = posToBitIndex(x, y);
  const byteIdx = Math.floor(bitIdx / 8);
  const bitPos = bitIdx % 8;
  return (bits[byteIdx] & (1 << bitPos)) !== 0;
}

/// Bitmap helper: mark a cell as mined in-place (no allocation)
export function markCellMined(bits: Uint8Array, x: number, y: number): void {
  const bitIdx = posToBitIndex(x, y);
  const byteIdx = Math.floor(bitIdx / 8);
  const bitPos = bitIdx % 8;
  bits[byteIdx] |= (1 << bitPos);
}

/// Bitmap helper: clear a cell's mined flag in-place (for revert)
export function clearCellMined(bits: Uint8Array, x: number, y: number): void {
  const bitIdx = posToBitIndex(x, y);
  const byteIdx = Math.floor(bitIdx / 8);
  const bitPos = bitIdx % 8;
  bits[byteIdx] &= ~(1 << bitPos);
}

/// Get viewport range centered on player
export function getViewportRange(playerX: number, playerY: number): {
  minX: number; maxX: number; minY: number; maxY: number;
} {
  const halfViewport = Math.floor(VIEWPORT_SIZE / 2);
  let minX = playerX - halfViewport;
  let maxX = playerX + halfViewport;
  let minY = playerY - halfViewport;
  let maxY = playerY + halfViewport;
  if (minX < 1) { maxX += 1 - minX; minX = 1; }
  if (maxX > GRID_SIZE) { minX -= maxX - GRID_SIZE; maxX = GRID_SIZE; }
  if (minY < 1) { maxY += 1 - minY; minY = 1; }
  if (maxY > GRID_SIZE) { minY -= maxY - GRID_SIZE; maxY = GRID_SIZE; }
  minX = Math.max(1, minX);
  maxX = Math.min(GRID_SIZE, maxX);
  minY = Math.max(1, minY);
  maxY = Math.min(GRID_SIZE, maxY);
  return { minX, maxX, minY, maxY };
}

// ─── PDA Derivation Helpers ───

export function getGameConfigPda(programId?: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("game_config")],
    programId || getProgramId()
  );
}

export function getGoldBitmapPda(programId?: PublicKey): [PublicKey, number] {
  return [new PublicKey(BITMAP_KEYPAIR_ADDRESS), 255]; // keypair, not PDA
}

export function getPlayerPda(wallet: PublicKey, programId?: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("player"), wallet.toBuffer()],
    programId || getProgramId()
  );
}

// Treasury PDA — seeds = [b"treasury", game_config]
export function getTreasuryPda(programId?: PublicKey): [PublicKey, number] {
  const [gameConfigPda] = getGameConfigPda(programId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), gameConfigPda.toBuffer()],
    programId || getProgramId()
  );
}

// Treasury's GOLD ATA (Token2022, same as gold_mint)
export function getTreasuryGoldAta(treasuryPda: PublicKey, goldMint?: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      treasuryPda.toBuffer(),
      AMM_GOLD_TOKEN_PROG.toBuffer(),
      (goldMint || getGoldMint()).toBuffer(),
    ],
    getAtaProgramId()
  )[0];
}

// AMM addresses for treasury_auto_lp
export const AMM_PROGRAM_ID = new PublicKey("7EEuq61z9VKdkUzj7G36xGd7ncyz8KBtUwAWVjypYQHf");
export const AMM_MARKET_AUTHORITY = new PublicKey("2HbqjtA9gB9c95c8KkUUWxhtNjCfYcPbvfdhcdobbq1C");
export const AMM_CONFIG = new PublicKey("3FzzbxwpdJKxRW1yNT7UPYmna17SwC9PRmskMa8A2BuY");
export const AMM_POOL_STATE = new PublicKey("CdD9sutJxR1nSRkUyHkYyDxo9D63JJcyiSuPVatDwFMt");
export const AMM_GOLD_VAULT = new PublicKey("5mCfZdbYfUyYHwVLdDQwnAEv6YJgiGi2dihfrEuv3AYx");
export const AMM_XNT_VAULT = new PublicKey("BBwRY3cCMyW524bgBoUheA8Tae6GtVKPKivz67xWGibH");
export const AMM_OBSERVER_STATE = new PublicKey("DXf6rW8E5wnMGYFMjhJPjL1aKNh8eAfwmLBqAkGF7t7v");
export const AMM_GOLD_MINT = new PublicKey("HRby9JcNp67dWCrdxwKyNohDu7WqoWmM9cbrodQCTEAq");
export const AMM_XNT_MINT = new PublicKey("So11111111111111111111111111111111111111112");
export const AMM_LP_MINT = new PublicKey("cWf87wGwVpv1TfMac8PimFmEPi1W4WqguFi2vEWQqkL");
export const AMM_XNT_TOKEN_PROG = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const AMM_GOLD_TOKEN_PROG = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export const INCINERATOR = new PublicKey("1nc1nerator11111111111111111111111111111111");

// Treasury's XNT ATA (Tokenkeg — XNT is regular SPL Token on X1 testnet)
export function getTreasuryXntAta(treasuryPda: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      treasuryPda.toBuffer(),
      AMM_XNT_TOKEN_PROG.toBuffer(),
      AMM_XNT_MINT.toBuffer(),
    ],
    getAtaProgramId()
  )[0];
}

// Treasury's LP ATA (Tokenkeg — LP is regular SPL Token)
export function getTreasuryLpAta(treasuryPda: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      treasuryPda.toBuffer(),
      AMM_XNT_TOKEN_PROG.toBuffer(),
      AMM_LP_MINT.toBuffer(),
    ],
    getAtaProgramId()
  )[0];
}

// ─── Formatting ───

export function formatXNT(lamports: number, decimals: number = 4): string {
  const xnt = lamports / LAMPORTS_PER_SOL;
  return `${xnt.toFixed(decimals)} XNT`;
}

export function formatGoldium(amount: number): string {
  return `${amount.toLocaleString()} GOLD`;
}
