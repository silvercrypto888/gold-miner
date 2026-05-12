import { PublicKey } from "@solana/web3.js";

// Safe PublicKey constructor that handles off-curve program-derived addresses
// like Token-2022 (TokenzQg...) which decode to <32 bytes in base58.
// Solana pads these with a leading 0x00 byte to make them 32 bytes.
function safePublicKey(address: string): PublicKey {
  // Standard 32-byte addresses work fine with new PublicKey()
  try {
    return new PublicKey(address);
  } catch {
    // For off-curve addresses that are <32 bytes, manually decode and pad
    // Use the buffer approach to handle 31-byte addresses like Token-2022
    const CHARSET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const bytes = [0];
    for (const c of address) {
      const carry = CHARSET.indexOf(c);
      for (let j = 0; j < bytes.length; j++) {
        const val = bytes[j] * 58 + carry;
        bytes[j] = val & 0xff;
      }
      let carry2 = 0;
      for (let j = 0; j < bytes.length; j++) {
        bytes[j] += carry2;
        carry2 = bytes[j] >> 8;
        bytes[j] &= 0xff;
      }
      while (carry2) {
        bytes.push(carry2 & 0xff);
        carry2 >>= 8;
      }
    }
    // Add leading zeros for each leading '1' in base58
    for (const c of address) {
      if (c === "1") bytes.push(0);
      else break;
    }
    // Reverse to big-endian and ensure 32 bytes
    bytes.reverse();
    while (bytes.length < 32) bytes.unshift(0);
    return new PublicKey(Buffer.from(bytes.slice(0, 32)));
  }
}

// Program and Network Configuration
let _PROGRAM_ID: PublicKey | null = null;
export function getProgramId(): PublicKey {
  if (!_PROGRAM_ID) {
    _PROGRAM_ID = new PublicKey(
      process.env.NEXT_PUBLIC_PROGRAM_ID || "EkThFJFcQtC9vmguQWQu6qhbndCkCaFFvuGX5MSsgGAf"
    );
  }
  return _PROGRAM_ID;
}

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.testnet.x1.xyz";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "wss://ws.testnet.x1.xyz";

// Token-2022 program (off-curve address — must use safe constructor)
let _TOKEN_2022_PROGRAM_ID: PublicKey | null = null;
export function getToken2022ProgramId(): PublicKey {
  if (!_TOKEN_2022_PROGRAM_ID) {
    _TOKEN_2022_PROGRAM_ID = safePublicKey(
      process.env.NEXT_PUBLIC_TOKEN_2022_PROGRAM_ID || "TokenzQgBNY1bUK1n5T2Q6Q6WKFk5CQu9upH5hF9jQ"
    );
  }
  return _TOKEN_2022_PROGRAM_ID;
}

// ATA program
let _ATA_PROGRAM_ID: PublicKey | null = null;
export function getAtaProgramId(): PublicKey {
  if (!_ATA_PROGRAM_ID) {
    _ATA_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
  }
  return _ATA_PROGRAM_ID;
}

// Derive player's Goldium ATA (Token-2022)
export function getPlayerGoldiumAta(goldiumMint: PublicKey, playerPda: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      playerPda.toBuffer(),
      getToken2022ProgramId().toBuffer(),
      goldiumMint.toBuffer(),
    ],
    getAtaProgramId()
  )[0];
}

// Game Constants
export const GRID_SIZE = 100;
export const VIEWPORT_SIZE = 15;
export const CELL_SIZE = 40;
export const GOLD_PER_MINE = 100;
export const MOVE_FEE_LAMPORTS = 2_000_000;
export const SESSION_DURATION_SLOTS = 36000;
export const BLOCK_TIME_MS = 400;

export const DEPOSIT_AMOUNTS = [
  { label: "0.02", value: 0.02 },
  { label: "0.1", value: 0.1 },
  { label: "1", value: 1.0 },
];

export const LAMPORTS_PER_SOL = 1_000_000_000;
export const SESSION_KEY_STORAGE = "gold_miner_session_key";

export function hasGoldAt(x: number, y: number): boolean {
  return ((x & y) % 7) === 0;
}

export function estimateGoldSpots(): number {
  let count = 0;
  for (let x = 1; x <= GRID_SIZE; x++) {
    for (let y = 1; y <= GRID_SIZE; y++) {
      if (hasGoldAt(x, y)) count++;
    }
  }
  return count;
}

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

// PDA derivation helpers
export function getGameConfigPda(programId?: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("game_config")],
    programId || getProgramId()
  );
}

export function getPlayerPda(wallet: PublicKey, programId?: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("player"), wallet.toBuffer()],
    programId || getProgramId()
  );
}

export function getGoldSpotPda(x: number, y: number, programId?: PublicKey): [PublicKey, number] {
  const xBuffer = Buffer.alloc(4);
  xBuffer.writeUInt32BE(x, 0);
  const yBuffer = Buffer.alloc(4);
  yBuffer.writeUInt32BE(y, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("gold_spot"), xBuffer, yBuffer],
    programId || getProgramId()
  );
}

export function formatXNT(lamports: number, decimals: number = 4): string {
  const xnt = lamports / LAMPORTS_PER_SOL;
  return `${xnt.toFixed(decimals)} XNT`;
}

export function formatGoldium(amount: number): string {
  return `${amount.toLocaleString()} GLD`;
}
